"""
Predictive Disease Risk — forecasts disease risk trajectory by analysing the
trend direction of key lab parameters across the patient's report history.

Reuses the exact same trend data (Report -> ReportParameter, grouped by
parameter_name) that powers GET /api/reports/trends.
"""
from datetime import datetime
from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.db import get_db
from models.models import User, Report
from core.security import get_current_user_dep
from api.ai.router import call_ai_json, AIUnavailableError

router = APIRouter()

_DISCLAIMER = "⚠️ AI-generated forecast — consult your doctor for proper diagnosis."

# (reference_min, reference_max) — mirrors frontend/app/trends/page.tsx PARAMS
_RANGES: dict[str, tuple[float | None, float | None]] = {
    "Hemoglobin":      (12.0, 17.0),
    "Vitamin D":       (30.0, 100.0),
    "TSH":             (0.34, 5.6),
    "HbA1c":           (None, 5.7),
    "Fasting Glucose": (70.0, 99.0),
    "Vitamin B12":     (200.0, 914.0),
    "Triglycerides":   (None, 150.0),
    "SGPT":            (None, 40.0),
    "SGOT":            (None, 40.0),
    "Creatinine":      (0.6, 1.2),
    "Cholesterol":     (None, 200.0),
}

# condition -> contributing trend parameters (must match canonical names above)
_CONDITION_MAP: dict[str, list[str]] = {
    "Type 2 Diabetes":            ["HbA1c", "Fasting Glucose"],
    "Cardiovascular Disease":     ["Cholesterol", "Triglycerides"],
    "Chronic Kidney Disease":     ["Creatinine"],
    "Fatty Liver / Liver Stress": ["SGPT", "SGOT"],
    "Anemia":                     ["Hemoglobin"],
    "Thyroid Disorder":           ["TSH"],
    "Vitamin Deficiency":         ["Vitamin D", "Vitamin B12"],
}


def _is_in_range(v: float, lo: float | None, hi: float | None) -> bool:
    if lo is not None and v < lo:
        return False
    if hi is not None and v > hi:
        return False
    return True


def _trend_direction(points: list[dict], lo: float | None, hi: float | None) -> dict:
    """Same logic as the frontend's analyzeTrend(), ported to Python."""
    first = points[0]["value"]
    latest = points[-1]["value"]
    change_pct = round(abs((latest - first) / first) * 100, 1) if first else 0.0

    first_in = _is_in_range(first, lo, hi)
    latest_in = _is_in_range(latest, lo, hi)

    if change_pct < 3:
        direction = "stable"
    elif not first_in and latest_in:
        direction = "improving"
    elif first_in and not latest_in:
        direction = "worsening"
    elif latest_in:
        direction = "stable"
    else:
        if hi is not None and lo is None:
            direction = "improving" if latest < first else "worsening"
        elif lo is not None and hi is None:
            direction = "improving" if latest > first else "worsening"
        elif lo is not None and hi is not None:
            mid = (lo + hi) / 2
            direction = "improving" if abs(latest - mid) < abs(first - mid) else "worsening"
        else:
            direction = "stable"

    return {
        "direction": direction,
        "change_pct": change_pct,
        "first_value": first,
        "latest_value": latest,
        "latest_in_range": latest_in,
        "unit": points[-1].get("unit"),
        "count": len(points),
    }


async def _fetch_trend_parameters(user_id: str, db: AsyncSession) -> dict[str, list[dict]]:
    """Identical query + grouping to GET /api/reports/trends."""
    result = await db.execute(
        select(Report)
        .where(Report.user_id == user_id)
        .order_by(Report.created_at.asc())
    )
    reports = result.scalars().all()

    grouped: dict[str, list[dict]] = {}
    for report in reports:
        if not report.created_at:
            continue
        for param in (report.parameters or []):
            try:
                numeric_val = float(param.value)  # type: ignore[arg-type]
            except (TypeError, ValueError):
                continue
            grouped.setdefault(param.parameter_name, []).append({
                "value": numeric_val,
                "unit": param.unit,
            })

    return {name: pts for name, pts in grouped.items() if len(pts) >= 2}


