from typing import List
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Habit, HabitLog, User, WorkspaceMember
from app.schemas.habit import HabitCreate, HabitLogResponse, HabitResponse, HabitUpdate, MonthlyHabitPattern
from app.services.google_cal import add_habit_to_calendar, delete_event_from_calendar, update_habit_in_calendar

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
    found = {user.email.lower() for user in users}
    missing = [email for email in emails if email.lower() not in found]

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
        raise HTTPException(status_code=403, detail="Студенти не можуть створювати або редагувати звички простору")

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


def habit_is_visible_for_user(habit: Habit, current_user: User, workspace_ids: set[UUID]) -> bool:
    participant_emails = [email.lower() for email in (habit.participant_emails or [])]
    return (
        habit.created_by == current_user.id
        or current_user.email.lower() in participant_emails
        or (habit.workspace_id in workspace_ids and not participant_emails)
    )


def serialize_target_days(target_days):
    if isinstance(target_days, MonthlyHabitPattern):
        return target_days.model_dump()

    return target_days


def serialize_habit(habit: Habit) -> HabitResponse:
    return HabitResponse(
        id=habit.id,
        title=habit.title,
        frequency=habit.frequency,
        target_days=habit.target_days,
        workspace_id=habit.workspace_id,
        participant_emails=habit.participant_emails or [],
        status=habit.status,
        created_by=habit.created_by,
        created_at=habit.created_at,
    )


@router.post("/", response_model=HabitResponse)
def create_habit(
    habit_in: HabitCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    participant_emails = normalize_email_list(habit_in.participant_emails, current_user.email)
    participant_users = resolve_existing_users(db, participant_emails)

    if habit_in.workspace_id:
        ensure_workspace_creator_permissions(db, habit_in.workspace_id, current_user)
        ensure_workspace_participants(db, habit_in.workspace_id, participant_users)

    new_habit = Habit(
        title=habit_in.title,
        frequency=habit_in.frequency,
        target_days=serialize_target_days(habit_in.target_days),
        workspace_id=habit_in.workspace_id,
        participant_emails=participant_emails or None,
        created_by=current_user.id,
    )

    new_habit.event_id = add_habit_to_calendar(
        user_id=str(current_user.id),
        title=habit_in.title,
        frequency=habit_in.frequency,
        target_days=serialize_target_days(habit_in.target_days),
        db=db,
    )

    db.add(new_habit)
    db.commit()
    db.refresh(new_habit)
    return serialize_habit(new_habit)


@router.get("/", response_model=List[HabitResponse])
def get_my_habits(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    workspace_ids = {
        row.workspace_id
        for row in db.query(WorkspaceMember.workspace_id).filter(WorkspaceMember.user_id == current_user.id).all()
    }

    habits = db.query(Habit).all()
    return [serialize_habit(habit) for habit in habits if habit_is_visible_for_user(habit, current_user, workspace_ids)]


@router.post("/{habit_id}/log", response_model=HabitLogResponse)
def log_habit_completion(
    habit_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    habit = db.query(Habit).filter(Habit.id == habit_id).first()
    workspace_ids = {
        row.workspace_id
        for row in db.query(WorkspaceMember.workspace_id).filter(WorkspaceMember.user_id == current_user.id).all()
    }

    if not habit or not habit_is_visible_for_user(habit, current_user, workspace_ids):
        raise HTTPException(status_code=404, detail="Звичку не знайдено або немає доступу")

    new_log = HabitLog(
        habit_id=habit_id,
        user_id=current_user.id,
    )

    db.add(new_log)
    db.commit()
    db.refresh(new_log)
    return new_log


@router.patch("/{habit_id}", response_model=HabitResponse)
def update_habit(
    habit_id: UUID,
    habit_update: HabitUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.created_by == current_user.id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Звичку не знайдено")

    target_workspace_id = habit_update.workspace_id if "workspace_id" in habit_update.model_fields_set else habit.workspace_id
    participant_emails = (
        normalize_email_list(habit_update.participant_emails, current_user.email)
        if "participant_emails" in habit_update.model_fields_set
        else (habit.participant_emails or [])
    )
    participant_users = resolve_existing_users(db, participant_emails)

    if target_workspace_id:
        ensure_workspace_creator_permissions(db, target_workspace_id, current_user)
        ensure_workspace_participants(db, target_workspace_id, participant_users)

    update_data = habit_update.model_dump(exclude_unset=True)
    if "target_days" in update_data:
        update_data["target_days"] = serialize_target_days(update_data["target_days"])
    update_data["participant_emails"] = participant_emails or None

    for key, value in update_data.items():
        setattr(habit, key, value)

    if habit.event_id and (habit_update.frequency or habit_update.target_days or habit_update.title):
        update_habit_in_calendar(
            user_id=str(current_user.id),
            event_id=habit.event_id,
            title=habit.title,
            frequency=habit.frequency,
            target_days=habit.target_days,
            db=db,
        )
    elif not habit.event_id:
        habit.event_id = add_habit_to_calendar(
            user_id=str(current_user.id),
            title=habit.title,
            frequency=habit.frequency,
            target_days=habit.target_days,
            db=db,
        )

    db.commit()
    db.refresh(habit)
    return serialize_habit(habit)


@router.delete("/{habit_id}")
def delete_habit(
    habit_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.created_by == current_user.id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Звичку не знайдено")

    if habit.event_id:
        delete_event_from_calendar(str(current_user.id), habit.event_id, db)

    db.query(HabitLog).filter(HabitLog.habit_id == habit_id).delete()
    db.delete(habit)
    db.commit()

    return {"message": "Звичку успішно видалено"}
