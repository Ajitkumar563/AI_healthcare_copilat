"""
Doctor Copilot — AI assistance during consultations.

All responses carry an explicit AI disclaimer.  The AI never finalises any
clinical action; every output is advisory and must be reviewed by the doctor.
"""
import json
from datetime import datetime, date, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.db import get_db
from models.models import User, Report, Reminder, ReportParameter, Appointment
from core.security import get_current_user_dep
from api.ai.router import call_ai_json, call_ai, AIUnavailableError

router = APIRouter()

_DISCLAIMER = (
    "⚠️ AI-generated guidance — for clinical decision support only. "
    "Must be reviewed and approved by a qualified healthcare professional "
    "before any patient action is taken. Sahaay AI does not replace medical judgement."
)

# ── Auth helper ───────────────────────────────────────────────────────────────

def _require_doctor_or_admin(current_user: User):
    if current_user.role not in ("doctor", "admin"):
        raise HTTPException(status_code=403, detail="Doctor or admin role required")
    return current_user


# ── Request models ─────────────────────────────────────────────────────────────

class PreConsultationRequest(BaseModel):
    patient_id: str
    language: str = "en"

class DiagnosisRequest(BaseModel):
    patient_id: str
    symptoms: str
    report_text: str = ""
    language: str = "en"

class PrescriptionRequest(BaseModel):
    patient_id: str
    diagnosis: str
    symptoms: str = ""
    language: str = "en"


# ── DB helpers ────────────────────────────────────────────────────────────────

async def _get_patient(patient_id: str, db: AsyncSession) -> User:
    user = (await db.execute(select(User).where(User.id == patient_id))).scalar_one_or_none()
    if not user or user.role != "patient":
        raise HTTPException(status_code=404, detail="Patient not found")
    return user


async def _recent_reports(patient_id: str, db: AsyncSession, limit: int = 5) -> list[Report]:
    result = await db.execute(
        select(Report)
        .where(Report.user_id == patient_id, Report.family_member_id.is_(None))
        .order_by(Report.created_at.desc())
        .limit(limit)
    )
    return list(result.scalars().all())


async def _active_reminders(patient_id: str, db: AsyncSession) -> list[Reminder]:
    result = await db.execute(
        select(Reminder)
        .where(Reminder.user_id == patient_id, Reminder.is_active == True)
        .order_by(Reminder.created_at.desc())
    )
    return list(result.scalars().all())


async def _abnormal_params(report: Report, db: AsyncSession) -> list[dict]:
    result = await db.execute(
        select(ReportParameter)
        .where(ReportParameter.report_id == report.id, ReportParameter.is_abnormal == True)
    )
    params = result.scalars().all()
    return [
        {
            "name": p.parameter_name,
            "value": p.value,
            "unit": p.unit,
            "reference_min": p.reference_min,
            "reference_max": p.reference_max,
            "status": p.status or "Abnormal",
        }
        for p in params
    ]


def _report_context(reports: list[Report]) -> str:
    if not reports:
        return "No recent reports on file."
    lines = []
    for r in reports:
        date_str = r.created_at.strftime("%d %b %Y") if r.created_at else "Unknown date"
        risk = r.risk_level or "Unknown"
        summary = (r.ai_summary or "No summary available")[:300]
        lines.append(f"- {date_str} | {r.report_type} | Risk: {risk} | {summary}")
    return "\n".join(lines)


