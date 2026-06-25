from fastapi import APIRouter, UploadFile, File, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
import os
import re
import json
import io
import asyncio

from datetime import date as _date
from sqlalchemy import select
from database.db import get_db
from models.models import Symptom, User, Report
from core.security import get_optional_user, get_current_user_dep
from services.ocr_service import extract_text
from services.email_service import send_emergency_email
from services.whatsapp_service import send_whatsapp_message

router = APIRouter()


# ─────────────────────────────────────────────
# Request Models  (unchanged — no schema changes)
# ─────────────────────────────────────────────

class SmartReportRequest(BaseModel):
    report_text: str = ""
    text: str | None = None
    report: str | None = None
    patient_name: str = "Patient"
    age: int = 25
    gender: str = "Unknown"
    language: str = "en"

class SymptomRequest(BaseModel):
    symptoms: str
    age: int = 25
    gender: str = "not specified"
    language: str = "en"

class DietPlanRequest(BaseModel):
    report_text: str = ""
    diet_type: str = "General"
    condition: str = "General"
    age: int = 25
    weight: float = 60
    activity_level: str = "moderate"
    language: str = "en"

class ChatMessage(BaseModel):
    role: str
    content: str

class ChatRequest(BaseModel):
    report_text: str
    message: str
    history: list[ChatMessage] = []
    patient_name: str = "Patient"
    language: str = "en"

class RiskScoreRequest(BaseModel):
    report_text: str
    patient_name: str = "Patient"
    age: int = 25
    gender: str = "Unknown"
    user_email: str | None = None
    language: str = "en"

class CompareRequest(BaseModel):
    report_text_1: str
    report_text_2: str
    patient_name: str = "Patient"
    date_1: str = "Previous"
    date_2: str = "Recent"

class DoctorSummaryRequest(BaseModel):
    report_text: str
    patient_name: str = "Patient"
    age: int = 25
    gender: str = "Unknown"
    language: str = "en"

class SOAPRequest(BaseModel):
    raw_text: str
    patient_name: str = "Patient"
    language: str = "en"

class MedicineInteractionRequest(BaseModel):
    medicines: list[str]


# ─────────────────────────────────────────────
# Gemini API helpers
# ─────────────────────────────────────────────

class AIUnavailableError(Exception):
    """Raised when the Gemini API key is missing, quota is exceeded, or the
    service returns an unrecoverable error."""
    pass


