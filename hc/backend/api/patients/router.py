import json
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.db import get_db
from models.models import User, Report, Reminder, FamilyMember
from core.security import get_current_user_dep
from sqlalchemy import or_

router = APIRouter()


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    age: int | None = None
    gender: str | None = None
    weight: float | None = None
    height: float | None = None
    medical_history: str | None = None
    allergies: str | None = None
    current_medicines: str | None = None
    language_preference: str | None = None


@router.get("/me")
async def get_profile(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return _user_to_dict(user)


@router.put("/me")
async def update_profile(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    for field, value in request.model_dump(exclude_none=True).items():
        setattr(user, field, value)

    return _user_to_dict(user)


@router.get("/timeline")
async def get_timeline(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Aggregate reports and reminders into a unified chronological timeline."""

    reports_result = await db.execute(
        select(Report)
        .where(Report.user_id == current_user.id)
        .order_by(Report.created_at.desc())
    )
    reports = reports_result.scalars().all()

    reminders_result = await db.execute(
        select(Reminder)
        .where(Reminder.user_id == current_user.id)
        .order_by(Reminder.created_at.desc())
    )
    reminders = reminders_result.scalars().all()

    events = []

    for r in reports:
        approval_status = getattr(r, "approval_status", None) or "approved"
        show_ai = approval_status == "approved"
        date_label = r.created_at.strftime("%-d %b %Y") if r.created_at else "Uploaded"
        title = r.file_name or f"Report — {date_label}"
        events.append({
            "id": r.id,
            "event_type": "report",
            "title": title,
            "report_type": r.report_type,
            # Don't leak AI summary for reports pending doctor approval
            "description": (r.ai_summary if show_ai else None) or "Report uploaded",
            "event_date": r.created_at.isoformat() if r.created_at else None,
            # risk_level is always shown — needed for emergency risk detection
            "risk_level": r.risk_level,
            "approval_status": approval_status,
            "metadata": {
                "file_name": r.file_name,
                "file_url": r.file_url,
                "risk_score": r.risk_score,
            },
        })

    for rem in reminders:
        times = ["08:00 AM"]
        if rem.times:
            try:
                times = json.loads(rem.times)
            except Exception:
                times = [rem.times]
        events.append({
            "id": rem.id,
            "event_type": "reminder",
            "title": f"Medicine: {rem.medicine_name}",
            "description": f"{rem.dosage or ''} — {rem.frequency}",
            "event_date": rem.created_at.isoformat() if rem.created_at else None,
            "metadata": {
                "times": times,
                "duration": rem.duration,
                "missed_count": rem.missed_count,
                "taken_today": rem.taken_today,
            },
        })

    events.sort(key=lambda e: e["event_date"] or "", reverse=True)
    return events


@router.get("/stats")
async def get_stats(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    reports_result = await db.execute(
        select(Report).where(Report.user_id == current_user.id)
    )
    reports = reports_result.scalars().all()

    reminders_result = await db.execute(
        select(Reminder).where(Reminder.user_id == current_user.id, Reminder.is_active == True)
    )
    reminders = reminders_result.scalars().all()

    family_result = await db.execute(
        select(FamilyMember).where(FamilyMember.owner_id == current_user.id)
    )
    family = family_result.scalars().all()

    high_risk_reports = [r for r in reports if r.risk_level in ("high", "critical")]
    missed_reminders = sum(r.missed_count or 0 for r in reminders)

    return {
        "total_reports": len(reports),
        "high_risk_reports": len(high_risk_reports),
        "active_reminders": len(reminders),
        "missed_reminders": missed_reminders,
        "family_members": len(family),
        "high_risk_family": len([m for m in family if m.risk_level.lower() in ("high", "critical")]),
    }


@router.get("/health-score-history")
async def get_health_score_history(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Return health score over time for approved reports that have AI scores."""
    result = await db.execute(
        select(Report)
        .where(
            Report.user_id == current_user.id,
            Report.risk_score.isnot(None),
            or_(Report.approval_status == "approved", Report.approval_status.is_(None)),
        )
        .order_by(Report.created_at.asc())
    )
    reports = result.scalars().all()
    return [
        {
            "date": r.created_at.date().isoformat(),
            "risk_score": int(r.risk_score),
            "risk_level": (r.risk_level or "low").capitalize(),
            "report_name": r.file_name or r.report_type or "Report",
        }
        for r in reports
        if r.created_at
    ]


def _user_to_dict(user: User) -> dict:
    return {
        "id": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "phone": user.phone,
        "age": user.age,
        "gender": user.gender,
        "weight": user.weight,
        "height": user.height,
        "medical_history": user.medical_history,
        "allergies": user.allergies,
        "current_medicines": user.current_medicines,
        "language_preference": user.language_preference,
        "created_at": user.created_at.isoformat() if user.created_at else None,
    }
