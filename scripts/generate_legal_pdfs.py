#!/usr/bin/env python3
"""Generate the public Cerbyl legal documents as branded PDFs."""

from pathlib import Path
from xml.sax.saxutils import escape

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.platypus import BaseDocTemplate, Frame, KeepTogether, PageTemplate, Paragraph, Spacer

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf"
OUT.mkdir(parents=True, exist_ok=True)

COMPANY = "CERBYL TECHNOLOGIES PRIVATE LIMITED"
CIN = "U62010TS2026PTC212247"
ADDRESS = "Dalhousie 11A, Type 2, Hill County, Nizampet, Qutubullapur, Hyderabad - 500090, Telangana, India"
UPDATED = "5 September 2026"

DOCS = {
    "cerbyl-terms-and-conditions.pdf": (
        "Terms and Conditions",
        "These Terms govern your access to Cerbyl's websites, applications, AI-assisted learning tools and related services (the Services). By creating an account, purchasing a plan, or using the Services, you agree to these Terms.",
        [
            ("1. Who operates Cerbyl", [f"The Services are operated by {COMPANY}, a company incorporated in India. Registered office: {ADDRESS}. CIN: {CIN}."]),
            ("2. Eligibility and accounts", ["You must provide accurate information, keep your credentials confidential, and promptly tell us about suspected unauthorised access. If you are under 18, you may use Cerbyl only with the involvement and verifiable consent of a parent or lawful guardian. A parent or guardian who permits use is responsible for supervising the account and accepting these Terms on the child's behalf.", "You may not sell, transfer, share, or misuse an account. We may require verification and may suspend an account where information is false, security is at risk, or these Terms are breached."]),
            ("3. Plans, payments and renewals", ["Plan features, billing period, currency, price, applicable taxes and whether a subscription renews automatically will be shown before you pay. If you choose auto-renewal, you authorise the displayed recurring charge until cancellation. Your bank, card issuer or payment provider may apply currency conversion, cross-border or other charges that we do not control.", "Payments are processed by third-party payment providers. Cerbyl does not store complete card credentials. A failed or reversed payment may result in plan suspension or reversion to a free plan. We may change future prices or plan features after giving reasonable notice; an increase will not be charged before the next renewal disclosed to you."]),
            ("4. Cancellation and refunds", ["You can cancel a recurring subscription through the account billing controls or by emailing billing@cerbyl.com. Cancellation stops future renewals and ordinarily leaves paid access active until the end of the current billing period. Refund eligibility is governed by the Refund and Cancellation Policy and mandatory law."]),
            ("5. Educational and AI-generated content", ["Cerbyl is a study and productivity service, not an accredited educational institution. AI-generated answers, notes, quizzes, summaries, recommendations and other outputs may be incomplete or inaccurate. You must independently verify important information. The Services do not provide medical, legal, financial, mental-health or other professional advice and do not guarantee grades, admissions, employment or any learning outcome."]),
            ("6. Your content", ["You retain ownership of content you submit. You give us a limited, worldwide, non-exclusive licence to host, copy, process, transform and display that content only as needed to operate, secure, improve and provide the Services, follow your sharing choices, and comply with law. You confirm you have the rights and permissions needed to submit the content.", "Content you intentionally publish or share may be accessible to others through the selected sharing controls. Remove sharing or delete the content if you no longer want it available, subject to reasonable caching, backups and legal retention."]),
            ("7. Acceptable use", ["You must not use Cerbyl to break the law; infringe privacy or intellectual-property rights; harass, exploit or endanger another person; upload malware; bypass usage, safety or access controls; scrape or reverse engineer the Services except where law permits; automate abusive requests; impersonate others; or submit content you have no right to use. You must not use AI output to facilitate cheating or academic misconduct."]),
            ("8. Cerbyl intellectual property", ["The Services, software, branding, designs and company-created materials belong to Cerbyl or its licensors. Except for the limited right to use the Services under these Terms, no intellectual-property rights are transferred to you."]),
            ("9. Availability and changes", ["We work to keep Cerbyl available, but uninterrupted or error-free operation is not guaranteed. We may maintain, update, add, remove or discontinue features. If we discontinue a paid Service before the end of a paid term, we will provide an appropriate remedy such as continued access, migration where practical, or a proportionate refund, as required by law."]),
            ("10. Suspension and termination", ["We may restrict or terminate access for material or repeated breach, fraud, abuse, security risk, non-payment, or legal necessity. Where reasonably possible, we will give notice and an opportunity to remedy the issue. You may stop using Cerbyl and request account deletion at any time. Provisions that by nature should survive termination will survive."]),
            ("11. Disclaimers and liability", ["To the maximum extent permitted by law, the Services are provided on an 'as available' basis without implied warranties. Cerbyl is not liable for indirect, incidental, special, punitive or consequential loss, or loss of data, profits or opportunity, arising from use of the Services.", "To the maximum extent permitted by law, Cerbyl's total liability for a claim will not exceed the amount you paid Cerbyl for the Services during the 12 months before the event giving rise to the claim. Nothing in these Terms excludes liability or consumer rights that cannot lawfully be excluded or limited."]),
            ("12. Indemnity", ["If you use the Services on behalf of a business or organisation, that entity will indemnify Cerbyl against third-party claims arising from its unlawful content, misuse of the Services or material breach of these Terms, except to the extent caused by Cerbyl. This clause does not reduce non-waivable consumer rights."]),
            ("13. Governing law and disputes", ["These Terms are governed by Indian law. Please first contact grievance@cerbyl.com so we can try to resolve the matter. Subject to any mandatory consumer forum or other non-waivable jurisdiction, courts at Hyderabad, Telangana will have jurisdiction."]),
            ("14. Changes to these Terms", ["We may update these Terms for legal, security or product reasons. We will post the revised version and update the effective date. For material changes, we will provide reasonable notice through email, the Services or another effective method. Continued use after the effective date constitutes acceptance where permitted by law."]),
        ],
    ),
    "cerbyl-privacy-policy.pdf": (
        "Privacy Policy",
        "This Policy explains what personal data Cerbyl processes, why we process it, how it is used and shared, and the choices available to you.",
        [
            ("1. Data fiduciary and contact", [f"{COMPANY} determines how personal data is processed for the Services. Privacy questions and rights requests may be sent to privacy@cerbyl.com. Complaints may be sent to grievance@cerbyl.com."]),
            ("2. Personal data we collect", ["Account data: name, email address, phone number, username, profile photo, login provider, age or age range, school or university and learning preferences you provide.", "Learning and content data: prompts, chats, notes, files, recordings, flashcards, quizzes, answers, scores, study history, mastery signals, feedback and content you share.", "Transaction data: plan, billing status, payment-provider references, transaction amount, currency, timestamps and limited payment-method details. We do not receive or store complete card numbers or security codes.", "Device and usage data: IP address, device and browser type, identifiers, logs, feature interactions, crash and performance data, referral pages and approximate location derived from IP.", "Communications and cookies: support messages and data needed for authentication, preferences, security, analytics and, only where enabled and permitted, marketing measurement."]),
            ("3. Why we process personal data", ["We process data to create and secure accounts; provide and personalise learning; generate requested AI content; process purchases and subscriptions; operate sharing and classroom features; respond to support and rights requests; improve reliability, safety and user experience; enforce our Terms; prevent fraud; and comply with law.", "Where consent is the applicable basis, you may withdraw it as easily as you gave it. Withdrawal does not affect earlier lawful processing and may make a requested feature unavailable."]),
            ("4. AI processing", ["Content you submit to AI features is processed to produce the output you request and, where applicable, retrieve context from prior activity. Do not submit highly sensitive information that is unnecessary for learning. Vetted service providers may process prompts and outputs on our behalf under contractual restrictions."]),
            ("5. How we share data", ["We share personal data only as reasonably necessary with hosting, database, communications, authentication, analytics, customer-support, AI and payment providers acting for us; an institution administrator when you join its workspace; other users when you choose to share; during a merger, financing or sale subject to appropriate protection; or where required to protect rights, safety and comply with law.", "We do not sell personal data or permit payment providers to use transaction data for Cerbyl advertising."]),
            ("6. International processing", ["Some providers or team members may process data outside India. We use contracts, access controls and other safeguards appropriate to the data and comply with restrictions notified under applicable Indian law."]),
            ("7. Retention", ["We retain account and learning data while your account is active and for a reasonable period afterwards for restoration, security and disputes. Payment, tax, fraud-prevention and compliance records may be retained as required by law. We delete or anonymise data when no longer needed, subject to legal obligations, backups and disputes."]),
            ("8. Security", ["We use reasonable technical and organisational safeguards including access restrictions, encrypted transport, authentication controls, logging and service-provider review. No system is completely secure. Report suspected risk promptly to support@cerbyl.com."]),
            ("9. Your choices and rights", ["Subject to applicable law, you may request access, correction, erasure, withdrawal of consent, account closure, nomination and grievance redressal. Send requests from your registered email to privacy@cerbyl.com. We may verify your identity. Promotional email can be unsubscribed; essential account, security, billing and legal notices will still be sent."]),
            ("10. Children", ["A user under 18 must use Cerbyl only with verifiable consent and involvement of a parent or lawful guardian. We do not knowingly target behavioural advertising to children. A parent or guardian may contact privacy@cerbyl.com to review or request deletion of a child's data."]),
            ("11. Cookies", ["Strictly necessary cookies support login, security and core preferences. Analytics or marketing technologies, if used, will be described through the relevant notice or consent control. Blocking necessary cookies may prevent parts of Cerbyl from working."]),
            ("12. Updates and complaints", ["We may update this Policy and will post the new date. Material changes will receive reasonable notice. Raise complaints first at grievance@cerbyl.com. This does not prevent you from approaching a competent regulator or authority when available under applicable law."]),
        ],
    ),
    "cerbyl-refund-and-cancellation-policy.pdf": (
        "Refund and Cancellation Policy",
        "This Policy applies to paid Cerbyl digital subscriptions and one-time digital purchases made directly from Cerbyl.",
        [
            ("1. Cancel at any time", ["Cancel a recurring plan through your account billing controls or email billing@cerbyl.com from your registered email. Cancellation stops the next renewal. Unless a refund is approved, paid access continues until the end of the billing period."]),
            ("2. First-purchase refund window", ["You may request a refund within 7 calendar days after your first purchase of a paid Cerbyl plan if the account has not made substantial use of paid features, credits or generated content. We assess substantial use reasonably using account activity and the nature of the plan. Renewals, upgrades and repeat purchases are not covered by this voluntary window."]),
            ("3. Other eligible cases", ["We will investigate and, where verified, refund or correct duplicate charges, a charged transaction where access was not delivered because of a Cerbyl error, or an unauthorised payment reported promptly. Your payment provider may require verification."]),
            ("4. Normally non-refundable", ["Except where this Policy or law requires otherwise, fees are not refundable or prorated for unused time after the 7-day window, change of mind after substantial use, failure to cancel before a disclosed renewal, partial billing periods, unused credits, account suspension caused by a breach, exchange-rate movements, or third-party fees not retained by Cerbyl."]),
            ("5. How to request a refund", ["Email billing@cerbyl.com with your registered email address, transaction ID, payment date, amount and reason. Do not send full card details, passwords or OTPs. We ordinarily acknowledge requests within 2 business days and aim to decide them within 7 business days."]),
            ("6. Approved refunds", ["Approved refunds are sent to the original payment method. Cerbyl will initiate the refund promptly; the bank, card network or payment provider may take an additional 5-10 business days to display it. International settlement and conversion differences are controlled by the payment provider."]),
            ("7. Consumer rights", ["Nothing in this Policy limits a refund, remedy or consumer right that cannot be excluded under applicable law. Unresolved payment disputes may be sent to grievance@cerbyl.com."]),
        ],
    ),
    "cerbyl-service-delivery-policy.pdf": (
        "Service Delivery Policy",
        "Cerbyl supplies digital services only. No physical goods are shipped under the plans described on cerbyl.com.",
        [
            ("1. Free account delivery", ["A free account is activated after required email, phone or identity verification is completed. Some features may require profile setup, permissions or joining a workspace."]),
            ("2. Paid plan delivery", ["Paid access is ordinarily activated automatically within a few minutes after our payment provider confirms a successful transaction. The active plan and billing period will appear in your account. A receipt or payment confirmation will be sent to the registered email by Cerbyl or the payment provider."]),
            ("3. Delays", ["Bank authentication, risk review, payment-provider downtime, an incomplete payment, or account mismatch may delay activation. If payment was debited but access is not active within 24 hours, email billing@cerbyl.com with the transaction reference and registered email. Never send a card number, CVV, password or OTP."]),
            ("4. Service access", ["Digital delivery requires a compatible device, supported browser and internet connection. Availability may be affected by maintenance, third-party infrastructure, legal restrictions or events outside reasonable control. Planned material maintenance will be communicated where practical."]),
            ("5. Failed delivery", ["If Cerbyl cannot deliver paid access because of a verified Cerbyl error, we will restore access, extend the paid term, or issue an appropriate refund under the Refund and Cancellation Policy."]),
        ],
    ),
    "cerbyl-contact-and-grievance-details.pdf": (
        "Contact and Grievance Details",
        "Use the address that matches your request so it reaches the right queue. Never email passwords, OTPs or complete card details.",
        [
            ("Contact channels", ["Customer support: support@cerbyl.com - account access, product help, safety and technical issues.", "Billing: billing@cerbyl.com - payments, receipts, cancellation and refunds.", "Privacy: privacy@cerbyl.com - data access, correction, deletion, consent and privacy questions.", "Grievances: grievance@cerbyl.com - formal consumer and unresolved service complaints."]),
            ("Grievance redressal", ["Grievance Officer: Not yet designated. This document must be updated before paid launch.", "Customer care telephone: Not yet published. This document must be updated before paid launch.", "We aim to acknowledge a grievance within 48 hours and resolve it within one month from receipt. Complex matters may require additional information, but we will keep you informed."]),
            ("Registered office", [f"{COMPANY}\n{ADDRESS}"]),
        ],
    ),
    "cerbyl-company-details.pdf": (
        "Company Details",
        "The legal entity responsible for Cerbyl and cerbyl.com is identified below.",
        [
            ("Legal entity", [f"Legal name: {COMPANY}", "Entity type: Private limited company incorporated in India", f"Corporate Identity Number: {CIN}", f"Registered office: {ADDRESS}", "Website: cerbyl.com", "General support: support@cerbyl.com"]),
            ("Notices", ["Formal notices may be sent to the registered office and copied to grievance@cerbyl.com. Payment and refund requests should be sent to billing@cerbyl.com."]),
        ],
    ),
}


