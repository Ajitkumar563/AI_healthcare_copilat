import uuid
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_

from database.db import get_db
from models.models import Doctor, Appointment, User
from core.security import get_current_user_dep

doctors_router = APIRouter()
appointments_router = APIRouter()


# ─────────────────────────────────────────────
# Request schemas
# ─────────────────────────────────────────────

class BookAppointmentRequest(BaseModel):
    doctor_id: str
    appointment_date: str          # "YYYY-MM-DD"
    appointment_time: str          # "HH:MM"
    type: str = "video"            # "video" | "in-person"
    reason: str | None = None


# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

def _doctor_to_dict(d: Doctor) -> dict:
    return {
        "id": d.id,
        "name": d.name,
        "specialty": d.specialty,
        "qualification": d.qualification,
        "experience_years": d.experience_years,
        "rating": d.rating,
        "consultation_fee": d.consultation_fee,
        "languages": d.languages,
        "location": d.location,
        "avatar_seed": d.avatar_seed,
        "bio": d.bio,
        "available_days": d.available_days,
        "slot_duration_minutes": d.slot_duration_minutes,
        "start_time": d.start_time,
        "end_time": d.end_time,
    }


def _appointment_to_dict(a: Appointment, doctor: Doctor | None = None) -> dict:
    video_url = None
    if a.video_room_id:
        video_url = f"https://meet.jit.si/{a.video_room_id}"
    return {
        "id": a.id,
        "patient_id": a.patient_id,
        "doctor_id": a.doctor_id,
        "doctor": _doctor_to_dict(doctor) if doctor else None,
        "appointment_date": a.appointment_date,
        "appointment_time": a.appointment_time,
        "type": a.type,
        "status": a.status,
        "reason": a.reason,
        "video_room_id": a.video_room_id,
        "video_url": video_url,
        "created_at": a.created_at.isoformat() if a.created_at else None,
    }


def _generate_slots(doctor: Doctor, date_str: str, booked_times: set) -> list:
    """Generate time slots between doctor's start and end times, marking booked ones."""
    try:
        target = datetime.strptime(date_str, "%Y-%m-%d")
    except ValueError:
        return []

    day_name = target.strftime("%a")  # "Mon", "Tue", etc.
    available = [d.strip() for d in doctor.available_days.split(",")]
    if day_name not in available:
        return []

    start_h, start_m = map(int, doctor.start_time.split(":"))
    end_h, end_m = map(int, doctor.end_time.split(":"))
    duration = timedelta(minutes=doctor.slot_duration_minutes)

    current = datetime(2000, 1, 1, start_h, start_m)
    end_dt = datetime(2000, 1, 1, end_h, end_m)

    slots = []
    while current < end_dt:
        time_str = current.strftime("%H:%M")
        slots.append({"time": time_str, "available": time_str not in booked_times})
        current += duration

    return slots


# ─────────────────────────────────────────────
# Doctors endpoints
# ─────────────────────────────────────────────

@doctors_router.get("/")
async def list_doctors(
    specialty: str | None = Query(None),
    location: str | None = Query(None),
    language: str | None = Query(None),
    search: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Doctor)
    result = await db.execute(stmt)
    doctors = result.scalars().all()

    # Apply filters in Python (simple, works for small datasets)
    filtered = []
    for d in doctors:
        if specialty and d.specialty.lower() != specialty.lower():
            continue
        if location and location.lower() not in d.location.lower():
            continue
        if language and language.lower() not in d.languages.lower():
            continue
        if search and search.lower() not in d.name.lower():
            continue
        filtered.append(d)

    return [_doctor_to_dict(d) for d in filtered]


@doctors_router.get("/{doctor_id}")
async def get_doctor(
    doctor_id: str,
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Doctor).where(Doctor.id == doctor_id))
    doctor = result.scalar_one_or_none()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")
    return _doctor_to_dict(doctor)


@doctors_router.get("/{doctor_id}/slots")
async def get_doctor_slots(
    doctor_id: str,
    date: str = Query(..., description="Date in YYYY-MM-DD format"),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Doctor).where(Doctor.id == doctor_id))
    doctor = result.scalar_one_or_none()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    # Fetch already-booked slots for this doctor on this date
    booked_result = await db.execute(
        select(Appointment.appointment_time).where(
            and_(
                Appointment.doctor_id == doctor_id,
                Appointment.appointment_date == date,
                Appointment.status != "cancelled",
            )
        )
    )
    booked_times = {row[0] for row in booked_result.fetchall()}

    slots = _generate_slots(doctor, date, booked_times)
    return {"date": date, "doctor_id": doctor_id, "slots": slots}


# ─────────────────────────────────────────────
# Appointments endpoints
# ─────────────────────────────────────────────

