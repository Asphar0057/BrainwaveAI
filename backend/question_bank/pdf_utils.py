import json
import re
from datetime import datetime


def generate_question_set_pdf(question_set, questions, include_answers: bool = False, user_name: str = "Student"):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, HRFlowable
    from reportlab.lib.enums import TA_CENTER, TA_JUSTIFY
    import io

    buffer = io.BytesIO()

    doc = SimpleDocTemplate(
        buffer,
        pagesize=A4,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        'CustomTitle',
        parent=styles['Heading1'],
        fontSize=24,
        spaceAfter=6,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#1a1a2e'),
        fontName='Helvetica-Bold'
    )

    subtitle_style = ParagraphStyle(
        'CustomSubtitle',
        parent=styles['Normal'],
        fontSize=12,
        spaceAfter=20,
        alignment=TA_CENTER,
        textColor=colors.HexColor('#666666'),
        fontName='Helvetica'
    )

    question_num_style = ParagraphStyle(
        'QuestionNumber',
        parent=styles['Normal'],
        fontSize=11,
        fontName='Helvetica-Bold',
        textColor=colors.HexColor('#d4a574'),
        spaceBefore=15,
        spaceAfter=5
    )

    question_style = ParagraphStyle(
        'QuestionText',
        parent=styles['Normal'],
        fontSize=11,
        fontName='Helvetica',
        textColor=colors.HexColor('#1a1a2e'),
        spaceAfter=8,
        leading=14,
        alignment=TA_JUSTIFY
    )

    option_style = ParagraphStyle(
        'OptionText',
        parent=styles['Normal'],
        fontSize=10,
        fontName='Helvetica',
        textColor=colors.HexColor('#333333'),
        leftIndent=20,
        spaceAfter=4,
        leading=13
    )

    answer_style = ParagraphStyle(
        'AnswerText',
        parent=styles['Normal'],
        fontSize=10,
        fontName='Helvetica-Oblique',
        textColor=colors.HexColor('#27ae60'),
        leftIndent=20,
        spaceBefore=5,
        spaceAfter=10
    )

    explanation_style = ParagraphStyle(
        'ExplanationText',
        parent=styles['Normal'],
        fontSize=9,
        fontName='Helvetica',
        textColor=colors.HexColor('#555555'),
        leftIndent=20,
        spaceAfter=15,
        leading=12,
        borderPadding=(5, 5, 5, 5)
    )

    story = []

    story.append(Paragraph("QUESTION SET", title_style))
    story.append(Paragraph(question_set.title, subtitle_style))

    created_date = question_set.created_at.strftime("%B %d, %Y") if question_set.created_at else "N/A"
    meta_text = f"Generated for: {user_name} | Total Questions: {len(questions)} | Created: {created_date}"
    story.append(Paragraph(meta_text, subtitle_style))

    story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#d4a574'), spaceBefore=10, spaceAfter=20))

    instructions_style = ParagraphStyle(
        'Instructions',
        parent=styles['Normal'],
        fontSize=10,
        fontName='Helvetica',
        textColor=colors.HexColor('#555555'),
        spaceAfter=20,
        leading=14,
        borderPadding=(10, 10, 10, 10),
        backColor=colors.HexColor('#f8f9fa')
    )

    instructions = """
    <b>Instructions:</b><br/>
    • Read each question carefully before answering.<br/>
    • For multiple choice questions, select the best answer.<br/>
    • For short answer questions, provide a concise response.<br/>
    • Show your work for mathematical problems where applicable.
    """
    story.append(Paragraph(instructions, instructions_style))
    story.append(Spacer(1, 20))

    difficulty_colors = {
        'easy': colors.HexColor('#27ae60'),
        'medium': colors.HexColor('#f39c12'),
        'hard': colors.HexColor('#e74c3c')
    }

    for idx, question in enumerate(questions, 1):
        difficulty = question.difficulty or 'medium'
        diff_color = difficulty_colors.get(difficulty.lower(), colors.HexColor('#666666'))

        q_header = f"<b>Question {idx}</b>"
        if question.topic:
            q_header += f" <font color='#888888'>| {question.topic}</font>"

        story.append(Paragraph(q_header, question_num_style))

        diff_text = f"<font color='{diff_color.hexval()}'>[{difficulty.upper()}]</font>"
        diff_para = ParagraphStyle(
            'DiffIndicator',
            parent=styles['Normal'],
            fontSize=9,
            fontName='Helvetica-Bold',
            spaceAfter=8
        )
        story.append(Paragraph(diff_text, diff_para))

        q_text = process_latex_for_pdf(question.question_text)
        story.append(Paragraph(q_text, question_style))

        if question.question_type == 'multiple_choice' and question.options:
            try:
                options = json.loads(question.options) if isinstance(question.options, str) else question.options
                if isinstance(options, list):
                    for i, opt in enumerate(options):
                        opt_letter = chr(65 + i)
                        opt_text = process_latex_for_pdf(opt)
                        story.append(Paragraph(f"<b>{opt_letter}.</b> {opt_text}", option_style))
            except:
                pass

        elif question.question_type == 'true_false':
            story.append(Paragraph("<b>A.</b> True", option_style))
            story.append(Paragraph("<b>B.</b> False", option_style))

        elif question.question_type == 'short_answer':
            answer_box_style = ParagraphStyle(
                'AnswerBox',
                parent=styles['Normal'],
                fontSize=10,
                fontName='Helvetica',
                textColor=colors.HexColor('#888888'),
                leftIndent=20,
                spaceAfter=10,
                borderPadding=(10, 10, 10, 10)
            )
            story.append(Paragraph("<i>Answer:</i> _" + "_" * 60, answer_box_style))

        if include_answers and question.correct_answer:
            answer_text = process_latex_for_pdf(question.correct_answer)
            story.append(Paragraph(f"<b>Answer:</b> {answer_text}", answer_style))

            if question.explanation:
                exp_text = process_latex_for_pdf(question.explanation)
                story.append(Paragraph(f"<b>Explanation:</b> {exp_text}", explanation_style))

        story.append(Spacer(1, 10))

        if idx % 5 == 0 and idx < len(questions):
            story.append(PageBreak())

    if include_answers:
        story.append(PageBreak())
        story.append(Paragraph("ANSWER KEY", title_style))
        story.append(HRFlowable(width="100%", thickness=1, color=colors.HexColor('#d4a574'), spaceBefore=10, spaceAfter=20))

        answer_data = [["Q#", "Answer", "Difficulty", "Topic"]]
        for idx, q in enumerate(questions, 1):
            answer_data.append([
                str(idx),
                process_latex_for_pdf(q.correct_answer or "N/A")[:50],
                (q.difficulty or "medium").capitalize(),
                (q.topic or "General")[:30]
            ])

        answer_table = Table(answer_data, colWidths=[0.5 * inch, 3 * inch, 1 * inch, 2 * inch])
        answer_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#d4a574')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, 0), 10),
            ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
            ('BACKGROUND', (0, 1), (-1, -1), colors.HexColor('#f8f9fa')),
            ('TEXTCOLOR', (0, 1), (-1, -1), colors.HexColor('#333333')),
            ('FONTNAME', (0, 1), (-1, -1), 'Helvetica'),
            ('FONTSIZE', (0, 1), (-1, -1), 9),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#dddddd')),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.white, colors.HexColor('#f8f9fa')])
        ]))
        story.append(answer_table)

    story.append(Spacer(1, 30))
    footer_style = ParagraphStyle(
        'Footer',
        parent=styles['Normal'],
        fontSize=8,
        fontName='Helvetica',
        textColor=colors.HexColor('#888888'),
        alignment=TA_CENTER
    )
    story.append(HRFlowable(width="100%", thickness=0.5, color=colors.HexColor('#dddddd'), spaceBefore=20, spaceAfter=10))
    story.append(Paragraph(f"Generated by Cerbyl Learning Platform | {datetime.now().strftime('%Y-%m-%d %H:%M')}", footer_style))

    doc.build(story)

    buffer.seek(0)
    return buffer.getvalue()


