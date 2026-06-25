"""
PDF generation for Sahaay patient health summaries using ReportLab.
"""

import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_RIGHT

# ── Brand colours ─────────────────────────────────────────────────────────────
TEAL       = colors.HexColor("#0F766E")
TEAL_LIGHT = colors.HexColor("#F0FDFA")
TEAL_MID   = colors.HexColor("#CCFBF1")
GRAY_50    = colors.HexColor("#F9FAFB")
GRAY_200   = colors.HexColor("#E2E8F0")
GRAY_400   = colors.HexColor("#94A3B8")
GRAY_700   = colors.HexColor("#334155")
WHITE      = colors.white
RED_LIGHT  = colors.HexColor("#FEF2F2")

# Risk border/text/bg colors per spec
_RISK_BORDER = {
    "low":      colors.HexColor("#22C55E"),
    "medium":   colors.HexColor("#F59E0B"),
    "high":     colors.HexColor("#F97316"),
    "critical": colors.HexColor("#EF4444"),
}
_RISK_TEXT = {
    "low":      colors.HexColor("#166534"),
    "medium":   colors.HexColor("#92400E"),
    "high":     colors.HexColor("#9A3412"),
    "critical": colors.HexColor("#7F1D1D"),
}
_RISK_BG = {
    "low":      colors.HexColor("#F0FDF4"),
    "medium":   colors.HexColor("#FFFBEB"),
    "high":     colors.HexColor("#FFF7ED"),
    "critical": colors.HexColor("#FEF2F2"),
}
_STATUS_COLOR = {
    "normal":     colors.HexColor("#16A34A"),
    "low":        colors.HexColor("#D97706"),
    "borderline": colors.HexColor("#D97706"),
    "high":       colors.HexColor("#DC2626"),
    "critical":   colors.HexColor("#7F1D1D"),
    "abnormal":   colors.HexColor("#DC2626"),
}

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm


def _risk_border(level: str) -> colors.Color:
    return _RISK_BORDER.get((level or "medium").lower(), _RISK_BORDER["medium"])


def _risk_text(level: str) -> colors.Color:
    return _RISK_TEXT.get((level or "medium").lower(), _RISK_TEXT["medium"])


def _risk_bg(level: str) -> colors.Color:
    return _RISK_BG.get((level or "medium").lower(), _RISK_BG["medium"])


def _status_color(status: str) -> colors.Color:
    return _STATUS_COLOR.get((status or "normal").lower(), GRAY_700)


def _p(text: str, **kw) -> Paragraph:
    """Convenience: build a Paragraph with an anonymous style."""
    style = ParagraphStyle("_anon_", **kw)
    return Paragraph(text, style)


def _section_bar(text: str, usable_w: float, brand_color: colors.Color = TEAL) -> Table:
    """Full-width teal background section-header bar."""
    tbl = Table(
        [[_p(text, fontSize=13, textColor=WHITE, fontName="Helvetica-Bold", leading=16)]],
        colWidths=[usable_w],
    )
    tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), brand_color),
        ("TOPPADDING",    (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ]))
    return tbl


