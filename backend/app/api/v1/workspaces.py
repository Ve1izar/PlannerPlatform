from datetime import datetime
from typing import List, Literal
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.api.v1.analytics import month_label, normalize_datetime, shift_months
from app.api.v1.habits import serialize_habit
from app.api.v1.tasks import serialize_task
from app.db.database import get_db
from app.db.models import Habit, HabitLog, Task, User, Workspace, WorkspaceMember
from app.schemas.analytics import (
    AnalyticsMonthOption,
    AnalyticsOverviewResponse,
    CompletedTaskLogItem,
    HabitLogItem,
)
from app.schemas.habit import HabitResponse
from app.schemas.task import TaskResponse
from app.schemas.workspace import (
    WorkspaceCreate,
    WorkspaceMemberAdd,
    WorkspaceMemberResponse,
    WorkspaceMemberUpdate,
    WorkspaceResponse,
    WorkspaceUpdate,
)
from app.services.google_cal import delete_event_from_calendar

router = APIRouter()

MANAGER_ROLES = {"admin", "teacher"}
ROLE_VALUES = {"admin", "teacher", "student"}
TASK_STATUS_FILTERS = {"all", "active", "completed"}
WORKSPACE_ASSIGNMENT_FILTERS = {"all", "assigned_to_me", "spacewide"}
HABIT_ASSIGNMENT_FILTERS = {"all", "mine", "spacewide"}


def get_workspace_or_404(db: Session, workspace_id: UUID) -> Workspace:
    workspace = db.query(Workspace).filter(Workspace.id == workspace_id).first()
    if not workspace:
        raise HTTPException(status_code=404, detail="Простір не знайдено")
    return workspace


def get_workspace_member_record(db: Session, workspace_id: UUID, user_id: UUID) -> WorkspaceMember | None:
    return db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.user_id == user_id,
    ).first()


def require_workspace_membership(db: Session, workspace_id: UUID, current_user: User) -> WorkspaceMember:
    get_workspace_or_404(db, workspace_id)
    member = get_workspace_member_record(db, workspace_id, current_user.id)
    if not member and not current_user.is_superuser:
        raise HTTPException(status_code=403, detail="У вас немає доступу до цього простору")
    return member


def require_workspace_admin(db: Session, workspace_id: UUID, current_user: User) -> WorkspaceMember | None:
    member = require_workspace_membership(db, workspace_id, current_user)
    if not current_user.is_superuser and member.role != "admin":
        raise HTTPException(status_code=403, detail="Лише адміністратор може змінювати налаштування простору")
    return member


def require_workspace_manager(db: Session, workspace_id: UUID, current_user: User) -> WorkspaceMember | None:
    member = require_workspace_membership(db, workspace_id, current_user)
    if not current_user.is_superuser and member.role not in MANAGER_ROLES:
        raise HTTPException(status_code=403, detail="Недостатньо прав для керування учасниками")
    return member


def validate_role(role: str) -> str:
    normalized_role = role.strip().lower()
    if normalized_role not in ROLE_VALUES:
        raise HTTPException(status_code=400, detail="Невідома роль учасника")
    return normalized_role


def count_workspace_admins(db: Session, workspace_id: UUID) -> int:
    return db.query(WorkspaceMember).filter(
        WorkspaceMember.workspace_id == workspace_id,
        WorkspaceMember.role == "admin",
    ).count()


def serialize_workspace(workspace: Workspace, role: str) -> WorkspaceResponse:
    return WorkspaceResponse(
        id=workspace.id,
        name=workspace.name,
        description=workspace.description,
        created_at=workspace.created_at,
        current_user_role=role,
    )


def paginate_query(query, limit: int, offset: int):
    return query.offset(offset).limit(limit)


def task_matches_workspace_filter(
    task: Task,
    current_user: User,
    status_filter: Literal["all", "active", "completed"],
    assignment_filter: Literal["all", "assigned_to_me", "spacewide"],
) -> bool:
    participant_emails = [email.lower() for email in (task.participant_emails or [])]
    current_email = current_user.email.lower()

    if status_filter == "active" and task.status == "completed":
        return False
    if status_filter == "completed" and task.status != "completed":
        return False

    if assignment_filter == "assigned_to_me":
        return current_email in participant_emails
    if assignment_filter == "spacewide":
        return len(participant_emails) == 0

    return True


def habit_matches_workspace_filter(
    habit: Habit,
    current_user: User,
    assignment_filter: Literal["all", "mine", "spacewide"],
) -> bool:
    participant_emails = [email.lower() for email in (habit.participant_emails or [])]
    current_email = current_user.email.lower()

    if assignment_filter == "mine":
        return current_email in participant_emails
    if assignment_filter == "spacewide":
        return len(participant_emails) == 0

    return True


@router.get("/{workspace_id}/history/overview", response_model=AnalyticsOverviewResponse)
def get_workspace_history_overview(
    workspace_id: UUID,
    range_months: int = Query(default=3),
    month: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_workspace_membership(db, workspace_id, current_user)

    if range_months not in {3, 6, 12}:
        raise HTTPException(status_code=400, detail="range_months must be one of 3, 6, or 12")

    now = datetime.utcnow()

    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    range_start = shift_months(current_month_start, -(range_months - 1))

    completed_tasks = [
        task for task in db.query(Task).filter(
            Task.workspace_id == workspace_id,
            Task.completed_at.is_not(None),
        ).all()
        if (normalized_completed_at := normalize_datetime(task.completed_at))
        and range_start <= normalized_completed_at <= now
    ]

    habit_logs = [
        (habit_log, title) for habit_log, title in db.query(HabitLog, Habit.title).join(
            Habit, Habit.id == HabitLog.habit_id
        ).filter(
            Habit.workspace_id == workspace_id,
        ).all()
        if (normalized_completed_at := normalize_datetime(habit_log.completed_at))
        and range_start <= normalized_completed_at <= now
    ]

    month_buckets: list[AnalyticsMonthOption] = []
    current_cursor = range_start

    while current_cursor <= current_month_start:
        bucket_key = current_cursor.strftime("%Y-%m")
        next_month = shift_months(current_cursor, 1)

        bucket_tasks = sum(
            1 for task in completed_tasks
            if (task_completed_at := normalize_datetime(task.completed_at))
            and current_cursor <= task_completed_at < next_month
        )
        bucket_habit_logs = sum(
            1 for habit_log, _title in habit_logs
            if (habit_completed_at := normalize_datetime(habit_log.completed_at))
            and current_cursor <= habit_completed_at < next_month
        )

        month_buckets.append(
            AnalyticsMonthOption(
                value=bucket_key,
                label=month_label(bucket_key),
                completed_tasks=bucket_tasks,
                habit_logs=bucket_habit_logs,
            )
        )
        current_cursor = next_month

    available_month_values = {bucket.value for bucket in month_buckets}
    selected_month = month if month in available_month_values else month_buckets[-1].value

    selected_year, selected_month_number = selected_month.split("-")
    selected_month_start = current_month_start.replace(
        year=int(selected_year),
        month=int(selected_month_number),
        day=1,
        hour=0,
        minute=0,
        second=0,
        microsecond=0,
    )
    selected_month_end = shift_months(selected_month_start, 1)

    selected_task_logs = sorted(
        [
            CompletedTaskLogItem(
                id=str(task.id),
                title=task.title,
                completed_at=normalize_datetime(task.completed_at),
            )
            for task in completed_tasks
            if (task_completed_at := normalize_datetime(task.completed_at))
            and selected_month_start <= task_completed_at < selected_month_end
        ],
        key=lambda item: item.completed_at,
        reverse=True,
    )

    selected_habit_logs = sorted(
        [
            HabitLogItem(
                id=str(habit_log.id),
                habit_id=str(habit_log.habit_id),
                title=title,
                completed_at=normalize_datetime(habit_log.completed_at),
            )
            for habit_log, title in habit_logs
            if (habit_completed_at := normalize_datetime(habit_log.completed_at))
            and selected_month_start <= habit_completed_at < selected_month_end
        ],
        key=lambda item: item.completed_at,
        reverse=True,
    )

    return AnalyticsOverviewResponse(
        completed_tasks=len(completed_tasks),
        habit_logs=len(habit_logs),
        available_months=month_buckets,
        selected_month=selected_month,
        task_logs=selected_task_logs,
        habit_completion_logs=selected_habit_logs,
    )


@router.post("/", response_model=WorkspaceResponse)
def create_workspace(
    workspace_in: WorkspaceCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    new_workspace = Workspace(name=workspace_in.name, description=workspace_in.description)
    db.add(new_workspace)
    db.flush()

    admin_member = WorkspaceMember(
        workspace_id=new_workspace.id,
        user_id=current_user.id,
        role="admin",
    )
    db.add(admin_member)
    db.commit()
    db.refresh(new_workspace)

    return serialize_workspace(new_workspace, "admin")


@router.get("/", response_model=List[WorkspaceResponse])
def get_my_workspaces(
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    memberships = db.query(WorkspaceMember).filter(WorkspaceMember.user_id == current_user.id).all()
    workspace_roles = {membership.workspace_id: membership.role for membership in memberships}
    workspace_ids = list(workspace_roles.keys())

    if not workspace_ids:
        return []

    query = db.query(Workspace).filter(Workspace.id.in_(workspace_ids))

    if q:
        search_value = f"%{q.strip()}%"
        query = query.filter(
            or_(
                Workspace.name.ilike(search_value),
                Workspace.description.ilike(search_value),
            )
        )

    workspaces = paginate_query(
        query.order_by(Workspace.created_at.desc(), Workspace.name.asc()),
        limit=limit,
        offset=offset,
    ).all()

    return [
        serialize_workspace(workspace, workspace_roles.get(workspace.id, "student"))
        for workspace in workspaces
    ]


@router.patch("/{workspace_id}", response_model=WorkspaceResponse)
def update_workspace(
    workspace_id: UUID,
    workspace_update: WorkspaceUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    member = require_workspace_admin(db, workspace_id, current_user)
    workspace = get_workspace_or_404(db, workspace_id)

    workspace.name = workspace_update.name
    workspace.description = workspace_update.description

    db.commit()
    db.refresh(workspace)

    role = "admin" if current_user.is_superuser else member.role
    return serialize_workspace(workspace, role)


@router.delete("/{workspace_id}")
def delete_workspace(
    workspace_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_workspace_admin(db, workspace_id, current_user)
    workspace = get_workspace_or_404(db, workspace_id)

    tasks = db.query(Task).filter(Task.workspace_id == workspace_id).all()
    for task in tasks:
        if task.event_id:
            delete_event_from_calendar(str(task.created_by), task.event_id, db)
        db.delete(task)

    habits = db.query(Habit).filter(Habit.workspace_id == workspace_id).all()
    for habit in habits:
        if habit.event_id:
            delete_event_from_calendar(str(habit.created_by), habit.event_id, db)
        db.query(HabitLog).filter(HabitLog.habit_id == habit.id).delete()
        db.delete(habit)

    db.delete(workspace)
    db.commit()
    return {"message": "Простір успішно видалено"}


@router.get("/{workspace_id}/members", response_model=List[WorkspaceMemberResponse])
def get_workspace_members(
    workspace_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    q: str | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_workspace_membership(db, workspace_id, current_user)

    query = db.query(WorkspaceMember, User).join(
        User, User.id == WorkspaceMember.user_id
    ).filter(
        WorkspaceMember.workspace_id == workspace_id
    )

    if q:
        search_value = f"%{q.strip()}%"
        query = query.filter(
            or_(
                User.name.ilike(search_value),
                User.email.ilike(search_value),
            )
        )

    members = paginate_query(
        query.order_by(User.name.asc(), User.email.asc()),
        limit=limit,
        offset=offset,
    ).all()

    return [
        WorkspaceMemberResponse(
            user_id=user.id,
            email=user.email,
            name=user.name,
            role=member.role,
        )
        for member, user in members
    ]


@router.post("/{workspace_id}/members")
def add_member_to_workspace(
    workspace_id: UUID,
    member_in: WorkspaceMemberAdd,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_member = require_workspace_manager(db, workspace_id, current_user)
    target_role = validate_role(member_in.role)

    if not current_user.is_superuser and current_member.role == "teacher" and target_role == "admin":
        raise HTTPException(status_code=403, detail="Лише адміністратор може призначати роль admin")

    user_to_add = db.query(User).filter(User.email == member_in.email.lower()).first()
    if not user_to_add:
        raise HTTPException(status_code=404, detail="Користувача з таким email не знайдено на платформі")

    existing_member = get_workspace_member_record(db, workspace_id, user_to_add.id)
    if existing_member:
        raise HTTPException(status_code=400, detail="Користувач вже є учасником цього простору")

    new_member = WorkspaceMember(
        workspace_id=workspace_id,
        user_id=user_to_add.id,
        role=target_role,
    )
    db.add(new_member)
    db.commit()

    return {"message": f"Користувача {member_in.email.lower()} успішно додано як {target_role}"}


@router.patch("/{workspace_id}/members/{user_id}")
def update_workspace_member_role(
    workspace_id: UUID,
    user_id: UUID,
    member_update: WorkspaceMemberUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_member = require_workspace_manager(db, workspace_id, current_user)
    target_member = get_workspace_member_record(db, workspace_id, user_id)
    if not target_member:
        raise HTTPException(status_code=404, detail="Учасника простору не знайдено")

    next_role = validate_role(member_update.role)

    if not current_user.is_superuser and current_member.role == "teacher":
        if target_member.role == "admin" or next_role == "admin":
            raise HTTPException(status_code=403, detail="Лише адміністратор може змінювати роль admin")

    if target_member.role == "admin" and next_role != "admin" and count_workspace_admins(db, workspace_id) == 1:
        raise HTTPException(status_code=400, detail="У просторі має залишитися хоча б один адміністратор")

    target_member.role = next_role
    db.commit()

    return {"message": "Роль учасника оновлено"}


@router.delete("/{workspace_id}/members/{user_id}")
def remove_member_from_workspace(
    workspace_id: UUID,
    user_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    current_member = require_workspace_manager(db, workspace_id, current_user)
    target_member = get_workspace_member_record(db, workspace_id, user_id)
    if not target_member:
        raise HTTPException(status_code=404, detail="Учасника простору не знайдено")

    if not current_user.is_superuser and current_member.role == "teacher" and target_member.role == "admin":
        raise HTTPException(status_code=403, detail="Лише адміністратор може видаляти admin з простору")

    if target_member.role == "admin" and count_workspace_admins(db, workspace_id) == 1:
        raise HTTPException(status_code=400, detail="Неможливо видалити останнього адміністратора простору")

    db.delete(target_member)
    db.commit()
    return {"message": "Учасника видалено з простору"}


@router.get("/{workspace_id}/tasks", response_model=List[TaskResponse])
def get_workspace_tasks(
    workspace_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    status_filter: Literal["all", "active", "completed"] = Query(default="all"),
    assignment_filter: Literal["all", "assigned_to_me", "spacewide"] = Query(default="all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_workspace_membership(db, workspace_id, current_user)

    tasks = db.query(Task).filter(Task.workspace_id == workspace_id).order_by(
        Task.completed_at.desc(),
        Task.created_at.desc(),
    ).all()
    visible_tasks = [
        task for task in tasks
        if task_matches_workspace_filter(task, current_user, status_filter, assignment_filter)
    ]

    paginated_tasks = visible_tasks[offset:offset + limit]
    return [serialize_task(task) for task in paginated_tasks]


@router.get("/{workspace_id}/habits", response_model=List[HabitResponse])
def get_workspace_habits(
    workspace_id: UUID,
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    assignment_filter: Literal["all", "mine", "spacewide"] = Query(default="all"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    require_workspace_membership(db, workspace_id, current_user)

    habits = db.query(Habit).filter(Habit.workspace_id == workspace_id).order_by(Habit.created_at.desc()).all()
    visible_habits = [
        habit for habit in habits
        if habit_matches_workspace_filter(habit, current_user, assignment_filter)
    ]

    paginated_habits = visible_habits[offset:offset + limit]
    return [serialize_habit(habit) for habit in paginated_habits]
