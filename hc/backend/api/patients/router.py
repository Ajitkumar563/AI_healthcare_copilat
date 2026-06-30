import json
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_
from sqlalchemy.orm import selectinload

from database.db import get_db
from models.models import User, Report, Reminder, FamilyMember, Appointment, Symptom
from core.security import get_current_user_dep

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
    days: int = Query(default=0, ge=0, description="Limit to last N days; 0 = all time"),
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Return all health events merged and sorted chronologically."""
    cutoff: datetime | None = datetime.utcnow() - timedelta(days=days) if days > 0 else None
    cutoff_str: str | None = cutoff.date().isoformat() if cutoff else None

    # ── Reports ──────────────────────────────────────────────────────────────
    q_rep = select(Report).where(Report.user_id == current_user.id)
    if cutoff:
        q_rep = q_rep.where(Report.created_at >= cutoff)
    reports = (await db.execute(q_rep.order_by(Report.created_at.desc()))).scalars().all()

    # ── Reminders ────────────────────────────────────────────────────────────
    q_rem = select(Reminder).where(Reminder.user_id == current_user.id)
    if cutoff:
        q_rem = q_rem.where(Reminder.created_at >= cutoff)
    reminders = (await db.execute(q_rem.order_by(Reminder.created_at.desc()))).scalars().all()

    # ── Symptoms ─────────────────────────────────────────────────────────────
    q_sym = select(Symptom).where(Symptom.user_id == current_user.id)
    if cutoff:
        q_sym = q_sym.where(Symptom.created_at >= cutoff)
    symptoms = (await db.execute(q_sym.order_by(Symptom.created_at.desc()))).scalars().all()

    # ── Appointments (eager-load doctor to avoid lazy-load in async context) ─
    q_apt = (
        select(Appointment)
        .options(selectinload(Appointment.doctor))
        .where(Appointment.patient_id == current_user.id)
    )
    if cutoff_str:
        q_apt = q_apt.where(Appointment.appointment_date >= cutoff_str)
    apts = (
        await db.execute(
            q_apt.order_by(
                Appointment.appointment_date.desc(),
                Appointment.appointment_time.desc(),
            )
        )
    ).scalars().all()

    events: list[dict] = []

    for r in reports:
        approval_status = r.approval_status or "approved"
        show_ai = approval_status == "approved"
        events.append({
            "id": r.id,
            "event_type": "report",
            "title": r.file_name or "Lab Report",
            "description": (
                (r.ai_summary if show_ai else None)
                or "Report uploaded — awaiting doctor review."
            ),
            "event_date": r.created_at.isoformat() if r.created_at else None,
            "risk_level": r.risk_level,
            "approval_status": approval_status,
            "metadata": {
                "report_type": r.report_type,
                "file_url": r.file_url,
                "risk_score": r.risk_score,
                "doctor_notes": r.doctor_notes if show_ai else None,
            },
        })

    for sym in symptoms:
        preview = sym.symptoms_text[:120] + ("…" if len(sym.symptoms_text) > 120 else "")
        events.append({
            "id": sym.id,
            "event_type": "symptom",
            "title": "Symptom Check",
            "description": preview,
            "event_date": sym.created_at.isoformat() if sym.created_at else None,
            "risk_level": sym.risk_level,
            "metadata": {
                "symptoms_text": sym.symptoms_text,
                "possible_conditions": sym.possible_conditions,
                "ai_response": sym.ai_response,
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
            "description": f"{rem.dosage or 'Standard dose'} — {rem.frequency.replace('_', ' ')}",
            "event_date": rem.created_at.isoformat() if rem.created_at else None,
            "metadata": {
                "times": times,
                "duration": rem.duration,
                "instructions": rem.instructions,
                "missed_count": rem.missed_count,
                "taken_today": rem.taken_today,
            },
        })

    for apt in apts:
        iso_dt = f"{apt.appointment_date}T{apt.appointment_time}:00"
        doctor_name = apt.doctor.name if apt.doctor else "Unknown Doctor"
        events.append({
            "id": apt.id,
            "event_type": "appointment",
            "title": f"Dr. {doctor_name}",
            "description": f"{apt.type.title()} appointment — {apt.status.replace('_', ' ').title()}",
            "event_date": iso_dt,
            "metadata": {
                "doctor_name": doctor_name,
                "doctor_specialty": apt.doctor.specialty if apt.doctor else None,
                "appointment_date": apt.appointment_date,
                "appointment_time": apt.appointment_time,
                "type": apt.type,
                "status": apt.status,
                "reason": apt.reason,
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
