import { useEffect } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { ArrowLeft, ArrowUpRight, Mail, MapPin } from 'lucide-react';
import './LegalPage.css';

const LAST_UPDATED = '5 September 2026';
const COMPANY = {
  legalName: 'CERBYL TECHNOLOGIES PRIVATE LIMITED',
  cin: 'U62010TS2026PTC212247',
  address: 'Dalhousie 11A, Type 2, Hill County, Nizampet, Qutubullapur, Hyderabad – 500090, Telangana, India',
  support: 'support@cerbyl.com', billing: 'billing@cerbyl.com',
  privacy: 'privacy@cerbyl.com', grievance: 'grievance@cerbyl.com',
  grievanceOfficer: process.env.REACT_APP_GRIEVANCE_OFFICER || '',
  customerCarePhone: process.env.REACT_APP_CUSTOMER_CARE_PHONE || '',
};

const DOCUMENTS = [
  { path: '/terms-and-conditions', short: 'Terms', title: 'Terms and Conditions' },
  { path: '/privacy-policy', short: 'Privacy', title: 'Privacy Policy' },
  { path: '/refund-and-cancellation-policy', short: 'Refunds', title: 'Refund and Cancellation Policy' },
  { path: '/service-delivery-policy', short: 'Delivery', title: 'Service Delivery Policy' },
  { path: '/contact', short: 'Contact', title: 'Contact and Grievance Details' },
  { path: '/company-details', short: 'Company', title: 'Company Details' },
];

const MailLink = ({ email }) => <a href={`mailto:${email}`}>{email}</a>;
const Section = ({ title, children }) => <section className="legal-section"><h2>{title}</h2>{children}</section>;

