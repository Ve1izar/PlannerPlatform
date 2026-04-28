from datetime import datetime
from typing import Optional
from uuid import UUID

from pydantic import BaseModel, EmailStr


class WorkspaceBase(BaseModel):
    name: str
    description: Optional[str] = None


class WorkspaceCreate(WorkspaceBase):
    pass


class WorkspaceUpdate(WorkspaceBase):
    pass


class WorkspaceResponse(WorkspaceBase):
    id: UUID
    created_at: datetime
    current_user_role: str

    class Config:
        from_attributes = True


class WorkspaceMemberAdd(BaseModel):
    email: EmailStr
    role: str


class WorkspaceMemberUpdate(BaseModel):
    role: str


class WorkspaceMemberResponse(BaseModel):
    user_id: UUID
    email: EmailStr
    name: str
    role: str
