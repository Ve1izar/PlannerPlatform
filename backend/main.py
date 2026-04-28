from fastapi import FastAPI
from sqlalchemy import inspect, text
from app.db.database import engine, Base
import app.db.models
from app.api.v1 import auth, users, tasks, habits, workspaces, analytics
from fastapi.middleware.cors import CORSMiddleware

Base.metadata.create_all(bind=engine)


def ensure_schema_updates():
    inspector = inspect(engine)

    if "tasks" in inspector.get_table_names():
        task_columns = {column["name"] for column in inspector.get_columns("tasks")}
        if "completed_at" not in task_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE tasks ADD COLUMN completed_at TIMESTAMP"))
        if "completed_by" not in task_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE tasks ADD COLUMN completed_by UUID"))
        if "participant_emails" not in task_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE tasks ADD COLUMN participant_emails JSONB"))

    if "habits" in inspector.get_table_names():
        habit_columns = {column["name"] for column in inspector.get_columns("habits")}
        if "participant_emails" not in habit_columns:
            with engine.begin() as connection:
                connection.execute(text("ALTER TABLE habits ADD COLUMN participant_emails JSONB"))


ensure_schema_updates()

app = FastAPI(title="PlannerPlatform API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Дозволяємо запити з будь-яких IP/доменів
    allow_credentials=True,
    allow_methods=["*"],  # Дозволяємо OPTIONS, GET, POST, DELETE, PATCH
    allow_headers=["*"],  # Дозволяємо передавати Authorization токен
)

app.include_router(auth.router, prefix="/api/v1/auth", tags=["Authentication"])
app.include_router(users.router, prefix="/api/v1/users", tags=["Users"])
app.include_router(tasks.router, prefix="/api/v1/tasks", tags=["Tasks"])
app.include_router(habits.router, prefix="/api/v1/habits", tags=["Habits"])
app.include_router(workspaces.router, prefix="/api/v1/workspaces", tags=["Workspaces"])
app.include_router(analytics.router, prefix="/api/v1/analytics", tags=["Analytics"])

@app.get("/")
def read_root():
    return {"message": "Бекенд успішно запущено!"}
