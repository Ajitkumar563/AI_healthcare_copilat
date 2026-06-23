import os
import json
import re
import uuid
from datetime import datetime
from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, delete as sa_delete
import io

from database.db import get_db
from models.models import Report, User, ReportParameter
from core.security import get_current_user_dep, get_optional_user
from services.ocr_service import extract_text
from services.whatsapp_service import send_whatsapp_message, format_report_summary_message
from services.pdf_service import generate_health_summary_pdf

router = APIRouter()

# ── Parameter extraction helpers ──────────────────────────────────────────────

# (ref_min, ref_max) — None means no bound on that side
_KNOWN_RANGES: dict[str, tuple[float | None, float | None]] = {
    "hemoglobin":        (11.5, 17.5),
    "vitamin d":         (30.0, 100.0),
    "tsh":               (0.34, 5.6),
    "fasting glucose":   (70.0, 99.0),
    "glucose":           (70.0, 99.0),
    "hba1c":             (None, 5.7),
    "vitamin b12":       (200.0, 914.0),
    "b12":               (200.0, 914.0),
    "triglycerides":     (None, 150.0),
    "ldl":               (None, 100.0),
    "hdl":               (40.0, None),
    "cholesterol":       (None, 200.0),
    "creatinine":        (0.6, 1.2),
    "sgpt":              (None, 40.0),
    "sgot":              (None, 40.0),
    "uric acid":         (3.5, 7.2),
    "platelets":         (150000.0, 400000.0),
    "wbc":               (4000.0, 11000.0),
    "rbc":               (4.2, 5.9),
    "ferritin":          (12.0, 300.0),
    "bilirubin":         (None, 1.2),
}


def _reference_range(name: str) -> tuple[float | None, float | None]:
    n = name.lower()
    for key, bounds in _KNOWN_RANGES.items():
        if key in n:
            return bounds
    return None, None


def _parse_finding_value(value_str: str | None) -> tuple[float | None, str | None]:
    """'12.5 g/dL'  →  (12.5, 'g/dL').  Returns (None, None) when not numeric."""
    if not value_str:
        return None, None
    m = re.search(r"(\d+\.?\d*)", value_str)
    if not m:
        return None, None
    numeric = float(m.group(1))
    unit = value_str[m.end():].strip() or None
    return numeric, unit


def _upsert_parameters(
    db,
    report_id: str,
    findings: list[dict],
    raw_text: str | None,
) -> None:
    """Replace all ReportParameter rows for this report using AI findings + regex fallback."""
    rows: dict[str, ReportParameter] = {}

    # 1. Parse findings from AI analysis
    for f in findings:
        param_name: str = (f.get("parameter") or "").strip()
        if not param_name:
            continue
        numeric, unit = _parse_finding_value(f.get("value"))
        if numeric is None:
            continue
        status_str: str = (f.get("status") or "Normal").strip()
        is_abnormal = status_str.lower() not in ("normal", "")
        ref_min, ref_max = _reference_range(param_name)
        rows[param_name.lower()] = ReportParameter(
            report_id=report_id,
            parameter_name=param_name,
            value=str(numeric),
            unit=unit,
            reference_min=ref_min,
            reference_max=ref_max,
            is_abnormal=is_abnormal,
            status=status_str,
        )

    # 2. Regex fallback for 7 well-known parameters (fills gaps when AI misses them)
    if raw_text:
        REGEX_PARAMS = [
            ("Vitamin D",       r"vitamin\s*d",                        1,   150, "ng/mL"),
            ("Hemoglobin",      r"ha?emoglobin\b",                     5,    25, "g/dL"),
            ("TSH",             r"thyroid\s*stimulating\s*hormone|\btsh\b", 0.1, 20, "mIU/L"),
            ("Fasting Glucose", r"glucose[,\s]*fasting|fasting\s*glucose", 50, 400, "mg/dL"),
            ("HbA1c",           r"hba1c|glycated\s*hemo",               3,    15, "%"),
            ("Vitamin B12",     r"vitamin\s*b\s*12\b|\bb12\b",         10, 2000, "pg/mL"),
            ("Triglycerides",   r"triglycerides?\b",                   50, 1000, "mg/dL"),
        ]
        for name, pattern, min_v, max_v, default_unit in REGEX_PARAMS:
            if name.lower() in rows:
                continue  # AI finding takes priority
            match = re.search(pattern, raw_text, re.IGNORECASE)
            if not match:
                continue
            after = raw_text[match.end():match.end() + 200]
            nums = re.findall(r"\b(\d+\.?\d*)\b", after)
            val: float | None = None
            for n in nums:
                v = float(n)
                if min_v <= v <= max_v:
                    val = v
                    break
            if val is None:
                continue
            ref_min, ref_max = _reference_range(name)
            is_abn = False
            if ref_min is not None and val < ref_min:
                is_abn = True
            if ref_max is not None and val > ref_max:
                is_abn = True
            rows[name.lower()] = ReportParameter(
                report_id=report_id,
                parameter_name=name,
                value=str(val),
                unit=default_unit,
                reference_min=ref_min,
                reference_max=ref_max,
                is_abnormal=is_abn,
                status="Abnormal" if is_abn else "Normal",
            )

    for param in rows.values():
        db.add(param)