def _get_gemini_client():
    """Lazy-initialise a google.genai Client.

    Raises AIUnavailableError if the key is not configured.
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or api_key == "your-gemini-api-key-here":
        raise AIUnavailableError("GEMINI_API_KEY is not set in .env")

    try:
        from google import genai
        return genai.Client(api_key=api_key)
    except ImportError:
        raise AIUnavailableError(
            "google-genai is not installed. "
            "Run: pip install google-genai"
        )


def _is_quota_error(e: Exception) -> bool:
    """Return True for rate-limit / quota / auth errors that should become
    AIUnavailableError rather than propagating as 500."""
    msg = str(e).lower()
    keywords = [
        "quota", "rate", "429", "resource exhausted",
        "permission denied", "unauthenticated", "api key", "credential",
        "billing", "invalid api key",
    ]
    # Also catch google.api_core exception classes by name
    class_name = type(e).__name__.lower()
    return (
        any(k in msg for k in keywords)
        or "resourceexhausted" in class_name
        or "permissiondenied" in class_name
        or "unauthenticated" in class_name
    )


def call_gemini(prompt: str) -> str:
    """Call Gemini with a text prompt and return the response text."""
    client = _get_gemini_client()
    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
        )
        return response.text.strip()
    except AIUnavailableError:
        raise
    except Exception as e:
        if _is_quota_error(e):
            raise AIUnavailableError(f"Gemini API unavailable: {e}")
        raise


def _clean_json_text(raw: str) -> str:
    """Sanitise raw Gemini text so json.loads() can parse it reliably.

    Handles the three most common failure modes:
    1. Markdown code fences  (```json ... ```)
    2. Trailing commas before } or ]  (invalid JSON but valid JS)
    3. Leading/trailing non-JSON prose before the first { or [
    """
    # 1. Strip markdown fences
    text = re.sub(r"```(?:json)?\s*", "", raw)
    text = re.sub(r"```\s*", "", text).strip()
    if text.startswith("`") and text.endswith("`"):
        text = text.strip("`").strip()

    # 2. Remove trailing commas before closing brace/bracket
    text = re.sub(r",(\s*[}\]])", r"\1", text)

    # 3. Slice from the first JSON boundary to the last matching closer
    obj_start = text.find("{")
    arr_start = text.find("[")

    if obj_start == -1 and arr_start == -1:
        return text  # nothing to slice — let json.loads raise

    if obj_start == -1:
        start, end = arr_start, text.rfind("]") + 1
    elif arr_start == -1:
        start, end = obj_start, text.rfind("}") + 1
    else:
        if obj_start <= arr_start:
            start, end = obj_start, text.rfind("}") + 1
        else:
            start, end = arr_start, text.rfind("]") + 1

    return text[start:end]


def call_gemini_json(prompt: str) -> dict:
    """Call Gemini in structured-JSON mode and return a parsed dict.

    Uses response_mime_type='application/json' so Gemini skips markdown
    fences and returns valid JSON directly.  _clean_json_text() is applied
    as a second-pass guard in case the model still adds stray characters.
    Raises AIUnavailableError (not a raw JSONDecodeError) on parse failure
    so the caller's except-AIUnavailableError branch handles it cleanly.
    """
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or api_key == "your-gemini-api-key-here":
        raise AIUnavailableError("GEMINI_API_KEY is not set in .env")

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        raise AIUnavailableError(
            "google-genai is not installed. Run: pip install google-genai"
        )

    client = genai.Client(api_key=api_key)

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            ),
        )
        raw = response.text.strip()
    except Exception as e:
        if _is_quota_error(e):
            raise AIUnavailableError(f"Gemini API unavailable: {e}")
        raise

    cleaned = _clean_json_text(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        print(f"[Gemini JSON] Parse error: {exc}")
        print(f"[Gemini JSON] Raw response (first 500 chars): {raw[:500]}")
        raise AIUnavailableError(
            f"Gemini returned malformed JSON ({exc}). "
            "This is a transient model output issue — please retry."
        )


def call_gemini_multimodal_json(prompt: str, image_bytes: bytes) -> dict:
    """Pass an image + text prompt to Gemini and return parsed JSON.

    Uses JSON mode (response_mime_type) and the same _clean_json_text()
    guard as call_gemini_json().  Used by /prescription for image inputs.
    """
    try:
        import PIL.Image
        from google import genai
        from google.genai import types
    except ImportError:
        raise AIUnavailableError(
            "google-genai or Pillow not installed. "
            "Run: pip install google-genai Pillow"
        )

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or api_key == "your-gemini-api-key-here":
        raise AIUnavailableError("GEMINI_API_KEY is not set in .env")

    client = genai.Client(api_key=api_key)
    image = PIL.Image.open(io.BytesIO(image_bytes))

    try:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=[prompt, image],
            config=types.GenerateContentConfig(
                response_mime_type="application/json"
            ),
        )
        raw = response.text.strip()
    except Exception as e:
        if _is_quota_error(e):
            raise AIUnavailableError(f"Gemini API unavailable: {e}")
        raise

    cleaned = _clean_json_text(raw)
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError as exc:
        print(f"[Gemini multimodal JSON] Parse error: {exc}")
        print(f"[Gemini multimodal JSON] Raw response (first 500 chars): {raw[:500]}")
        raise AIUnavailableError(
            f"Gemini returned malformed JSON ({exc}). Please retry."
        )


# ─────────────────────────────────────────────
# Regex fallback parser (no AI needed)
# ─────────────────────────────────────────────

def extract_value_from_text(label_pattern, text, min_val=None, max_val=None):
    match = re.search(label_pattern, text, re.IGNORECASE)
    if not match:
        return None
    after_label = text[match.end():match.end()+200]
    nums = re.findall(r'\b(\d+\.?\d*)\b', after_label)
    for n in nums:
        val = float(n)
        if min_val is not None and val < min_val:
            continue
        if max_val is not None and val > max_val:
            continue
        return val
    return None


def production_text_parser(text: str, patient_name: str):
    findings = []
    health_score = 95
    critical_flags = []

    val = extract_value_from_text(r'VITAMIN D \(25 - OH VITAMIN D\)', text, min_val=1, max_val=150)
    if val is None:
        val = extract_value_from_text(r'vitamin\s*d\s*supplementation', text, min_val=1, max_val=150)
    if val:
        status = "Normal" if val >= 30.0 else "Low"
        if status == "Low":
            health_score -= 15
            critical_flags.append("Vitamin D Deficiency")
        findings.append({"parameter": "Vitamin D (Total)", "value": f"{val} ng/mL", "status": status,
                         "explanation": f"Standard range is 30.0 - 100.0 ng/mL. Your value is {status.lower()}."})

    val = extract_value_from_text(r'haemoglobin\b', text, min_val=5, max_val=25)
    if val is None:
        val = extract_value_from_text(r'hemoglobin\b', text, min_val=5, max_val=25)
    if val:
        status = "Normal" if 11.5 <= val <= 17.5 else "Low"
        if status == "Low":
            health_score -= 20
            critical_flags.append("Low Hemoglobin (Anemia)")
        findings.append({"parameter": "Hemoglobin (Hb)", "value": f"{val} g/dL", "status": status,
                         "explanation": f"Standard range is 12.0 - 17.0 g/dL. Your value is {status.lower()}."})

    val = extract_value_from_text(r'thyroid\s*stimulating\s*hormone', text, min_val=0.1, max_val=20)
    if val is None:
        val = extract_value_from_text(r'\btsh\b', text, min_val=0.1, max_val=20)
    if val:
        status = "Normal" if 0.34 <= val <= 5.6 else ("High" if val > 5.6 else "Low")
        if status != "Normal":
            health_score -= 15
            critical_flags.append("Elevated TSH")
        findings.append({"parameter": "Thyroid (TSH)", "value": f"{val} mIU/L", "status": status,
                         "explanation": f"Standard range is 0.34 - 5.6 mIU/L. Your value is {status.lower()}."})

    val = extract_value_from_text(r'glucose[,\s]*fasting', text, min_val=50, max_val=400)
    if val is None:
        val = extract_value_from_text(r'fasting\s*glucose', text, min_val=50, max_val=400)
    if val:
        status = "Normal" if val < 100.0 else ("High" if val > 125.0 else "Borderline")
        if status != "Normal":
            health_score -= 15
            critical_flags.append(f"{status} Blood Glucose")
        findings.append({"parameter": "Blood Glucose (Fasting)", "value": f"{val} mg/dL", "status": status,
                         "explanation": "Optimal fasting glucose level is < 100.0 mg/dL."})

    val = extract_value_from_text(r'hba1c[,\s]*glycated', text, min_val=3, max_val=15)
    if val is None:
        val = extract_value_from_text(r'glycated\s*hemo', text, min_val=3, max_val=15)
    if val:
        status = "Normal" if val < 5.7 else ("Prediabetic" if val < 6.5 else "Diabetic")
        if status != "Normal":
            health_score -= 15
            critical_flags.append(f"HbA1c {status}")
        findings.append({"parameter": "HbA1c", "value": f"{val} %", "status": status,
                         "explanation": "Normal: <5.7%, Prediabetes: 5.7-6.4%, Diabetes: ≥6.5%."})

    val = extract_value_from_text(r'vitamin\s*b\s*12\b', text, min_val=10, max_val=2000)
    if val is None:
        val = extract_value_from_text(r'\bb12\b', text, min_val=10, max_val=2000)
    if val:
        status = "Normal" if val >= 200 else "Low"
        if status == "Low":
            health_score -= 10
            critical_flags.append("Vitamin B12 Deficiency")
        findings.append({"parameter": "Vitamin B12", "value": f"{val} pg/mL", "status": status,
                         "explanation": f"Normal range: 200-914 pg/mL. Your value is {status.lower()}."})

    val = extract_value_from_text(r'triglycerides?\b', text, min_val=50, max_val=1000)
    if val:
        status = "Normal" if val < 150 else ("Borderline" if val < 200 else "High")
        if status != "Normal":
            health_score -= 10
            critical_flags.append("High Triglycerides")
        findings.append({"parameter": "Triglycerides", "value": f"{val} mg/dL", "status": status,
                         "explanation": "Desirable: <150 mg/dL. Borderline: 150-199. High: ≥200."})

    if not findings:
        findings = [{"parameter": "Document Status", "value": "Parsed", "status": "Normal",
                     "explanation": "File text successfully read. No core metabolic anomalies detected."}]

    nutrition = ["Maintain a clean balanced diet with rich green vegetables, micro-nutrients, and fiber."]
    lifestyle = ["Engage in 20-30 minutes of consistent physical activity or brisk walking daily."]
    supplements = ["No emergency pharmacological intervention required. Focus on whole foods."]
    future_tests = ["Routine health checkup panel on an annual baseline schedule."]

    if "Vitamin D Deficiency" in critical_flags:
        nutrition.append("Consume fortified dairy, mushrooms, and egg yolks regularly.")
        lifestyle.append("Ensure 15-20 minutes of early morning natural sunlight exposure.")
        supplements.append("Vitamin D3 60K capsules weekly as directed by a healthcare professional.")
        future_tests.append("Re-evaluate Serum Vitamin D levels after 8-12 weeks.")
    if "Low Hemoglobin (Anemia)" in critical_flags:
        nutrition.append("Increase consumption of iron-dense foods like spinach, beetroot, and pomegranate.")
        lifestyle.append("Avoid drinking tea or coffee immediately after meals.")
        supplements.append("Iron supplementation after clinical consultation.")
        future_tests.append("Follow-up CBC test in 30 days.")
    if "Elevated TSH" in critical_flags:
        nutrition.append("Utilize iodized salt. Limit intake of raw cruciferous foods.")
        lifestyle.append("Focus on healthy sleep habits and stress management.")
        future_tests.append("Consult endocrinologist; re-test TSH in 8 weeks.")
    if "Vitamin B12 Deficiency" in critical_flags:
        nutrition.append("Include eggs, dairy, and fortified cereals in your diet.")
        supplements.append("Vitamin B12 supplementation as advised by your doctor.")
        future_tests.append("Re-test Vitamin B12 levels after 3 months.")
    if "High Triglycerides" in critical_flags:
        nutrition.append("Reduce sugar, refined carbs, and fried foods.")
        lifestyle.append("Increase omega-3 rich foods like flaxseeds and walnuts.")
        future_tests.append("Repeat lipid profile in 3 months.")
    if any("HbA1c" in f for f in critical_flags):
        nutrition.append("Limit simple sugars and refined carbohydrates.")
        lifestyle.append("Monitor blood sugar regularly.")
        future_tests.append("Repeat HbA1c in 3 months.")

    return {
        "health_score": max(45, health_score),
        "status": "Action Required" if health_score < 80 else "Good Health",
        "summary": f"Report analysis for {patient_name}. Key findings: {', '.join(critical_flags) if critical_flags else 'All core indicators stable'}.",
        "findings": findings,
        "nutrition": nutrition,
        "lifestyle": lifestyle,
        "future_tests": future_tests,
        "supplements": supplements
    }


def _compare_reports_regex(text1: str, text2: str, patient_name: str, date_1: str, date_2: str) -> dict:
    """Regex-based comparison fallback when Gemini is unavailable.

    Extracts known numeric lab parameters from both texts and categorises
    changes as improved / worsened / stable relative to normal ranges.
    Returns the same shape as the Gemini compare response so the frontend
    renders identically.
    """
    # (name, regex_pattern, min_plausible, max_plausible,
    #  normal_min_or_None, normal_max_or_None, lower_is_better, unit)
    PARAMS = [
        ("Vitamin D",       r"VITAMIN D \(25 - OH VITAMIN D\)|vitamin\s*d",    1,   150,  30.0,  100.0, False, "ng/mL"),
        ("Hemoglobin",      r"ha?emoglobin\b",                                  5,   25,   11.5,  17.5,  False, "g/dL"),
        ("TSH",             r"thyroid\s*stimulating\s*hormone|(?<!\w)tsh\b",   0.1,  20,   0.34,  5.6,   None,  "mIU/L"),
        ("Fasting Glucose", r"glucose[,\s]*fasting|fasting\s*glucose",         50,  400,   None,  99.0,  True,  "mg/dL"),
        ("HbA1c",           r"hba1c|glycated\s*hemo",                           3,   15,   None,  5.69,  True,  "%"),
        ("Vitamin B12",     r"vitamin\s*b\s*12\b|\bb12\b",                     10, 2000,  200.0,  None,  False, "pg/mL"),
        ("Triglycerides",   r"triglycerides?\b",                                50, 1000,   None, 149.0,  True,  "mg/dL"),
    ]

    improved, worsened, stable = [], [], []

    for name, pattern, min_v, max_v, normal_min, normal_max, lower_is_better, unit in PARAMS:
        v1 = extract_value_from_text(pattern, text1, min_val=min_v, max_val=max_v)
        v2 = extract_value_from_text(pattern, text2, min_val=min_v, max_val=max_v)
        if v1 is None or v2 is None:
            continue

        old_str = f"{v1} {unit}"
        new_str = f"{v2} {unit}"
        change_pct = round(abs(v2 - v1) / v1 * 100) if v1 else 0

        # Identical or within 3% → stable
        if abs(v2 - v1) / max(abs(v1), 0.001) < 0.03:
            stable.append({"parameter": name, "value": new_str, "note": "Within normal range"})
            continue

        in_normal_1 = (
            (normal_min is None or v1 >= normal_min) and
            (normal_max is None or v1 <= normal_max)
        )
        in_normal_2 = (
            (normal_min is None or v2 >= normal_min) and
            (normal_max is None or v2 <= normal_max)
        )

        # If we know both bounds, use them to judge direction precisely
        if normal_min is not None and normal_max is not None:
            if in_normal_1 and in_normal_2:
                stable.append({"parameter": name, "value": new_str, "note": "Within normal range"})
                continue
            if not in_normal_1 and in_normal_2:
                improved.append({"parameter": name, "old_value": old_str, "new_value": new_str, "change_percent": change_pct, "note": "Now within normal range"})
                continue
            if in_normal_1 and not in_normal_2:
                worsened.append({"parameter": name, "old_value": old_str, "new_value": new_str, "change_percent": change_pct, "note": "Moved outside normal range"})
                continue
            # Both still abnormal — fall through to direction check below

        # Direction-based judgement (lower_is_better=None means bidirectional/TSH)
        if lower_is_better is None:
            # For TSH and similar: moving toward midpoint of range is better
            midpoint = ((normal_min or 0) + (normal_max or 0)) / 2 if (normal_min and normal_max) else None
            if midpoint is not None:
                d1 = abs(v1 - midpoint)
                d2 = abs(v2 - midpoint)
                if d2 < d1:
                    improved.append({"parameter": name, "old_value": old_str, "new_value": new_str, "change_percent": change_pct, "note": "Moving toward normal range"})
                else:
                    worsened.append({"parameter": name, "old_value": old_str, "new_value": new_str, "change_percent": change_pct, "note": "Moving away from normal range"})
            else:
                stable.append({"parameter": name, "value": new_str, "note": "Changed — consult your doctor"})
        elif lower_is_better:
            if v2 < v1:
                improved.append({"parameter": name, "old_value": old_str, "new_value": new_str, "change_percent": change_pct, "note": "Decreased (better)"})
            else:
                worsened.append({"parameter": name, "old_value": old_str, "new_value": new_str, "change_percent": change_pct, "note": "Increased (monitor closely)"})
        else:
            if v2 > v1:
                improved.append({"parameter": name, "old_value": old_str, "new_value": new_str, "change_percent": change_pct, "note": "Increased (better)"})
            else:
                worsened.append({"parameter": name, "old_value": old_str, "new_value": new_str, "change_percent": change_pct, "note": "Decreased (monitor closely)"})

    total = len(improved) + len(worsened) + len(stable)
    if total == 0:
        summary = (
            f"No common measurable parameters were found between the {date_1} and {date_2} reports "
            f"for {patient_name}. Upload standard lab reports (CBC, LFT, thyroid, etc.) for a detailed comparison. "
            "AI-powered comparison is also unavailable — check your Gemini API key."
        )
    else:
        parts = []
        if improved:
            parts.append(f"{len(improved)} improved")
        if worsened:
            parts.append(f"{len(worsened)} worsened")
        if stable:
            parts.append(f"{len(stable)} stable")
        summary = (
            f"Regex-based comparison of {total} parameter(s) between the {date_1} and {date_2} "
            f"reports for {patient_name}: {', '.join(parts)}. "
            "AI comparison is unavailable — results are based on known lab parameter patterns."
        )

    return {"ai_summary": summary, "improved": improved, "worsened": worsened, "stable": stable}


# ─────────────────────────────────────────────
# Language instructions (shared across all AI endpoints)
# ─────────────────────────────────────────────

_LANG_INSTRUCTIONS: dict[str, str] = {
    "hi":       "Respond in Hindi (Devanagari script). Use simple, warm language.",
    "hinglish": (
        "Respond in Hinglish — casual Hindi-English code-switching the way young urban Indians text. "
        "Example style: 'Aapka hemoglobin thoda low hai, isliye thakaan mehsoos ho sakti hai. "
        "Iron-rich food jaise spinach aur dates lo.' "
        "Do NOT write in pure Hindi script or pure formal English — mix naturally and keep it conversational."
    ),
    "ar": "Respond in Arabic. Use simple, warm language.",
    "fr": "Respond in French. Use simple, warm language.",
}


def _lang_note(language: str) -> str:
    """Return a prompt instruction for the requested language, or empty string for English."""
    instruction = _LANG_INSTRUCTIONS.get(language, "")
    if not instruction:
        return ""
    return f"\nLanguage instruction: {instruction} Keep parameter names, numeric values, and JSON keys in English."


# ─────────────────────────────────────────────
# ENDPOINT: Analyze report
# ─────────────────────────────────────────────

@router.post("/analyze")
async def smart_report(request: SmartReportRequest):
    report_text = request.report_text or request.text or request.report or ""

    try:
        prompt = f"""You are a clinical lab report analyzer. Extract all lab test values from this report for patient {request.patient_name}.

Return ONLY a valid JSON object, no extra text, no markdown, no backticks:
{{
  "health_score": <number between 45-100>,
  "status": "<Good Health or Action Required>",
  "summary": "<2 line summary of key findings>",
  "findings": [
    {{
      "parameter": "<test name>",
      "value": "<value with unit>",
      "status": "<Normal or Low or High or Borderline or Prediabetic>",
      "explanation": "<one line explanation with normal range>"
    }}
  ],
  "nutrition": ["<tip1>", "<tip2>", "<tip3>"],
  "lifestyle": ["<tip1>", "<tip2>"],
  "future_tests": ["<test1>", "<test2>"],
  "supplements": ["<supplement1>"]
}}

Important rules:
- Extract ACTUAL values from the text, not made up ones
- Include ALL abnormal parameters in findings
- Also include key normal parameters like Hemoglobin, TSH, Glucose
- health_score should reflect overall health{_lang_note(request.language)}

Report text:
{report_text[:5000]}"""

        report = call_gemini_json(prompt)
        return {"status": "success", "success": True, "ai_available": True, "error": None, "report": report}

    except AIUnavailableError as e:
        print(f"[AI] Gemini unavailable: {e}")
        parsed_report = production_text_parser(report_text, request.patient_name)
        return {
            "status": "success", "success": True, "ai_available": False,
            "message": "AI features unavailable — please check your Gemini API key. Showing regex-based analysis.",
            "error": None, "report": parsed_report
        }
    except Exception as e:
        print(f"[AI] Analyze error: {e}")
        parsed_report = production_text_parser(report_text, request.patient_name)
        return {"status": "success", "success": True, "ai_available": False, "error": None, "report": parsed_report}


# ─────────────────────────────────────────────
# ENDPOINT: Symptom checker
# ─────────────────────────────────────────────

@router.post("/symptoms")
async def check_symptoms(
    request: SymptomRequest,
    db: AsyncSession = Depends(get_db),
    current_user=Depends(get_optional_user),
):
    symptoms_text = request.symptoms.lower()
    ai_available = True
    result = None

    try:
        prompt = f"""You are a medical symptom checker AI. Patient is {request.age} years old, gender: {request.gender}.
Symptoms: {request.symptoms}

Return ONLY valid JSON, no markdown:
{{
  "risk_level": "<LOW|MODERATE|HIGH>",
  "risk_explanation": "<1 sentence>",
  "possible_conditions": [
    {{"condition": "<name>", "probability": "<low|medium|high>", "description": "<1 line>"}}
  ],
  "recommendations": ["<rec1>", "<rec2>", "<rec3>"],
  "follow_up_questions": ["<q1>", "<q2>"],
  "emergency": <true|false>,
  "emergency_message": "<message if emergency else empty string>"
}}{_lang_note(request.language)}"""
        result = call_gemini_json(prompt)

    except AIUnavailableError:
        ai_available = False
    except Exception as e:
        print(f"[AI] Symptoms error: {e}")
        ai_available = False

    if result is None:
        # Rule-based fallback
        result = {
            "risk_level": "MODERATE",
            "risk_explanation": "Symptoms suggest a moderate risk condition. Monitor symptoms closely and consult a doctor if they worsen.",
            "possible_conditions": [
                {"condition": "Acute Viral Illness / Systemic Infection", "probability": "medium",
                 "description": "A common viral infection that can cause fever, body ache, weakness, and headache."},
                {"condition": "Seasonal Viral Fever", "probability": "low",
                 "description": "Fever caused by seasonal weather changes or mild viral exposure."}
            ],
            "recommendations": [
                "Keep a regular log of body temperature every 4-6 hours.",
                "Drink plenty of fluids like water, ORS, or coconut water.",
                "Take proper rest and avoid physical exertion.",
                "Consult a doctor if fever persists beyond 2-3 days."
            ],
            "follow_up_questions": [
                "How long have you had the fever?",
                "Do you also have cough, sore throat, or body pain?"
            ],
            "emergency": False,
            "emergency_message": ""
        }
        if any(word in symptoms_text for word in ["fatigue", "weakness", "tired", "lethargy"]):
            result.update({
                "risk_level": "LOW",
                "risk_explanation": "Symptoms suggest a low-risk nutritional or deficiency-related issue.",
                "possible_conditions": [
                    {"condition": "Vitamin D / B12 Deficiency", "probability": "medium",
                     "description": "Low vitamin levels can cause tiredness, fatigue, and weakness."},
                    {"condition": "Low Hemoglobin (Anemia)", "probability": "low",
                     "description": "Anemia reduces oxygen supply to the body, causing weakness and lethargy."}
                ],
                "recommendations": [
                    "Eat iron-rich foods like spinach and beetroot.",
                    "Get 15-20 minutes of sunlight exposure daily.",
                    "Consider a CBC and vitamin profile blood test."
                ],
            })

    # Persist symptom check to DB so history is available for timeline
    if current_user is not None:
        try:
            conditions_json = json.dumps(
                [c["condition"] for c in result.get("possible_conditions", [])]
            )
            symptom_record = Symptom(
                user_id=current_user.id,
                symptoms_text=request.symptoms,
                possible_conditions=conditions_json,
                risk_level=result.get("risk_level"),
                ai_response=json.dumps(result),
            )
            db.add(symptom_record)
        except Exception as db_err:
            print(f"[DB] Failed to save symptom record: {db_err}")

    return {
        "status": "success",
        "success": True,
        "ai_available": ai_available,
        "message": (
            "AI features unavailable — please check your Gemini API key. Showing rule-based analysis."
            if not ai_available else None
        ),
        "error": None,
        "result": result,
    }


# ─────────────────────────────────────────────
# ENDPOINT: Diet plan
# ─────────────────────────────────────────────

@router.post("/diet-plan")
async def get_diet_plan(request: DietPlanRequest):
    condition = request.condition or request.diet_type or "General"

    try:
        prompt = f"""You are a clinical nutritionist. Create a specific daily diet plan for this patient.

Patient: Age {request.age}, Weight {request.weight}kg, Activity level: {request.activity_level}
Condition/Focus: {condition}

Return ONLY valid JSON, no markdown:
{{
  "summary": "<2-3 sentence personalized summary of the diet approach>",
  "breakfast": ["<item1 with portion>", "<item2>"],
  "lunch": ["<item1>", "<item2>", "<item3>"],
  "dinner": ["<item1>", "<item2>"],
  "snacks": ["<snack1>", "<snack2>"],
  "water_intake": "<specific recommendation>",
  "exercise": "<specific recommendation for their condition>",
  "foods_to_avoid": ["<food1>", "<food2>", "<food3>", "<food4>"]
}}

Use Indian food options primarily. Be specific with portions.{_lang_note(request.language)}"""
        result = call_gemini_json(prompt)
        return {"status": "success", "success": True, "ai_available": True, "error": None, "plan": result}

    except AIUnavailableError as e:
        print(f"[AI] Gemini unavailable for diet-plan: {e}")
    except Exception as e:
        print(f"[AI] Diet plan error: {e}")

    return {
        "status": "success", "success": True, "ai_available": False,
        "message": "AI features unavailable — please check your Gemini API key. Showing standard diet plan.",
        "error": None,
        "plan": {
            "summary": "This is a custom metabolic recovery diet tailored to replenish vital micro-nutrients, balance systemic hormone thresholds, and support sustained energy levels throughout the day.",
            "breakfast": ["Oatmeal with almonds, chia seeds, and fortified plant/skimmed milk", "2 Egg whites toast or mashed avocado over whole-grain bread"],
            "lunch": ["Whole wheat chapati or brown rice with a rich bowl of lentils (dal)", "Spinach paneer or grilled tofu", "A fresh bowl of cucumber curd or probiotic yogurt"],
            "dinner": ["Light vegetable clear soup or broccoli broth", "Grilled chicken breast or sautéed beetroot salad with mixed greens", "Stir-fried bell peppers and mushrooms"],
            "snacks": ["Green tea or herbal infusion", "A handful of roasted makhana or raw walnuts", "1 Small apple or seasonal fruit"],
            "water_intake": "Drink at least 2.5 to 3 liters of filtered, ambient water daily.",
            "exercise": "Engage in 20-30 minutes of low-impact physical activity, consistent brisk walking, or yoga.",
            "foods_to_avoid": ["Refined Sugars", "Processed Trans Fats", "Excessive Caffeine", "Deep Fried Foods"]
        }
    }


# ─────────────────────────────────────────────
# ENDPOINT: AI Chat with Report
# ─────────────────────────────────────────────

@router.post("/chat")
async def chat_with_report(request: ChatRequest):
    if not request.report_text or not request.message:
        raise HTTPException(status_code=400, detail="report_text and message are required")

    try:
        lang_instruction = _LANG_INSTRUCTIONS.get(
            request.language, "Respond in English. Use simple, warm language."
        )
        system_prompt = f"""You are Sahaay, an AI healthcare assistant analyzing a medical report for patient: {request.patient_name}.

REPORT DATA:
{request.report_text[:4000]}

RULES:
1. Only answer based on values found in the report above. Do NOT invent or assume values.
2. If a value is not in the report, say you don't see that in the report.
3. Always end responses with a reminder to consult a doctor for medical decisions.
4. {lang_instruction}
5. Be warm, clear, and use simple non-medical language."""

        from google.genai import types
        client = _get_gemini_client()

        # Gemini uses "model" instead of "assistant" for the AI role in history
        history_for_gemini = [
            types.Content(
                role="user" if m.role == "user" else "model",
                parts=[types.Part.from_text(m.content)],
            )
            for m in request.history
        ]

        chat = client.chats.create(
            model="gemini-2.5-flash",
            config=types.GenerateContentConfig(system_instruction=system_prompt),
            history=history_for_gemini,
        )
        response = chat.send_message(request.message)
        reply = response.text.strip()

        return {
            "success": True, "ai_available": True,
            "reply": reply,
            "updated_history": [
                *[{"role": m.role, "content": m.content} for m in request.history],
                {"role": "user", "content": request.message},
                {"role": "assistant", "content": reply},
            ]
        }

    except AIUnavailableError:
        return {
            "success": False, "ai_available": False,
            "message": "AI features unavailable — please check your Gemini API key.",
            "reply": "AI service is temporarily unavailable. Please check that your GEMINI_API_KEY is set correctly and has sufficient quota.",
            "updated_history": []
        }
    except Exception as e:
        if _is_quota_error(e):
            return {
                "success": False, "ai_available": False,
                "message": "AI service is temporarily unavailable due to rate limits.",
                "reply": "AI service is temporarily unavailable due to rate limits. Non-AI features (login, reports, reminders) still work.",
                "updated_history": []
            }
        print(f"[AI] Chat error: {e}")
        return {
            "success": False, "ai_available": True,
            "reply": "I'm having trouble connecting to the AI. Please try again in a moment.",
            "updated_history": []
        }


# ─────────────────────────────────────────────
# ENDPOINT: Health Risk Score
# ─────────────────────────────────────────────

_RISK_SCORE_FALLBACK = {
    "overall_score": 72,
    "risk_level": "Medium",
    "liver_risk": {"score": 85, "level": "Low", "parameters": [], "explanation": "Liver markers appear within normal range."},
    "diabetes_risk": {"score": 70, "level": "Medium", "parameters": [], "explanation": "Blood sugar levels are borderline — monitor closely."},
    "heart_risk": {"score": 75, "level": "Medium", "parameters": [], "explanation": "Lipid profile needs attention."},
    "kidney_risk": {"score": 88, "level": "Low", "parameters": [], "explanation": "Kidney function markers are normal."},
    "overall_explanation": "Your overall health score is moderate. Some areas need attention — please review individual risk categories."
}

@router.post("/risk-score")
async def calculate_risk_score(
    request: RiskScoreRequest,
    db: AsyncSession = Depends(get_db),
):
    try:
        prompt = f"""You are a medical risk assessment AI. Analyze this lab report for patient: {request.patient_name}, Age: {request.age}, Gender: {request.gender}.

Calculate risk scores for each organ system based on the lab values found.

Return ONLY valid JSON, no markdown:
{{
  "overall_score": <0-100, higher is healthier>,
  "risk_level": "<Low|Medium|High|Critical>",
  "liver_risk": {{"score": <0-100>, "level": "<Low|Medium|High>", "parameters": ["SGPT", "SGOT"], "explanation": "<1 sentence plain language>"}},
  "diabetes_risk": {{"score": <0-100>, "level": "<Low|Medium|High>", "parameters": ["Fasting Glucose", "HbA1c"], "explanation": "<1 sentence plain language>"}},
  "heart_risk": {{"score": <0-100>, "level": "<Low|Medium|High>", "parameters": ["Cholesterol", "LDL", "Triglycerides"], "explanation": "<1 sentence plain language>"}},
  "kidney_risk": {{"score": <0-100>, "level": "<Low|Medium|High>", "parameters": ["Creatinine", "eGFR"], "explanation": "<1 sentence plain language>"}},
  "overall_explanation": "<2 sentence plain language summary of overall health status>"
}}

Score 80-100 = Low risk, 60-79 = Medium risk, 40-59 = High risk, 0-39 = Critical.
If a parameter is not in the report, assume normal (score 85) for that system.{_lang_note(request.language)}

Report:
{request.report_text[:4000]}"""

        result = call_gemini_json(prompt)

        # ── Determine if any system is Critical ───────────────────────────────
        is_critical = (
            result.get("risk_level", "").lower() == "critical"
            or result.get("overall_score", 100) < 40
            or any(
                result.get(k, {}).get("level", "").lower() == "critical"
                for k in ("liver_risk", "diabetes_risk", "heart_risk", "kidney_risk")
            )
        )

        emergency_alert_sent = False
        whatsapp_alert_sent = False

        if is_critical and request.user_email:
            # ── Fire-and-forget email ─────────────────────────────────────────
            async def _send_email():
                loop = asyncio.get_event_loop()
                await loop.run_in_executor(
                    None, send_emergency_email,
                    request.user_email, request.patient_name, result,
                )
            asyncio.create_task(_send_email())
            emergency_alert_sent = True

            # ── Fire-and-forget WhatsApp ──────────────────────────────────────
            user_row = (
                await db.execute(select(User).where(User.email == request.user_email))
            ).scalar_one_or_none()

            if user_row and user_row.phone:
                phone = re.sub(r"[^\d]", "", user_row.phone)
                if 10 <= len(phone) <= 15:
                    critical_systems = [
                        k.replace("_risk", "").title()
                        for k in ("liver_risk", "diabetes_risk", "heart_risk", "kidney_risk")
                        if result.get(k, {}).get("level", "").lower() in ("critical", "high")
                    ]
                    systems_str = ", ".join(critical_systems) if critical_systems else "multiple organ systems"
                    wa_message = (
                        f"🚨 EMERGENCY HEALTH ALERT for {request.patient_name}: "
                        f"Critical risk detected in {systems_str}. "
                        "Please seek immediate medical attention. - Sahaay AI Healthcare"
                    )

                    async def _send_wa():
                        await send_whatsapp_message(phone, wa_message)
                    asyncio.create_task(_send_wa())
                    whatsapp_alert_sent = True

        return {
            "success": True,
            "ai_available": True,
            "data": result,
            "emergency_alert_sent": emergency_alert_sent,
            "whatsapp_alert_sent": whatsapp_alert_sent,
        }

    except AIUnavailableError as e:
        print(f"[AI] Gemini unavailable for risk-score: {e}")
        return {
            "success": True, "ai_available": False,
            "message": "AI features unavailable — please check your Gemini API key. Showing default risk estimate.",
            "data": _RISK_SCORE_FALLBACK,
            "emergency_alert_sent": False,
            "whatsapp_alert_sent": False,
        }
    except Exception as e:
        print(f"[AI] Risk score error: {e}")
        return {
            "success": True, "ai_available": False,
            "data": _RISK_SCORE_FALLBACK,
            "emergency_alert_sent": False,
            "whatsapp_alert_sent": False,
        }


# ─────────────────────────────────────────────
# ENDPOINT: Report Comparison
# ─────────────────────────────────────────────

@router.post("/compare")
async def compare_reports(request: CompareRequest):
    try:
        prompt = f"""You are a medical report comparison AI. Compare these two lab reports for patient: {request.patient_name}.

OLDER REPORT ({request.date_1}):
{request.report_text_1[:2500]}

NEWER REPORT ({request.date_2}):
{request.report_text_2[:2500]}

Return ONLY valid JSON, no markdown:
{{
  "ai_summary": "<2-3 sentence plain-language summary highlighting the most important changes>",
  "improved": [
    {{"parameter": "<name>", "old_value": "<value with unit>", "new_value": "<value with unit>", "change_percent": <number>, "note": "<1 line note>"}}
  ],
  "worsened": [
    {{"parameter": "<name>", "old_value": "<value with unit>", "new_value": "<value with unit>", "change_percent": <number>, "note": "<1 line note>"}}
  ],
  "stable": [
    {{"parameter": "<name>", "value": "<current value>", "note": "Within normal range"}}
  ]
}}

Only include parameters that actually appear in both reports. Use positive numbers for change_percent."""

        result = call_gemini_json(prompt)
        return {"success": True, "ai_available": True, "data": result}

    except AIUnavailableError as e:
        print(f"[AI] Gemini unavailable for compare: {e}")
        fallback_data = _compare_reports_regex(
            request.report_text_1, request.report_text_2,
            request.patient_name, request.date_1, request.date_2,
        )
        return {
            "success": True, "ai_available": False,
            "message": "AI comparison unavailable — showing regex-based analysis of common lab parameters.",
            "data": fallback_data,
        }
    except Exception as e:
        print(f"[AI] Compare error: {e}")
        fallback_data = _compare_reports_regex(
            request.report_text_1, request.report_text_2,
            request.patient_name, request.date_1, request.date_2,
        )
        return {
            "success": True, "ai_available": False,
            "message": "AI comparison unavailable — showing regex-based analysis of common lab parameters.",
            "data": fallback_data,
        }


# ─────────────────────────────────────────────
# ENDPOINT: Doctor Summary
# ─────────────────────────────────────────────

@router.post("/doctor-summary")
async def doctor_summary(request: DoctorSummaryRequest):
    try:
        prompt = f"""You are a clinical AI assistant generating a structured doctor summary. Patient: {request.patient_name}, Age: {request.age}, Gender: {request.gender}.

Return ONLY valid JSON, no markdown:
{{
  "patient_name": "{request.patient_name}",
  "age": {request.age},
  "gender": "{request.gender}",
  "report_date": "<extract from report or write 'Recent'>",
  "key_findings": ["<finding 1 — clinical style>", "<finding 2>", "<finding 3>"],
  "abnormal_parameters": [
    {{"name": "<parameter name>", "value": "<patient value with unit>", "reference": "<normal range>", "severity": "<Mild|Moderate|Severe>"}}
  ],
  "normal_parameters": ["<param 1: value>", "<param 2: value>"],
  "recommendations": ["<clinical recommendation 1>", "<recommendation 2>"],
  "ai_summary_paragraph": "<3-4 sentence clinical summary paragraph suitable for a doctor's review>"
}}{_lang_note(request.language)}

Report text:
{request.report_text[:4000]}"""

        result = call_gemini_json(prompt)
        return {"success": True, "ai_available": True, "data": result}

    except AIUnavailableError as e:
        print(f"[AI] Gemini unavailable for doctor-summary: {e}")
        return {
            "success": False, "ai_available": False,
            "message": "AI features unavailable — please check your Gemini API key. Doctor summary requires AI.",
            "data": None
        }
    except Exception as e:
        print(f"[AI] Doctor summary error: {e}")
        return {
            "success": False, "ai_available": False,
            "message": f"Summary generation failed: {str(e)}",
            "data": None
        }


# ─────────────────────────────────────────────
# ENDPOINT: SOAP Notes Generator
# ─────────────────────────────────────────────

@router.post("/soap-notes")
async def generate_soap_notes(request: SOAPRequest):
    print(f"[SOAP] patient={request.patient_name} "
          f"raw_text_chars={len(request.raw_text)} "
          f"preview={repr(request.raw_text[:300])}")
    try:
        prompt = f"""You are a clinical AI assistant that generates structured SOAP notes from a patient's lab report.
Patient: {request.patient_name}

Lab report / clinical data:
"{request.raw_text}"

Return ONLY valid JSON, no markdown:
{{
  "subjective": {{
    "chief_complaint": "<main complaint in patient's words>",
    "history": "<expanded history of presenting illness>",
    "duration": "<how long>"
  }},
  "objective": {{
    "vitals": "<any vitals mentioned or 'Not documented'>",
    "physical_findings": "<clinical findings mentioned>",
    "relevant_history": "<relevant past history if mentioned>"
  }},
  "assessment": {{
    "primary_diagnosis": "<most likely diagnosis>",
    "differential_diagnoses": ["<diff 1>", "<diff 2>"],
    "severity": "<Mild|Moderate|Severe>"
  }},
  "plan": {{
    "investigations": ["<test 1>", "<test 2>"],
    "medications": ["<med 1 with dose if mentioned>"],
    "lifestyle_advice": ["<advice 1>"],
    "follow_up": "<when to follow up>"
  }}
}}{_lang_note(request.language)}"""

        result = call_gemini_json(prompt)
        return {"success": True, "ai_available": True, "data": result}

    except AIUnavailableError as e:
        print(f"[AI] Gemini unavailable for soap-notes: {e}")
        return {
            "success": False, "ai_available": False,
            "message": "AI features unavailable — please check your Gemini API key. SOAP notes require AI.",
            "data": None
        }
    except Exception as e:
        print(f"[AI] SOAP notes error: {e}")
        return {
            "success": False, "ai_available": False,
            "message": f"SOAP notes generation failed: {str(e)}",
            "data": None
        }


# ─────────────────────────────────────────────
# ENDPOINT: Prescription Extraction
# Uses Gemini multimodal for images (JPEG/PNG);
# falls back to OCR text for PDFs.
# ─────────────────────────────────────────────

@router.post("/prescription")
async def extract_prescription(file: UploadFile = File(...)):
    allowed = ["application/pdf", "image/jpeg", "image/png", "image/jpg"]
    if file.content_type not in allowed:
        raise HTTPException(status_code=400, detail="Only PDF, JPG, PNG files are supported")

    file_bytes = await file.read()
    is_image = file.content_type in ["image/jpeg", "image/png", "image/jpg"]

    prescription_prompt = """You are a medical AI that extracts structured data from prescription images or text.

Return ONLY valid JSON, no markdown:
{
  "doctor_name": "<extracted or Unknown>",
  "doctor_qualification": "<extracted or Unknown>",
  "clinic_hospital": "<extracted or Unknown>",
  "date": "<extracted or Unknown>",
  "patient_name": "<extracted or Unknown>",
  "medicines": [
    {
      "name": "<medicine name>",
      "dosage": "<e.g. 500mg>",
      "frequency": "<e.g. Twice daily / BD>",
      "duration": "<e.g. 5 days>",
      "instructions": "<e.g. After food>",
      "times": ["<e.g. 8:00 AM>", "<e.g. 8:00 PM>"]
    }
  ],
  "special_instructions": "<any general instructions from doctor>",
  "follow_up": "<follow up date or instruction if mentioned>"
}

Extract ALL medicines listed. If a field is unclear, use your best judgment based on context."""

    # OCR text is always extracted (needed as PDF fallback and for storage)
    ocr_text = extract_text(file_bytes, file.content_type)

    try:
        if is_image:
            # Pass the image directly to Gemini — no need for OCR
            result = call_gemini_multimodal_json(prescription_prompt, file_bytes)
        else:
            # PDF: use OCR text as input
            if ocr_text.startswith("OCR_ERROR"):
                raise HTTPException(status_code=422, detail=f"Could not read PDF: {ocr_text}")
            prompt_with_text = f"OCR Text from prescription:\n{ocr_text[:3000]}\n\n{prescription_prompt}"
            result = call_gemini_json(prompt_with_text)

        return {"success": True, "ai_available": True, "data": result, "ocr_text": ocr_text}

    except HTTPException:
        raise
    except AIUnavailableError as e:
        print(f"[AI] Gemini unavailable for prescription: {e}")
        return {
            "success": False, "ai_available": False,
            "message": "AI features unavailable — please check your Gemini API key. Raw OCR text is shown below.",
            "data": {
                "doctor_name": "Unknown", "doctor_qualification": "Unknown",
                "clinic_hospital": "Unknown", "date": "Unknown", "patient_name": "Unknown",
                "medicines": [], "special_instructions": ocr_text[:500] if not ocr_text.startswith("OCR_ERROR") else "",
                "follow_up": ""
            },
            "ocr_text": ocr_text
        }
    except json.JSONDecodeError as e:
        print(f"[AI] JSON parse error in prescription: {e}")
        return {
            "success": False, "ai_available": True,
            "message": "AI returned an unexpected response format. Please try again.",
            "data": None, "ocr_text": ocr_text
        }
    except Exception as e:
        print(f"[AI] Prescription extraction error: {e}")
        if _is_quota_error(e):
            return {
                "success": False, "ai_available": False,
                "message": "AI service is temporarily unavailable due to rate limits.",
                "data": None, "ocr_text": ocr_text
            }
        return {
            "success": False, "ai_available": False,
            "message": f"Extraction failed: {str(e)}",
            "data": None, "ocr_text": ocr_text
        }


# ─────────────────────────────────────────────
# ENDPOINT: Medicine Interaction Checker
# ─────────────────────────────────────────────

@router.post("/medicine-interaction")
async def check_medicine_interactions(request: MedicineInteractionRequest):
    medicines = [m.strip() for m in request.medicines if m.strip()]
    if len(medicines) < 2:
        raise HTTPException(
            status_code=422,
            detail="Please provide at least 2 medicine names to check interactions."
        )
    if len(medicines) > 10:
        medicines = medicines[:10]

    medicine_list = ", ".join(medicines)

    prompt = f"""You are a clinical pharmacist. Check for drug-drug interactions between these medicines: {medicine_list}

Return ONLY valid JSON, no markdown, no extra text:
{{
  "overall_risk": "<low|moderate|high>",
  "safe_to_combine": <true|false>,
  "summary": "<2-3 sentence overview of the combined interaction profile>",
  "interactions": [
    {{
      "medicine_a": "<name from input>",
      "medicine_b": "<name from input>",
      "severity": "<Mild|Moderate|Severe>",
      "description": "<mechanism and clinical effects when these two are combined>",
      "recommendation": "<specific action the patient or doctor should take>"
    }}
  ]
}}

Rules:
- Only list pairs with documented, clinically meaningful interactions
- If no significant interactions exist: return empty interactions array, safe_to_combine: true, overall_risk: "low"
- Severity: Mild = minor or theoretical effect; Moderate = requires monitoring or timing adjustment; Severe = avoid combination or use only under close supervision
- overall_risk must reflect the worst severity found; if no interactions, use "low"
- Use the exact medicine names as provided in the input
- Keep descriptions factual and concise (1-2 sentences each)"""

    try:
        result = call_gemini_json(prompt)
        return {"success": True, "ai_available": True, **result}

    except AIUnavailableError as e:
        print(f"[AI] Gemini unavailable for medicine interaction: {e}")
        return {
            "success": False,
            "ai_available": False,
            "overall_risk": "unknown",
            "safe_to_combine": None,
            "summary": "AI is currently unavailable. Please consult your doctor or pharmacist directly to check for interactions between these medicines.",
            "interactions": [],
            "message": str(e),
        }
    except Exception as e:
        print(f"[AI] Medicine interaction error: {e}")
        return {
            "success": False,
            "ai_available": False,
            "overall_risk": "unknown",
            "safe_to_combine": None,
            "summary": "Could not check interactions. Please consult your doctor or pharmacist directly.",
            "interactions": [],
            "message": "AI is temporarily unavailable. Please try again later.",
        }


# ─────────────────────────────────────────────
# ENDPOINT: Daily Health Tip (cached per user per day)
# ─────────────────────────────────────────────

_daily_tip_cache: dict[str, dict] = {}

_FALLBACK_TIPS = [
    {"tip": "Drink at least 8 glasses of water today to stay hydrated and support kidney health.", "category": "Hydration", "icon": "💧"},
    {"tip": "Take a 20-minute brisk walk to improve circulation and boost your energy levels.", "category": "Exercise", "icon": "🚶"},
    {"tip": "Add leafy greens like spinach or methi to your meals today for iron and folate.", "category": "Nutrition", "icon": "🥗"},
    {"tip": "Aim for 7–8 hours of sleep tonight — your body repairs and recharges while you rest.", "category": "Sleep", "icon": "😴"},
    {"tip": "Practice 5 minutes of deep breathing to lower cortisol and calm your nervous system.", "category": "Mental Health", "icon": "🧘"},
    {"tip": "Add a handful of nuts or seeds today for healthy fats, magnesium, and sustained energy.", "category": "Nutrition", "icon": "🥜"},
    {"tip": "Avoid screens for 30 minutes before bed to improve melatonin production and sleep quality.", "category": "Sleep", "icon": "📵"},
]


@router.get("/daily-tip")
async def get_daily_tip(
    current_user=Depends(get_optional_user),
    db: AsyncSession = Depends(get_db),
):
    today = _date.today().isoformat()
    user_id = current_user.id if current_user else "anon"
    cache_key = f"{user_id}:{today}"

    if cache_key in _daily_tip_cache:
        return _daily_tip_cache[cache_key]

    # Try to personalise from the latest approved report
    latest_report_text = ""
    if current_user:
        latest_result = await db.execute(
            select(Report)
            .where(
                Report.user_id == current_user.id,
                Report.approval_status == "approved",
                Report.raw_text.isnot(None),
            )
            .order_by(Report.created_at.desc())
            .limit(1)
        )
        latest = latest_result.scalar_one_or_none()
        if latest and latest.raw_text:
            latest_report_text = latest.raw_text[:2000]

    tip_data: dict | None = None
    if latest_report_text:
        try:
            prompt = f"""You are a health coach. Based on this lab report, give ONE personalized, actionable health tip for today.
Report excerpt: {latest_report_text}
Return ONLY JSON (no markdown):
{{"tip": "<one actionable tip, 1-2 sentences>", "category": "<Nutrition|Exercise|Sleep|Hydration|Mental Health>", "icon": "<one relevant emoji>"}}"""
            tip_data = call_gemini_json(prompt)
        except (AIUnavailableError, Exception):
            pass

    if not tip_data:
        tip_data = _FALLBACK_TIPS[_date.today().weekday()]

    result = {
        "tip": tip_data.get("tip", ""),
        "category": tip_data.get("category", "Health"),
        "icon": tip_data.get("icon", "💡"),
        "date": today,
        "personalized": bool(latest_report_text),
    }
    _daily_tip_cache[cache_key] = result
    return result


# ─────────────────────────────────────────────
# ENDPOINT: Second Opinion (dual Gemini analysis)
# ─────────────────────────────────────────────

class SecondOpinionRequest(BaseModel):
    report_text: str
    patient_name: str = "Patient"
    age: int = 25
    language: str = "en"


_RISK_ORDER = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}

_SECOND_OPINION_PROMPT = """You are a clinical AI analyzing a lab report for patient: {name}, Age: {age}.
Give a thorough, independent clinical analysis.

Return ONLY valid JSON, no markdown:
{{
  "health_score": <45-100>,
  "risk_level": "<Low|Medium|High|Critical>",
  "summary": "<2-3 sentence clinical summary>",
  "key_findings": ["<finding 1>", "<finding 2>", "<finding 3>"],
  "recommendations": ["<rec 1>", "<rec 2>", "<rec 3>"]
}}

Report:
{report}"""


@router.post("/second-opinion")
async def second_opinion(request: SecondOpinionRequest):
    """Run two independent Gemini analyses (temp 0.3 and 0.7) and return both + consensus."""
    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or api_key == "your-gemini-api-key-here":
        return {"success": False, "ai_available": False, "message": "GEMINI_API_KEY is not configured."}

    try:
        from google import genai
        from google.genai import types
    except ImportError:
        return {"success": False, "ai_available": False, "message": "google-genai not installed."}

    client = genai.Client(api_key=api_key)
    report_text = request.report_text[:4000]

    def _call_with_temp(temp: float) -> dict:
        response = client.models.generate_content(
            model="gemini-2.5-flash",
            contents=_SECOND_OPINION_PROMPT.format(
                name=request.patient_name,
                age=request.age,
                report=report_text,
            ),
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                temperature=temp,
            ),
        )
        raw = response.text.strip()
        return json.loads(_clean_json_text(raw))

    try:
        loop = asyncio.get_event_loop()
        opinion_a, opinion_b = await asyncio.gather(
            loop.run_in_executor(None, _call_with_temp, 0.3),
            loop.run_in_executor(None, _call_with_temp, 0.7),
        )

        score_a = int(opinion_a.get("health_score", 70))
        score_b = int(opinion_b.get("health_score", 70))
        consensus_score = round((score_a + score_b) / 2)

        level_a = opinion_a.get("risk_level", "Medium")
        level_b = opinion_b.get("risk_level", "Medium")
        consensus_level = level_a if _RISK_ORDER.get(level_a, 1) >= _RISK_ORDER.get(level_b, 1) else level_b

        agree = abs(score_a - score_b) <= 10 and level_a == level_b

        return {
            "success": True,
            "ai_available": True,
            "opinion_a": opinion_a,
            "opinion_b": opinion_b,
            "consensus": {
                "health_score": consensus_score,
                "risk_level": consensus_level,
                "agreement": agree,
                "agreement_note": (
                    "Both analyses agree on the risk assessment."
                    if agree
                    else f"Minor variation detected (scores: {score_a} vs {score_b}). Caution-side risk level shown."
                ),
                "summary": opinion_a.get("summary", ""),
            },
        }

    except Exception as e:
        print(f"[AI] Second opinion error: {e}")
        if _is_quota_error(e):
            return {"success": False, "ai_available": False, "message": "AI quota exceeded. Please try again later."}
        return {"success": False, "ai_available": False, "message": "Could not generate second opinion. Please try again."}


# ─────────────────────────────────────────────
# ENDPOINT: Insurance Claim Helper
# ─────────────────────────────────────────────

class InsuranceHelperRequest(BaseModel):
    report_text: str
    patient_name: str = "Patient"
    language: str = "en"


@router.post("/insurance-helper")
async def insurance_helper(request: InsuranceHelperRequest):
    try:
        prompt = f"""You are a medical insurance claim assistant. Analyze this lab report for {request.patient_name} and provide insurance claim guidance.

Return ONLY valid JSON, no markdown:
{{
  "icd10_codes": [
    {{"code": "<e.g. E11.9>", "description": "<condition name>", "note": "<1 line clinical relevance>"}}
  ],
  "covered_tests": ["<test name typically covered by standard plans>"],
  "claim_tips": ["<practical tip 1>", "<tip 2>", "<tip 3>"],
  "documentation_needed": ["<document 1>", "<document 2>", "<document 3>"],
  "estimated_coverage": "<general guidance e.g. '70-80% for diagnostic tests under standard health plans'>",
  "disclaimer": "This is AI-generated guidance only and not financial or legal advice. Always verify with your insurance provider."
}}

Rules:
- Only suggest ICD-10 codes for conditions clearly evidenced in this report
- Keep claim tips practical and actionable for an Indian patient
- The disclaimer field must always be present{_lang_note(request.language)}

Report:
{request.report_text[:3000]}"""

        result = call_gemini_json(prompt)
        return {"success": True, "ai_available": True, "data": result}

    except AIUnavailableError as e:
        print(f"[AI] Insurance helper unavailable: {e}")
        return {
            "success": False,
            "ai_available": False,
            "message": "AI unavailable — showing standard guidance.",
            "data": {
                "icd10_codes": [],
                "covered_tests": ["CBC", "LFT", "KFT", "Thyroid Panel (TSH)", "HbA1c", "Lipid Profile", "Vitamin D", "Vitamin B12"],
                "claim_tips": [
                    "Keep all original lab receipts and reports — never submit photocopies unless explicitly accepted.",
                    "Obtain a doctor's referral or prescription stating medical necessity before your tests.",
                    "File claims within 30 days of the test date to avoid rejection on timeliness grounds.",
                    "Cross-check your policy's list of covered diagnostic tests before submitting.",
                ],
                "documentation_needed": [
                    "Original lab report (with lab stamp and signature)",
                    "Doctor's prescription / referral letter",
                    "Insurance policy card or member ID",
                    "Photo ID (Aadhaar / PAN card)",
                    "Payment receipts from the lab",
                ],
                "estimated_coverage": "Diagnostic lab tests are typically covered 70-80% under standard health insurance plans in India, subject to your policy's sub-limits.",
                "disclaimer": "This is AI-generated guidance only and not financial or legal advice. Always verify coverage details with your insurance provider.",
            },
        }
    except Exception as e:
        print(f"[AI] Insurance helper error: {e}")
        return {"success": False, "ai_available": False, "message": "Could not process insurance guidance. Please try again."}
