import asyncio
import json as _json
import secrets
import string
from datetime import datetime, date
from fastapi import APIRouter, HTTPException, Depends, Query
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct

from database.db import get_db
from models.models import User, Hospital, Doctor, Appointment, Report
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

    from api.ai.router import call_gemini_json, AIUnavailableError, _clean_json_text

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
