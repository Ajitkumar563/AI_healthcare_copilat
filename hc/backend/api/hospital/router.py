import asyncio
import json as _json
import secrets
import string
from datetime import datetime, date
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct, case as sa_case

from database.db import get_db
from models.models import User, Hospital, Doctor, Appointment, Report, Notification
from core.security import (
    get_current_user_dep,
    require_role,
    create_access_token,
    hash_password,
    verify_password,
)

router = APIRouter()


# ── Request models ────────────────────────────────────────────────────────────

class RegisterHospitalRequest(BaseModel):
    hospital_name: str
    address: str = ""
    city: str = ""
    phone: str = ""
    admin_name: str
    admin_email: str
    admin_password: str


class HospitalLoginRequest(BaseModel):
    email: str
    password: str


class InviteDoctorRequest(BaseModel):
    name: str
    email: str
    specialty: str = "General Medicine"
    qualification: str = "MBBS"
    experience_years: int = 5


class ApproveReportRequest(BaseModel):
    doctor_notes: str = ""


class RejectReportRequest(BaseModel):
    doctor_notes: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def _user_dict(u: User) -> dict:
    return {
        "id": u.id,
        "email": u.email,
        "name": u.name,
        "role": u.role,
        "hospital_id": u.hospital_id,
    }


async def _hospital_patient_ids(db: AsyncSession, hospital_id: str) -> list[str]:
    """All distinct patient (role='patient') IDs who have appointments with doctors at this hospital.
    Excludes admin/doctor accounts even if they have appointments in the system."""
    result = await db.execute(
        select(distinct(Appointment.patient_id))
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .join(User, User.id == Appointment.patient_id)
        .where(
            Doctor.hospital_id == hospital_id,
            User.role == "patient",
        )
    )
    return [r[0] for r in result.fetchall()]


def _require_hospital(user: User) -> str:
    if not user.hospital_id:
        raise HTTPException(status_code=403, detail="No hospital association on this account")
    return user.hospital_id


# ── Registration & login ──────────────────────────────────────────────────────

