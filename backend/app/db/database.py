import os
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from dotenv import load_dotenv

# Завантажуємо змінні з файлу .env (який лежить у папці backend)
load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    raise ValueError("❌ DATABASE_URL не знайдено у файлі .env!")

# Створюємо двигун для підключення
engine = create_engine(
    DATABASE_URL,
    pool_pre_ping=True,  # ВАЖЛИВО: Перевіряє з'єднання перед кожним запитом (робить "пінг")
    pool_recycle=300,    # Автоматично перестворює з'єднання кожні 5 хвилин
)

# Створюємо фабрику сесій
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# Базовий клас, від якого будуть успадковуватися всі наші таблиці
Base = declarative_base()

# Залежність (Dependency) для FastAPI, щоб безпечно відкривати/закривати сесію для кожного запиту
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()