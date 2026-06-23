"""
Emergency health alert email via Gmail SMTP (Python built-in smtplib — no extra package).

Setup:
  1. Enable 2-Step Verification on your Google account.
  2. Go to myaccount.google.com → Security → App Passwords.
  3. Create an App Password for "Mail" — copy the 16-char code.
  4. Add to .env:
       SMTP_EMAIL=your-gmail@gmail.com
       SMTP_APP_PASSWORD=xxxx xxxx xxxx xxxx   (spaces OK, they are stripped)

If either variable is missing, all functions return False silently — the app
continues to work exactly as before, just without email alerts.
"""

import os
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText


def _credentials() -> tuple[str, str] | None:
    email    = os.getenv("SMTP_EMAIL", "").strip()
    password = os.getenv("SMTP_APP_PASSWORD", "").replace(" ", "").strip()
    if not email or not password:
        return None
    return email, password


def send_emergency_email(to_email: str, patient_name: str, risk_details: dict) -> bool:
    """
    Send an emergency health alert email.

    Args:
        to_email:      Recipient address (patient's email from their profile).
        patient_name:  Display name in the email body.
        risk_details:  The full risk-score dict returned by Gemini.

    Returns:
        True if the email was dispatched, False if skipped or failed.
    """
    creds = _credentials()
    if creds is None:
        print("[Email] SMTP_EMAIL / SMTP_APP_PASSWORD not set — skipping alert email.")
        return False

    smtp_email, smtp_password = creds

    try:
        # ── Identify which organ systems are critical ──────────────────────
        organ_map = {
            "liver_risk":    "Liver",
            "diabetes_risk": "Diabetes / Blood Sugar",
            "heart_risk":    "Heart / Cardiovascular",
            "kidney_risk":   "Kidney",
        }
        critical_systems: list[tuple[str, str]] = []
        for key, label in organ_map.items():
            organ = risk_details.get(key, {})
            if isinstance(organ, dict) and organ.get("level", "").lower() == "critical":
                critical_systems.append((label, organ.get("explanation", "")))

        overall_score = risk_details.get("overall_score", "N/A")
        overall_level = risk_details.get("risk_level", "Unknown")

        # ── Build HTML rows ────────────────────────────────────────────────
        rows_html = ""
        for system, explanation in critical_systems:
            rows_html += f"""
            <tr>
              <td style="padding:8px 12px;font-weight:bold;color:#DC2626;border-bottom:1px solid #FEE2E2">{system}</td>
              <td style="padding:8px 12px;color:#374151;border-bottom:1px solid #FEE2E2">{explanation or "Requires immediate attention."}</td>
            </tr>"""

        # ── Email content ──────────────────────────────────────────────────
        subject = f"⚠️ Urgent: Critical Health Alert for {patient_name}"

        html = f"""
<!DOCTYPE html>
<html lang="en">
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#F9FAFB;">
  <div style="max-width:600px;margin:32px auto;border-radius:16px;overflow:hidden;
              box-shadow:0 4px 24px rgba(0,0,0,0.08);">

    <!-- Header -->
    <div style="background:linear-gradient(135deg,#DC2626 0%,#EF4444 60%,#F97316 100%);
                padding:28px 24px;">
      <h1 style="margin:0;color:#fff;font-size:20px;font-weight:800;">
        &#9888;&#65039; Critical Health Alert
      </h1>
      <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:13px;">
        Sahaay AI Healthcare Copilot
      </p>
    </div>

    <!-- Body -->
    <div style="background:#FEF2F2;padding:24px;border:1px solid #FECACA;
                border-top:none;border-radius:0 0 16px 16px;">
      <p style="color:#374151;font-size:16px;margin:0 0 12px;">
        Dear <strong>{patient_name}</strong>,
      </p>
      <p style="color:#374151;font-size:14px;line-height:1.6;margin:0 0 20px;">
        Your recent lab report analysis on <strong>Sahaay</strong> has detected
        <strong style="color:#DC2626;">critical health risk levels</strong>
        that require immediate medical attention.
      </p>

      <!-- Score box -->
      <div style="background:#fff;border:1px solid #FECACA;border-radius:10px;
                  padding:16px 20px;margin-bottom:16px;">
        <p style="margin:0 0 12px;font-size:14px;color:#374151;">
          Overall Health Score:
          <strong style="color:#DC2626;">{overall_score}/100 ({overall_level})</strong>
        </p>
        <table style="width:100%;border-collapse:collapse;">
          <thead>
            <tr style="background:#FEE2E2;">
              <th style="padding:8px 12px;text-align:left;font-size:11px;
                         text-transform:uppercase;color:#6B7280;letter-spacing:.5px;">
                System
              </th>
              <th style="padding:8px 12px;text-align:left;font-size:11px;
                         text-transform:uppercase;color:#6B7280;letter-spacing:.5px;">
                Finding
              </th>
            </tr>
          </thead>
          <tbody>{rows_html}</tbody>
        </table>
      </div>

      <!-- CTA warning -->
      <div style="background:#FEF3C7;border:1px solid #FCD34D;border-radius:10px;
                  padding:14px 16px;margin-bottom:20px;">
        <p style="margin:0;color:#92400E;font-size:14px;line-height:1.5;">
          <strong>&#9889; Immediate Action Required:</strong>
          Please consult a doctor or visit the nearest hospital as soon as possible.
          If you experience severe symptoms, call emergency services
          (<strong>112</strong>).
        </p>
      </div>

      <!-- Footer -->
      <p style="color:#9CA3AF;font-size:11px;margin:0;padding-top:16px;
                border-top:1px solid #F3F4F6;line-height:1.5;">
        This alert was generated automatically by Sahaay AI Healthcare Copilot
        based on your uploaded lab report. This is <em>not</em> a medical
        diagnosis — always consult a qualified healthcare professional.
      </p>
    </div>
  </div>
</body>
</html>"""

        # ── Assemble and send ──────────────────────────────────────────────
        msg = MIMEMultipart("alternative")
        msg["Subject"] = subject
        msg["From"]    = smtp_email
        msg["To"]      = to_email
        msg.attach(MIMEText(html, "html"))

        with smtplib.SMTP("smtp.gmail.com", 587, timeout=10) as server:
            server.ehlo()
            server.starttls()
            server.login(smtp_email, smtp_password)
            server.sendmail(smtp_email, to_email, msg.as_string())

        print(f"[Email] Emergency alert sent to {to_email}")
        return True

    except Exception as exc:
        print(f"[Email] Failed to send emergency alert: {exc}")
        return False
