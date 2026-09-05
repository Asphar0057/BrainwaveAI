# AI workflow fixes

Implemented the six requested findings. This document does not claim to resolve every item in the broader project review.

| Finding | Change |
| --- | --- |
| Failures treated as answers | Graph errors propagate as explicit failures; chat routes reject failed/empty generation before successful message/reward handling. Workers reject error-shaped results. Quota failures retain HTTP 429; other generation failures return HTTP 503. |
| Substring grading | Removed the hardcoded calculus shortcut. The grader receives the complete answer and actual tutor step. Uncertain or invalid evaluations do not advance progress or affect mastery. |
| Conversational mastery changes | BKT and tutor performance counters update from graded attempts only. Confidence/confusion remain diagnostic signals. DKT training and recency queries exclude conversational signals. |
| Selected-document grounding | Selected documents enforce grounding independently of the HS curriculum toggle, including fallback and no-match handling. |
| Personalized global cache | API rejects global scope; chat generation bypasses semantic response caching, including old queued requests. Cache metadata also forces user isolation for chat. |
| Job reliability | Atomic database claims, worker heartbeats, expired-worker recovery, acknowledged Redis delivery, atomic retry promotion, and reconciliation of unpublished database jobs. Uploads must finish before file jobs become runnable. Cancellation cannot overwrite a running claim. Frontend follows persistent status beyond three minutes, reconnects after transient errors, and resumes by account/chat using local records and server discovery. |

## Validation

- 114 backend tests passed across focused tutor, grounding, mastery, DKT, route, worker, and queue suites. Redis delivery tests used an isolated real Redis process.
- Full frontend suite passed: 258 tests. The subsequently extended job service suite passed separately (6 tests).
- Production frontend build passed with a CSS ordering warning involving QuizBattleSession.css and MathRenderer.css.
- No real paid provider calls or production database changes were used for validation. These tests check workflow contracts; they do not establish that an LLM grader is always correct.

## Rollout and limits

Deploy the backend, worker, and frontend changes together. Stop old workers before starting the heartbeat-enabled workers; mixed old/new workers can cause old work to appear abandoned. No new database columns are required.

Queue execution is at least once. A crash after an external provider call or application side effect but before the completion commit can repeat that work on recovery; atomic claims prevent ordinary concurrent duplicate delivery, not every crash-window side effect. Long-lived file jobs need storage accessible to the worker, as before.

Existing historical mastery values and previously trained model weights are not automatically repaired. Retrain learning models on the filtered evidence and assess whether historical mastery needs rebuilding before relying on it for learner decisions.