function Terms() {
  return <>
    <p className="legal-lead">These Terms govern your access to Cerbyl's websites, applications, AI-assisted learning tools and related services (the “Services”). By creating an account, purchasing a plan, or using the Services, you agree to these Terms.</p>
    <Section title="1. Who operates Cerbyl"><p>The Services are operated by {COMPANY.legalName}, a company incorporated in India. Our registered address and contact information appear on the <Link to="/company-details">Company Details</Link> page.</p></Section>
    <Section title="2. Eligibility and accounts"><p>You must provide accurate information, keep your credentials confidential, and promptly tell us about suspected unauthorised access. If you are under 18, you may use Cerbyl only with the involvement and verifiable consent of a parent or lawful guardian. A parent or guardian who permits use is responsible for supervising the account and accepting these Terms on the child's behalf.</p><p>You may not sell, transfer, share, or misuse an account. We may require verification and may suspend an account where information is false, security is at risk, or these Terms are breached.</p></Section>
    <Section title="3. Plans, payments and renewals"><p>Plan features, billing period, currency, price, applicable taxes and whether a subscription renews automatically will be shown before you pay. If you choose auto-renewal, you authorise the displayed recurring charge until cancellation. Your bank, card issuer or payment provider may apply currency conversion, cross-border or other charges that we do not control.</p><p>Payments are processed by third-party payment providers. Cerbyl does not store complete card credentials. A failed or reversed payment may result in plan suspension or reversion to a free plan. We may change future prices or plan features after giving reasonable notice; an increase will not be charged before the next renewal disclosed to you.</p></Section>
    <Section title="4. Cancellation and refunds"><p>You can cancel a recurring subscription through the account billing controls or by emailing <MailLink email={COMPANY.billing} />. Cancellation stops future renewals and ordinarily leaves paid access active until the end of the current billing period. Refund eligibility is governed by our <Link to="/refund-and-cancellation-policy">Refund and Cancellation Policy</Link> and mandatory law.</p></Section>
    <Section title="5. Educational and AI-generated content"><p>Cerbyl is a study and productivity service, not an accredited educational institution. AI-generated answers, notes, quizzes, summaries, recommendations and other outputs may be incomplete or inaccurate. You must independently verify important information. The Services do not provide medical, legal, financial, mental-health or other professional advice and do not guarantee grades, admissions, employment or any learning outcome.</p></Section>
    <Section title="6. Your content"><p>You retain ownership of content you submit. You give us a limited, worldwide, non-exclusive licence to host, copy, process, transform and display that content only as needed to operate, secure, improve and provide the Services, follow your sharing choices, and comply with law. You confirm you have the rights and permissions needed to submit the content.</p><p>Content you intentionally publish or share may be accessible to others through the selected sharing controls. Remove sharing or delete the content if you no longer want it available, subject to reasonable caching, backups and legal retention.</p></Section>
    <Section title="7. Acceptable use"><p>You must not use Cerbyl to break the law; infringe privacy or intellectual-property rights; harass, exploit or endanger another person; upload malware; bypass usage, safety or access controls; scrape or reverse engineer the Services except where law permits; automate abusive requests; impersonate others; or submit content you have no right to use. You must not use AI output to facilitate cheating or academic misconduct.</p></Section>
    <Section title="8. Cerbyl intellectual property"><p>The Services, software, branding, designs and company-created materials belong to Cerbyl or its licensors. Except for the limited right to use the Services under these Terms, no intellectual-property rights are transferred to you.</p></Section>
    <Section title="9. Availability and changes"><p>We work to keep Cerbyl available, but uninterrupted or error-free operation is not guaranteed. We may maintain, update, add, remove or discontinue features. If we discontinue a paid Service before the end of a paid term, we will provide an appropriate remedy such as continued access, migration where practical, or a proportionate refund, as required by law.</p></Section>
    <Section title="10. Suspension and termination"><p>We may restrict or terminate access for material or repeated breach, fraud, abuse, security risk, non-payment, or legal necessity. Where reasonably possible, we will give notice and an opportunity to remedy the issue. You may stop using Cerbyl and request account deletion at any time. Provisions that by nature should survive termination—including ownership, payment obligations, disclaimers and liability limits—will survive.</p></Section>
    <Section title="11. Disclaimers and liability"><p>To the maximum extent permitted by law, the Services are provided on an “as available” basis without implied warranties. Cerbyl is not liable for indirect, incidental, special, punitive or consequential loss, or loss of data, profits or opportunity, arising from use of the Services.</p><p>To the maximum extent permitted by law, Cerbyl's total liability for a claim will not exceed the amount you paid Cerbyl for the Services during the 12 months before the event giving rise to the claim. Nothing in these Terms excludes liability or consumer rights that cannot lawfully be excluded or limited.</p></Section>
    <Section title="12. Indemnity"><p>If you use the Services on behalf of a business or organisation, that entity will indemnify Cerbyl against third-party claims arising from its unlawful content, misuse of the Services or material breach of these Terms, except to the extent caused by Cerbyl. This clause does not reduce non-waivable consumer rights.</p></Section>
    <Section title="13. Governing law and disputes"><p>These Terms are governed by Indian law. Please first contact <MailLink email={COMPANY.grievance} /> so we can try to resolve the matter. Subject to any mandatory consumer forum or other non-waivable jurisdiction, courts at Hyderabad, Telangana will have jurisdiction.</p></Section>
    <Section title="14. Changes to these Terms"><p>We may update these Terms for legal, security or product reasons. We will post the revised version and update the date above. For material changes, we will provide reasonable notice through email, the Services or another effective method. Continued use after the effective date constitutes acceptance where permitted by law.</p></Section>
  </>;
}

