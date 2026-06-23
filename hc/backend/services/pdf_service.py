"""
PDF generation for Sahaay patient health summaries using ReportLab.
"""

import io
from datetime import datetime
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import mm
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable,
)
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT

# ── Brand colours ─────────────────────────────────────────────────────────────
TEAL       = colors.HexColor("#0F766E")
TEAL_LIGHT = colors.HexColor("#CCFBF1")
CYAN       = colors.HexColor("#06B6D4")
GRAY_50    = colors.HexColor("#F8FAFC")
GRAY_200   = colors.HexColor("#E2E8F0")
GRAY_400   = colors.HexColor("#94A3B8")
GRAY_700   = colors.HexColor("#334155")
WHITE      = colors.white

RISK_COLOURS = {
    "low":      (colors.HexColor("#D1FAE5"), colors.HexColor("#065F46")),  # bg, fg
    "medium":   (colors.HexColor("#FEF3C7"), colors.HexColor("#92400E")),
    "high":     (colors.HexColor("#FFE4E6"), colors.HexColor("#9F1239")),
    "critical": (colors.HexColor("#FEE2E2"), colors.HexColor("#7F1D1D")),
}

PAGE_W, PAGE_H = A4
MARGIN = 18 * mm


def _risk_colours(level: str) -> tuple:
    return RISK_COLOURS.get((level or "").lower(), RISK_COLOURS["medium"])


