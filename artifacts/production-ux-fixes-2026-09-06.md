# Production UX fixes — 6 September 2026

Implemented changes for all 44 findings from the original review. This is an implementation and regression record, not unrestricted production certification.

## Validation

- Production build: `CI=true npm run build` passed.
- Web tests: **278 passed across 36 suites**, `CI=true npm test -- --watchAll=false --runInBand`.
- Native TypeScript: `mobile/node_modules/.bin/tsc --noEmit -p mobile/tsconfig.json` passed.
- Backend: 2 score-normalization regressions passed; modified Python modules compile.
- ESLint: 0 errors. Two pre-existing unreachable-code warnings remain in FriendsDashboard and PlaylistsPage.
- `git diff --check` passed.
- Browser: Aditya Chrome profile, localhost:3000; desktop and 375 × 812 viewport. Checked dashboard, Notes drawer, profile, landing, missing route, analytics, flashcard queue, ContextHub, canvas, avatar dialog, public missing link, slides, maps and saved media notes. Browser checks used existing data without publishing grades or sending messages.
- Impeccable static detector ran once over src. It reported 749 pattern findings (572 font, 14 easing, 30 geometric background, 45 sidebar, 65 layout transition, 23 gradient text). The existing visual identity was retained. This detector result is not treated as a clean accessibility pass.

## Finding-by-finding changes