class SendWhatsAppRequest(BaseModel):
    phone_number: str
    risk_data: dict | None = None

UPLOAD_DIR = os.getenv("UPLOAD_DIR", "uploads")
os.makedirs(UPLOAD_DIR, exist_ok=True)

ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/jpg"]


@router.post("/upload")
async def upload_report(
    file: UploadFile = File(...),
    db: AsyncSession = Depends(get_db),
    current_user: User | None = Depends(get_optional_user),
):
    if file.content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Only PDF, JPG, PNG allowed")

    file_bytes = await file.read()

    ext = file.filename.rsplit(".", 1)[-1] if "." in file.filename else "bin"
    filename = f"{uuid.uuid4()}.{ext}"
    filepath = os.path.join(UPLOAD_DIR, filename)

    with open(filepath, "wb") as buf:
        buf.write(file_bytes)

    file_url = f"/uploads/{filename}"
    extracted_text = extract_text(file_bytes, file.content_type)

    print(f"[Upload] file={file.filename} content_type={file.content_type} "
          f"extracted_chars={len(extracted_text)} "
          f"preview={repr(extracted_text[:300])}")

    report_id = None
    if current_user is not None:
        report = Report(
            user_id=current_user.id,
            file_url=file_url,
            file_name=file.filename,
            file_size=len(file_bytes),
            raw_text=extracted_text,
            report_type="Other",
        )
        db.add(report)
        await db.flush()
        report_id = report.id

    return {
        "message": "File uploaded successfully",
        "report_id": report_id,
        "file_name": file.filename,
        "file_url": file_url,
        "file_type": file.content_type,
        "size": len(file_bytes),
        "extracted_text": extracted_text,
    }


@router.get("/")
async def list_reports(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Report)
        .where(Report.user_id == current_user.id)
        .order_by(Report.created_at.desc())
    )
    reports = result.scalars().all()
    return [_report_to_dict(r) for r in reports]


