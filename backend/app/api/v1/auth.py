from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session
from app.db.database import get_db
from app.db.models import User
from app.schemas.user import UserCreate, UserResponse, Token
from app.core.security import get_password_hash, verify_password, create_access_token
from app.api.deps import get_current_user
from app.services.google_cal import generate_google_auth_url, save_google_token_from_code

router = APIRouter()

@router.post("/register", response_model=UserResponse)
def register_user(user: UserCreate, db: Session = Depends(get_db)):
    db_user = db.query(User).filter(User.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="Email вже зареєстровано")

    hashed_pwd = get_password_hash(user.password)
    new_user = User(email=user.email, name=user.name, hashed_password=hashed_pwd)

    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return new_user

@router.post("/login", response_model=Token)
def login_user(user_data: UserCreate, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == user_data.email).first()

    if not user or not verify_password(user_data.password, user.hashed_password):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Неправильний email або пароль")

    access_token = create_access_token(data={"sub": str(user.id)})
    return {"access_token": access_token, "token_type": "bearer"}

@router.get("/google/link")
def link_google_calendar(current_user: User = Depends(get_current_user)):
    url = generate_google_auth_url(str(current_user.id))
    return {"auth_url": url}

@router.get("/google/callback")
def google_calendar_callback(state: str, code: str, db: Session = Depends(get_db)):
    try:
        # Передаємо db для збереження токена в базу
        save_google_token_from_code(code=code, state=state, db=db)
        return {"message": "Google Calendar успішно підключено! Ви можете закрити цю сторінку."}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Помилка підключення до Google: {str(e)}")