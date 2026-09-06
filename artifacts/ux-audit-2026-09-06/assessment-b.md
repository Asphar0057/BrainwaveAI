# Assessment B — deterministic scan and implementation evidence

Independent source assessment; no Assessment A findings received. Target: `/Users/adityalanka/BrainwaveAI/src/pages`; supporting checks in `src/App.js`, `src/components/SocialHubChrome.js`, and `backend/routes/search.py`. Read-only source work; output files only in /tmp. No ignore list exists (parent confirmed).

## Detector

Command: `node /Users/adityalanka/.agents/skills/impeccable/scripts/detect.mjs --json src/pages > /tmp/ux-detector.json`
Exit: 2 (findings, not a crash). Pre-scan JS/TS count: 75; expanded source/style count: 159 (<500). Directory scanning includes CSS and imported styles. Raw JSON remains `/tmp/ux-detector.json`, untruncated. Total 667 occurrences in 65 distinct files; 642 warning, 25 advisory; no error-severity findings. Counts are occurrences, not independent user-facing defects or verified live usage.

| Rule | Warning | Advisory | Example locations |
|---|---:|---:|---|
| overused-font | 508 | 0 | src/pages/AIChat.css:91, :149, :529 |
| layout-transition | 59 | 0 | src/pages/AIChat.css:370, :2953, :3322 |
| side-tab | 41 | 0 | src/pages/AIChat.css:2216, :2270, :3725 |
| codex-grid-background | 0 | 25 | src/pages/ActivityFeed.css:32; AdminAnalytics.css:1; CanvasHub.css:1 |
| gradient-text | 23 | 0 | src/pages/AIChat.css:933, :3702; ActivityFeed.css:436 |
| bounce-easing | 11 | 0 | src/pages/Atlas.css:1802; BattleNotification.css:62; Flashcards.css:976 |

## Interpret detector against incumbent brand

- 508 font warnings largely flag the established Inter system. Replacing typography platform-wide solely to satisfy detector would undermine consistency. Treat as brand context, not 508 defects.
- 25 grid warnings overlap existing geometric brand language. Canvas/map surfaces may use grids meaningfully. Evaluate actual contrast, density and hierarchy before recommending removal; the detector cannot establish these.
- Concrete false positives: AIChat.css:3725 and :3737 are CSS triangle tails (zero-width/height pseudo-elements with transparent top/bottom borders), not accent stripes on cards. AIChat.css:4027 is an alert border; a status signal can be useful.
- Gold gradient accents may be incumbent identity. AIChat.css:3702 applies gradient clipping to generated-content h1/h2, which warrants a live legibility check, not automatic rejection.
- Layout transitions are performance candidates, not measured jank. profile.css:487 animates a score fill, a meaningful progress change. profile.css:265's `typingBounce` is a loading indicator; the rule does not measure tackiness or actual motion discomfort. Note lower-case profile.css belongs to a legacy page; live Profile route imports ProfileNew (App.js:71), so source totals overstate active UI prevalence.

## Verified source UX issues (outside the stylistic detector)

### P1 — Search results expose smart buttons that cannot dispatch

`backend/routes/search.py:186-218` creates action objects using `action` (`study`, `quiz`, `review`, `edit`, `create_flashcards`, `summarize`, `continue`, etc.). The response attaches them at :597; SearchHub.js:3074-3078 renders them directly. `SearchHub.js:2457-2468` tests `action.type`, never `action.action`, and stops event propagation before doing so. Thus ordinary server-produced smart buttons do nothing and also suppress the useful card-open fallback. Moreover, even manually supplied supported `type` values would send review/continue/progress to `/flashcards/:id`, `/chat/:id`, `/progress`, none declared by App.js. App.js:396 wildcard redirects these to `/`. Fix the response/UI action contract and existing destination conventions together, then verify real result cards and keyboard actions. This is not speculation about styling; confirmed cross-file mismatch. Source evidence does not establish whether live server differs from repository.

### P1 — Editing then immediately leaving can discard unsaved notes