def process_latex_for_pdf(text: str) -> str:
    if not text:
        return ""

    # Escape raw markup characters from the source text *before* any of the
    # substitutions below introduce real reportlab tags (<b>, <i>, <super>,
    # ...) -- otherwise a literal "<" or ">" in the question text (e.g. "if
    # x < 5") corrupts reportlab's Paragraph markup parser and the PDF export
    # throws on any question containing an inequality or angle bracket.
    text = text.replace('&', '&amp;').replace('<', '&lt;').replace('>', '&gt;')

    text = re.sub(r'\$([^$]+)\$', r'<i>\1</i>', text)

    text = re.sub(r'\$\$([^$]+)\$\$', r'<br/><i>\1</i><br/>', text)

    latex_replacements = {
        r'\\frac\{([^}]+)\}\{([^}]+)\}': r'(\1)/(\2)',
        r'\\sqrt\{([^}]+)\}': r'√(\1)',
        r'\\sum': '∑',
        r'\\prod': '∏',
        r'\\int': '∫',
        r'\\infty': '∞',
        r'\\alpha': 'α',
        r'\\beta': 'β',
        r'\\gamma': 'γ',
        r'\\delta': 'δ',
        r'\\epsilon': 'ε',
        r'\\theta': 'θ',
        r'\\lambda': 'λ',
        r'\\mu': 'μ',
        r'\\pi': 'π',
        r'\\sigma': 'σ',
        r'\\omega': 'ω',
        r'\\times': '×',
        r'\\div': '÷',
        r'\\pm': '±',
        r'\\leq': '≤',
        r'\\geq': '≥',
        r'\\neq': '≠',
        r'\\approx': '≈',
        r'\\rightarrow': '→',
        r'\\leftarrow': '←',
        r'\\Rightarrow': '⇒',
        r'\\Leftarrow': '⇐',
        r'\\cdot': '·',
        r'\\ldots': '...',
        r'\\degree': '°',
        r'\^2': '²',
        r'\^3': '³',
        r'\^n': 'ⁿ',
        r'\\text\{([^}]+)\}': r'\1',
        r'\\mathbf\{([^}]+)\}': r'<b>\1</b>',
        r'\\textbf\{([^}]+)\}': r'<b>\1</b>',
        r'\\textit\{([^}]+)\}': r'<i>\1</i>',
        r'\\underline\{([^}]+)\}': r'<u>\1</u>',
    }

    for pattern, replacement in latex_replacements.items():
        text = re.sub(pattern, replacement, text)

    text = re.sub(r'\^\{([^}]+)\}', r'<super>\1</super>', text)
    text = re.sub(r'\^(\d)', r'<super>\1</super>', text)

    text = re.sub(r'_\{([^}]+)\}', r'<sub>\1</sub>', text)
    text = re.sub(r'_(\d)', r'<sub>\1</sub>', text)

    text = text.replace('\\\\', '<br/>')
    text = re.sub(r'\\([a-zA-Z]+)', r'\1', text)

    return text
