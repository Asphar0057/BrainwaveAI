# Cerbyl engineering review — 5 September 2026

Assessment: substantial product functionality exists, but the current code has account-isolation, billing, classroom, and operational defects that should block a broad production rollout. Address the critical and high findings before increasing traffic or onboarding institutions.

This is a broad repository review, not an exhaustive penetration test or certification of every endpoint. It covers authentication, subscription handling, representative learning and institutional flows, web/mobile architecture, async jobs, deployment configuration, persistence, and automated checks. Findings below distinguish isolated reproductions from source-traced behavior. No production services, real accounts, payments, or existing databases were exercised. Application source was not changed.

## Verification

| Check | Result |
| --- | --- |
| Web tests: `CI=true npm test -- --watchAll=false --runInBand` | 30 suites / 253 tests passed |
| Production web build: `npm run build` | Passed with CSS ordering warning between QuizBattleSession.css and MathRenderer.css |
| Mobile: `./node_modules/.bin/tsc --noEmit` from mobile | Passed |
| Backend static security tests: `python3 -m pytest backend/tests/test_security_invariants.py -q` | 5 passed |
| Isolated execution of extracted source functions with fake dependencies | Reproduced cache identity collision, unauthorized unlimited-tier update, and attendance rejection |
| Full backend integration suite | Not run: available Python environments do not provide a complete compatible dependency environment |
| Browser/mobile device end-to-end flows | Not run |
| Live infrastructure, restore drill, provider integrations, dependency advisory scan | Not verified |

Passing tests do not override the defects below. For example, the static paid-tier test only checks for the presence of a blocking error message; the separate profile-update bypass still passes that test.

## Critical: fix first

### 1. Authentication cache can resolve a token to the wrong account