@router.get("/trends")
async def get_report_trends(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Return numeric parameter values grouped by name across all approved reports."""
    result = await db.execute(
        select(Report)
        .where(
            Report.user_id == current_user.id,
            or_(
                Report.approval_status == "approved",
                Report.approval_status == None,  # noqa: E711  pre-migration rows
            ),
        )
        .order_by(Report.created_at.asc())
    )
    reports = result.scalars().all()

    grouped: dict[str, list[dict]] = {}

    for report in reports:
        if not report.created_at:
            continue
        date_str = report.created_at.date().isoformat()

        for param in (report.parameters or []):
            try:
                numeric_val = float(param.value)  # type: ignore[arg-type]
            except (TypeError, ValueError):
                continue

            entry = {
                "date": date_str,
                "value": numeric_val,
                "unit": param.unit,
                "is_abnormal": bool(param.is_abnormal),
                "reference_min": param.reference_min,
                "reference_max": param.reference_max,
            }
            grouped.setdefault(param.parameter_name, []).append(entry)

    # Only keep parameters that appear in 2+ reports (single points aren't trends)
    parameters = {name: points for name, points in grouped.items() if len(points) >= 2}

    return {
        "parameters": parameters,
        "available_parameters": sorted(parameters.keys()),
    }


@router.get("/{report_id}")
async def get_report(
    report_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")
    return _report_to_dict(report)


@router.put("/{report_id}/analysis")
async def save_analysis(
    report_id: str,
    payload: dict,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Frontend calls this after AI analysis to persist results."""
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    if "analysis_result" in payload:
        report.analysis_result = json.dumps(payload["analysis_result"])
    if "ai_summary" in payload:
        report.ai_summary = payload["ai_summary"]
    if "risk_score" in payload:
        report.risk_score = payload["risk_score"]
    if "risk_level" in payload:
        report.risk_level = payload["risk_level"]
    if "report_type" in payload:
        report.report_type = payload["report_type"]

    # New analysis always goes to pending — a doctor must approve before the
    # patient sees the AI results in subsequent sessions.
    if "analysis_result" in payload or "ai_summary" in payload:
        report.approval_status = "pending"

    # Populate report_parameters so the Trends graph has data to plot
    if "analysis_result" in payload:
        try:
            ar = payload["analysis_result"]
            findings: list[dict] = ar.get("findings", []) if isinstance(ar, dict) else []
            # Delete stale rows then re-insert so repeated analysis refreshes correctly
            await db.execute(
                sa_delete(ReportParameter).where(ReportParameter.report_id == report_id)
            )
            _upsert_parameters(db, report_id, findings, report.raw_text)
        except Exception as exc:
            print(f"[Reports] Failed to upsert parameters for {report_id}: {exc}")

    return {"message": "Analysis saved", "report_id": report_id}


@router.delete("/{report_id}")
async def delete_report(
    report_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    # Delete file from disk
    if report.file_url:
        disk_path = report.file_url.lstrip("/")
        if os.path.exists(disk_path):
            os.remove(disk_path)

    await db.delete(report)
    return {"message": "Report deleted"}


@router.get("/{report_id}/download-pdf")
async def download_pdf(
    report_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    analysis = None
    if report.analysis_result:
        try:
            analysis = json.loads(report.analysis_result)
        except Exception:
            pass

    patient_data = {
        "name":   current_user.name,
        "email":  current_user.email,
        "age":    current_user.age,
        "gender": current_user.gender,
    }

    report_data = {
        "report_type":     report.report_type,
        "file_name":       report.file_name,
        "ai_summary":      report.ai_summary,
        "analysis_result": analysis,
        "parameters":      [
            {
                "parameter_name": p.parameter_name,
                "value":          p.value,
                "unit":           p.unit,
                "reference_min":  p.reference_min,
                "reference_max":  p.reference_max,
                "is_abnormal":    p.is_abnormal,
                "status":         p.status,
            }
            for p in (report.parameters or [])
        ],
        "created_at": report.created_at.isoformat() if report.created_at else None,
    }

    # Build a minimal risk_data dict from what's stored; skip section if nothing available
    risk_data = None
    if report.risk_score is not None or report.risk_level:
        risk_data = {
            "overall_score": int(report.risk_score) if report.risk_score else "—",
            "risk_level":    report.risk_level or "Unknown",
        }

    pdf_bytes = generate_health_summary_pdf(patient_data, report_data, risk_data)

    date_str  = (report.created_at or datetime.utcnow()).strftime("%Y-%m-%d")
    safe_name = (current_user.name or "patient").replace(" ", "-").lower()
    filename  = f"sahaay-health-summary-{safe_name}-{date_str}.pdf"

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.post("/{report_id}/send-whatsapp")
async def send_report_via_whatsapp(
    report_id: str,
    body: SendWhatsAppRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Send a WhatsApp summary of this report to the given phone number."""
    result = await db.execute(
        select(Report).where(Report.id == report_id, Report.user_id == current_user.id)
    )
    report = result.scalar_one_or_none()
    if report is None:
        raise HTTPException(status_code=404, detail="Report not found")

    # Normalise to E.164 digits only (strip +, spaces, dashes)
    phone = re.sub(r"[^\d]", "", body.phone_number)
    if not (10 <= len(phone) <= 15):
        raise HTTPException(status_code=422, detail="Phone number must be 10–15 digits (E.164 format)")

    # Use provided risk_data; fall back to what's stored on the report row
    risk_data: dict = body.risk_data or {}
    if not risk_data:
        risk_data = {
            "overall_score": int(report.risk_score) if report.risk_score else "N/A",
            "risk_level": report.risk_level or "Unknown",
        }

    message = format_report_summary_message(
        patient_name=current_user.name or "Patient",
        report_type=report.report_type or report.file_name or "Lab Report",
        risk_summary=risk_data,
    )

    wa_result = await send_whatsapp_message(phone, message)
    if wa_result["success"]:
        return {"success": True, "message": "Summary sent to WhatsApp!"}

    error_raw = wa_result.get("error", "")
    error_str = str(error_raw).lower()

    if "not configured" in error_str:
        return {"success": False, "message": "WhatsApp integration is being set up — check back soon!"}

    token_keywords = ("token", "oauth", "oauthexception", "190", "invalid", "expired", "authenticate")
    if any(k in error_str for k in token_keywords):
        return {
            "success": False,
            "message": "token expired",
        }

    return {"success": False, "message": f"Could not send message: {error_raw}"}


@router.post("/import-uploads")
async def import_existing_uploads(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """One-time import: scan uploads/ directory and create DB records for files with no record."""
    if not os.path.isdir(UPLOAD_DIR):
        return {"imported": 0, "message": "Upload directory not found"}

    existing_result = await db.execute(
        select(Report.file_url).where(Report.user_id == current_user.id)
    )
    existing_urls = {row[0] for row in existing_result.fetchall()}

    imported = 0
    for fname in os.listdir(UPLOAD_DIR):
        file_url = f"/uploads/{fname}"
        if file_url in existing_urls:
            continue
        fpath = os.path.join(UPLOAD_DIR, fname)
        size = os.path.getsize(fpath)
        report = Report(
            user_id=current_user.id,
            file_url=file_url,
            file_name=fname,
            file_size=size,
            report_type="Other",
        )
        db.add(report)
        imported += 1

    await db.flush()
    return {"imported": imported, "message": f"{imported} files imported"}


_RETEST_DAYS: dict[str, int] = {
    "CBC": 90,
    "LFT": 180,
    "KFT": 180,
    "Thyroid": 180,
    "Vitamin D": 180,
    "Vitamin B12": 180,
    "Diabetes": 90,
    "Lipid Profile": 365,
}


def _report_to_dict(r: Report) -> dict:
    approval_status = getattr(r, "approval_status", None) or "approved"
    show_ai = approval_status == "approved"

    analysis = None
    if show_ai and r.analysis_result:
        try:
            analysis = json.loads(r.analysis_result)
        except Exception:
            analysis = r.analysis_result

    reviewed_at = getattr(r, "reviewed_at", None)
    return {
        "id": r.id,
        "user_id": r.user_id,
        "report_type": r.report_type,
        "file_url": r.file_url,
        "file_name": r.file_name,
        "file_size": r.file_size,
        "raw_text": r.raw_text,
        "ai_summary": r.ai_summary if show_ai else None,
        "analysis_result": analysis,
        "risk_score": r.risk_score,
        "risk_level": r.risk_level,
        "approval_status": approval_status,
        "doctor_notes": getattr(r, "doctor_notes", None),
        "reviewed_at": reviewed_at.isoformat() if reviewed_at else None,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "parameters": [
            {
                "id": p.id,
                "parameter_name": p.parameter_name,
                "value": p.value,
                "unit": p.unit,
                "reference_min": p.reference_min,
                "reference_max": p.reference_max,
                "is_abnormal": p.is_abnormal,
                "status": p.status,
            }
            for p in (r.parameters or [])
        ],
        **_retest_fields(r),
    }


def _retest_fields(r: Report) -> dict:
    if not r.created_at:
        return {"days_since_upload": None, "recommended_retest_days": None, "retest_due": False}
    days_since = (datetime.utcnow() - r.created_at).days
    retest_days = _RETEST_DAYS.get(r.report_type or "", 180)
    return {
        "days_since_upload": days_since,
        "recommended_retest_days": retest_days,
        "retest_due": days_since >= retest_days,
    }