function Privacy() {
  return <>
    <p className="legal-lead">This Policy explains what personal data Cerbyl processes, why we process it, how it is used and shared, and the choices available to you.</p>
    <Section title="1. Data fiduciary and contact"><p>{COMPANY.legalName} determines how personal data is processed for the Services. Privacy questions and rights requests may be sent to <MailLink email={COMPANY.privacy} />. Complaints may be sent to <MailLink email={COMPANY.grievance} />.</p></Section>
    <Section title="2. Personal data we collect"><ul><li><strong>Account data:</strong> name, email address, phone number, username, profile photo, login provider, age or age range, school or university and learning preferences you provide.</li><li><strong>Learning and content data:</strong> prompts, chats, notes, files, recordings, flashcards, quizzes, answers, scores, study history, mastery signals, feedback and content you share.</li><li><strong>Transaction data:</strong> plan, billing status, payment-provider references, transaction amount, currency, timestamps and limited payment-method details such as brand and last digits. We do not receive or store complete card numbers or security codes.</li><li><strong>Device and usage data:</strong> IP address, device and browser type, identifiers, logs, feature interactions, crash and performance data, referral pages and approximate location derived from IP.</li><li><strong>Communications:</strong> support, billing, privacy and grievance messages and our responses.</li><li><strong>Cookies and similar technologies:</strong> data needed for authentication, preferences, security, analytics and—only where enabled and permitted—marketing measurement.</li></ul></Section>
    <Section title="3. Why we process personal data"><ul><li>create and secure accounts, verify contact details and authenticate users;</li><li>provide, personalise and remember your learning experience;</li><li>generate requested AI content and retrieve relevant prior learning context;</li><li>process purchases, manage subscriptions, send receipts and prevent fraud;</li><li>operate social, sharing, classroom and collaboration features you choose to use;</li><li>respond to support and rights requests, and send essential service notices;</li><li>measure reliability and improve features, models, safety and user experience using appropriate safeguards;</li><li>enforce our Terms, protect users and comply with legal obligations.</li></ul><p>Where consent is the applicable basis, you may withdraw it as easily as you gave it. Withdrawal does not affect earlier lawful processing and may make a requested feature unavailable.</p></Section>
    <Section title="4. AI processing"><p>Content you submit to AI features is processed to produce the output you request and, where applicable, to retrieve context from your prior activity. Do not submit highly sensitive information that is unnecessary for learning. We may use vetted service providers to process prompts and outputs on our behalf under contractual restrictions.</p></Section>
    <Section title="5. How we share data"><p>We share personal data only as reasonably necessary with hosting, database, communications, authentication, analytics, customer-support, AI and payment providers acting for us; with an institution or workspace administrator when you join an organisation-managed workspace; with other users when you choose to share; during a merger, financing or sale subject to appropriate protection; or where required to protect rights, safety and comply with law.</p><p>We do not sell personal data. We do not permit payment providers to use transaction data for Cerbyl's advertising.</p></Section>
    <Section title="6. International processing"><p>Some providers or team members may process data outside India. Where this occurs, we use contracts, access controls and other safeguards appropriate to the data and comply with restrictions notified under applicable Indian law.</p></Section>
    <Section title="7. Retention"><p>We retain account and learning data while your account is active and for a reasonable period afterwards to provide restoration, security and dispute support. Payment, tax, fraud-prevention and compliance records may be retained for the period required by law. We delete or anonymise personal data when it is no longer needed for its stated purpose, subject to legal obligations, backups and the resolution of disputes.</p></Section>
    <Section title="8. Security"><p>We use reasonable technical and organisational safeguards designed to protect personal data, including access restrictions, encrypted transport, authentication controls, logging and service-provider review. No system is completely secure. If you believe your account or data is at risk, contact <MailLink email={COMPANY.support} /> promptly.</p></Section>
    <Section title="9. Your choices and rights"><p>Subject to applicable law, you may ask to access a summary of your personal data and its processing, correct or update inaccurate data, erase data no longer needed, withdraw consent, close your account, and nominate another person to exercise rights in the circumstances allowed by law. You may also seek grievance redressal.</p><p>Send a request from your registered email to <MailLink email={COMPANY.privacy} />. We may verify your identity before acting. You may unsubscribe from promotional email using its link; essential account, security, billing and legal notices will still be sent.</p></Section>
    <Section title="10. Children"><p>Cerbyl is designed for learning, but a user under 18 must use it only with verifiable consent and involvement of a parent or lawful guardian. We do not knowingly target behavioural advertising to children. A parent or guardian may contact <MailLink email={COMPANY.privacy} /> to review or request deletion of a child's data.</p></Section>
    <Section title="11. Cookies"><p>Strictly necessary cookies support login, security and core preferences. Analytics or marketing technologies, if used, will be described through the relevant notice or consent control. Browser settings can limit cookies, but blocking necessary cookies may prevent parts of Cerbyl from working.</p></Section>
    <Section title="12. Updates and complaints"><p>We may update this Policy and will post the new date above. Material changes will receive reasonable notice. Please raise a complaint first with <MailLink email={COMPANY.grievance} /> so we can investigate. This does not prevent you from approaching a competent regulator or authority when available under applicable law.</p></Section>
  </>;
}