def _rule_based_probability(direction: str, latest_in_range: bool, change_pct: float) -> str:
    if direction == "worsening" and not latest_in_range:
        return "High" if change_pct >= 15 else "Medium"
    if direction == "worsening":
        return "Medium"
    if direction == "improving":
        return "Low"
    return "Low" if latest_in_range else "Medium"


@router.post("/risk-forecast")
async def risk_forecast(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Forecast disease risk trajectory from the trend direction of lab parameters."""
    trend_params = await _fetch_trend_parameters(current_user.id, db)

    condition_trends: list[dict] = []
    for condition, param_names in _CONDITION_MAP.items():
        contributing = []
        for pname in param_names:
            points = trend_params.get(pname)
            if not points:
                continue
            lo, hi = _RANGES.get(pname, (None, None))
            contributing.append({"parameter": pname, **_trend_direction(points, lo, hi)})
        if contributing:
            condition_trends.append({"condition": condition, "parameters": contributing})

    if not condition_trends:
        return {
            "predicted_conditions": [],
            "trend_summary": "Not enough report history to forecast risk. Upload and analyse at least two reports with overlapping parameters to enable predictions.",
            "recommended_action": "Upload and analyse more lab reports over time.",
            "disclaimer": _DISCLAIMER,
            "generated_at": datetime.utcnow().isoformat(),
        }

    trend_lines = [
        f"- {ct['condition']} <- {p['parameter']}: {p['first_value']} -> {p['latest_value']} {p['unit'] or ''} "
        f"({p['direction']}, {p['change_pct']}% change, {'in range' if p['latest_in_range'] else 'out of range'}, "
        f"{p['count']} data points)"
        for ct in condition_trends
        for p in ct["parameters"]
    ]
    trend_block = "\n".join(trend_lines)

    prompt = f"""You are a predictive health-risk AI analysing lab trend data for a patient.

Patient: {current_user.name}, Age: {current_user.age or 'Unknown'}, Gender: {current_user.gender or 'Unknown'}
Medical history: {current_user.medical_history or 'None documented'}

Trend data extracted from their report history (oldest to newest):
{trend_block}

For each condition above, forecast the risk trajectory over the next 3-6 months based ONLY on the observed trend direction.

Return a JSON object with EXACTLY these keys:
{{
  "predicted_conditions": [
    {{
      "condition": "condition name",
      "trajectory": "increasing / stable / decreasing",
      "probability": "High / Medium / Low",
      "reasoning": "1-2 sentence explanation referencing the specific parameter trend",
      "contributing_parameters": ["parameter name"]
    }}
  ],
  "trend_summary": "2-3 sentence overall narrative across all conditions",
  "recommended_action": "concise, actionable next step for the patient"
}}

Only include conditions with actual supporting trend evidence above. Be conservative — this is a screening forecast, not a diagnosis."""

    fallback = {
        "predicted_conditions": [
            {
                "condition": ct["condition"],
                "trajectory": (
                    "increasing" if any(p["direction"] == "worsening" for p in ct["parameters"]) else
                    "decreasing" if any(p["direction"] == "improving" for p in ct["parameters"]) else
                    "stable"
                ),
                "probability": _rule_based_probability(
                    ct["parameters"][0]["direction"],
                    ct["parameters"][0]["latest_in_range"],
                    ct["parameters"][0]["change_pct"],
                ),
                "reasoning": (
                    f"Based on {ct['parameters'][0]['parameter']} trend: "
                    f"{ct['parameters'][0]['first_value']} -> {ct['parameters'][0]['latest_value']} "
                    f"({ct['parameters'][0]['direction']})."
                ),
                "contributing_parameters": [p["parameter"] for p in ct["parameters"]],
            }
            for ct in condition_trends
        ],
        "trend_summary": "AI narrative temporarily unavailable — showing rule-based trend analysis instead.",
        "recommended_action": "Discuss these trends with your doctor at your next visit.",
    }

    try:
        ai_result = call_ai_json(prompt)
    except AIUnavailableError as e:
        print(f"[Predictive/risk-forecast] AI unavailable: {e}")
        ai_result = fallback

    return {
        **ai_result,
        "disclaimer": _DISCLAIMER,
        "generated_at": datetime.utcnow().isoformat(),
    }