Evidence: [deps.py:224](backend/deps.py#L224), [deps.py:209](backend/deps.py#L209), [auth.py:339](backend/routes/auth.py#L339).

`_set_cached_auth_user` writes subject, numeric database ID, username, and email into one untyped string-keyed dictionary. Numeric usernames are allowed. If account A has username `123` and account B has database ID `123`, caching B overwrites the lookup key used by A's token. `_get_cached_auth_user('123')` then returns B, and the authentication path accepts that object without checking the original subject against the account.

An isolated execution of the actual cache functions reproduced this collision. Exploitability depends on the accounts and request ordering, but the identity-isolation failure itself is confirmed. Lowercasing cache keys while database username lookup is case-sensitive is an additional mismatch to resolve.

Fix: use immutable user IDs as JWT subjects, query by that ID, and key the cache by that same identity. Keep typed, canonicalized login identifier lookup separate. Invalidate existing ambiguous tokens/caches during migration. Add cross-account tests for numeric usernames, identifier collisions, and case variants.

### 2. Profile updates grant the internal unlimited subscription

Evidence: [auth.py:2090](backend/routes/auth.py#L2090), [subscription_catalog.py:80](backend/services/subscription_catalog.py#L80), [token_limits.py:117](backend/services/token_limits.py#L117).

The general `/api/update_comprehensive_profile` handler accepts `subscriptionTier`, normalizes it, and commits it directly. `unlimited` is a valid internal plan. The token-limit code treats that plan as unrestricted. The guard on `/subscription/select` does not protect this different endpoint.

With an authenticated user's own `user_id`, a payload containing `subscriptionTier: "unlimited"` reaches this write. An isolated execution reproduced the handler committing `starter → unlimited` and returning success. This is a self-service entitlement escalation, not an unauthenticated endpoint claim.

Fix: remove provider/internal entitlement fields from ordinary profile input. Only verified billing processing and a separately authorized admin operation should change them. Test every write path to subscription fields, including generic profile updates.

## High: production correctness and reliability

### 3. JWT identity follows a reusable username

Evidence: [auth.py:1044](backend/routes/auth.py#L1044), [auth.py:1508](backend/routes/auth.py#L1508), [deps.py:240](backend/deps.py#L240).

Tokens use `sub=user.username`. Renaming an account frees its old username, while an old token remains cryptographically valid. If another account acquires the old name during that token's lifetime, the token lookup resolves to the new owner. The same risk applies to deletion followed by name reuse. This is separate from the cache collision and survives disabling the cache.

Fix: immutable account ID subjects, with a token migration and revocation strategy. Verify rename/re-registration cannot change the account represented by any previously issued token. Source-traced; no real accounts were created.

### 4. Password reset does not revoke existing sessions

Evidence: [auth.py:1108](backend/routes/auth.py#L1108), [auth.py:1540](backend/routes/auth.py#L1540), [deps.py:152](backend/deps.py#L152).

Password changes and OTP resets update the password hash and evict a local user-cache entry. Token verification checks signature and claims, but no session version or password-change timestamp. A stolen bearer token remains usable until expiry; default token lifetime is eight hours. Cache invalidation is not token revocation.

Fix: a server-checked session/token version or revocable session record. Increment/revoke on reset and relevant security events. Test old-token rejection after reset and across multiple workers.

### 5. Teacher attendance updates are rejected by shared authorization

Evidence: [institution/__init__.py:16](backend/routes/institution/__init__.py#L16), [deps.py:333](backend/deps.py#L333), [attendance.py:16](backend/routes/institution/attendance.py#L16).

The institution router uses `enforce_request_user_scope`, which recursively treats each `student_id` as an identifier that must equal the caller. An educator's valid attendance payload contains the IDs of enrolled students, so the shared dependency raises 403 before the endpoint's section/enrollment authorization can run. An isolated execution with teacher ID 101 and enrolled-student ID 202 reproduced the rejection.

Fix: distinguish the acting identity from target resources. Retain the endpoint's educator, instructor, and enrollment checks; replace the inappropriate blanket self-only scope rule for this operation. Test both valid teacher writes and cross-section denial through the complete ASGI stack.

### 6. AI jobs can be lost when a worker crashes

Evidence: [ai_job_queue.py:147](backend/services/ai_job_queue.py#L147), [ai_job_queue.py:110](backend/services/ai_job_queue.py#L110), [worker.py:358](backend/worker.py#L358), [ai_jobs.py:512](backend/routes/ai_jobs.py#L512).

`BLPOP` removes a job before processing. There is no processing-list acknowledgement, visibility lease, or stale-running recovery in the inspected worker. A worker killed after dequeue can leave a database job queued or running with no queue message. Running jobs cannot be cancelled through the cancellation route. Retry promotion separately removes from the sorted set before pushing to the ready list, creating another loss window.

Fix: an acknowledged queue with recovery, atomic retry promotion, worker leases/heartbeats, and reconciliation for orphaned jobs. Atomically claim jobs and make execution idempotent. Verify by killing a worker immediately after claim and during provider execution, not just by testing caught exceptions.

### 7. Real-time notifications cannot reliably span production workers

Evidence: [websocket_manager.py:8](backend/services/websocket_manager.py#L8), [Dockerfile.production:25](aws-deployment/Dockerfile.production#L25), [backend/Dockerfile:28](backend/Dockerfile#L28).

Connections live in a process-local dictionary, while both backend Dockerfiles start four Gunicorn workers. A battle request handled by a different worker from the recipient's socket cannot find that connection. The dictionary also stores only one socket per user, so another tab/device replaces the first connection's delivery target.

Fix: shared event transport such as Redis pub/sub, with each process delivering to its local connection set. Support multiple connections per user. Test notifications across separate workers and simultaneous web/mobile sessions.

### 8. Active battle APIs expose answer keys and trust client timing

Evidence: [battles.py:643](backend/routes/battles.py#L643), [battles.py:873](backend/routes/battles.py#L873), [battle_rules.py:17](backend/services/battle_rules.py#L17), [battle_rules.py:136](backend/services/battle_rules.py#L136).

Battle detail and question generation return `correct_answer` and explanations before the participant finishes. Server-side rescoring is present, but a participant can read the answer key and submit the right choices. Speed-mode tie breaking reads client-supplied timing preserved in the answer snapshot, allowing timing manipulation too.

Fix: separate question-delivery DTOs from post-submission review DTOs. Store server-observed start/submission times and enforce battle lifecycle/deadlines. Test that active question responses contain no answer key and that fabricated timing cannot affect the winner.

### 9. SQLite corruption recovery silently starts an empty application database

Evidence: [database.py:49](backend/database.py#L49), [database.py:83](backend/database.py#L83).

On corruption detection, startup quarantines the database and sidecars, creates a fresh database, and continues. Original files are retained, but users see an empty system and later writes diverge from the recoverable data. There is no production-specific opt-in guard around this behavior.

Fix: fail readiness, alert, preserve evidence, and restore through an explicit recovery procedure. Automatic empty-database creation should be limited to disposable environments. This finding applies to SQLite deployments, not a confirmed production PostgreSQL outage.

## Medium: product integrity and maintainability

### 10. Profile fields can report success without persisting

Evidence: [deps.py:206](backend/deps.py#L206), [auth.py:2030](backend/routes/auth.py#L2030), [auth.py:2120](backend/routes/auth.py#L2120).

Cache hits produce fresh transient ORM `User` objects. The general profile handler mutates username, name, email, and field of study on that object, then commits without loading or attaching the user to the request session. The router's earlier authentication lookup normally warms this cache. Changes to the separately queried comprehensive profile persist, while user-table changes may not. A username-change response can even issue a token for a name not saved in the database.

Fix: load the user by authenticated immutable ID in the write transaction, update an explicit field allowlist, and invalidate caches after commit. Require verification for email changes. Test save/reload with both warm and cold caches. Source-traced; ORM integration reproduction remains outstanding.

### 11. Billing processing lacks durable event ordering and entitlement lifecycle rules

Evidence: [subscription.py:458](backend/routes/subscription.py#L458), [subscription.py:269](backend/routes/subscription.py#L269), [subscription.py:319](backend/routes/subscription.py#L319), [token_limits.py:117](backend/services/token_limits.py#L117).

The webhook handler verifies signatures, which is good, but applies event objects without recording a processed event ID or rejecting stale state transitions. Applying an older subscription update after cancellation can restore the older plan/status. Entitlement resolution reads the tier without evaluating subscription status/current-period expiry; payment failure records `grace` without a bounded grace policy in these enforcement paths.

Fix: persist an event ledger, serialize updates per billing identity, reconcile current subscription state, and define explicit active/trial/grace/expired entitlement rules. Test duplicate and reversed event sequences and grace expiry. Verify actual provider behavior in a billing test environment before release.

### 12. Assignment AI policy is stored and displayed but not enforced

Evidence: [schemas.py:14](backend/routes/institution/schemas.py#L14), [assignments.py:334](backend/routes/institution/assignments.py#L334), [InstitutionClassroomPage.js:314](src/pages/InstitutionClassroomPage.js#L314).

Repository search finds `ai_policy` in models, migrations, seeds, classroom serialization, editing, and display. No inspected tutor/generation authorization consumes it. Teachers can select `restricted`, but students retain the general AI paths without assignment-aware enforcement.

Fix: decide whether this is advisory guidance or a product restriction. Label advisory behavior clearly; if enforced, attach assignment context to requests and apply the policy on the server. Do not imply the app can prevent students using external AI tools.

### 13. Institutional progress can become stale after assignment changes

Evidence: [assignments.py:413](backend/routes/institution/assignments.py#L413), [assignments.py:440](backend/routes/institution/assignments.py#L440), [helpers.py:300](backend/routes/institution/helpers.py#L300).

Assignment editing/archiving changes publication status, points, and weights without recomputing affected enrollment progress/mastery. `_recalculate_enrollment` returns when no published assignments remain and leaves old mastery untouched when there are no graded results. Existing grades can also exceed newly reduced points. Gradebook and cached dashboard metrics can disagree.

Fix: specify grading/progress semantics, recompute or invalidate aggregates after relevant assignment/submission changes, and reset empty aggregates explicitly. Test archive-last-assignment, change-points-after-grading, and graded resubmission scenarios.

### 14. CI does not enforce the checks this project needs

Evidence: [test-frontend.yml:1](.github/workflows/test-frontend.yml#L1), [test_security_invariants.py:83](backend/tests/test_security_invariants.py#L83), [smoke.spec.js:6](e2e/smoke.spec.js#L6), [mobile/package.json:5](mobile/package.json#L5).

The only checked-in workflow is path-filtered to frontend files and runs one service test file plus a build. It does not run the full 253-test web suite, backend behavior tests, migration checks, institutional integration flows, or mobile typechecking. The sole Playwright smoke test only asserts a visible body. Static string/AST security checks cannot detect behavioral bypasses such as finding 2.

Fix: add full web tests, mobile typecheck, backend tests against disposable databases, migration-from-empty/upgrade checks, and authenticated end-to-end flows. Prioritize account isolation, billing, teacher attendance, submission/grade propagation, and job recovery. Trigger CI on the relevant backend/mobile/deployment/workflow paths.

### 15. Mobile does not implement the role-aware workspace contract

Evidence: [mobile/App.tsx:19](mobile/App.tsx#L19), [mobile/App.tsx:63](mobile/App.tsx#L63), [mobile/auth.ts:5](mobile/src/services/auth.ts#L5), [PRODUCT.md](PRODUCT.md).

Mobile's user type and root navigation route authenticated users through the profile quiz into the common learner tabs. There is no student/educator workspace selection in that flow. The product document says each account is routed to its server-authoritative role workspace. An institutional user can therefore authenticate into a mobile experience that does not fulfill that promise.

Fix: explicitly scope mobile to learners with a clear alternative for institutional users, or implement server-role-aware institutional navigation. Test all three roles on each supported platform.

## Structural gaps to address alongside fixes

- **Oversized feature modules:** Flashcards.js has 4,452 lines, NotesRedesign.js 4,436, AIChat.js 4,023, and auth.py 2,361. State, network calls, rendering, and business logic are difficult to isolate. Extract along feature/use-case boundaries as fixes land; a framework rewrite is not necessary.
- **Weak static guardrails:** package.json disables exhaustive hook dependency checking and several bug-detecting lint rules globally. Re-enable selectively with reviewed, local exceptions. Resolve the observed CSS ordering conflict with explicit ownership/scoping.
- **Reproducibility:** many backend dependencies remain unpinned or minimum-only despite a few exact pins; no backend lockfile was found. Use a reproducible resolved dependency set and verify clean builds. No specific current CVE claim is made in this review.
- **Repository hygiene:** several Chroma SQLite databases are tracked, including backend/chroma_db/chroma.sqlite3. Their contents were not inspected, so this is not a claim of leaked personal data. Replace runtime stores with deliberate sanitized fixtures/seed inputs and stop tracking generated databases.
- **Institution query shape:** `_accessible_section` eagerly joins enrollments/students and assignments/submissions even for targeted operations. Multiple collection joins can multiply rows substantially as classes grow. Fetch authorization facts cheaply, then load only data needed by that endpoint; benchmark representative large classes.
- **Operational proof:** health checks, backup scripts, retry/dead-letter helpers, and deployment runbooks exist. Their presence does not establish recovery. Run restore drills, worker-kill tests, multiple-worker socket tests, and agreed load targets in staging. Review alert coverage for these exact failure modes.
- **AI quality proof:** answer validation, tutor formatting tests, mastery tests, and RAG checks exist. This review did not establish a CI-gated end-to-end quality benchmark for citation correctness, unsupported answers, curriculum fit, and cross-user retrieval isolation. Establish a fixed evaluation set before treating model/prompt changes as safe.

## Recommended delivery order

1. Close both critical findings; migrate identity handling, revoke affected sessions, and audit entitlement writes. Verify with actual authenticated multi-user integration tests.
2. Repair attendance, token revocation, battle answer exposure, and cached profile writes. Add those regressions to CI.
3. Introduce recoverable job processing and cross-worker real-time delivery; exercise crash/reconnect scenarios in staging.
4. Complete billing state handling, institutional aggregate consistency, and explicit AI-policy/mobile-role behavior.
5. Expand release checks, lock backend dependencies, and reduce large modules incrementally while maintaining behavior tests.

Existing strengths worth preserving: Argon2 password hashing, signed JWT issuer/audience validation, server-side role helpers, ownership checks in sampled resource routes, HTML sanitization, server-side battle answer rescoring, migrations, health endpoints, queue retry support, and a passing web test suite. The main issue is inconsistent enforcement and integration across an already broad feature set.