def styles():
    base = getSampleStyleSheet()
    return {
        "title": ParagraphStyle("Title", parent=base["Title"], fontName="Helvetica-Bold", fontSize=27, leading=31, textColor=colors.HexColor("#171411"), alignment=TA_LEFT, spaceAfter=8),
        "meta": ParagraphStyle("Meta", parent=base["Normal"], fontName="Helvetica", fontSize=8.5, leading=12, textColor=colors.HexColor("#796A5A"), spaceAfter=18),
        "lead": ParagraphStyle("Lead", parent=base["Normal"], fontName="Helvetica", fontSize=11.5, leading=18, textColor=colors.HexColor("#3F3933"), spaceAfter=19),
        "heading": ParagraphStyle("Heading", parent=base["Heading2"], fontName="Helvetica-Bold", fontSize=12, leading=15, textColor=colors.HexColor("#1C1814"), spaceBefore=10, spaceAfter=7, keepWithNext=True),
        "body": ParagraphStyle("Body", parent=base["BodyText"], fontName="Helvetica", fontSize=9.3, leading=14.8, textColor=colors.HexColor("#4D4740"), spaceAfter=8, allowWidows=0, allowOrphans=0),
        "footer": ParagraphStyle("Footer", parent=base["Normal"], fontName="Helvetica", fontSize=7.5, leading=9, textColor=colors.HexColor("#796A5A"), alignment=TA_CENTER),
    }