`NotesRedesign.js:2116-2141` schedules autosave 1500 ms after an edit and clears that timer on cleanup. `:1628-1640` switches notes by replacing content and last-saved snapshot; it does not flush outgoing note changes. Navigation controls `:3192-3193` leave directly. No beforeunload/pagehide/useBlocker or draft persistence exists in this page. Therefore typing and switching note/leaving inside the debounce window can skip persistence. A failed save reports “Save interrupted — edit to retry” at :3586-3589, requiring mutation merely to retry. Recommended UX: stable dirty/saved state, durable draft/flush on transition, explicit retry preserving content. Must reproduce with a disposable draft once browser access is authorized; no data mutation attempted in this audit.

### P2 — Successful save reverts to “Unsaved” after two seconds

`NotesRedesign.js:2035-2040` and :2076-2081 set `autoSaved` true then false after 2000 ms; `:3273-3275` and :3584-3593 display `Unsaved` whenever not saving/error/autoSaved. Even a pristine loaded note starts with autoSaved false. Actual dirty snapshot is computed for persistence but not used for the badge. This undermines confidence about whether work is safely stored. Use dirty comparison for persistent status; announce failure and completion appropriately. No browser necessary to establish the boolean logic, but visible placement and announcements require browser/screen-reader verification.

### P1 — Authentication navigation excludes keyboard users

Login.js:294 “Back” and :488 “Create one” are span onClick controls without role, tabIndex or keyboard handling. Register.js:245 and :471 repeat the same pattern. Password reveal buttons are explicitly removed from tab order at Login.js:364 and Register.js:378/:404 (reset reveal toggles repeat this at Login.js:444/:469). Core fields do have associated labels and submit buttons. Replace navigation with links and keep disclosure buttons keyboard reachable. Browser verification should tab from page start through account creation and password reset, including focus visibility.

### P2 — Library load failure is presented as an empty library with no retry

NotesHub.js:61-65 catches recent-note failure and ends loading while recentNotes remains empty. `:103-106` therefore says “A clean slate”; `:218-222` invites “Create first note”. `:159` prints “Please try again”, but loading function is scoped inside mount effect and no retry action is exposed. User must reload or leave to retry. Distinguish failed retrieval from true first-use state and provide a retry loading action. LearningPaths offers explicit retry at :421-424, a useful incumbent pattern.

## Positive evidence to preserve

- SearchHub.js:2994-3003 has role=alert, plain language/detail and Retry search. Result cards :3047-3064 include Enter/Space handling and target guard, role and focusability; avoid claiming all cards are click-only.
- NotesHub uses actual buttons for capture choices and note rows (:170, :185, :209), meaningful loading text (:207), and duplicate submission guard (:76) plus disabling primary creation actions.
- LearningPaths.js:394/400 exposes generation error and disables invalid/generating submission. Library failure :421-424 supplies retry; deletion :241 asks irreversible-action confirmation.
- SocialHubChrome.js:7-16 and :461-464 exposes aria labels/current/pressed on common navigation, avoiding a blanket platform-wide keyboard-failure claim.

## Browser evidence and limits — hands-on audit incomplete

Browser access to http://localhost:3000 is denied by saved user permission; parent retried and received denial, then asked user to restore access. I made no browser calls, no alternate browser/network workaround, no server, no overlay injection. Browser tools expose read-only evaluation; no mutation preflight or overlay can be claimed. All browser-dependent dimensions remain unverified: actual active authenticated surfaces, responsive widths, overflow at 200% zoom, light/dark contrast, focus visibility/order, screen-reader announcements, latency/progress behavior, exact smart-action live payload, autosave transition reproduction. Representative future paths: login/register/reset; search-to-result-to-study; note creation/edit/switch/failure; flashcard study/quiz; learning-path generate/resume; shared/public and student/educator routes.

No screenshot or live issue reproduction is claimed. No temp live server to stop. Keep /tmp raw/report until parent persists synthesis, then remove when no longer needed.
