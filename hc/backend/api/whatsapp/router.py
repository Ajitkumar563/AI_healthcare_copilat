"""
WhatsApp inbound webhook — Twilio Sandbox.

Twilio POSTs application/x-www-form-urlencoded to this endpoint when a user
messages the sandbox number.  We classify intent, query the DB, optionally
call Gemini, and reply with a TwiML <Response><Message>.

Setup:
  1. Twilio Console → Messaging → Try it out → WhatsApp Sandbox
  2. Set Webhook URL:  https://<your-domain>/api/whatsapp/webhook  (POST)
  3. Copy credentials to .env:
       TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       TWILIO_AUTH_TOKEN=your_auth_token
       TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
  4. For local dev, set WHATSAPP_SKIP_VALIDATION=true (skips signature check)
"""

import asyncio
import os
import re
from fastapi import APIRouter, Depends, Form, Request
from fastapi.responses import Response
from pydantic import BaseModel
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from database.db import get_db
from models.models import User, Report, Reminder
from api.ai.router import call_ai, AIUnavailableError
from core.security import get_current_user_dep
from services.whatsapp_service import send_whatsapp_message, TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN

router = APIRouter()


class TestSendRequest(BaseModel):
    to: str = ""   # E.164 digits, no '+', e.g. "917303554059". Defaults to TWILIO_WHATSAPP_TO if blank.


@router.post("/test-send")
async def test_send(
    body: TestSendRequest,
    current_user: User = Depends(get_current_user_dep),
):
    """Standalone Twilio connectivity check — sends 'Hello from Sahaay', then polls
    Twilio for the real delivery status (queued -> delivered/failed) since the
    initial API response only confirms Twilio *accepted* the request, not delivery."""
    result = await send_whatsapp_message(
        body.to, "Hello from Sahaay 👋 — this is a test message confirming your Twilio WhatsApp connection is working."
    )
    if not result.get("success"):
        return result  # credential/config-level error — nothing to poll

    # Give Twilio a moment to attempt delivery, then fetch the real status.
    await asyncio.sleep(4)
    try:
        from twilio.rest import Client
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        msg = client.messages(result["sid"]).fetch()
        return {
            "success": msg.status not in ("failed", "undelivered"),
            "sid": msg.sid,
            "delivery_status": msg.status,
            "error_code": msg.error_code,
            "error_message": msg.error_message,
            "hint": (
                "Twilio Sandbox error 63015 means the recipient hasn't joined your "
                "sandbox or the 72-hour session expired — have them text "
                "'join <your-sandbox-word>' to +14155238886 again."
                if msg.error_code == 63015 else None
            ),
        }
    except Exception as e:
        return {"success": True, "sid": result["sid"], "delivery_status": "unknown", "poll_error": str(e)}

_SKIP_VALIDATION = os.getenv("WHATSAPP_SKIP_VALIDATION", "false").lower() == "true"
_AUTH_TOKEN = os.getenv("TWILIO_AUTH_TOKEN", "")


# ─── Helpers ──────────────────────────────────────────────────────────────────

def _twiml(message: str) -> Response:
    xml = (
        "<?xml version='1.0' encoding='UTF-8'?>"
        f"<Response><Message>{message}</Message></Response>"
    )
    return Response(content=xml, media_type="text/xml")


def _validate_signature(request: Request, form_data: dict) -> bool:
    if _SKIP_VALIDATION or not _AUTH_TOKEN:
        return True
    try:
        from twilio.request_validator import RequestValidator
        validator = RequestValidator(_AUTH_TOKEN)
        sig = request.headers.get("X-Twilio-Signature", "")
        return validator.validate(str(request.url), form_data, sig)
    except Exception:
        return False


def _phone_variants(wa_id: str) -> list[str]:
    """
    Return candidate phone strings to match against User.phone.
    Twilio WaId is digits-only (e.g. '919876543210').
    Users may store phone in several formats.
    """
    digits = re.sub(r"\D", "", wa_id)
    variants = {digits, f"+{digits}"}
    if len(digits) > 10:
        local = digits[-10:]
        variants.update([local, f"0{local}"])
    return list(variants)


async def _find_user(wa_id: str, db: AsyncSession) -> User | None:
    for phone in _phone_variants(wa_id):
        row = await db.execute(select(User).where(User.phone == phone))
        user = row.scalars().first()
        if user:
            return user
    return None


def _intent(body: str) -> str:
    text = body.lower()
    if any(k in text for k in ["report", "result", "latest", "lab", "test", "blood"]):
        return "report"
    if any(k in text for k in ["reminder", "medicine", "tablet", "pill", "dose", "medication"]):
        return "reminder"
    if any(k in text for k in ["appointment", "book", "doctor", "slot", "schedule", "visit"]):
        return "appointment"
    return "ai"


# ─── Intent handlers ──────────────────────────────────────────────────────────