def _reminder_context(reminders: list[Reminder]) -> str:
    if not reminders:
        return "No active medicines."
    return ", ".join(
        f"{rem.medicine_name} {rem.dosage or ''}".strip()
        for rem in reminders
    )


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/pre-consultation")
async def pre_consultation(
    body: PreConsultationRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """
    AI-generated pre-consultation brief for a patient.
    Should be loaded before the doctor enters the consultation room.
    """
    _require_doctor_or_admin(current_user)

    patient = await _get_patient(body.patient_id, db)
    reports  = await _recent_reports(body.patient_id, db)
    reminders = await _active_reminders(body.patient_id, db)

    # Collect abnormal values from the most recent report
    abnormal = await _abnormal_params(reports[0], db) if reports else []

    # Risk trend: compare latest two approved reports
    approved = [r for r in reports if r.approval_status == "approved" and r.risk_score is not None]
    risk_trend = "stable"
    if len(approved) >= 2:
        delta = (approved[0].risk_score or 0) - (approved[1].risk_score or 0)
        if delta > 5:
            risk_trend = "worsening"
        elif delta < -5:
            risk_trend = "improving"

    patient_ctx = (
        f"Patient: {patient.name}, Age: {patient.age or 'Unknown'}, Gender: {patient.gender or 'Unknown'}\n"
        f"Medical history: {patient.medical_history or 'None documented'}\n"
        f"Known allergies: {patient.allergies or 'None'}\n"
        f"Current medicines: {patient.current_medicines or _reminder_context(reminders)}"
    )
    report_ctx = _report_context(reports)
    abnormal_ctx = (
        "\n".join(f"  • {p['name']}: {p['value']} {p['unit'] or ''} ({p['status']})" for p in abnormal)
        if abnormal else "  None detected in latest report."
    )

    prompt = f"""You are a clinical decision-support AI assisting a doctor before a patient consultation.

{patient_ctx}

Recent lab reports (newest first):
{report_ctx}

Abnormal values from latest report:
{abnormal_ctx}

Provide a concise pre-consultation brief in JSON with EXACTLY these keys:
{{
  "chief_complaint_guess": "likely reason for visit based on history and reports",
  "key_concerns": ["concern 1", "concern 2"],
  "critical_values": ["any critical lab value that needs immediate attention"],
  "questions_to_ask": ["suggested question for doctor to ask patient"],
  "watch_out_for": ["red flags or things to monitor"],
  "patient_snapshot": "2-3 sentence narrative summary for quick read"
}}

Be concise and clinically focused. If data is insufficient, state it clearly."""

    fallback = {
        "chief_complaint_guess": "Insufficient data — please review patient history manually.",
        "key_concerns": [],
        "critical_values": [],
        "questions_to_ask": ["What brings you in today?", "Any new symptoms since last visit?"],
        "watch_out_for": [],
        "patient_snapshot": "Patient record available. AI summary temporarily unavailable — check GEMINI_API_KEY in .env.",
    }

    try:
        ai_result = call_ai_json(prompt)
    except AIUnavailableError as e:
        print(f"[Copilot/pre-consultation] AI unavailable: {e}")
        ai_result = fallback

    latest_report = reports[0] if reports else None

    return {
        "patient": {
            "id": patient.id,
            "name": patient.name,
            "age": patient.age,
            "gender": patient.gender,
            "medical_history": patient.medical_history,
            "allergies": patient.allergies,
            "current_medicines": patient.current_medicines or _reminder_context(reminders),
        },
        "report_summary": {
            "total": len(reports),
            "latest_date": latest_report.created_at.isoformat() if latest_report and latest_report.created_at else None,
            "latest_risk_level": latest_report.risk_level if latest_report else None,
            "latest_risk_score": latest_report.risk_score if latest_report else None,
            "risk_trend": risk_trend,
        },
        "abnormal_values": abnormal,
        "active_medicines": [
            {"name": r.medicine_name, "dosage": r.dosage, "frequency": r.frequency}
            for r in reminders
        ],
        "ai_brief": ai_result,
        "disclaimer": _DISCLAIMER,
    }


@router.post("/suggest-diagnosis")
async def suggest_diagnosis(
    body: DiagnosisRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """
    AI differential diagnosis suggestions based on symptoms and available report data.
    The AI suggests — the doctor decides.
    """
    _require_doctor_or_admin(current_user)

    patient = await _get_patient(body.patient_id, db)
    reports  = await _recent_reports(body.patient_id, db, limit=3)
    reminders = await _active_reminders(body.patient_id, db)

    report_ctx = _report_context(reports)
    medicine_ctx = _reminder_context(reminders)

    prompt = f"""You are a clinical AI assistant helping a doctor formulate a differential diagnosis.

Patient profile:
- Name: {patient.name}, Age: {patient.age or 'Unknown'}, Gender: {patient.gender or 'Unknown'}
- Medical history: {patient.medical_history or 'None documented'}
- Known allergies: {patient.allergies or 'None'}
- Current medicines: {medicine_ctx}

Presenting symptoms: {body.symptoms}

Recent reports:
{report_ctx}

{"Additional report data: " + body.report_text[:1000] if body.report_text else ""}

Return a JSON object with EXACTLY these keys:
{{
  "diagnoses": [
    {{
      "name": "condition name",
      "probability": "High / Medium / Low",
      "reasoning": "1-2 sentence clinical reasoning",
      "icd_code": "ICD-10 code if known, else null"
    }}
  ],
  "differential": ["other condition to rule out"],
  "red_flags": ["urgent symptom or finding requiring immediate attention"],
  "suggested_tests": ["recommended investigation"],
  "clinical_notes": "brief narrative for the doctor"
}}

List up to 4 diagnoses ordered by probability. Be concise and evidence-based."""

    fallback = {
        "diagnoses": [{"name": "Differential diagnosis unavailable", "probability": "Unknown", "reasoning": "AI service not available.", "icd_code": None}],
        "differential": [],
        "red_flags": [],
        "suggested_tests": [],
        "clinical_notes": "AI service unavailable. Please assess clinically.",
    }

    try:
        result = call_ai_json(prompt)
    except AIUnavailableError as e:
        print(f"[Copilot/suggest-diagnosis] AI unavailable: {e}")
        result = fallback

    return {
        "patient_id": body.patient_id,
        "patient_name": patient.name,
        **result,
        "disclaimer": _DISCLAIMER,
    }


@router.post("/draft-prescription")
async def draft_prescription(
    body: PrescriptionRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """
    AI drafts a prescription based on confirmed diagnosis.
    The doctor MUST review, edit, and approve before any clinical use.
    This endpoint never finalises a prescription.
    """
    _require_doctor_or_admin(current_user)

    patient = await _get_patient(body.patient_id, db)
    reminders = await _active_reminders(body.patient_id, db)
    reports = await _recent_reports(body.patient_id, db, limit=2)

    current_meds = patient.current_medicines or _reminder_context(reminders)
    allergies = patient.allergies or "None documented"

    # Calculate a reasonable follow-up date (~2 weeks from today)
    follow_up = (date.today() + timedelta(weeks=2)).strftime("%d %b %Y")

    prompt = f"""You are a clinical AI assistant drafting a prescription template for a doctor to review.

Patient: {patient.name}, Age: {patient.age or 'Unknown'}, Gender: {patient.gender or 'Unknown'}
Confirmed diagnosis: {body.diagnosis}
Presenting symptoms: {body.symptoms or 'Not specified'}
Known allergies: {allergies}
Current medicines: {current_meds}

Return a JSON object with EXACTLY these keys:
{{
  "medicines": [
    {{
      "name": "generic drug name",
      "dosage": "e.g. 500mg",
      "frequency": "e.g. twice daily",
      "duration": "e.g. 7 days",
      "instructions": "e.g. take after meals",
      "caution": "interaction or allergy note if any"
    }}
  ],
  "general_advice": "brief patient advice",
  "follow_up_date": "{follow_up}",
  "follow_up_tests": ["test to repeat at follow-up"],
  "lifestyle_changes": ["specific lifestyle recommendation"],
  "doctor_review_notes": "what the doctor should double-check in this draft"
}}

CRITICAL RULES:
1. Do NOT prescribe anything that conflicts with known allergies
2. Flag any interaction with current medicines
3. Use generic drug names (not brand names)
4. Suggest conservative dosages — the doctor will adjust
5. Include up to 4 medicines maximum"""

    fallback = {
        "medicines": [],
        "general_advice": "AI prescription draft unavailable. Please prescribe manually.",
        "follow_up_date": follow_up,
        "follow_up_tests": [],
        "lifestyle_changes": [],
        "doctor_review_notes": "AI service not available.",
    }

    try:
        result = call_ai_json(prompt)
    except AIUnavailableError as e:
        print(f"[Copilot/draft-prescription] AI unavailable: {e}")
        result = fallback

    return {
        "patient_id": body.patient_id,
        "patient_name": patient.name,
        "diagnosis": body.diagnosis,
        "draft": result,
        "status": "draft_pending_review",
        "disclaimer": _DISCLAIMER,
        "generated_at": datetime.utcnow().isoformat(),
        "generated_by": "Sahaay Doctor Copilot AI",
    }
