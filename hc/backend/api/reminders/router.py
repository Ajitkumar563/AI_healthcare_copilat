import json
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.db import get_db
from models.models import Reminder, User
from core.security import get_current_user_dep

router = APIRouter()


class CreateReminderRequest(BaseModel):
    medicine_name: str
    dosage: str | None = None
    frequency: str = "once_daily"
    times: list[str] = ["08:00 AM"]
    duration: str | None = None
    instructions: str | None = None


class UpdateReminderRequest(BaseModel):
    medicine_name: str | None = None
    dosage: str | None = None
    frequency: str | None = None
    times: list[str] | None = None
    duration: str | None = None
    instructions: str | None = None
    is_active: bool | None = None


@router.get("/")
async def list_reminders(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reminder)
        .where(Reminder.user_id == current_user.id, Reminder.is_active == True)
        .order_by(Reminder.created_at.desc())
    )
    reminders = result.scalars().all()
    return [_reminder_to_dict(r) for r in reminders]


@router.post("/")
async def create_reminder(
    request: CreateReminderRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    reminder = Reminder(
        user_id=current_user.id,
        medicine_name=request.medicine_name,
        dosage=request.dosage,
        frequency=request.frequency,
        times=json.dumps(request.times),
        duration=request.duration,
        instructions=request.instructions,
    )
    db.add(reminder)
    await db.flush()
    return _reminder_to_dict(reminder)


@router.post("/reset-daily")
async def reset_daily(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Set taken_today=False for all reminders where last_taken_at is before today.

    Safe to call on every page load — only modifies reminders that are actually stale.
    Returns the count of reminders that were reset.
    """
    result = await db.execute(
        select(Reminder).where(
            Reminder.user_id == current_user.id,
            Reminder.is_active == True,
            Reminder.taken_today == True,
        )
    )
    reminders = result.scalars().all()
    today = datetime.utcnow().date()
    reset_count = 0
    for r in reminders:
        if r.last_taken_at is None or r.last_taken_at.date() < today:
            r.taken_today = False
            reset_count += 1
    return {"message": f"Reset {reset_count} reminder(s) for a new day", "reset_count": reset_count}


@router.put("/{reminder_id}")
async def update_reminder(
    reminder_id: str,
    request: UpdateReminderRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
    )
    reminder = result.scalar_one_or_none()
    if reminder is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    data = request.model_dump(exclude_none=True)
    if "times" in data:
        data["times"] = json.dumps(data["times"])
    for field, value in data.items():
        setattr(reminder, field, value)

    return _reminder_to_dict(reminder)


@router.post("/{reminder_id}/mark-taken")
async def mark_taken(
    reminder_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
    )
    reminder = result.scalar_one_or_none()
    if reminder is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    reminder.taken_today = True
    reminder.last_taken_at = datetime.utcnow()
    return {"message": "Marked as taken", "reminder_id": reminder_id}


@router.post("/{reminder_id}/mark-missed")
async def mark_missed(
    reminder_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
    )
    reminder = result.scalar_one_or_none()
    if reminder is None:
        raise HTTPException(status_code=404, detail="Reminder not found")

    reminder.missed_count = (reminder.missed_count or 0) + 1
    reminder.taken_today = False
    return {"message": "Marked as missed", "missed_count": reminder.missed_count}


@router.delete("/{reminder_id}")
async def delete_reminder(
    reminder_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Reminder).where(Reminder.id == reminder_id, Reminder.user_id == current_user.id)
    )
    reminder = result.scalar_one_or_none()
    if reminder is None:
        raise HTTPException(status_code=404, detail="Reminder not found")
    await db.delete(reminder)
    return {"message": "Reminder deleted"}


def _reminder_to_dict(r: Reminder) -> dict:
    times = ["08:00 AM"]
    if r.times:
        try:
            times = json.loads(r.times)
        except Exception:
            times = [r.times]
    return {
        "id": r.id,
        "user_id": r.user_id,
        "medicine_name": r.medicine_name,
        "dosage": r.dosage,
        "frequency": r.frequency,
        "times": times,
        "duration": r.duration,
        "instructions": r.instructions,
        "is_active": r.is_active,
        "missed_count": r.missed_count,
        "taken_today": r.taken_today,
        "last_taken_at": r.last_taken_at.isoformat() if r.last_taken_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