@appointments_router.post("/")
async def book_appointment(
    request: BookAppointmentRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    # Validate doctor exists
    result = await db.execute(select(Doctor).where(Doctor.id == request.doctor_id))
    doctor = result.scalar_one_or_none()
    if not doctor:
        raise HTTPException(status_code=404, detail="Doctor not found")

    # Validate day is available for this doctor
    try:
        target = datetime.strptime(request.appointment_date, "%Y-%m-%d")
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format. Use YYYY-MM-DD")

    day_name = target.strftime("%a")
    if day_name not in [d.strip() for d in doctor.available_days.split(",")]:
        raise HTTPException(status_code=400, detail=f"Doctor is not available on {day_name}")

    # Check slot is not already booked
    conflict = await db.execute(
        select(Appointment).where(
            and_(
                Appointment.doctor_id == request.doctor_id,
                Appointment.appointment_date == request.appointment_date,
                Appointment.appointment_time == request.appointment_time,
                Appointment.status != "cancelled",
            )
        )
    )
    if conflict.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="This slot is already booked. Please choose another time.")

    # Generate video room ID for video appointments
    video_room_id = None
    if request.type == "video":
        random_part = uuid.uuid4().hex[:10]
        video_room_id = f"sahaay-{random_part}"

    appointment = Appointment(
        patient_id=current_user.id,
        doctor_id=request.doctor_id,
        appointment_date=request.appointment_date,
        appointment_time=request.appointment_time,
        type=request.type,
        status="upcoming",
        reason=request.reason,
        video_room_id=video_room_id,
    )
    db.add(appointment)
    await db.flush()

    return _appointment_to_dict(appointment, doctor)


def _auto_complete_if_past(appointment: Appointment) -> None:
    """Flip status to 'completed' if the appointment datetime has passed."""
    if appointment.status != "upcoming":
        return
    try:
        apt_dt = datetime.strptime(
            f"{appointment.appointment_date} {appointment.appointment_time}",
            "%Y-%m-%d %H:%M",
        )
        if apt_dt < datetime.utcnow():
            appointment.status = "completed"
    except ValueError:
        pass


@appointments_router.get("/")
async def list_appointments(
    status: str | None = Query(None, description="Filter by status: upcoming/completed/cancelled"),
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    # Fetch without status filter first so we can auto-complete past ones
    stmt = select(Appointment).where(Appointment.patient_id == current_user.id)
    stmt = stmt.order_by(Appointment.appointment_date.desc(), Appointment.appointment_time.desc())

    result = await db.execute(stmt)
    appointments = result.scalars().all()

    # Auto-complete any upcoming appointment whose datetime has passed
    for a in appointments:
        _auto_complete_if_past(a)

    # Apply status filter after auto-completion so the caller sees the correct state
    if status:
        appointments = [a for a in appointments if a.status == status]

    # Batch-load doctors
    doctor_ids = list({a.doctor_id for a in appointments})
    doctors_result = await db.execute(select(Doctor).where(Doctor.id.in_(doctor_ids)))
    doctors_map = {d.id: d for d in doctors_result.scalars().all()}

    return [_appointment_to_dict(a, doctors_map.get(a.doctor_id)) for a in appointments]


@appointments_router.get("/{appointment_id}")
async def get_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Appointment).where(
            Appointment.id == appointment_id,
            Appointment.patient_id == current_user.id,
        )
    )
    appointment = result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")

    _auto_complete_if_past(appointment)

    doctor_result = await db.execute(select(Doctor).where(Doctor.id == appointment.doctor_id))
    doctor = doctor_result.scalar_one_or_none()

    return _appointment_to_dict(appointment, doctor)


@appointments_router.put("/{appointment_id}/cancel")
async def cancel_appointment(
    appointment_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Appointment).where(
            Appointment.id == appointment_id,
            Appointment.patient_id == current_user.id,
        )
    )
    appointment = result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.status == "cancelled":
        raise HTTPException(status_code=400, detail="Appointment is already cancelled")
    if appointment.status == "completed":
        raise HTTPException(status_code=400, detail="Cannot cancel a completed appointment")

    appointment.status = "cancelled"
    return {"message": "Appointment cancelled successfully", "appointment_id": appointment_id}


@appointments_router.get("/{appointment_id}/video-link")
async def get_video_link(
    appointment_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Appointment).where(
            Appointment.id == appointment_id,
            Appointment.patient_id == current_user.id,
        )
    )
    appointment = result.scalar_one_or_none()
    if not appointment:
        raise HTTPException(status_code=404, detail="Appointment not found")
    if appointment.type != "video":
        raise HTTPException(status_code=400, detail="This is not a video appointment")
    if not appointment.video_room_id:
        raise HTTPException(status_code=400, detail="No video room assigned for this appointment")

    return {
        "video_room_id": appointment.video_room_id,
        "video_url": f"https://meet.jit.si/{appointment.video_room_id}",
        "instructions": "Click the link to join your video consultation. No download required.",
    }


# Backward-compat: keep the old `router` name so existing main.py import still works
router = doctors_router
