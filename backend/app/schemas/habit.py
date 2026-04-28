from datetime import datetime
from typing import Literal, Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class MonthlyHabitPattern(BaseModel):
    week_of_month: Literal["first", "second", "third", "fourth", "last"]
    weekday: int


class HabitBase(BaseModel):
    title: str
    frequency: str
    target_days: Optional[list[int] | MonthlyHabitPattern] = None
    workspace_id: Optional[UUID] = None
    participant_emails: Optional[list[EmailStr]] = None


class HabitCreate(HabitBase):
    pass


class HabitUpdate(BaseModel):
    title: Optional[str] = None
    frequency: Optional[str] = None
    target_days: Optional[list[int] | MonthlyHabitPattern] = None
    status: Optional[str] = None
    participant_emails: Optional[list[EmailStr]] = None


class HabitResponse(HabitBase):
    id: UUID
    status: str
    created_by: UUID
    created_at: datetime

    class Config:
        from_attributes = True


class HabitLogResponse(BaseModel):
    id: UUID
    habit_id: UUID
    user_id: UUID
    completed_at: datetime

    class Config:
        from_attributes = True