function Refunds() {
  return <>
    <p className="legal-lead">This Policy applies to paid Cerbyl digital subscriptions and one-time digital purchases made directly from Cerbyl.</p>
    <Section title="1. Cancel at any time"><p>You may cancel a recurring plan through the billing controls in your account or by emailing <MailLink email={COMPANY.billing} /> from your registered email. Cancellation stops the next renewal. Unless a refund is approved, you keep access until the end of the paid billing period.</p></Section>
    <Section title="2. First-purchase refund window"><p>You may request a refund within 7 calendar days after your first purchase of a paid Cerbyl plan if the account has not made substantial use of paid features, credits or generated content. We assess substantial use reasonably using account activity and the nature of the plan. Renewals, plan upgrades and repeat purchases are not covered by this voluntary first-purchase window.</p></Section>
    <Section title="3. Other eligible cases"><p>We will investigate and, where verified, refund or otherwise correct duplicate charges, a charged transaction where paid access was not delivered because of a Cerbyl error, or an unauthorised payment reported promptly. Your bank or payment provider may require additional verification.</p></Section>
    <Section title="4. Normally non-refundable"><p>Except where this Policy or law requires otherwise, fees are not refundable or prorated for unused time after the 7-day window, change of mind after substantial use, failure to cancel before a disclosed renewal, partial billing periods, unused credits, account suspension caused by a breach, exchange-rate movements, or bank and payment-provider fees not retained by Cerbyl.</p></Section>
    <Section title="5. How to request a refund"><p>Email <MailLink email={COMPANY.billing} /> with your registered email address, transaction ID, payment date, amount and reason. Do not send full card details, passwords or OTPs. We ordinarily acknowledge the request within 2 business days and aim to decide it within 7 business days.</p></Section>
    <Section title="6. Approved refunds"><p>Approved refunds are sent to the original payment method. Cerbyl will initiate the refund promptly; the bank, card network or payment provider may take an additional 5–10 business days to display it. International settlement and conversion differences are controlled by the payment provider.</p></Section>
    <Section title="7. Consumer rights"><p>Nothing in this Policy limits a refund, remedy or consumer right that cannot be excluded under applicable law. If a payment dispute is unresolved, contact our grievance channel at <MailLink email={COMPANY.grievance} />.</p></Section>
  </>;
}

function Delivery() {
  return <>
    <p className="legal-lead">Cerbyl supplies digital services only. No physical goods are shipped under the plans described on cerbyl.com.</p>
    <Section title="1. Free account delivery"><p>A free account is activated after the required email, phone or identity verification is completed. Some features may require profile setup, permissions or joining a workspace.</p></Section>
    <Section title="2. Paid plan delivery"><p>Paid access is ordinarily activated automatically within a few minutes after our payment provider confirms a successful transaction. The active plan and billing period will appear in your account. A receipt or payment confirmation will be sent to the registered email by Cerbyl or the payment provider.</p></Section>
    <Section title="3. Delays"><p>Bank authentication, risk review, payment-provider downtime, an incomplete payment, or account mismatch may delay activation. If payment was debited but access is not active within 24 hours, email <MailLink email={COMPANY.billing} /> with the transaction reference and registered email. Do not send a card number, CVV, password or OTP.</p></Section>
    <Section title="4. Service access"><p>Digital delivery requires a compatible device, supported browser and internet connection. Availability may be affected by maintenance, third-party infrastructure, legal restrictions or events outside reasonable control. Planned material maintenance will be communicated where practical.</p></Section>
    <Section title="5. Failed delivery"><p>If Cerbyl cannot deliver paid access because of a verified Cerbyl error, we will restore access, extend the paid term, or issue an appropriate refund under the <Link to="/refund-and-cancellation-policy">Refund and Cancellation Policy</Link>.</p></Section>
  </>;
}

