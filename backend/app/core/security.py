import os
from datetime import datetime, timedelta, timezone
import bcrypt  # Використовуємо bcrypt напряму замість passlib
import jwt

SECRET_KEY = os.getenv("SECRET_KEY", "your-secret-key-if-env-fails")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # Токен діятиме 7 днів

def verify_password(plain_password: str, hashed_password: str) -> bool:
    # bcrypt працює з байтами, тому ми перетворюємо рядки (encode)
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )

def get_password_hash(password: str) -> str:
    # Генеруємо "сіль" і створюємо хеш
    salt = bcrypt.gensalt()
    hashed = bcrypt.hashpw(password.encode('utf-8'), salt)
    # Повертаємо як звичайний рядок (decode), щоб SQLAlchemy міг записати це в БД
    return hashed.decode('utf-8')

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt