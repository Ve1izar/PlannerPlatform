from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import get_current_user
from app.db.database import get_db
from app.db.models import Habit, HabitLog, Task, User
from app.schemas.analytics import (
    AnalyticsMonthOption,
    AnalyticsOverviewResponse,
    CompletedTaskLogItem,
    HabitLogItem,
)

router = APIRouter()


def normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None and value.utcoffset() is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def shift_months(value: datetime, months_delta: int) -> datetime:
    month_index = (value.year * 12 + value.month - 1) + months_delta
    year = month_index // 12
    month = month_index % 12 + 1
    return value.replace(year=year, month=month, day=1, hour=0, minute=0, second=0, microsecond=0)


def month_label(month_key: str) -> str:
    year, month = month_key.split("-")
    return f"{month}.{year}"


@router.get("/overview", response_model=AnalyticsOverviewResponse)
def get_analytics_overview(
        range_months: int = 3,
        month: str | None = None,
        db: Session = Depends(get_db),
        current_user: User = Depends(get_current_user)
):
    if range_months not in {3, 6, 12}:
        raise HTTPException(status_code=400, detail="range_months must be one of 3, 6, or 12")

    now = datetime.utcnow()
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    range_start = shift_months(current_month_start, -(range_months - 1))

    completed_tasks = [
        task for task in db.query(Task).filter(
            Task.completed_at.is_not(None),
            Task.completed_by == current_user.id,
        ).all()
        if (normalized_completed_at := normalize_datetime(task.completed_at))
        and range_start <= normalized_completed_at <= now
    ]

    habit_logs = [
        (habit_log, title) for habit_log, title in db.query(HabitLog, Habit.title).join(
            Habit, Habit.id == HabitLog.habit_id
        ).filter(
            HabitLog.user_id == current_user.id,
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
    selected_month_start = datetime(int(selected_year), int(selected_month_number), 1)
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
