import json
import re
from datetime import datetime


def generate_question_set_pdf(question_set, questions, include_answers: bool = False, user_name: str = "Student"):
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import A4
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib.units import inch
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak
    from reportlab.lib.enums import TA_CENTER, TA_LEFT
    import io

    ink = colors.HexColor('#1f1a16')
    muted = colors.HexColor('#776b60')
    champagne = colors.HexColor('#b98b5d')
    champagne_light = colors.HexColor('#f4e7d8')
    surface = colors.HexColor('#fbf8f4')
    line = colors.HexColor('#e5d5c3')
    green = colors.HexColor('#2f7656')
    red = colors.HexColor('#a94f49')

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

    kicker_style = ParagraphStyle(
        'ExportKicker',
        parent=styles['Normal'],
        fontSize=8,
        leading=10,
        textColor=champagne,
        fontName='Helvetica-Bold',
        tracking=1.4,
        spaceAfter=9,
    )
    title_style = ParagraphStyle(
        'ExportTitle',
        parent=styles['Heading1'],
        fontSize=25,
        leading=29,
        spaceAfter=8,
        alignment=TA_LEFT,
        textColor=ink,
        fontName='Helvetica-Bold'
    )
    subtitle_style = ParagraphStyle(
        'ExportSubtitle',
        parent=styles['Normal'],
        fontSize=10,
        leading=15,
        spaceAfter=18,
        alignment=TA_LEFT,
        textColor=muted,
        fontName='Helvetica',
    )
    question_num_style = ParagraphStyle(
        'QuestionNumber',
        parent=styles['Normal'],
        fontSize=9,
        leading=11,
        fontName='Helvetica-Bold',
        textColor=champagne,
        spaceBefore=0,
        spaceAfter=2,
        tracking=1.1,
    )
    question_style = ParagraphStyle(
        'QuestionText',
        parent=styles['Normal'],
        fontSize=11,
        leading=16,
        fontName='Helvetica',
        textColor=ink,
        spaceAfter=11,
        alignment=TA_LEFT,
    )
    option_style = ParagraphStyle(
        'OptionText',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        fontName='Helvetica',
        textColor=ink,
        spaceAfter=0,
    )
    answer_style = ParagraphStyle(
        'AnswerText',
        parent=styles['Normal'],
        fontSize=10,
        leading=14,
        fontName='Helvetica-Bold',
        textColor=green,
        spaceAfter=6,
    )
    explanation_style = ParagraphStyle(
        'ExplanationText',
        parent=styles['Normal'],
        fontSize=9.5,
        leading=14,
        fontName='Helvetica',
        textColor=muted,
        spaceAfter=0,
    )
    meta_label_style = ParagraphStyle('MetaLabel', parent=styles['Normal'], fontSize=7.5, leading=9, fontName='Helvetica-Bold', textColor=muted, tracking=.7)
    meta_value_style = ParagraphStyle('MetaValue', parent=styles['Normal'], fontSize=10, leading=13, fontName='Helvetica-Bold', textColor=ink)
    difficulty_style = ParagraphStyle('Difficulty', parent=styles['Normal'], fontSize=8, leading=10, fontName='Helvetica-Bold', textColor=muted, alignment=TA_CENTER)
    topic_style = ParagraphStyle('Topic', parent=styles['Normal'], fontSize=8, leading=10, fontName='Helvetica-Bold', textColor=muted, tracking=.45)
    instruction_style = ParagraphStyle('Instructions', parent=styles['Normal'], fontSize=9.5, leading=14, fontName='Helvetica', textColor=muted)
    answer_heading_style = ParagraphStyle('AnswerHeading', parent=styles['Normal'], fontSize=11, leading=14, fontName='Helvetica-Bold', textColor=ink, spaceAfter=6)

    story = []
    created_date = question_set.created_at.strftime("%B %d, %Y") if question_set.created_at else "N/A"

    story.append(Paragraph("CERBYL / QUESTION BANK", kicker_style))
    story.append(Paragraph(process_latex_for_pdf(question_set.title), title_style))
    story.append(Paragraph("A focused practice set, prepared for deliberate work away from the screen.", subtitle_style))
    metadata = [
        [Paragraph('PREPARED FOR', meta_label_style), Paragraph('QUESTIONS', meta_label_style), Paragraph('CREATED', meta_label_style)],
        [Paragraph(process_latex_for_pdf(user_name), meta_value_style), Paragraph(str(len(questions)), meta_value_style), Paragraph(created_date, meta_value_style)],
    ]
    meta_table = Table(metadata, colWidths=[2.1 * inch, 1.55 * inch, 2.6 * inch])
    meta_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), surface),
        ('LINEABOVE', (0, 0), (-1, 0), 1, champagne),
        ('LINEBELOW', (0, -1), (-1, -1), .5, line),
        ('LINEAFTER', (0, 0), (-2, -1), .5, line),
        ('TOPPADDING', (0, 0), (-1, 0), 9),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 4),
        ('TOPPADDING', (0, 1), (-1, -1), 2),
        ('BOTTOMPADDING', (0, 1), (-1, -1), 10),
        ('LEFTPADDING', (0, 0), (-1, -1), 11),
        ('RIGHTPADDING', (0, 0), (-1, -1), 11),
    ]))
    story.extend([meta_table, Spacer(1, 20)])

    instruction_table = Table([[Paragraph('<b>How to use this set</b><br/>Read each prompt carefully. Select the best response for multiple-choice questions, write concise answers where requested, and show your working for mathematical problems.', instruction_style)]], colWidths=[6.25 * inch])
    instruction_table.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), champagne_light),
        ('BOX', (0, 0), (-1, -1), .5, line),
        ('LEFTPADDING', (0, 0), (-1, -1), 13),
        ('RIGHTPADDING', (0, 0), (-1, -1), 13),
        ('TOPPADDING', (0, 0), (-1, -1), 11),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 11),
    ]))
    story.extend([instruction_table, Spacer(1, 12)])

    difficulty_colors = {
        'easy': colors.HexColor('#27ae60'),
        'medium': colors.HexColor('#f39c12'),
        'hard': colors.HexColor('#e74c3c')
    }

    for idx, question in enumerate(questions, 1):
        # A question is deliberately one printable card.  A single table row
        # cannot split across pages, preventing a detached response box or a
        # header that lands on a different page from its prompt.
        difficulty = (question.difficulty or 'medium').lower()
        diff_color = difficulty_colors.get(difficulty, colors.HexColor('#666666'))
        topic = process_latex_for_pdf(str(question.topic).upper()) if question.topic else 'GENERAL'
        difficulty_badge_style = ParagraphStyle(f'Difficulty-{idx}', parent=difficulty_style, textColor=diff_color)
        card_header_style = ParagraphStyle(
            f'QuestionHeader-{idx}', parent=question_num_style, fontSize=9, leading=12, spaceAfter=0
        )

        question_header = Table([[
            Paragraph(f'QUESTION {idx:02d}<br/><font color="#776b60" size="8">{topic}</font>', card_header_style),
            Paragraph(difficulty.upper(), difficulty_badge_style),
        ]], colWidths=[4.65 * inch, 1.35 * inch])
        question_header.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (0, 0), colors.HexColor('#f8f3ed')),
            ('BACKGROUND', (1, 0), (1, 0), colors.HexColor('#f8f3ed')),
            ('BOX', (1, 0), (1, 0), .65, diff_color),
            ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
            ('ALIGN', (1, 0), (1, 0), 'CENTER'),
            ('LEFTPADDING', (0, 0), (0, 0), 13),
            ('RIGHTPADDING', (0, 0), (0, 0), 10),
            ('LEFTPADDING', (1, 0), (1, 0), 7),
            ('RIGHTPADDING', (1, 0), (1, 0), 7),
            ('TOPPADDING', (0, 0), (-1, -1), 9),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 9),
        ]))

        card_body = [question_header, Spacer(1, 14), Paragraph(process_latex_for_pdf(question.question_text), question_style)]

        if question.question_type == 'multiple_choice' and question.options:
            try:
                options = json.loads(question.options) if isinstance(question.options, str) else question.options
            except (TypeError, json.JSONDecodeError):
                options = []
            if isinstance(options, list):
                for option_index, option in enumerate(options):
                    option_letter = chr(65 + option_index)
                    option_row = Table([[
                        Paragraph(f'<b>{option_letter}</b>', difficulty_style),
                        Paragraph(process_latex_for_pdf(option), option_style),
                    ]], colWidths=[.38 * inch, 5.62 * inch])
                    option_row.setStyle(TableStyle([
                        ('BACKGROUND', (0, 0), (-1, -1), surface),
                        ('BOX', (0, 0), (-1, -1), .5, line),
                        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
                        ('LEFTPADDING', (0, 0), (0, 0), 9),
                        ('RIGHTPADDING', (0, 0), (0, 0), 6),
                        ('LEFTPADDING', (1, 0), (1, 0), 9),
                        ('RIGHTPADDING', (1, 0), (1, 0), 10),
                        ('TOPPADDING', (0, 0), (-1, -1), 7),
                        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
                    ]))
                    card_body.extend([option_row, Spacer(1, 5)])

        elif question.question_type == 'true_false':
            for option_letter, option_text in [('A', 'True'), ('B', 'False')]:
                option_row = Table([[
                    Paragraph(f'<b>{option_letter}</b>', difficulty_style), Paragraph(option_text, option_style),
                ]], colWidths=[.38 * inch, 5.62 * inch])
                option_row.setStyle(TableStyle([
                    ('BACKGROUND', (0, 0), (-1, -1), surface), ('BOX', (0, 0), (-1, -1), .5, line),
                    ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('LEFTPADDING', (0, 0), (0, 0), 9),
                    ('RIGHTPADDING', (0, 0), (0, 0), 6), ('LEFTPADDING', (1, 0), (1, 0), 9),
                    ('RIGHTPADDING', (1, 0), (1, 0), 10), ('TOPPADDING', (0, 0), (-1, -1), 7),
                    ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
                ]))
                card_body.extend([option_row, Spacer(1, 5)])

        elif question.question_type == 'short_answer':
            answer_box = Table([[Paragraph('Response', topic_style)], ['']], colWidths=[6.0 * inch], rowHeights=[.26 * inch, .82 * inch])
            answer_box.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, 0), surface), ('BOX', (0, 0), (-1, -1), .5, line),
                ('LINEBELOW', (0, 0), (-1, 0), .5, line), ('LEFTPADDING', (0, 0), (-1, -1), 11),
                ('RIGHTPADDING', (0, 0), (-1, -1), 11), ('TOPPADDING', (0, 0), (-1, -1), 7),
            ]))
            card_body.append(answer_box)

        question_card = Table([[card_body]], colWidths=[6.25 * inch], splitByRow=1)
        question_card.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, -1), colors.white),
            ('BOX', (0, 0), (-1, -1), .65, line),
            ('LEFTPADDING', (0, 0), (-1, -1), 12),
            ('RIGHTPADDING', (0, 0), (-1, -1), 12),
            ('TOPPADDING', (0, 0), (-1, -1), 12),
            ('BOTTOMPADDING', (0, 0), (-1, -1), 12),
        ]))
        story.extend([question_card, Spacer(1, 15)])

    if include_answers:
        story.append(PageBreak())
        story.append(Paragraph("CERBYL / ANSWER KEY", kicker_style))
        story.append(Paragraph("Answer key and explanations", title_style))
        story.append(Paragraph("Use this section after attempting the set, or as a compact review guide.", subtitle_style))
        for idx, q in enumerate(questions, 1):
            answer = process_latex_for_pdf(q.correct_answer or 'No answer recorded')
            answer_parts = [
                Paragraph(f'QUESTION {idx:02d}' + (f'  /  {process_latex_for_pdf(q.topic)}' if q.topic else ''), kicker_style),
                Paragraph(answer, answer_heading_style),
            ]
            if q.explanation:
                answer_parts.append(Paragraph(process_latex_for_pdf(q.explanation), explanation_style))
            answer_card = Table([[answer_parts]], colWidths=[6.25 * inch])
            answer_card.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), surface),
                ('BOX', (0, 0), (-1, -1), .5, line),
                ('LEFTPADDING', (0, 0), (-1, -1), 13),
                ('RIGHTPADDING', (0, 0), (-1, -1), 13),
                ('TOPPADDING', (0, 0), (-1, -1), 11),
                ('BOTTOMPADDING', (0, 0), (-1, -1), 11),
            ]))
            story.extend([answer_card, Spacer(1, 10)])

    def draw_page(canvas, document):
        canvas.saveState()
        page_width, page_height = A4
        canvas.setStrokeColor(line)
        canvas.setLineWidth(.5)
        canvas.line(document.leftMargin, page_height - .47 * inch, page_width - document.rightMargin, page_height - .47 * inch)
        canvas.setFillColor(muted)
        canvas.setFont('Helvetica-Bold', 7)
        canvas.drawString(document.leftMargin, page_height - .35 * inch, 'CERBYL LEARNING PLATFORM')
        canvas.setFont('Helvetica', 7)
        canvas.drawRightString(page_width - document.rightMargin, .35 * inch, f'PAGE {document.page}')
        canvas.drawString(document.leftMargin, .35 * inch, f'Generated {datetime.now().strftime("%d %b %Y")}')
        canvas.restoreState()

    doc.build(story, onFirstPage=draw_page, onLaterPages=draw_page)

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
