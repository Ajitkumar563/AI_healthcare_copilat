"""
WhatsApp integration via Twilio Sandbox.

Setup:
  1. Sign up at twilio.com, go to Messaging → Try it out → Send a WhatsApp message
  2. Join the sandbox by sending "join <word>-<word>" from your phone to +14155238886
  3. Copy credentials to .env:
       TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
       TWILIO_AUTH_TOKEN=your_auth_token
       TWILIO_WHATSAPP_FROM=whatsapp:+14155238886   # sandbox default
       TWILIO_WHATSAPP_TO=whatsapp:+91XXXXXXXXXX    # your verified number (optional)

If credentials are missing, all functions return gracefully — the app
continues to work exactly as before, just without WhatsApp messages.
"""

import os
from twilio.rest import Client

TWILIO_ACCOUNT_SID = os.getenv("TWILIO_ACCOUNT_SID")
TWILIO_AUTH_TOKEN  = os.getenv("TWILIO_AUTH_TOKEN")
TWILIO_FROM        = os.getenv("TWILIO_WHATSAPP_FROM", "whatsapp:+14155238886")
TWILIO_TO          = os.getenv("TWILIO_WHATSAPP_TO")


async def send_whatsapp_message(to_phone: str, message: str) -> dict:
    """
    Send a text message via Twilio WhatsApp Sandbox.

    Args:
        to_phone:  Recipient number in E.164 format WITHOUT '+', e.g. "919876543210".
                   Ignored when TWILIO_WHATSAPP_TO is set (sandbox pin to one number).
        message:   Plain-text body.

    Returns:
        {"success": True, "sid": "SM..."} on success,
        {"success": False, "error": "..."} on any failure — never raises.
    """
    if not TWILIO_ACCOUNT_SID or not TWILIO_AUTH_TOKEN:
        return {"success": False, "error": "Twilio not configured"}

    try:
        client = Client(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN)
        recipient = TWILIO_TO if TWILIO_TO else f"whatsapp:+{to_phone}"

        print(f"[WhatsApp/Twilio] from={TWILIO_FROM}  to={recipient}")

        msg = client.messages.create(
            from_=TWILIO_FROM,
            to=recipient,
            body=message,
        )

        print(f"[WhatsApp/Twilio] sid={msg.sid}  status={msg.status}")
        return {"success": True, "sid": msg.sid}

    except Exception as exc:
        print(f"[WhatsApp/Twilio] error: {exc}")
        return {"success": False, "error": str(exc)}


def _risk_level(summary: dict, key: str) -> str:
    val = summary.get(key, {})
    if isinstance(val, dict):
        return val.get("level", "N/A")
    return str(val) if val else "N/A"


def _emoji_for_level(level: str) -> str:
    l = level.lower()
    if l == "critical": return "🔴"
    if l == "high":     return "🟠"
    if l == "medium":   return "🟡"
    if l == "low":      return "🟢"
    return "⚪"


def format_report_summary_message(
    patient_name: str,
    report_type: str,
    risk_summary: dict,
) -> str:
    overall_score = risk_summary.get("overall_score", "N/A")
    overall_level = risk_summary.get("risk_level", "N/A")
    overall_emoji = _emoji_for_level(str(overall_level))

    heart    = _risk_level(risk_summary, "heart_risk")
    diabetes = _risk_level(risk_summary, "diabetes_risk")
    liver    = _risk_level(risk_summary, "liver_risk")
    kidney   = _risk_level(risk_summary, "kidney_risk")

    has_organ_data = any(
        isinstance(risk_summary.get(k), dict)
        for k in ("heart_risk", "diabetes_risk", "liver_risk", "kidney_risk")
    )

    lines = [
        "🏥 *Sahaay Health Report Summary*",
        "",
        f"Patient: {patient_name}",
        f"Report: {report_type}",
        "",
        f"📊 *Overall Health Score: {overall_score}/100*",
        f"{overall_emoji} Risk Level: {overall_level}",
    ]

    if has_organ_data:
        lines += [
            "",
            "*Organ Risk Breakdown:*",
            f"❤️  Heart:    {heart}  {_emoji_for_level(heart)}",
            f"🩸  Diabetes: {diabetes}  {_emoji_for_level(diabetes)}",
            f"🫁  Liver:    {liver}  {_emoji_for_level(liver)}",
            f"🫘  Kidney:   {kidney}  {_emoji_for_level(kidney)}",
        ]

    lines += [
        "",
        "Open the Sahaay app to view the full AI analysis and chat with your health assistant.",
        "",
        "⚠️ _This is an automated summary. Always consult your doctor for medical decisions._",
    ]

    return "\n".join(lines)
