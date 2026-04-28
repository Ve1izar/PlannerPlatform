from datetime import datetime
from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Task, User, WorkspaceMember
from app.schemas.task import TaskCreate, TaskResponse, TaskUpdate, TaskUpdateStatus
from app.services.google_cal import add_task_to_calendar, delete_event_from_calendar, update_task_in_calendar

router = APIRouter()


def normalize_email_list(emails: list[str] | None, current_user_email: str) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()

    for email in emails or []:
        normalized_email = email.strip().lower()
        if not normalized_email or normalized_email == current_user_email.lower() or normalized_email in seen:
            continue
        seen.add(normalized_email)
        normalized.append(normalized_email)

    return normalized


def resolve_existing_users(db: Session, emails: list[str]) -> list[User]:
    if not emails:
        return []

    users = db.query(User).filter(User.email.in_(emails)).all()
    found_emails = {user.email.lower() for user in users}
    missing = [email for email in emails if email.lower() not in found_emails]

    if missing:
        raise HTTPException(status_code=404, detail=f"Користувачів не знайдено: {', '.join(missing)}")

    return users


def ensure_workspace_creator_permissions(db: Session, workspace_id: UUID, current_user: User) -> WorkspaceMember:
    member = db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == current_user.id,
    ).first()

    if not member:
        raise HTTPException(status_code=403, detail="Ви не є учасником цього простору")
    if member.role == "student" and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="Студенти не можуть створювати або редагувати завдання простору")

    return member


def ensure_workspace_participants(db: Session, workspace_id: UUID, users: list[User]):
    if not users:
        return

    workspace_user_ids = {
        row.user_id
        for row in db.query(WorkspaceMember.user_id).filter(WorkspaceMember.workspace_id == workspace_id).all()
    }

    invalid_users = [user.email for user in users if user.id not in workspace_user_ids]
    if invalid_users:
        raise HTTPException(
            status_code=400,
            detail=f"Не всі користувачі є учасниками простору: {', '.join(invalid_users)}",
        )


def task_is_visible_for_user(task: Task, current_user: User, workspace_ids: set[UUID]) -> bool:
    participant_emails = [email.lower() for email in (task.participant_emails or [])]

    if task.created_by == current_user.id:
        return True
    if current_user.email.lower() in participant_emails:
        return True
    if task.workspace_id in workspace_ids and not participant_emails:
        return True

    return False


def get_accessible_task(db: Session, task_id: UUID, current_user: User) -> Task:
    task = db.query(Task).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Завдання не знайдено")

    workspace_ids = {
        row.workspace_id
        for row in db.query(WorkspaceMember.workspace_id).filter(WorkspaceMember.user_id == current_user.id).all()
    }

    if not task_is_visible_for_user(task, current_user, workspace_ids):
        raise HTTPException(status_code=403, detail="Немає доступу до цього завдання")

    return task


def serialize_task(task: Task) -> TaskResponse:
    return TaskResponse(
        id=task.id,
        title=task.title,
        description=task.description,
        due_date=task.due_date,
        workspace_id=task.workspace_id,
        participant_emails=task.participant_emails or [],
        status=task.status,
        created_by=task.created_by,
        created_at=task.created_at,
        completed_at=task.completed_at,
        workspace_name=task.workspace.name if task.workspace else None,
    )


@router.get("/", response_model=List[TaskResponse])
def get_my_tasks(
        status_filter: str = None,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    workspace_ids = {
        row.workspace_id
        for row in db.query(WorkspaceMember.workspace_id).filter(WorkspaceMember.user_id == current_user.id).all()
    }

    candidate_tasks = db.query(Task).all()
    visible_tasks = [
        task for task in candidate_tasks
        if task_is_visible_for_user(task, current_user, workspace_ids)
    ]

    if status_filter:
        visible_tasks = [task for task in visible_tasks if task.status == status_filter]

    return [serialize_task(task) for task in visible_tasks]


@router.post("/", response_model=TaskResponse)
def create_task(
        task_in: TaskCreate,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    participant_emails = normalize_email_list(task_in.participant_emails, current_user.email)
    participant_users = resolve_existing_users(db, participant_emails)

    if task_in.workspace_id:
        ensure_workspace_creator_permissions(db, task_in.workspace_id, current_user)
        ensure_workspace_participants(db, task_in.workspace_id, participant_users)

    new_task = Task(
        title=task_in.title,
        description=task_in.description,
        due_date=task_in.due_date,
        workspace_id=task_in.workspace_id,
        participant_emails=participant_emails or None,
        created_by=current_user.id,
    )

    if task_in.due_date:
        new_task.event_id = add_task_to_calendar(
            user_id=str(current_user.id),
            title=task_in.title,
            description=task_in.description,
            due_date=task_in.due_date,
            db=db,
        )

    db.add(new_task)
    db.commit()
    db.refresh(new_task)
    return serialize_task(new_task)


@router.patch("/{task_id}", response_model=TaskResponse)
def update_task(
        task_id: UUID,
        task_update: TaskUpdate,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id, Task.created_by == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Завдання не знайдено")

    target_workspace_id = task_update.workspace_id if "workspace_id" in task_update.model_fields_set else task.workspace_id
    participant_emails = (
        normalize_email_list(task_update.participant_emails, current_user.email)
        if "participant_emails" in task_update.model_fields_set
        else (task.participant_emails or [])
    )
    participant_users = resolve_existing_users(db, participant_emails)

    if target_workspace_id:
        ensure_workspace_creator_permissions(db, target_workspace_id, current_user)
        ensure_workspace_participants(db, target_workspace_id, participant_users)

    update_data = task_update.model_dump(exclude_unset=True)
    update_data["participant_emails"] = participant_emails or None

    for key, value in update_data.items():
        setattr(task, key, value)

    if task.event_id and not task.due_date:
        delete_event_from_calendar(str(current_user.id), task.event_id, db)
        task.event_id = None
    elif task.event_id and task.due_date:
        update_task_in_calendar(
            user_id=str(current_user.id),
            event_id=task.event_id,
            title=task.title,
            description=task.description,
            due_date=task.due_date,
            db=db,
        )
    elif not task.event_id and task.due_date:
        task.event_id = add_task_to_calendar(
            user_id=str(current_user.id),
            title=task.title,
            description=task.description,
            due_date=task.due_date,
            db=db,
        )

    db.commit()
    db.refresh(task)
    return serialize_task(task)


@router.patch("/{task_id}/status", response_model=TaskResponse)
def update_task_status(
        task_id: UUID,
        status_update: TaskUpdateStatus,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    task = get_accessible_task(db, task_id, current_user)

    task.status = status_update.status
    task.completed_at = datetime.utcnow() if status_update.status == "completed" else None
    task.completed_by = current_user.id if status_update.status == "completed" else None

    if status_update.status == "completed" and task.event_id:
        delete_event_from_calendar(str(task.created_by), task.event_id, db)
        task.event_id = None

    db.commit()
    db.refresh(task)
    return serialize_task(task)


@router.delete("/{task_id}")
def delete_task(
        task_id: UUID,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    task = db.query(Task).filter(Task.id == task_id, Task.created_by == current_user.id).first()
    if not task:
        raise HTTPException(status_code=404, detail="Завдання не знайдено")

    if task.event_id:
        delete_event_from_calendar(str(current_user.id), task.event_id, db)

    db.delete(task)
    db.commit()
    return {"message": "Завдання успішно видалено"}