function ContactCard({ title, email, copy }) {
  return <a className="legal-contact-card" href={`mailto:${email}`}><Mail size={18} aria-hidden="true" /><span><strong>{title}</strong><small>{copy}</small><em>{email} <ArrowUpRight size={13} /></em></span></a>;
}

function AddressBlock() {
  return <address className="legal-address"><MapPin size={18} aria-hidden="true" /><span><strong>{COMPANY.legalName}</strong>{COMPANY.address}</span></address>;
}

function Contact() {
  return <>
    <p className="legal-lead">Use the address that matches your request so it reaches the right queue. Never email passwords, OTPs or complete card details.</p>
    <div className="legal-contact-grid"><ContactCard title="Customer support" email={COMPANY.support} copy="Account access, product help, safety and technical issues." /><ContactCard title="Billing" email={COMPANY.billing} copy="Payments, receipts, subscription cancellation and refund requests." /><ContactCard title="Privacy" email={COMPANY.privacy} copy="Data access, correction, deletion, consent and privacy questions." /><ContactCard title="Grievances" email={COMPANY.grievance} copy="Formal consumer and unresolved service complaints." /></div>
    <Section title="Grievance redressal"><p><strong>Grievance Officer:</strong> {COMPANY.grievanceOfficer || 'To be designated before paid launch'}</p><p><strong>Email:</strong> <MailLink email={COMPANY.grievance} /></p><p><strong>Customer care telephone:</strong> {COMPANY.customerCarePhone || 'To be published before paid launch'}</p><p>We aim to acknowledge a grievance within 48 hours and resolve it within one month from receipt. Complex matters may require additional information, but we will keep you informed.</p></Section>
    <Section title="Registered office"><AddressBlock /></Section>
  </>;
}

function CompanyDetails() {
  return <>
    <p className="legal-lead">The legal entity responsible for Cerbyl and cerbyl.com is identified below.</p>
    <div className="legal-facts"><div><span>Legal name</span><strong>{COMPANY.legalName}</strong></div><div><span>Entity type</span><strong>Private limited company incorporated in India</strong></div><div><span>Corporate Identity Number</span><strong>{COMPANY.cin}</strong></div><div><span>Registered office</span><strong>{COMPANY.address}</strong></div><div><span>Website</span><strong>cerbyl.com</strong></div><div><span>General support</span><strong><MailLink email={COMPANY.support} /></strong></div></div>
    <Section title="Notices"><p>Formal notices may be sent to the registered office and copied by email to <MailLink email={COMPANY.grievance} />. Payment and refund requests should be sent to <MailLink email={COMPANY.billing} />.</p></Section>
  </>;
}

const CONTENT = { '/terms-and-conditions': Terms, '/privacy-policy': Privacy, '/refund-and-cancellation-policy': Refunds, '/service-delivery-policy': Delivery, '/contact': Contact, '/company-details': CompanyDetails };

export default function LegalPage() {
  const { pathname } = useLocation();
  const current = DOCUMENTS.find((item) => item.path === pathname) || DOCUMENTS[0];
  const Content = CONTENT[current.path] || Terms;
  useEffect(() => { document.title = `${current.title} | Cerbyl`; window.scrollTo(0, 0); }, [current.title]);
  return <div className="legal-page"><header className="legal-header"><Link className="legal-brand" to="/" aria-label="Cerbyl home"><span aria-hidden="true" />cerbyl</Link><Link className="legal-back" to="/"><ArrowLeft size={15} />Back to Cerbyl</Link></header><div className="legal-layout"><aside className="legal-sidebar" aria-label="Legal documents"><p>Legal</p><nav>{DOCUMENTS.map((item) => <NavLink key={item.path} to={item.path}>{item.short}</NavLink>)}</nav></aside><main className="legal-document"><div className="legal-title-block"><p>cerbyl.com</p><h1>{current.title}</h1><span>Last updated {LAST_UPDATED}</span></div><Content /></main></div><footer className="legal-footer"><span>© 2026 {COMPANY.legalName}</span><span>CIN {COMPANY.cin}</span></footer></div>;
}
