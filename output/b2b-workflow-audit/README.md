# Cerbyl B2B workflow audit — 11 September 2026

**The local teacher → student → teacher → student workflow passes on http://localhost:3000, backed by port 8000.** Blockers found in that audited path were fixed. This is evidence for a supervised pilot, not proof of production readiness or customer demand.

Open [the screenshot gallery](SCREENSHOTS.html), [the image folder](screenshots), [response quality review](RESPONSE-QUALITY.md), or [pilot instructions](pilot/PILOT.md).

## Verification

| Evidence | Result |
|---|---|
| Backend workflow, permissions, grading, personalization and tutor regression checks | 95 passed |
| Frontend routes, drafts, forms, sidebar, profile and timestamp checks | 50 passed |
| Chromium against real localhost:3000 / localhost:8000 accounts and database | Complete workflow passed, including injected request failures |
| Production frontend build | Compiled successfully |
| Desktop and mobile route sweep | 14 routes, 1440×1000 and 390×844; screenshots and browser-baseline.json |
| AI response sampling | 3 live probability prompts; correctness, clarity, level and latency reviewed separately |

The browser test logs in through the normal login form. It creates a teacher-owned class, enrolls two existing company students, uploads a real material, publishes an assignment, downloads the material as a student, saves a draft, reloads it, submits, sends a private message, publishes teacher feedback, and verifies the student sees the exact feedback and grade. It also navigates from Messages to Gradebook through the sidebar. No page runtime errors were recorded during the passing workflow.

The failed draft and grade requests in screenshots 05 and 09 were deliberately injected 503 responses. The test verifies the text survives and the successful retry completes. Separate backend checks verify retries after a successful server commit do not duplicate attempts or feedback notifications.

Company isolation checks use a separate company owner/teacher, another student, and revoked memberships. They cover class data, learning, submissions, history, grade export, messages, and assignment changes. A student draft file is downloadable only by its student until submitted. Checkpoint answer keys stay hidden before submission.

## Fixes made

| Severity | Issue found | Result |
|---|---|---|
| P0 | Teacher could request a private draft file directly | File access now requires student ownership or submitted work; regression verified |
| P0 | Personalization drew topic candidates from other accounts | Topic queries are scoped to the current user and request; regression verified |
| P1 | Student mastery and weighted gradebook percentages disagreed | Both use the same point/weight calculation |
| P1 | New, edited or archived assignments left stale progress | Active student progress recalculates on coursework changes, including an empty assignment set |
| P1 | Teacher could not complete class setup | Teachers can create their own class and enroll active students from their own company, atomically; owner-only administration remains restricted |
| P1 | Invalid or blank values could reach coursework/feedback | Whitespace validation, finite numbers, date ordering, required update fields and awarded-score limits enforced |
| P1 | Empty materials produced disabled student actions | Publishing requires a URL or uploaded file |
| P1 | Retrying after a lost response could consume another attempt | Identical pending submissions and identical published grades return their existing result |
| P1 | Teacher review truncated student answers to three lines | Full answers are readable; multiline feedback has adequate width; students see their published feedback at the top |
| P1 | Context header covered assignment dialogs | Dialog-containing shell stacks above the header; mobile capture verified |
| P1 | UTC timestamps without an offset were interpreted as local time | Classroom displays normalize server timestamps; attendance retains local calendar dates |
| P1 | First-turn attempted answers bypassed evaluation | Self-contained answer-check requests now reach the evaluator |
| P2 | Review load failure had no direct retry | Added a retry action |
| P2 | Resizing to mobile could leave the sidebar covering content | Sidebar collapses on entering the mobile breakpoint |
| P2 | Embedding proximity attached unrelated topics | A relevant topic word is now also required; final samples returned no unrelated topic labels |

## Design and accessibility assessment

The existing Cerbyl sidebar, graphite/gold surfaces, typography and motion template were retained. The detector flagged Inter and the existing decorative background; those are intentional requirements from the supplied design, not changes to make during this stabilization task.

| Dimension | Audit score / 4 | Evidence and limits |
|---|---:|---|
| Accessibility | 3 | Named fields, keyboard focus handling, errors and retry controls; no full screen-reader or contrast certification |
| Performance | 2 | Build succeeds and route navigation works; tutor latency is still 10–39 seconds in the final sample; no load benchmark |
| Responsive design | 3 | Mobile submission/publishing and route screenshots verified; tables and tool strips scroll horizontally within their containers |
| Theming | 3 | Shared B2C template is reused; some inherited hard-coded values remain |
| Implementation integrity | 3 | Real backend workflow and explicit loading/failure states verified; AI level metadata and pedagogy still need refinement |
| Total | 14 / 20 | Good for a supervised pilot, with the stated gaps |

These are engineering judgments for the inspected surfaces. The checks do not establish WCAG compliance, Safari support, production deployment behavior, high concurrency, or a full security audit.

## Response quality: candid conclusion

The final beginner response is clear and appropriately paced. The misconception response correctly explains 1/4 and the denominator, but repeats a question it just answered and could state more directly that 1/3 is wrong. The advanced biased-coin counterexample is correct and its weighted-die check is useful. Internal difficulty labels still sometimes remain intermediate despite the requested level. Three samples are too few to claim general AI reliability.

Do not market this as autonomous, reliably source-grounded teaching yet. Course Tutor passes material references, not automatically extracted classroom file contents. Teacher-approved checkpoints and teacher-published assignment grades are the supported audited teaching path. See RESPONSE-QUALITY.md for actual prompts, outputs, timings, and remaining work.

## Outputs and local demo

- Screenshots 01–14 show the complete workflow and failure recovery. Named teacher/student captures cover the broader route sweep.
- Final audit class and assignment IDs are recorded in workflow-results.json. It is clearly marked QA in Northstar Coaching · Demo.
- Earlier audit-only classes were archived, preserving their data; see qa-cleanup.json.
- Real pilot has **not** run. Participants and dates are pending. The suggested two-week pilot, teacher time log and read-only scorecard script are ready.
- Demo scorecard: one of two enrolled students submitted the audit assignment (50%); one active learner, zero multi-day returners; teacher time savings unknown. These are automated QA results, not business metrics.

## Reproduce

```sh
# Local demo accounts must already be installed; test only runs when explicitly enabled.
CERBYL_B2B_AUDIT=1 npx playwright test e2e/b2b-workflow.spec.js --project=chromium --reporter=line

# Isolated backend database; no live AI calls in these regression tests.
python -m pytest backend/tests/test_b2b_workflow_audit.py backend/tests/test_b2b_journey.py backend/tests/test_ml_pipeline_mastery.py backend/tests/test_tutor_response_formatting.py backend/tests/test_tutor_comprehension.py backend/tests/test_tutor_prompt_priority.py -q

# Read-only local cohort measurements, with optional instructor-entered timing data.
python backend/scripts/b2b_pilot_report.py --section-id YOUR_CLASS_ID --teacher-time-csv output/b2b-workflow-audit/pilot/teacher-time.csv --out output/real-pilot
```

No production deployment, customer invitations or real participant messages were sent. The messages exercised by the browser test belong to the local fictional demo accounts.
