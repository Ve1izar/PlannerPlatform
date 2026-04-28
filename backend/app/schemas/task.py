from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class TaskBase(BaseModel):
    title: str
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    workspace_id: Optional[UUID] = None
    participant_emails: Optional[list[EmailStr]] = None


class TaskCreate(TaskBase):
    pass


class TaskUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    due_date: Optional[datetime] = None
    workspace_id: Optional[UUID] = None
    participant_emails: Optional[list[EmailStr]] = None


class TaskUpdateStatus(BaseModel):
    status: str


class TaskResponse(TaskBase):
    id: UUID
    status: str
    created_by: UUID
    created_at: datetime
    completed_at: Optional[datetime] = None
    workspace_name: Optional[str] = None

    class Config:
        from_attributes = True