@router.post("/register")
async def register_hospital(
    body: RegisterHospitalRequest,
    db: AsyncSession = Depends(get_db),
):
    existing = (await db.execute(select(User).where(User.email == body.admin_email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    hospital = Hospital(
        name=body.hospital_name,
        address=body.address or None,
        city=body.city or None,
        phone=body.phone or None,
    )
    db.add(hospital)
    await db.flush()

    admin = User(
        name=body.admin_name,
        email=body.admin_email,
        role="admin",
        hospital_id=hospital.id,
        password_hash=hash_password(body.admin_password),
    )
    db.add(admin)
    await db.flush()

    token = create_access_token({
        "sub": admin.id,
        "email": admin.email,
        "name": admin.name,
        "role": "admin",
        "hospital_id": hospital.id,
    })
    return {
        "access_token": token,
        "token_type": "bearer",
        "user": _user_dict(admin),
        "hospital": {"id": hospital.id, "name": hospital.name},
    }


@router.post("/login")
async def hospital_login(
    body: HospitalLoginRequest,
    db: AsyncSession = Depends(get_db),
):
    user = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if not user or not user.password_hash:
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if not verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    if user.role not in ("admin", "doctor"):
        raise HTTPException(status_code=403, detail="Not a hospital staff account")

    token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "hospital_id": user.hospital_id,
    })
    return {"access_token": token, "token_type": "bearer", "user": _user_dict(user)}


# ── Dashboard stats ───────────────────────────────────────────────────────────

@router.get("/dashboard/stats")
async def dashboard_stats(
    current_user: User = Depends(require_role(["admin", "doctor"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)
    today_str = date.today().isoformat()
    first_of_month = date.today().replace(day=1).isoformat()

    patient_ids = await _hospital_patient_ids(db, hospital_id)
    total_patients = len(patient_ids)

    # New patients this month (first appointment >= first_of_month)
    new_pts = (await db.execute(
        select(func.count(distinct(Appointment.patient_id)))
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Doctor.hospital_id == hospital_id, Appointment.appointment_date >= first_of_month)
    )).scalar() or 0

    # High-risk patients (latest report risk_level in high/critical)
    high_risk = 0
    if patient_ids:
        high_risk = (await db.execute(
            select(func.count(distinct(Report.user_id)))
            .where(
                Report.user_id.in_(patient_ids),
                Report.risk_level.in_(["high", "critical"]),
            )
        )).scalar() or 0

    # Upcoming appointments (pending)
    pending = (await db.execute(
        select(func.count())
        .select_from(Appointment)
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Doctor.hospital_id == hospital_id, Appointment.status == "upcoming")
    )).scalar() or 0

    # Appointments today
    today_count = (await db.execute(
        select(func.count())
        .select_from(Appointment)
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Doctor.hospital_id == hospital_id, Appointment.appointment_date == today_str)
    )).scalar() or 0

    # Total doctors at this hospital
    total_doctors = (await db.execute(
        select(func.count()).select_from(Doctor).where(Doctor.hospital_id == hospital_id)
    )).scalar() or 0

    return {
        "total_patients": total_patients,
        "new_patients_this_month": new_pts,
        "high_risk_patients_count": high_risk,
        "pending_appointments": pending,
        "total_appointments_today": today_count,
        "total_doctors": total_doctors,
    }


# ── Doctor-specific dashboard stats ──────────────────────────────────────────

@router.get("/dashboard/doctor-stats")
async def doctor_dashboard_stats(
    current_user: User = Depends(require_role(["admin", "doctor"])),
    db: AsyncSession = Depends(get_db),
):
    """Returns metrics scoped to the logged-in doctor's own patients and schedule.
    Admin accounts fall back to hospital-wide aggregates."""
    hospital_id = _require_hospital(current_user)
    today_str = date.today().isoformat()

    # Resolve linked Doctor record (doctors only; admins may not have one)
    doctor = (await db.execute(
        select(Doctor).where(
            Doctor.user_id == current_user.id,
            Doctor.hospital_id == hospital_id,
        )
    )).scalar_one_or_none()

    if doctor:
        today_patients = (await db.execute(
            select(func.count()).select_from(Appointment).where(
                Appointment.doctor_id == doctor.id,
                Appointment.appointment_date == today_str,
                Appointment.status != "cancelled",
            )
        )).scalar() or 0

        upcoming_video = (await db.execute(
            select(func.count()).select_from(Appointment).where(
                Appointment.doctor_id == doctor.id,
                Appointment.type == "video",
                Appointment.status == "upcoming",
                Appointment.appointment_date >= today_str,
            )
        )).scalar() or 0

        # Build today's schedule with patient names
        sched_rows = (await db.execute(
            select(Appointment, User)
            .join(User, User.id == Appointment.patient_id)
            .where(
                Appointment.doctor_id == doctor.id,
                Appointment.appointment_date == today_str,
                Appointment.status != "cancelled",
            )
            .order_by(Appointment.appointment_time)
        )).all()

        today_schedule = [
            {
                "id": a.id,
                "patient_name": u.name,
                "patient_id": u.id,
                "appointment_time": a.appointment_time,
                "type": a.type,
                "status": a.status,
                "reason": a.reason,
                "video_url": f"https://meet.jit.si/{a.video_room_id}" if a.video_room_id else None,
            }
            for a, u in sched_rows
        ]
    else:
        # Admin fallback: hospital-wide today count
        today_patients = (await db.execute(
            select(func.count()).select_from(Appointment)
            .join(Doctor, Doctor.id == Appointment.doctor_id)
            .where(Doctor.hospital_id == hospital_id, Appointment.appointment_date == today_str)
        )).scalar() or 0

        upcoming_video = (await db.execute(
            select(func.count()).select_from(Appointment)
            .join(Doctor, Doctor.id == Appointment.doctor_id)
            .where(
                Doctor.hospital_id == hospital_id,
                Appointment.type == "video",
                Appointment.status == "upcoming",
                Appointment.appointment_date >= today_str,
            )
        )).scalar() or 0

        today_schedule = []

    # Hospital-wide: critical cases + pending reviews
    patient_ids = await _hospital_patient_ids(db, hospital_id)

    critical_cases = 0
    pending_reviews = 0
    if patient_ids:
        critical_cases = (await db.execute(
            select(func.count(distinct(Report.user_id))).where(
                Report.user_id.in_(patient_ids),
                Report.risk_level.in_(["high", "critical", "High", "Critical"]),
            )
        )).scalar() or 0

        pending_reviews = (await db.execute(
            select(func.count()).select_from(Report).where(
                Report.user_id.in_(patient_ids),
                Report.approval_status == "pending",
                Report.analysis_result.isnot(None),
            )
        )).scalar() or 0

    return {
        "today_patients": today_patients,
        "critical_cases": critical_cases,
        "pending_reviews": pending_reviews,
        "upcoming_video": upcoming_video,
        "new_reports": pending_reviews,
        "today_schedule": today_schedule,
    }


# ── Patient list ──────────────────────────────────────────────────────────────

@router.get("/patients")
async def list_patients(
    search: str | None = Query(None),
    risk_level: str | None = Query(None),
    current_user: User = Depends(require_role(["admin", "doctor"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)
    patient_ids = await _hospital_patient_ids(db, hospital_id)
    if not patient_ids:
        return []

    user_q = select(User).where(User.id.in_(patient_ids))
    if search:
        user_q = user_q.where(User.name.ilike(f"%{search}%"))
    patients = (await db.execute(user_q)).scalars().all()

    out = []
    for p in patients:
        last_apt = (await db.execute(
            select(Appointment)
            .join(Doctor, Doctor.id == Appointment.doctor_id)
            .where(Appointment.patient_id == p.id, Doctor.hospital_id == hospital_id)
            .order_by(Appointment.appointment_date.desc())
            .limit(1)
        )).scalar_one_or_none()

        last_report = (await db.execute(
            select(Report)
            .where(Report.user_id == p.id)
            .order_by(Report.created_at.desc())
            .limit(1)
        )).scalar_one_or_none()

        risk = last_report.risk_level if last_report else None
        if risk_level and risk_level.lower() != (risk or "").lower():
            continue

        out.append({
            "id": p.id,
            "name": p.name,
            "email": p.email,
            "age": p.age,
            "gender": p.gender,
            "last_visit": last_apt.appointment_date if last_apt else None,
            "last_report_date": last_report.created_at.isoformat() if last_report else None,
            "risk_level": risk,
            "risk_score": last_report.risk_score if last_report else None,
        })
    return out


# ── Patient detail ────────────────────────────────────────────────────────────

@router.get("/patients/{patient_id}")
async def get_patient(
    patient_id: str,
    current_user: User = Depends(require_role(["admin", "doctor"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)

    # Verify care relationship — patient must have at least one appointment with a hospital doctor
    rel_count = (await db.execute(
        select(func.count())
        .select_from(Appointment)
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Appointment.patient_id == patient_id, Doctor.hospital_id == hospital_id)
    )).scalar() or 0
    if rel_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")

    patient = (await db.execute(select(User).where(User.id == patient_id))).scalar_one_or_none()
    if patient is None:
        raise HTTPException(status_code=404, detail="Patient not found")

    reports = (await db.execute(
        select(Report).where(Report.user_id == patient_id).order_by(Report.created_at.desc())
    )).scalars().all()

    appointments = (await db.execute(
        select(Appointment)
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Appointment.patient_id == patient_id, Doctor.hospital_id == hospital_id)
        .order_by(Appointment.appointment_date.desc())
    )).scalars().all()

    return {
        "id": patient.id,
        "name": patient.name,
        "email": patient.email,
        "age": patient.age,
        "gender": patient.gender,
        "phone": patient.phone,
        "medical_history": patient.medical_history,
        "created_at": patient.created_at.isoformat(),
        "reports": [
            {
                "id": r.id,
                "report_type": r.report_type,
                "file_name": r.file_name,
                "risk_score": r.risk_score,
                "risk_level": r.risk_level,
                "ai_summary": r.ai_summary,
                "raw_text": r.raw_text,
                "approval_status": r.approval_status,
                "doctor_notes": r.doctor_notes,
                "reviewed_at": r.reviewed_at.isoformat() if r.reviewed_at else None,
                "created_at": r.created_at.isoformat(),
            }
            for r in reports
        ],
        "appointments": [
            {
                "id": a.id,
                "appointment_date": a.appointment_date,
                "appointment_time": a.appointment_time,
                "type": a.type,
                "status": a.status,
                "reason": a.reason,
            }
            for a in appointments
        ],
    }


# ── Patient trends (doctor/admin) ─────────────────────────────────────────────

@router.get("/patients/{patient_id}/trends")
async def get_patient_trends(
    patient_id: str,
    current_user: User = Depends(require_role(["admin", "doctor"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)

    rel_count = (await db.execute(
        select(func.count())
        .select_from(Appointment)
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Appointment.patient_id == patient_id, Doctor.hospital_id == hospital_id)
    )).scalar() or 0
    if rel_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")

    reports = (await db.execute(
        select(Report).where(Report.user_id == patient_id).order_by(Report.created_at.asc())
    )).scalars().all()

    grouped: dict = {}
    for report in reports:
        if not report.created_at:
            continue
        date_str = report.created_at.date().isoformat()
        for param in (report.parameters or []):
            try:
                numeric_val = float(param.value)
            except (TypeError, ValueError):
                continue
            entry = {
                "date": date_str,
                "value": numeric_val,
                "unit": param.unit,
                "is_abnormal": param.is_abnormal,
                "reference_min": param.reference_min,
                "reference_max": param.reference_max,
            }
            grouped.setdefault(param.parameter_name, []).append(entry)

    return {
        "parameters": grouped,
        "available_parameters": sorted(grouped.keys()),
    }


# ── Patient follow-up notification ────────────────────────────────────────────

class FollowupRequest(BaseModel):
    message: str = "Your doctor has requested a follow-up visit."


@router.post("/patients/{patient_id}/followup")
async def send_patient_followup(
    patient_id: str,
    body: FollowupRequest,
    current_user: User = Depends(require_role(["admin", "doctor"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)

    rel_count = (await db.execute(
        select(func.count())
        .select_from(Appointment)
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Appointment.patient_id == patient_id, Doctor.hospital_id == hospital_id)
    )).scalar() or 0
    if rel_count == 0:
        raise HTTPException(status_code=404, detail="Patient not found")

    db.add(Notification(
        user_id=patient_id,
        type="followup",
        title="Follow-up Requested",
        message=body.message,
        action_url="/appointments",
    ))

    return {"success": True, "message": "Follow-up notification sent."}


# ── Doctor list (admin only) ──────────────────────────────────────────────────

@router.get("/doctors")
async def list_hospital_doctors(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)
    first_of_month = date.today().replace(day=1).isoformat()

    doctors = (await db.execute(
        select(Doctor).where(Doctor.hospital_id == hospital_id)
    )).scalars().all()

    out = []
    for d in doctors:
        total_pts = (await db.execute(
            select(func.count(distinct(Appointment.patient_id))).where(Appointment.doctor_id == d.id)
        )).scalar() or 0

        apts_month = (await db.execute(
            select(func.count())
            .select_from(Appointment)
            .where(Appointment.doctor_id == d.id, Appointment.appointment_date >= first_of_month)
        )).scalar() or 0

        out.append({
            "id": d.id,
            "name": d.name,
            "specialty": d.specialty,
            "qualification": d.qualification,
            "experience_years": d.experience_years,
            "rating": d.rating,
            "total_patients": total_pts,
            "appointments_this_month": apts_month,
        })
    return out


# ── Doctor analytics (admin only) ─────────────────────────────────────────────

@router.get("/doctors/{doctor_id}/analytics")
async def doctor_analytics(
    doctor_id: str,
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)

    doctor = (await db.execute(
        select(Doctor).where(Doctor.id == doctor_id, Doctor.hospital_id == hospital_id)
    )).scalar_one_or_none()
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")

    appointments = (await db.execute(
        select(Appointment)
        .where(Appointment.doctor_id == doctor_id)
        .order_by(Appointment.appointment_date.desc())
    )).scalars().all()

    monthly: dict[str, int] = {}
    for a in appointments:
        key = a.appointment_date[:7]
        monthly[key] = monthly.get(key, 0) + 1

    total_patients = (await db.execute(
        select(func.count(distinct(Appointment.patient_id)))
        .where(Appointment.doctor_id == doctor_id)
    )).scalar() or 0

    return {
        "doctor": {
            "id": doctor.id,
            "name": doctor.name,
            "specialty": doctor.specialty,
            "qualification": doctor.qualification,
            "rating": doctor.rating,
            "experience_years": doctor.experience_years,
        },
        "total_appointments": len(appointments),
        "total_patients": total_patients,
        "monthly_breakdown": [{"month": k, "count": v} for k, v in sorted(monthly.items())],
        "recent_appointments": [
            {
                "id": a.id,
                "appointment_date": a.appointment_date,
                "appointment_time": a.appointment_time,
                "status": a.status,
                "patient_id": a.patient_id,
            }
            for a in appointments[:10]
        ],
    }


# ── Invite doctor (admin only) ────────────────────────────────────────────────

@router.post("/doctors/invite")
async def invite_doctor(
    body: InviteDoctorRequest,
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)

    existing = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")

    alphabet = string.ascii_letters + string.digits
    temp_password = "".join(secrets.choice(alphabet) for _ in range(12))

    user = User(
        name=body.name,
        email=body.email,
        role="doctor",
        hospital_id=hospital_id,
        password_hash=hash_password(temp_password),
    )
    db.add(user)
    await db.flush()

    doctor = Doctor(
        name=body.name,
        specialty=body.specialty,
        qualification=body.qualification,
        experience_years=body.experience_years,
        hospital_id=hospital_id,
        user_id=user.id,
    )
    db.add(doctor)
    await db.flush()

    return {
        "success": True,
        "message": f"Dr. {body.name} has been invited.",
        "credentials": {
            "email": body.email,
            "temp_password": temp_password,
            "login_url": "/hospital/login",
        },
    }


# ── Pending report reviews ────────────────────────────────────────────────────

@router.get("/reports/pending")
async def list_pending_reports(
    current_user: User = Depends(require_role(["admin", "doctor"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)
    patient_ids = await _hospital_patient_ids(db, hospital_id)
    if not patient_ids:
        return []

    result = await db.execute(
        select(Report, User)
        .join(User, User.id == Report.user_id)
        .where(
            Report.user_id.in_(patient_ids),
            Report.approval_status == "pending",
            Report.analysis_result.isnot(None),
        )
        .order_by(Report.created_at.desc())
    )
    rows = result.all()

    return [
        {
            "id": r.id,
            "patient_id": r.user_id,
            "patient_name": u.name,
            "patient_email": u.email,
            "report_type": r.report_type,
            "file_name": r.file_name,
            "risk_score": r.risk_score,
            "risk_level": r.risk_level,
            "ai_summary": r.ai_summary,
            "created_at": r.created_at.isoformat(),
            "approval_status": r.approval_status,
        }
        for r, u in rows
    ]


@router.put("/reports/{report_id}/approve")
async def approve_report(
    report_id: str,
    body: ApproveReportRequest,
    current_user: User = Depends(require_role(["admin", "doctor"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)
    patient_ids = await _hospital_patient_ids(db, hospital_id)

    report = (await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id.in_(patient_ids))
    )).scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    report.approval_status = "approved"
    report.reviewed_by = current_user.id
    report.reviewed_at = datetime.utcnow()
    if body.doctor_notes:
        report.doctor_notes = body.doctor_notes

    note_snippet = (
        f": {body.doctor_notes[:100]}{'…' if len(body.doctor_notes) > 100 else ''}"
        if body.doctor_notes
        else "."
    )
    db.add(Notification(
        user_id=report.user_id,
        type="report_approved",
        title="Report Reviewed by Doctor",
        message=f"Your report has been reviewed and approved{note_snippet}",
        action_url="/dashboard",
    ))

    return {"success": True, "message": "Report approved — patient can now see their results."}


@router.put("/reports/{report_id}/reject")
async def reject_report(
    report_id: str,
    body: RejectReportRequest,
    current_user: User = Depends(require_role(["admin", "doctor"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)
    patient_ids = await _hospital_patient_ids(db, hospital_id)

    report = (await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id.in_(patient_ids))
    )).scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    if not body.doctor_notes.strip():
        raise HTTPException(status_code=422, detail="Rejection notes are required so the patient knows what to do next.")

    report.approval_status = "rejected"
    report.reviewed_by = current_user.id
    report.reviewed_at = datetime.utcnow()
    report.doctor_notes = body.doctor_notes

    return {"success": True, "message": "Report rejected — patient will see your notes."}


# ── Bulk report analysis (hospital) ──────────────────────────────────────────

class BulkAnalyzeRequest(BaseModel):
    report_ids: list[str]


@router.post("/reports/bulk-analyze")
async def bulk_analyze_reports(
    body: BulkAnalyzeRequest,
    current_user: User = Depends(require_role(["admin", "doctor"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)
    patient_ids = await _hospital_patient_ids(db, hospital_id)
    if not patient_ids:
        raise HTTPException(status_code=404, detail="No patients associated with this hospital")

    report_ids = body.report_ids[:20]
    reports = (await db.execute(
        select(Report)
        .where(Report.id.in_(report_ids), Report.user_id.in_(patient_ids))
    )).scalars().all()

    if not reports:
        raise HTTPException(status_code=404, detail="No accessible reports found for the given IDs")

    from api.ai.router import call_ai_json as call_gemini_json, AIUnavailableError, _clean_json_text

    async def _stream():
        for i, report in enumerate(reports):
            yield f"data: {_json.dumps({'index': i, 'total': len(reports), 'report_id': report.id, 'report_name': report.file_name or report.report_type or 'Report', 'status': 'processing'})}\n\n"

            result_data: dict = {"overall_score": 70, "risk_level": "Medium", "summary": "Analysis unavailable.", "flags": []}
            try:
                if report.raw_text and len(report.raw_text) > 50:
                    prompt = f"""Analyze this lab report ({report.report_type or 'Lab'}).
Return ONLY valid JSON:
{{"overall_score": <45-100>, "risk_level": "<Low|Medium|High|Critical>", "summary": "<2 sentence plain-language summary>", "flags": ["<key finding 1>", "<key finding 2>"]}}
Report: {report.raw_text[:3000]}"""
                    result_data = call_gemini_json(prompt)
            except (AIUnavailableError, Exception):
                pass

            yield f"data: {_json.dumps({'index': i, 'total': len(reports), 'report_id': report.id, 'report_name': report.file_name or report.report_type or 'Report', 'status': 'done', 'result': result_data})}\n\n"
            await asyncio.sleep(0.4)

        yield f"data: {_json.dumps({'status': 'complete', 'total': len(reports)})}\n\n"

    return StreamingResponse(
        _stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ── Analytics ─────────────────────────────────────────────────────────────────

@router.get("/analytics")
async def get_analytics(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)
    patient_ids = await _hospital_patient_ids(db, hospital_id)

    # Appointments by month
    apts_rows = (await db.execute(
        select(
            func.substr(Appointment.appointment_date, 1, 7).label("month"),
            func.count().label("count"),
        )
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Doctor.hospital_id == hospital_id)
        .group_by(func.substr(Appointment.appointment_date, 1, 7))
        .order_by(func.substr(Appointment.appointment_date, 1, 7))
    )).fetchall()

    # Active patients by month
    pts_rows = (await db.execute(
        select(
            func.substr(Appointment.appointment_date, 1, 7).label("month"),
            func.count(distinct(Appointment.patient_id)).label("count"),
        )
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Doctor.hospital_id == hospital_id)
        .group_by(func.substr(Appointment.appointment_date, 1, 7))
        .order_by(func.substr(Appointment.appointment_date, 1, 7))
    )).fetchall()

    # Appointments by specialty (top 8)
    spec_rows = (await db.execute(
        select(
            Doctor.specialty.label("specialty"),
            func.count(Appointment.id).label("count"),
        )
        .join(Appointment, Appointment.doctor_id == Doctor.id)
        .where(Doctor.hospital_id == hospital_id)
        .group_by(Doctor.specialty)
        .order_by(func.count(Appointment.id).desc())
        .limit(8)
    )).fetchall()

    # AI usage by month (reports with analysis)
    ai_by_month: list = []
    if patient_ids:
        ai_rows = (await db.execute(
            select(
                func.to_char(Report.created_at, "YYYY-MM").label("month"),
                func.count().label("count"),
            )
            .where(Report.user_id.in_(patient_ids), Report.analysis_result.isnot(None))
            .group_by(func.to_char(Report.created_at, "YYYY-MM"))
            .order_by(func.to_char(Report.created_at, "YYYY-MM"))
        )).fetchall()
        ai_by_month = [{"month": r.month, "count": r.count} for r in ai_rows]

    # Revenue estimate (₹800 video / ₹500 in-person)
    rev_rows = (await db.execute(
        select(
            func.substr(Appointment.appointment_date, 1, 7).label("month"),
            func.sum(sa_case((Appointment.type == "video", 800), else_=500)).label("amount"),
        )
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Doctor.hospital_id == hospital_id)
        .group_by(func.substr(Appointment.appointment_date, 1, 7))
        .order_by(func.substr(Appointment.appointment_date, 1, 7))
    )).fetchall()

    hospital = (await db.execute(select(Hospital).where(Hospital.id == hospital_id))).scalar_one_or_none()
    total_doctors = (await db.execute(
        select(func.count(Doctor.id)).where(Doctor.hospital_id == hospital_id)
    )).scalar() or 0
    total_reports = 0
    if patient_ids:
        total_reports = (await db.execute(
            select(func.count(Report.id)).where(Report.user_id.in_(patient_ids))
        )).scalar() or 0

    return {
        "hospital_name": hospital.name if hospital else "Hospital",
        "total_patients": len(patient_ids),
        "total_doctors": total_doctors,
        "total_reports": total_reports,
        "total_appointments": sum(r.count for r in apts_rows),
        "total_ai_calls": sum(r["count"] for r in ai_by_month),
        "total_revenue": sum(int(r.amount or 0) for r in rev_rows),
        "appointments_by_month": [{"month": r.month, "count": r.count} for r in apts_rows],
        "patients_by_month": [{"month": r.month, "count": r.count} for r in pts_rows],
        "appointments_by_specialty": [{"specialty": r.specialty, "count": r.count} for r in spec_rows],
        "ai_calls_by_month": ai_by_month,
        "revenue_by_month": [{"month": r.month, "amount": int(r.amount or 0)} for r in rev_rows],
    }


# ── Departments (derived from doctor specialties) ─────────────────────────────

@router.get("/departments")
async def get_departments(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)

    spec_rows = (await db.execute(
        select(Doctor.specialty, func.count(Doctor.id).label("doctor_count"))
        .where(Doctor.hospital_id == hospital_id)
        .group_by(Doctor.specialty)
        .order_by(Doctor.specialty)
    )).fetchall()

    result = []
    for specialty, doc_count in spec_rows:
        patient_count = (await db.execute(
            select(func.count(distinct(Appointment.patient_id)))
            .join(Doctor, Doctor.id == Appointment.doctor_id)
            .where(Doctor.hospital_id == hospital_id, Doctor.specialty == specialty)
        )).scalar() or 0

        apt_count = (await db.execute(
            select(func.count(Appointment.id))
            .join(Doctor, Doctor.id == Appointment.doctor_id)
            .where(Doctor.hospital_id == hospital_id, Doctor.specialty == specialty)
        )).scalar() or 0

        result.append({
            "name": specialty,
            "doctor_count": doc_count,
            "patient_count": patient_count,
            "appointment_count": apt_count,
        })

    return result


# ── Remove doctor from hospital ───────────────────────────────────────────────

@router.delete("/doctors/{doctor_id}")
async def remove_doctor(
    doctor_id: str,
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)

    doctor = (await db.execute(
        select(Doctor).where(Doctor.id == doctor_id, Doctor.hospital_id == hospital_id)
    )).scalar_one_or_none()
    if doctor is None:
        raise HTTPException(status_code=404, detail="Doctor not found")

    doctor.hospital_id = None
    if doctor.user_id:
        user = (await db.execute(select(User).where(User.id == doctor.user_id))).scalar_one_or_none()
        if user:
            user.hospital_id = None

    return {"success": True, "message": "Doctor removed from hospital."}


# ── Audit logs ────────────────────────────────────────────────────────────────

@router.get("/audit-logs")
async def get_audit_logs(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    hospital_id = _require_hospital(current_user)
    patient_ids = await _hospital_patient_ids(db, hospital_id)

    logs: list[dict] = []

    if patient_ids:
        # Report uploads
        for rid, rtype, fname, rlevel, ts, uname in (await db.execute(
            select(Report.id, Report.report_type, Report.file_name, Report.risk_level, Report.created_at, User.name)
            .join(User, User.id == Report.user_id)
            .where(Report.user_id.in_(patient_ids))
            .order_by(Report.created_at.desc()).limit(15)
        )).fetchall():
            logs.append({"id": f"rpt-{rid}", "type": "report_upload", "actor": uname, "actor_role": "patient",
                         "action": f"Uploaded {rtype or fname or 'report'}", "timestamp": ts.isoformat(), "badge": rlevel})

        # Report approvals
        for rid, rtype, fname, status, reviewed_at, reviewer_name in (await db.execute(
            select(Report.id, Report.report_type, Report.file_name, Report.approval_status, Report.reviewed_at, User.name)
            .join(User, User.id == Report.reviewed_by)
            .where(Report.user_id.in_(patient_ids), Report.reviewed_at.isnot(None), Report.reviewed_by.isnot(None))
            .order_by(Report.reviewed_at.desc()).limit(15)
        )).fetchall():
            word = "Approved" if status == "approved" else "Rejected"
            logs.append({"id": f"appr-{rid}", "type": status, "actor": reviewer_name, "actor_role": "doctor",
                         "action": f"{word} {rtype or fname or 'report'}", "timestamp": reviewed_at.isoformat(), "badge": None})

    # Appointments
    for aid, apt_type, apt_date, uname in (await db.execute(
        select(Appointment.id, Appointment.type, Appointment.appointment_date, User.name)
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .join(User, User.id == Appointment.patient_id)
        .where(Doctor.hospital_id == hospital_id)
        .order_by(Appointment.appointment_date.desc()).limit(15)
    )).fetchall():
        logs.append({"id": f"apt-{aid}", "type": "appointment", "actor": uname, "actor_role": "patient",
                     "action": f"Booked {apt_type} appointment on {apt_date}",
                     "timestamp": f"{apt_date}T00:00:00", "badge": None})

    logs.sort(key=lambda x: x["timestamp"], reverse=True)
    return logs[:40]