async def _reply_report(user: User, db: AsyncSession) -> str:
    row = await db.execute(
        select(Report)
        .where(Report.user_id == user.id, Report.approval_status == "approved")
        .order_by(desc(Report.created_at))
        .limit(1)
    )
    report = row.scalars().first()

    if not report:
        row2 = await db.execute(
            select(Report)
            .where(Report.user_id == user.id)
            .order_by(desc(Report.created_at))
            .limit(1)
        )
        report = row2.scalars().first()

    if not report:
        return (
            f"Hi {user.name}! 👋\n\n"
            "You haven't uploaded any reports yet.\n\n"
            "Open the Sahaay app to upload your lab reports and get AI health insights."
        )

    status = {
        "approved": "✅ Approved by doctor",
        "pending":  "⏳ Pending doctor review (24–48h)",
        "rejected": "❌ Doctor recommended follow-up — see app",
    }.get(report.approval_status or "pending", "⏳ Pending")

    summary = report.ai_summary or "No AI summary available yet."
    if len(summary) > 500:
        summary = summary[:497] + "..."

    date_str = report.created_at.strftime("%d %b %Y") if report.created_at else "N/A"

    return (
        f"🏥 *Latest Report — {user.name}*\n\n"
        f"📋 Type: {report.report_type or 'Lab Report'}\n"
        f"📅 Date: {date_str}\n"
        f"🎯 Risk Score: {report.risk_score or 'N/A'}/100\n"
        f"⚠️  Risk Level: {report.risk_level or 'N/A'}\n"
        f"📌 Status: {status}\n\n"
        f"*AI Summary:*\n{summary}\n\n"
        "_Open the Sahaay app for full analysis and AI health chat._"
    )


async def _reply_reminders(user: User, db: AsyncSession) -> str:
    row = await db.execute(
        select(Reminder)
        .where(Reminder.user_id == user.id, Reminder.is_active == True)
        .order_by(Reminder.medicine_name)
    )
    reminders = row.scalars().all()

    if not reminders:
        return (
            f"Hi {user.name}! 💊\n\n"
            "No active medicine reminders found.\n\n"
            "Open Sahaay → Reminders to add your medicines."
        )

    lines = [f"💊 *Medicine Reminders — {user.name}*\n"]
    for r in reminders[:8]:
        icon = "✅" if r.taken_today else "🔔"
        dosage = f" ({r.dosage})" if r.dosage else ""
        freq = f" — {r.frequency}" if r.frequency else ""
        lines.append(f"{icon} {r.medicine_name}{dosage}{freq}")

    if len(reminders) > 8:
        lines.append(f"... and {len(reminders) - 8} more. Open the app to see all.")

    lines.append("\n_Open Sahaay to mark doses taken or add new reminders._")
    return "\n".join(lines)


def _reply_appointment() -> str:
    return (
        "📅 *Book an Appointment via Sahaay*\n\n"
        "Steps:\n"
        "1. Open the Sahaay app\n"
        "2. Go to *Appointments*\n"
        "3. Choose specialty → pick a doctor → select time slot\n"
        "4. Confirm booking\n\n"
        "💻 Video consultation: ₹800\n"
        "🏥 In-person visit: ₹500\n\n"
        "_Have a health question instead? Just ask me anything!_"
    )


def _reply_ai(body: str, name: str) -> str:
    prompt = (
        f"You are Sahaay, a friendly AI health assistant for Indian patients. "
        f"The user's name is {name}. "
        f"Answer their health question concisely in 3-5 short sentences using plain text only — "
        f"no markdown, no bullet points. "
        f"Always advise consulting a doctor for serious concerns.\n\n"
        f"User: {body}"
    )
    try:
        answer = call_ai(prompt)
        return (
            f"🤖 *Sahaay AI*\n\n{answer}\n\n"
            "_Always consult a qualified doctor for medical decisions._"
        )
    except AIUnavailableError:
        return (
            f"Hi {name}! 👋\n\n"
            "The AI service is temporarily unavailable. Please try again later "
            "or open the Sahaay app for the full AI health assistant."
        )


# ─── Webhook endpoint ─────────────────────────────────────────────────────────

@router.post("/webhook")
async def whatsapp_webhook(
    request: Request,
    From: str = Form(...),
    Body: str = Form(...),
    WaId: str = Form(...),
    ProfileName: str = Form(default=""),
    db: AsyncSession = Depends(get_db),
):
    """Receive inbound WhatsApp messages from Twilio and reply with TwiML."""
    form_dict = {"From": From, "Body": Body, "WaId": WaId, "ProfileName": ProfileName}

    if not _validate_signature(request, form_dict):
        return _twiml("Unauthorized request.")

    wa_digits = re.sub(r"\D", "", WaId)
    user = await _find_user(wa_digits, db)
    display_name = ProfileName or "there"

    if not user:
        return _twiml(
            f"Hi {display_name}! 👋\n\n"
            "I couldn't find a Sahaay account linked to your number.\n\n"
            "Please sign up on the Sahaay app and add your phone number in your profile settings."
        )

    intent = _intent(Body)

    if intent == "report":
        reply = await _reply_report(user, db)
    elif intent == "reminder":
        reply = await _reply_reminders(user, db)
    elif intent == "appointment":
        reply = _reply_appointment()
    else:
        reply = _reply_ai(Body, user.name or display_name)

    return _twiml(reply)
