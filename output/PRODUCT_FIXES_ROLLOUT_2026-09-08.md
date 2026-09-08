# Product trust and commercial pilot release

Implemented in the working tree; not deployed. No production database, Stripe account, paid AI provider, or real user record was used for verification.

## What is included

| Requested improvement | Implementation |
| --- | --- |
| Grading and account protection | Immutable, versioned user-ID tokens; password-change/reset revocation; no detached authentication cache; exact account-scope checks; blocked profile entitlement and sign-in-email changes; server-only solo scores and replay protection; recorded practice question delivery; strict grading JSON; meaning-preserving math comparison; written-answer graders no longer use keyword/word-overlap shortcuts; question-bank resource ownership guard. |
| Try before signup | Public `/sample-course`, reached from the home hero. A prepared probability lesson with two questions, feedback, lesson reference, and registration handoff. No AI call or account is needed. |
| Practice next | Learner and student dashboard actions lead to `/practice-next`: due spaced-review cards first, then marked cards, then recorded weak topics, then the sample for empty accounts. Weak-topic practice uses three server-issued questions and records completion. |
| Sources and correction flow | Tutor source filename/title/page/excerpt now persists with each new response and survives reopening. Report controls on tutor answers, new weakness practice, solo review, and spaced-review cards. Server checks resource ownership and captures the original answer. `/answer-reports` shows review status and published corrections. The admin API-usage page contains the review queue. |
| Cohort evidence | Educator dashboard lets assigned instructors open submissions below 70%, including student answer, score, latest attempt number, and teacher feedback. It calls these possible learning gaps, not proven misconceptions. Private chats and individual practice are excluded. |
| Funnel and cost tracking | First-party sample/activation/checkout/payment/practice events; browser-to-activation attribution; seven-day return counts; per-currency payment receipts; configured per-model AI cost estimates and explicit unpriced-call counts. Admin panel: `/admin/api-usage`. |

## Deployment order

1. Back up the database. Pause application writes/workers while applying schema changes. In the backend environment, run `alembic upgrade head`. New revision: `a9f1e8c2b603`, parent `d1e5a9c73f28`. It adds `users.session_version`, `chat_messages.source_metadata`, and product-events, billing-events, answer-reports and practice-deliveries tables.
2. Release backend, web, and updated mobile together. Old username JWTs are intentionally rejected. Users must sign in again. Solo completion now accepts `{quiz_id, answers: {questionId: "zero-based option index"}}`; old clients submitting result lists must update. Uncompleted quizzes no longer expose answer keys. The updated web/mobile retrieve instant feedback from an authenticated per-question endpoint.
3. Configure and verify Stripe price IDs, secret key, webhook secret, app origin, and billing portal in the deployment environment. Existing subscriptions must have a valid future billing period to confer paid access. Run `python scripts/reconcile_billing.py` from `backend` to inspect existing subscriptions; inspect the results, then run with `--apply` to sync their current state. This script was added but **not run against Stripe**.
4. Check Stripe webhook delivery/retries after rollout. Supported subscription, checkout-completed, invoice-payment-succeeded/failed events reconcile against Stripe’s current subscription. Event IDs are recorded durably. A delayed event cannot simply replace current state with its old payload. Failed reconciliation returns an error for provider retry. An existing active subscription opens the portal instead of starting another checkout; a cancelled account can purchase again.
5. Set `ADMIN_EMAILS` to authorized operator email addresses. Profile editing cannot change the sign-in email. Staff must review reports regularly and publish specific corrected answers/references, or an explanation of why the original stands.
6. Configure `AI_MODEL_PRICES_JSON` using the **exact provider and model names in usage records**, with `input_per_million_usd`, `output_per_million_usd`, and an optional `version`. Keys look like `groq:MODEL_ID` or `gemini:MODEL_ID`; vision and `hs_context` have distinct provider names. Use your actual contracted prices. Unknown, invalid, or missing prices remain unpriced, not zero-cost. Prices are captured with each new usage event; historical events are not silently repriced.
7. Smoke-test with test-mode Stripe and disposable accounts: sign in, rename, revoke a session through password change, complete a solo quiz, retry its completion, use Practice next, report an answer, resolve it as admin, and check an assigned instructor’s evidence view versus another instructor’s denial.

## Honest limits

- This fixes concrete trust failures; it does not make generated explanations infallible or prove the product will sell.
- Written responses still use an AI judge, with a strict response contract and failure that leaves the attempt ungraded. Multiple-choice and solo grading use stored answer keys. Model quality requires representative subject-specific evaluation and instructor review.
- Existing potentially incorrect scores are not automatically rewritten. A published report resolution is visible to its learner but does not automatically regrade historical attempts, rewrite shared source questions, or propagate revised mastery. This preserves the audit trail and avoids silently changing grades.
- Old tutor messages have no newly reconstructed citations. The interface explicitly says when no reference is attached. New citations show retrieved material metadata and excerpts; they are evidence to inspect, not proof every claim is supported.
- Instructor flags use graded assignment performance and existing feedback. The database retains only the latest submission per student/assignment; this release does not invent missing attempt history or infer a diagnosis from a low score.
- The sample demonstrates the loop using prepared content. It does not demonstrate AI response quality, personalised course generation, or spaced retention over time.
- Funnel tracking starts after release. Anonymous sample events are client-reported browser IDs. Attribution is incomplete across devices and is not causal marketing attribution. “Activation” means first authenticated tracking event, not necessarily a newly created account. Seven-day return uses the first practice event within the selected window, so it is not lifetime signup-cohort retention. Quiz/practice completion is server recorded; flashcard self-reports are labelled client-origin.
- Payment receipts are not net revenue: taxes, fees, refunds and pre-release history are excluded. Cost estimates cover priced logged AI calls only. They do not include hosting, support, acquisition, media processing, cached-input discounts or unlogged providers. Do not interpret the panel as profit until those inputs are reconciled.
- Existing paid accounts lacking expiry data will fall back to Starter until reconciled. Do the reconciliation during rollout; do not silently preserve unverified paid tiers.

## Verification

- Final full web regression suite: 45 suites / 307 tests passed.
- Final focused backend verification: 102 tests passed (21 new product/migration regressions; 24 AI-workflow safety; 44 tutor/mastery; 13 answer/security/token/option checks).
- New isolated backend suite exercises real ASGI routes and SQLAlchemy, with provider calls stubbed. Coverage includes identity rename/revocation, legacy-token rejection, paid expiry, account scope, source report ownership/resolution, practice answer leakage/replay, grading failures, solo score tampering/replay, instructor section boundaries, event idempotency, cost coverage, profile privilege escalation, subscription replay/resubscription, and migration upgrade/downgrade with retained user data.
- Existing AI-workflow, grading, token usage, security, tutor and mastery regressions are run separately because some existing suites install process-global dependency stubs.
- Web production build and mobile TypeScript checks pass. Public sample was exercised in Chrome at desktop and 390-pixel width through correction and completion.
- No production payment, full production-provider deployment test, or formal security penetration test was performed.