def generate_health_summary_pdf(
    patient_data: dict,
    report_data: dict,
    risk_data: dict | None,
    branding: dict | None = None,
) -> bytes:
    """
    Build a patient health-summary PDF and return it as bytes.

    patient_data: { name, email, age, gender }
    report_data:  { report_type, file_name, ai_summary, parameters: [...], created_at }
    risk_data:    { overall_score, risk_level, liver_risk, diabetes_risk, heart_risk, kidney_risk }
                  or None / partial
    branding:     { hospital_name, hospital_logo_text, hospital_color, doctor_name } or None
    """
    buf = io.BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=A4,
        leftMargin=MARGIN, rightMargin=MARGIN,
        topMargin=MARGIN,  bottomMargin=MARGIN + 10 * mm,
    )

    story: list = []
    usable_w = PAGE_W - 2 * MARGIN

    # ── Branding ──────────────────────────────────────────────────────────────
    brand       = branding or {}
    hospital    = brand.get("hospital_name", "")
    logo_text   = brand.get("hospital_logo_text", "")
    doctor_name = brand.get("doctor_name", "")
    brand_hex   = brand.get("hospital_color", "#0F766E")
    try:
        brand_color = colors.HexColor(brand_hex)
    except Exception:
        brand_color = TEAL

    logo_main = hospital if hospital else "Sahaay"
    logo_sub  = logo_text or ("AI Healthcare Copilot" if not hospital else "")

    # ── Header: logo left, title box right ───────────────────────────────────
    right_label = f"Patient Health Summary{f'<br/>Prepared by Dr. {doctor_name}' if doctor_name else ''}"
    right_box = Table(
        [[_p(right_label, fontSize=11, textColor=WHITE, fontName="Helvetica-Bold",
             alignment=TA_CENTER, leading=16)]],
        colWidths=[usable_w * 0.36],
    )
    right_box.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), brand_color),
        ("TOPPADDING",    (0, 0), (-1, -1), 10),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("LEFTPADDING",   (0, 0), (-1, -1), 10),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 10),
    ]))

    logo_inner = Table(
        [[_p(logo_main, fontSize=28, textColor=brand_color, fontName="Helvetica-Bold", leading=34)],
         [_p(logo_sub,  fontSize=12, textColor=GRAY_400,   leading=15) if logo_sub else Spacer(1, 1)]],
        colWidths=[usable_w * 0.64],
    )
    logo_inner.setStyle(TableStyle([
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 2),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 2),
    ]))

    header_tbl = Table([[logo_inner, right_box]], colWidths=[usable_w * 0.64, usable_w * 0.36])
    header_tbl.setStyle(TableStyle([
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ("LEFTPADDING",   (0, 0), (-1, -1), 0),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 0),
        ("TOPPADDING",    (0, 0), (-1, -1), 0),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 0),
    ]))
    story.append(header_tbl)
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=2, color=brand_color, spaceAfter=10))

    # ── Patient info: 2-column grid ───────────────────────────────────────────
    patient_name = patient_data.get("name") or "Patient"
    raw_age      = patient_data.get("age")
    raw_gender   = patient_data.get("gender")
    age_str      = str(raw_age) if raw_age is not None else "Not specified"
    gender_str   = raw_gender.capitalize() if raw_gender else "Not specified"
    report_date  = (report_data.get("created_at") or datetime.utcnow().isoformat())[:10]
    report_type  = report_data.get("report_type") or report_data.get("file_name") or "Lab Report"
    generated_on = datetime.utcnow().strftime("%d %b %Y, %H:%M UTC")

    def _label(txt: str) -> Paragraph:
        return _p(txt, fontSize=9, textColor=GRAY_400, leading=12)

    def _value(txt: str) -> Paragraph:
        return _p(f"<b>{txt}</b>", fontSize=12, textColor=GRAY_700, fontName="Helvetica-Bold", leading=16)

    info_rows = [
        [_label("Patient Name"), _label("Report Type")],
        [_value(patient_name),   _value(report_type)],
        [_label("Age"),          _label("Report Date")],
        [_value(age_str),        _value(report_date)],
        [_label("Gender"),       _label("Generated On")],
        [_value(gender_str),     _value(generated_on)],
    ]
    half = usable_w / 2
    info_tbl = Table(info_rows, colWidths=[half, half])
    info_tbl.setStyle(TableStyle([
        ("BACKGROUND",    (0, 0), (-1, -1), GRAY_50),
        ("BOX",           (0, 0), (-1, -1), 0.5, GRAY_200),
        ("LINEAFTER",     (0, 0), (0, -1),  0.5, GRAY_200),
        ("LINEBELOW",     (0, 1), (-1, 1),  0.3, GRAY_200),
        ("LINEBELOW",     (0, 3), (-1, 3),  0.3, GRAY_200),
        ("TOPPADDING",    (0, 0), (-1, -1), 4),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
        ("LEFTPADDING",   (0, 0), (-1, -1), 12),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
    ]))
    story.append(info_tbl)
    story.append(Spacer(1, 14))

    # ── Risk Scores section ───────────────────────────────────────────────────
    if risk_data:
        story.append(_section_bar("Risk Scores", usable_w, brand_color))
        story.append(Spacer(1, 8))

        overall_score = risk_data.get("overall_score", "—")
        overall_level = (risk_data.get("risk_level") or "medium").lower()

        organs = [
            ("Overall",  overall_score, overall_level),
            ("Liver",    (risk_data.get("liver_risk")    or {}).get("score", "—"),
                         (risk_data.get("liver_risk")    or {}).get("level", "medium")),
            ("Diabetes", (risk_data.get("diabetes_risk") or {}).get("score", "—"),
                         (risk_data.get("diabetes_risk") or {}).get("level", "medium")),
            ("Heart",    (risk_data.get("heart_risk")    or {}).get("score", "—"),
                         (risk_data.get("heart_risk")    or {}).get("level", "medium")),
            ("Kidney",   (risk_data.get("kidney_risk")   or {}).get("score", "—"),
                         (risk_data.get("kidney_risk")   or {}).get("level", "medium")),
        ]

        col_w    = usable_w / len(organs)
        risk_row = []
        for label, score, level in organs:
            norm  = (level or "medium").lower()
            bc    = _risk_border(norm)
            tc    = _risk_text(norm)
            bgc   = _risk_bg(norm)
            s_str = f"{score}/100" if isinstance(score, (int, float)) else str(score)

            cell = Table(
                [
                    [_p(f"<b>{s_str}</b>", fontSize=18, textColor=tc,
                        fontName="Helvetica-Bold", alignment=TA_CENTER, leading=22)],
                    [_p(label, fontSize=9, textColor=tc, alignment=TA_CENTER, leading=11)],
                    [_p(f"<b>{norm.capitalize()}</b>", fontSize=9, textColor=tc,
                        fontName="Helvetica-Bold", alignment=TA_CENTER, leading=11)],
                ],
                colWidths=[col_w - 10],
            )
            cell.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), bgc),
                ("BOX",           (0, 0), (-1, -1), 2, bc),
                ("TOPPADDING",    (0, 0), (-1, -1), 8),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 8),
                ("LEFTPADDING",   (0, 0), (-1, -1), 4),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 4),
            ]))
            risk_row.append(cell)

        risk_tbl = Table([risk_row], colWidths=[col_w] * len(organs))
        risk_tbl.setStyle(TableStyle([
            ("LEFTPADDING",  (0, 0), (-1, -1), 5),
            ("RIGHTPADDING", (0, 0), (-1, -1), 5),
            ("TOPPADDING",   (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
        ]))
        story.append(risk_tbl)
        story.append(Spacer(1, 10))

        # Per-organ explanations
        exps = []
        for key, lbl in [("liver_risk", "Liver"), ("diabetes_risk", "Diabetes"),
                          ("heart_risk", "Heart"),  ("kidney_risk",  "Kidney")]:
            organ = risk_data.get(key) or {}
            if isinstance(organ, dict) and organ.get("explanation"):
                exps.append([
                    _p(f"<b>{lbl}</b>", fontSize=10, textColor=GRAY_700,
                       fontName="Helvetica-Bold", leading=13),
                    _p(organ["explanation"], fontSize=10, textColor=GRAY_700, leading=13),
                ])
        if exps:
            exp_tbl = Table(exps, colWidths=[usable_w * 0.15, usable_w * 0.85])
            exp_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), GRAY_50),
                ("BOX",           (0, 0), (-1, -1), 0.5, GRAY_200),
                ("LINEBELOW",     (0, 0), (-1, -2), 0.3, GRAY_200),
                ("TOPPADDING",    (0, 0), (-1, -1), 5),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 5),
                ("LEFTPADDING",   (0, 0), (-1, -1), 8),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
                ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(exp_tbl)
            story.append(Spacer(1, 14))

    # ── Report Parameters section ─────────────────────────────────────────────
    parameters = report_data.get("parameters") or []
    if parameters:
        story.append(_section_bar("Report Parameters", usable_w, brand_color))
        story.append(Spacer(1, 4))

        def _hdr_cell(txt: str) -> Paragraph:
            return _p(f"<b>{txt}</b>", fontSize=12, textColor=WHITE,
                      fontName="Helvetica-Bold", leading=15)

        rows      = [[_hdr_cell("Parameter"), _hdr_cell("Value"),
                      _hdr_cell("Unit"), _hdr_cell("Reference"), _hdr_cell("Status")]]
        row_styles: list = [
            ("BACKGROUND",    (0, 0), (-1, 0), TEAL),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 7),
            ("TOPPADDING",    (0, 0), (-1, 0), 7),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, GRAY_50]),
            ("TOPPADDING",    (0, 1), (-1, -1), 5),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 5),
            ("LEFTPADDING",   (0, 0), (-1, -1), 7),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 7),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
            ("BOX",           (0, 0), (-1, -1), 0.5, GRAY_200),
            ("LINEBEFORE",    (1, 0), (-1, -1), 0.3, GRAY_200),
            ("LINEBELOW",     (0, 0), (-1, -1), 0.3, GRAY_200),
        ]

        for i, p in enumerate(parameters):
            is_bad  = p.get("is_abnormal") or (p.get("status", "").lower() in ("low", "high", "critical", "abnormal"))
            st_raw  = (p.get("status") or "Normal").strip()
            st_cap  = st_raw.capitalize()
            st_c    = _status_color(st_raw.lower())

            ref_min = p.get("reference_min")
            ref_max = p.get("reference_max")
            ref_str = (
                f"{ref_min}-{ref_max}" if ref_min is not None and ref_max is not None
                else f">={ref_min}"    if ref_min is not None
                else f"<={ref_max}"   if ref_max is not None
                else "-"
            )

            base = dict(fontSize=12, textColor=GRAY_700, leading=14)
            row = [
                _p(f"<b>{p.get('parameter_name') or '-'}</b>",
                   fontSize=12, textColor=GRAY_700, fontName="Helvetica-Bold", leading=14),
                _p(str(p.get("value") or "-"),  **base),
                _p(p.get("unit") or "-",         **base),
                _p(ref_str,                      **base),
                _p(f"<b>{st_cap}</b>",
                   fontSize=12, textColor=st_c, fontName="Helvetica-Bold", leading=14),
            ]
            rows.append(row)
            if is_bad:
                row_styles.append(("BACKGROUND", (0, i + 1), (-1, i + 1), RED_LIGHT))

        col_ws = [usable_w * w for w in [0.30, 0.14, 0.13, 0.23, 0.20]]
        param_tbl = Table(rows, colWidths=col_ws)
        param_tbl.setStyle(TableStyle(row_styles))
        story.append(param_tbl)
        story.append(Spacer(1, 14))

    # ── AI Analysis Summary section ───────────────────────────────────────────
    ai_summary = report_data.get("ai_summary") or (
        (report_data.get("analysis_result") or {}).get("summary")
        if isinstance(report_data.get("analysis_result"), dict) else None
    )
    if ai_summary:
        story.append(_section_bar("AI Analysis Summary", usable_w, brand_color))
        story.append(Spacer(1, 6))
        summary_box = Table(
            [[_p(ai_summary, fontSize=12, textColor=GRAY_700, leading=18)]],
            colWidths=[usable_w],
        )
        summary_box.setStyle(TableStyle([
            ("BACKGROUND",    (0, 0), (-1, -1), TEAL_LIGHT),
            ("BOX",           (0, 0), (-1, -1), 0.8, TEAL_MID),
            ("TOPPADDING",    (0, 0), (-1, -1), 10),
            ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
            ("LEFTPADDING",   (0, 0), (-1, -1), 12),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 12),
        ]))
        story.append(summary_box)
        story.append(Spacer(1, 14))

    # ── Footer ────────────────────────────────────────────────────────────────
    story.append(Spacer(1, 10))
    story.append(HRFlowable(width="100%", thickness=0.8, color=GRAY_200, spaceAfter=8))
    story.append(_p(
        "<i>Disclaimer: This is an AI-generated summary and is not a substitute for "
        "professional medical advice. Always consult a qualified doctor for diagnosis "
        "and treatment decisions.</i>",
        fontSize=10, textColor=GRAY_400, alignment=TA_CENTER, leading=14,
        fontName="Helvetica-Oblique",
    ))
    story.append(Spacer(1, 5))
    story.append(_p(
        "© 2026 Sahaay AI Healthcare Copilot  |  Page 1 of 1",
        fontSize=10, textColor=GRAY_400, alignment=TA_CENTER, leading=14,
    ))

    doc.build(story)
    return buf.getvalue()