| Finding | Change | Verification |
| --- | --- | --- |
| UX-01 (P1) | Commit selections immediately; submit one immutable answer snapshot. | New quiz regressions: final selection and delayed sequential submission. |
| UX-02 (P1) | Keep account-scoped note recovery buffers; serialize saves and ignore outgoing-note UI updates. | New note remount recovery regression; existing Notes suite. |
| UX-03 (P1) | Keep only changed grade drafts and update the saved student row without reloading other drafts. | New two-student grade regression. |
| UX-04 (P1) | Convert UTC deadlines to local input values and label the displayed time zone. | New date round-trip regression. |
| UX-05 (P1) | Persist profile recovery drafts, queue the latest pending edit, and expose saving/error/retry state. | New deferred-request profile regression; profile suite and browser. |
| UX-06 (P1) | Guard web and native chat responses by conversation version; reset switching state. | Source review, native type check, web build. |
| UX-07 (P1) | Scope canvases to the account; expose browser-only storage, PNG export and Add to Notes recovery; surface quota failures. | Canvas browser smoke check; account-scoped storage regression. See legacy-data limitation. |
| UX-08 (P1) | Use a narrow-screen overlay drawer with focus containment, background inert state and Escape dismissal. | 375px Notes: drawer 280px, content 285px, no document overflow, Escape verified. |
| UX-09 (P1) | Make auth navigation actual links and social cards keyboard reachable; include password controls in tab order. | Source and web lint/build. |
| UX-10 (P1) | Advance spaced reviews only after persistence succeeds; disable pending grades and offer queue retry. | Flashcards suite; browser queue load. |
| UX-11 (P1) | Keep native spaced/MCQ review on the current card when persistence fails. | Native type check and source review; device runtime pending. |
| UX-12 (P1) | Return an unsuccessful save result while native note persistence is already pending, preventing premature Back navigation. | Native type check and source review; device runtime pending. |
| UX-13 (P1) | Persist assignment, announcement and submission text drafts; prevent dismissal during saves and protect unsaved file attachments. | New assignment remount and stable-focus regression; classroom tests. |
| UX-14 (P1) | Start challenge countdown only after loading/generation ends; pause it during errors and submission. | Source review and build. |
| UX-15 (P1) | Normalize historical quiz scores to percentages before averaging; preserve zero results. | Two backend regressions for mixed quiz lengths, zero and invalid values. |
| UX-16 (P1) | Checkpoint quiz answers, position and original start time; retain failed attempts and retry saving. | New remount and failed-save quiz regressions. |
| UX-17 (P1) | Add initial focus, Tab containment, Escape and return focus to the dashboard avatar dialog. | Live: close button initially focused, Shift+Tab wraps to Custom, Escape returns to Edit profile picture. |
| UX-18 (P2) | Retain safe internal return paths through authentication; add actionable workspace retry states. | New safe-return-path regression; existing auth/workspace suites. |
| UX-19 (P2) | Derive Saved/Unsaved from the current note snapshot against the last confirmed save. | Note recovery test; source review. |
| UX-20 (P2) | Separate failed libraries from empty libraries and expose Retry in Notes, maps, slides, media and review queues. | Existing collection suites; browser Notes, slides and maps checks. |
| UX-21 (P2) | Handle challenge non-OK load/create/join/progress responses, expose retry, and guard duplicate actions. | Source review and build; live account mutation not exercised. |
| UX-22 (P2) | Keep generated media notes visible while a replacement is being generated. | Source review and build. |
| UX-23 (P2) | Save already generated media notes directly using a deterministic title; guard duplicate saves. | Source review and build. |
| UX-24 (P2) | Replace fabricated generation percentages with honest progress text. | Source review and build. |
| UX-25 (P2) | Show a primary study-library action first on mobile and one static copy of the 12 module destinations. | Live 375px: CTA at y147 below 143px header, height85px; 12 module buttons; no overflow. |
| UX-26 (P2) | Clarify curriculum mode, document selection semantics and material references; replace chunk jargon with passages. | Context browser and source review. |
| UX-27 (P2) | Carry selected section and published material reference identity into Course Tutor; display and persist scope per chat. | Source review/build. Material bodies are not automatically ingested; see limits. |
| UX-28 (P2) | Describe institutional search as finding teaching/study tools. | Source review and build. |
| UX-29 (P2) | Open the named learner’s signal, activity and assignment evidence; keep learner identity when opening grade review. | Classroom grade regression; source review. Live institutional account pending. |
| UX-30 (P2) | Clear class resources while switching and ignore outdated responses; disable sends until recipient data is ready. | Source review/build. Live institutional account pending. |
| UX-31 (P2) | Give recent note and media buttons concise Open-title names; shorten previews and remove HTML markup. | Notes browser accessibility snapshot. |
| UX-32 (P2) | Increase classroom form text and operational metadata; expand mobile source/folder hit targets. | 375px source workspace reflow; source review. Native touch/zoom acceptance remains device-dependent. |
| UX-33 (P2) | Name route loading status and respect reduced-motion preference for the shared loader. | Source review/build. |
| UX-34 (P2) | Show history load failures with retry; distinguish missing public links from service outages and correct branding. | New 500-to-404 public recovery regression; live invalid shared link. |
| UX-35 (P2) | Surface analytics failures with retry and stale-data notice; prevent previous-range responses replacing current-range results. | Analytics suite and desktop browser. |
| UX-36 (P2) | Apply native calendar, shared-item and settings state only after server success; show actionable failures. | Native type check/source review; device runtime pending. |
| UX-37 (P2) | Separate subscription price preview from the persisted billing cycle; require plan selection before updating it. | Profile billing regression and browser profile rendering. |
| UX-38 (P1) | Resolve authoritative native account role before onboarding; provide an explicit classroom web handoff for institutional accounts. | Native type check/source review; role/device runtime pending. |
| UX-39 (P2) | Connect native Help and Privacy actions to the actual web destinations and report browser-opening failures. | Native type check and verified matching web route definitions. |
| UX-40 (P2) | Expose failed monitoring requests with a stale-data warning and Refresh recovery. | Source review/build; live admin account not exercised. |
| UX-41 (P2) | Report playlist delete/view failures while retaining the current collection. | Playlist suite and source review. |
| UX-42 (P2) | Fetch an unfiltered first page of suggested learners instead of searching for the letter a. | Backend compile, frontend build and source review. |
| UX-43 (P2) | Add a learner-focused proposition and Start learning action to the landing page. | Desktop visual check and 375px reflow with no overflow. |
| UX-44 (P2) | Render a real Page not found view with back/workspace recovery for unknown routes. | Live desktop/mobile missing-route check. |

## Remaining validation and migration limits

- Native iOS/Android device or simulator runtime was not exercised.
- Institutional and admin browser workflows were not exercised with role-specific accounts. Classroom drafts/grading were tested with mocked API responses.
- Course Tutor carries section identity and published material references, not automatic material-body ingestion or a new backend AI-policy enforcement layer.
- Unowned legacy cerbyl_canvases data is retained untouched; it is not assigned to a new account automatically. An ownership-aware migration is needed if deployed browsers contain that legacy data.
- The static detector is not a clean pass: 749 advisory/design-pattern findings remain, largely incumbent fonts, geometry, sidebars and transitions. It is not an accessibility or production certification.

The user’s pre-existing learning-path work was preserved. No deployment or commit was performed.

## Dashboard visual follow-up

At the user’s request, the full-width gold Continue studying banner was replaced with a compact dark outlined action beside the greeting (below it on mobile). The rotating module strip and drag/hover interactions were restored. Duplicate visual copies remain outside the tab order and accessibility tree; keyboard focus pauses motion, and reduced-motion users get a static strip. Desktop and 375px browser checks confirmed the button is 44px high, the strip moves, and the mobile page has no horizontal overflow.