def safe(text):
    return escape(text).replace("\n", "<br/>")


def page_decor(canvas, doc, title):
    width, height = A4
    canvas.saveState()
    canvas.setFillColor(colors.HexColor("#D8B38D"))
    canvas.rect(0, height - 7 * mm, width, 7 * mm, fill=1, stroke=0)
    canvas.setFillColor(colors.HexColor("#171411"))
    canvas.setFont("Helvetica-Bold", 9)
    canvas.drawString(21 * mm, height - 16 * mm, "cerbyl")
    canvas.setFillColor(colors.HexColor("#796A5A"))
    canvas.setFont("Helvetica", 7.5)
    canvas.drawRightString(width - 21 * mm, height - 16 * mm, title)
    canvas.setStrokeColor(colors.HexColor("#DED4C8"))
    canvas.line(21 * mm, 16 * mm, width - 21 * mm, 16 * mm)
    canvas.setFont("Helvetica", 7.2)
    canvas.drawString(21 * mm, 10.5 * mm, f"{COMPANY}  |  CIN {CIN}")
    canvas.drawRightString(width - 21 * mm, 10.5 * mm, f"Page {doc.page}")
    canvas.restoreState()


def build_pdf(path, title, lead, sections):
    st = styles()
    doc = BaseDocTemplate(str(path), pagesize=A4, leftMargin=21 * mm, rightMargin=21 * mm, topMargin=27 * mm, bottomMargin=23 * mm, title=title, author=COMPANY, subject=f"Cerbyl {title}")
    frame = Frame(doc.leftMargin, doc.bottomMargin, doc.width, doc.height, id="main")
    doc.addPageTemplates(PageTemplate(id="legal", frames=[frame], onPage=lambda c, d: page_decor(c, d, title)))
    story = [Spacer(1, 4 * mm), Paragraph(safe(title), st["title"]), Paragraph(f"cerbyl.com  |  Last updated {UPDATED}", st["meta"]), Paragraph(safe(lead), st["lead"])]
    for heading, paragraphs in sections:
        heading_p = Paragraph(safe(heading), st["heading"])
        body = [Paragraph(safe(p), st["body"]) for p in paragraphs]
        story.append(KeepTogether([heading_p, body[0]]))
        story.extend(body[1:])
    doc.build(story)


def main():
    for filename, (title, lead, sections) in DOCS.items():
        build_pdf(OUT / filename, title, lead, sections)
        print(OUT / filename)


if __name__ == "__main__":
    main()