def _styles():
    base = getSampleStyleSheet()
    add = lambda name, **kw: ParagraphStyle(name, parent=base["Normal"], **kw)
    return {
        "title":       add("sahaay_title",   fontSize=22, textColor=TEAL,   fontName="Helvetica-Bold",  spaceAfter=2),
        "subtitle":    add("sahaay_sub",     fontSize=10, textColor=GRAY_400, spaceAfter=1),
        "section":     add("sahaay_section", fontSize=12, textColor=TEAL,   fontName="Helvetica-Bold",  spaceBefore=10, spaceAfter=4),
        "body":        add("sahaay_body",    fontSize=9,  textColor=GRAY_700, leading=14),
        "footer":      add("sahaay_footer",  fontSize=7.5, textColor=GRAY_400, alignment=TA_CENTER, leading=11),
        "cell":        add("sahaay_cell",    fontSize=8,  textColor=GRAY_700, leading=11),
        "cell_bad":    add("sahaay_cell_b",  fontSize=8,  textColor=colors.HexColor("#9F1239"), fontName="Helvetica-Bold", leading=11),
        "risk_label":  add("sahaay_risk",    fontSize=9,  fontName="Helvetica-Bold", alignment=TA_CENTER),
    }


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

    s = _styles()
    story = []
    usable_w = PAGE_W - 2 * MARGIN

    # ── Branding ──────────────────────────────────────────────────────────────
    brand = branding or {}
    hospital_name  = brand.get("hospital_name", "")
    logo_text      = brand.get("hospital_logo_text", "")
    doctor_name    = brand.get("doctor_name", "")
    brand_hex      = brand.get("hospital_color", "#0F766E")
    try:
        brand_color = colors.HexColor(brand_hex)
    except Exception:
        brand_color = TEAL

    # ── Header ────────────────────────────────────────────────────────────────
    left_title = hospital_name if hospital_name else "Sahaay"
    left_sub   = logo_text or ("AI Healthcare Copilot" if not hospital_name else "")
    header_data = [[
        Table(
            [[Paragraph(left_title, ParagraphStyle("brand_title", parent=s["title"], textColor=brand_color, fontSize=18))],
             [Paragraph(left_sub, s["subtitle"])] if left_sub else []],
            colWidths=[usable_w * 0.6],
        ),
        Paragraph(
            f"<font color='#94A3B8'>Patient Health Summary{f'<br/>Prepared by Dr. {doctor_name}' if doctor_name else ''}</font>",
            ParagraphStyle("rh", parent=s["subtitle"], alignment=TA_RIGHT, fontSize=9),
        ),
    ]]
    header_tbl = Table(header_data, colWidths=[usable_w * 0.6, usable_w * 0.4])
    header_tbl.setStyle(TableStyle([("VALIGN", (0, 0), (-1, -1), "BOTTOM")]))
    story.append(header_tbl)
    story.append(HRFlowable(width="100%", thickness=1.5, color=brand_color, spaceAfter=6))

    # Patient meta row
    patient_name = patient_data.get("name") or "Patient"
    report_date  = report_data.get("created_at", datetime.utcnow().isoformat())[:10]
    report_type  = report_data.get("report_type") or report_data.get("file_name") or "Lab Report"
    generated_on = datetime.utcnow().strftime("%d %b %Y, %H:%M UTC")

    meta = [
        [
            Paragraph(f"<b>{patient_name}</b>", s["body"]),
            Paragraph(
                f"Age: {patient_data.get('age') or '—'}  ·  "
                f"Gender: {(patient_data.get('gender') or '—').capitalize()}  ·  "
                f"{patient_data.get('email') or ''}",
                s["body"],
            ),
            Paragraph(
                f"Report: {report_type}<br/>Date: {report_date}<br/>"
                f"<font color='#94A3B8'>Generated: {generated_on}</font>",
                ParagraphStyle("rmeta", parent=s["body"], alignment=TA_RIGHT),
            ),
        ]
    ]
    meta_tbl = Table(meta, colWidths=[usable_w * 0.25, usable_w * 0.45, usable_w * 0.3])
    meta_tbl.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, -1), GRAY_50),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [GRAY_50]),
        ("BOX", (0, 0), (-1, -1), 0.5, GRAY_200),
        ("ROUNDEDCORNERS", [4]),
        ("TOPPADDING",    (0, 0), (-1, -1), 6),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
        ("LEFTPADDING",   (0, 0), (-1, -1), 8),
        ("RIGHTPADDING",  (0, 0), (-1, -1), 8),
        ("VALIGN",        (0, 0), (-1, -1), "TOP"),
    ]))
    story.append(meta_tbl)
    story.append(Spacer(1, 8))

    # ── Risk Scores section ───────────────────────────────────────────────────
    if risk_data:
        story.append(Paragraph("Risk Scores", s["section"]))

        overall_score = risk_data.get("overall_score", "—")
        overall_level = (risk_data.get("risk_level") or "medium").lower()
        obg, ofg = _risk_colours(overall_level)

        organs = [
            ("Overall",  overall_score, overall_level),
            ("Liver",    (risk_data.get("liver_risk")    or {}).get("score", "—"), (risk_data.get("liver_risk")    or {}).get("level", "")),
            ("Diabetes", (risk_data.get("diabetes_risk") or {}).get("score", "—"), (risk_data.get("diabetes_risk") or {}).get("level", "")),
            ("Heart",    (risk_data.get("heart_risk")    or {}).get("score", "—"), (risk_data.get("heart_risk")    or {}).get("level", "")),
            ("Kidney",   (risk_data.get("kidney_risk")   or {}).get("score", "—"), (risk_data.get("kidney_risk")   or {}).get("level", "")),
        ]

        risk_row   = []
        risk_style = [("ALIGN", (0, 0), (-1, -1), "CENTER"), ("VALIGN", (0, 0), (-1, -1), "MIDDLE")]
        col_w      = usable_w / len(organs)

        for i, (label, score, level) in enumerate(organs):
            bg, fg = _risk_colours(level) if level else (GRAY_50, GRAY_400)
            score_str = f"{score}/100" if isinstance(score, (int, float)) else str(score)
            cell = Table(
                [[Paragraph(f"<b>{score_str}</b>", ParagraphStyle("rs", fontSize=14, textColor=fg, alignment=TA_CENTER, fontName="Helvetica-Bold"))],
                 [Paragraph(label, ParagraphStyle("rl", fontSize=7.5, textColor=fg, alignment=TA_CENTER))],
                 [Paragraph((level or "").capitalize(), ParagraphStyle("rv", fontSize=7, textColor=fg, alignment=TA_CENTER, fontName="Helvetica-Bold"))]],
                colWidths=[col_w - 6],
            )
            cell.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), bg),
                ("BOX",           (0, 0), (-1, -1), 0.5, fg),
                ("ROUNDEDCORNERS", [6]),
                ("TOPPADDING",    (0, 0), (-1, -1), 6),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 6),
            ]))
            risk_row.append(cell)

        risk_tbl = Table([risk_row], colWidths=[col_w] * len(organs))
        risk_tbl.setStyle(TableStyle([
            ("LEFTPADDING",  (0, 0), (-1, -1), 3),
            ("RIGHTPADDING", (0, 0), (-1, -1), 3),
            ("TOPPADDING",   (0, 0), (-1, -1), 0),
            ("BOTTOMPADDING",(0, 0), (-1, -1), 0),
        ]))
        story.append(risk_tbl)
        story.append(Spacer(1, 8))

        # Per-organ explanations
        explanations = []
        for key, label in [("liver_risk","Liver"),("diabetes_risk","Diabetes"),("heart_risk","Heart"),("kidney_risk","Kidney")]:
            organ = risk_data.get(key) or {}
            if isinstance(organ, dict) and organ.get("explanation"):
                explanations.append([
                    Paragraph(f"<b>{label}</b>", s["cell"]),
                    Paragraph(organ["explanation"], s["cell"]),
                ])
        if explanations:
            exp_tbl = Table(explanations, colWidths=[usable_w * 0.15, usable_w * 0.85])
            exp_tbl.setStyle(TableStyle([
                ("BACKGROUND",    (0, 0), (-1, -1), GRAY_50),
                ("LINEBELOW",     (0, 0), (-1, -2), 0.3, GRAY_200),
                ("TOPPADDING",    (0, 0), (-1, -1), 4),
                ("BOTTOMPADDING", (0, 0), (-1, -1), 4),
                ("LEFTPADDING",   (0, 0), (-1, -1), 6),
                ("RIGHTPADDING",  (0, 0), (-1, -1), 6),
                ("VALIGN",        (0, 0), (-1, -1), "TOP"),
            ]))
            story.append(exp_tbl)
            story.append(Spacer(1, 8))

    # ── Report Parameters section ─────────────────────────────────────────────
    parameters = report_data.get("parameters") or []
    if parameters:
        story.append(Paragraph("Report Parameters", s["section"]))

        hdr = [
            Paragraph("<b>Parameter</b>", s["cell"]),
            Paragraph("<b>Value</b>",     s["cell"]),
            Paragraph("<b>Unit</b>",      s["cell"]),
            Paragraph("<b>Reference</b>", s["cell"]),
            Paragraph("<b>Status</b>",    s["cell"]),
        ]
        rows = [hdr]
        row_styles = [
            ("BACKGROUND",    (0, 0), (-1, 0), TEAL),
            ("TEXTCOLOR",     (0, 0), (-1, 0), WHITE),
            ("FONTNAME",      (0, 0), (-1, 0), "Helvetica-Bold"),
            ("FONTSIZE",      (0, 0), (-1, 0), 8),
            ("BOTTOMPADDING", (0, 0), (-1, 0), 5),
            ("TOPPADDING",    (0, 0), (-1, 0), 5),
            ("LINEBELOW",     (0, 0), (-1, -1), 0.3, GRAY_200),
            ("ROWBACKGROUNDS",(0, 1), (-1, -1), [WHITE, GRAY_50]),
            ("TOPPADDING",    (0, 1), (-1, -1), 3),
            ("BOTTOMPADDING", (0, 1), (-1, -1), 3),
            ("LEFTPADDING",   (0, 0), (-1, -1), 5),
            ("RIGHTPADDING",  (0, 0), (-1, -1), 5),
            ("VALIGN",        (0, 0), (-1, -1), "MIDDLE"),
        ]

        for i, p in enumerate(parameters):
            is_bad = p.get("is_abnormal") or (p.get("status", "").lower() in ("low", "high"))
            st     = (p.get("status") or "Normal").capitalize()
            ref_min = p.get("reference_min")
            ref_max = p.get("reference_max")
            ref_str = (
                f"{ref_min}–{ref_max}" if ref_min is not None and ref_max is not None
                else f"≥{ref_min}" if ref_min is not None
                else f"≤{ref_max}" if ref_max is not None
                else "—"
            )
            cell_style = s["cell_bad"] if is_bad else s["cell"]
            row = [
                Paragraph(p.get("parameter_name") or "—", cell_style),
                Paragraph(str(p.get("value") or "—"),      cell_style),
                Paragraph(p.get("unit") or "—",            s["cell"]),
                Paragraph(ref_str,                         s["cell"]),
                Paragraph(st,                              cell_style),
            ]
            rows.append(row)
            if is_bad:
                row_styles.append(("BACKGROUND", (0, i + 1), (-1, i + 1), colors.HexColor("#FFF1F2")))

        param_tbl = Table(rows, colWidths=[usable_w * w for w in [0.32, 0.15, 0.13, 0.22, 0.18]])
        param_tbl.setStyle(TableStyle(row_styles))
        story.append(param_tbl)
        story.append(Spacer(1, 8))

    # ── AI Summary section ────────────────────────────────────────────────────
    ai_summary = report_data.get("ai_summary") or (
        (report_data.get("analysis_result") or {}).get("summary") if isinstance(report_data.get("analysis_result"), dict) else None
    )
    if ai_summary:
        story.append(Paragraph("AI Analysis Summary", s["section"]))
        story.append(Paragraph(ai_summary, s["body"]))
        story.append(Spacer(1, 8))

    # ── Footer disclaimer ─────────────────────────────────────────────────────
    story.append(Spacer(1, 6))
    story.append(HRFlowable(width="100%", thickness=0.5, color=GRAY_200, spaceAfter=5))
    story.append(Paragraph(
        "This is an AI-generated summary and is not a substitute for professional medical advice. "
        "Always consult a qualified doctor for diagnosis and treatment decisions. "
        "© Sahaay AI Healthcare Copilot",
        s["footer"],
    ))

    doc.build(story)
    return buf.getvalue()
