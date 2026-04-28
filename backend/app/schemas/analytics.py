from datetime import datetime
from pydantic import BaseModel


class AnalyticsMonthOption(BaseModel):
    value: str
    label: str
    completed_tasks: int
    habit_logs: int


class CompletedTaskLogItem(BaseModel):
    id: str
    title: str
    completed_at: datetime


class HabitLogItem(BaseModel):
    id: str
    habit_id: str
    title: str
    completed_at: datetime


class AnalyticsOverviewResponse(BaseModel):
    completed_tasks: int
    habit_logs: int
    available_months: list[AnalyticsMonthOption]
    selected_month: str
    task_logs: list[CompletedTaskLogItem]
    habit_completion_logs: list[HabitLogItem]
