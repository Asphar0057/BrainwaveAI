# Cerbyl platform UX audit — preliminary source findings

Method: dual-agent (A: /root/ux_design_review · B: /root/ux_evidence_review), followed by parent cross-file verification.

**The requested full browser audit is not complete.** Opening http://localhost:3000 was rejected by a saved browser permission setting. No live pages, interactions, mobile layouts, contrast measurements, or screen-reader behavior were observed in this run. Findings below are source-confirmed logic defects or explicitly labeled UX risks. The user has been asked to enable browser access. No application code was changed during the audit.

## Overall assessment

The main experience problem is unreliable continuity: users must choose among many tools, and some transitions fail, discard context, or make persistence ambiguous. Visual consistency matters, but trust in actions and saved work must come first. Cerbyl already has promising source-to-tutor-to-practice handoffs; the dashboard should make that learning journey obvious rather than require users to assemble it.

Reviewed representative implementation: Dashboard, Search, ContextHub, tutor, notes library/editor, flashcards, solo quiz, learning paths, Social, analytics, profile, authentication. Student/educator routes were sampled only. The route inventory includes 100 declarations, including redirects and parameterized destinations; it is not a claim of 100 tested pages.

## Highest-priority findings

### UX-01 · P1 · Search and dashboard destinations break task continuity

Search results expose Study, Review, Edit and other smart actions. Backend action objects use `action`; the frontend dispatches on `action.type`. It stops event propagation first, so unmatched actions also suppress the card-open fallback. Some dispatch branches target routes not registered in the application. This is a source-confirmed contract mismatch, not a live reproduction.

Evidence: [SearchHub.js](/Users/adityalanka/BrainwaveAI/src/pages/SearchHub.js:2457), [search.py](/Users/adityalanka/BrainwaveAI/backend/routes/search.py:186), [App.js](/Users/adityalanka/BrainwaveAI/src/App.js:396).

Dashboard feature search also names `/learning-review-hub`, `/friends-dashboard` and `/shared-content`, while the registered destinations are `/learning-review`, `/friends` and `/shared`. A user selecting these entries is routed into the wildcard redirect instead of the requested task. Evidence: [DashboardCerbyl.js](/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:50), [dispatch](/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:391).

Recommendation: one canonical route/action contract; validate every visible action against it. Preserve selected item and study context across the handoff. Browser acceptance: every search action opens the correct item/tool and Back returns to the query. Suggested workflow: harden.

### UX-02 · P1 · Notes do not provide trustworthy save guarantees

Successful saves set Saved, then reset that flag after two seconds. The badge maps the reset state to Unsaved even when the saved snapshot still matches. The pending 1.5-second autosave is canceled on cleanup; switching notes replaces the content and saved snapshot without flushing the outgoing edit. This creates a code-backed loss risk when leaving quickly, which needs reproduction using a disposable draft.

Evidence: [save state](/Users/adityalanka/BrainwaveAI/src/pages/NotesRedesign.js:2035), [badge](/Users/adityalanka/BrainwaveAI/src/pages/NotesRedesign.js:3273), [autosave cleanup](/Users/adityalanka/BrainwaveAI/src/pages/NotesRedesign.js:2116), [note switch](/Users/adityalanka/BrainwaveAI/src/pages/NotesRedesign.js:1628).

Recommendation: derive Saved/Unsaved from actual dirty state; preserve drafts continuously; flush or guard a transition; provide Retry without requiring another edit. Browser acceptance: edit → immediately switch → return and refresh without loss; Saved remains truthful. Suggested workflow: harden.

### UX-03 · P1 · An interrupted quiz has no reliable resume path

Answers and current question live in component state. Mount restores quiz questions from sessionStorage but resets answer state and timing. Direct exits offer no persisted attempt/resume flow in the reviewed component. Browser reproduction remains pending.

Evidence: [SoloQuizSession.js](/Users/adityalanka/BrainwaveAI/src/pages/SoloQuizSession.js:17), [restore logic](/Users/adityalanka/BrainwaveAI/src/pages/SoloQuizSession.js:37).

Recommendation: persist attempt ID, answers, current question and timing policy; offer Resume/Restart. Browser acceptance: refresh or leave midway, return to the same answers and an accurately handled timer. Suggested workflow: harden.

### UX-04 · P1 · Failed data loads look like empty user history

Social silently catches load and mutation failures. Analytics awaits settled requests without handling rejected results, then can render empty-history copy. NotesHub can show “A clean slate” after a failed recent-note request and offers no direct retry. Users cannot distinguish a service problem from lost work, no friends, or no progress.

Evidence: [Social.js](/Users/adityalanka/BrainwaveAI/src/pages/Social.js:84), [Analytics.js](/Users/adityalanka/BrainwaveAI/src/pages/Analytics.js:119), [NotesHub.js](/Users/adityalanka/BrainwaveAI/src/pages/NotesHub.js:61).

Recommendation: explicit loading/ready/empty/stale/error states per section, retained last-known data, actionable retry, and pending/failure feedback on mutations. Browser acceptance: controlled retrieval failure never claims the user has no data. Suggested workflow: harden.

### UX-05 · P1 · The product asks learners to choose tools instead of showing the next learning task

Dashboard defines twelve modules, several parallel navigation lists, and roughly thirty feature-search destinations. Quiz Hub / Solo Quiz / Question Bank, Knowledge Map / Concept Web, and Analytics / Study Insights overlap conceptually. Review Hub is another tool selector rather than a due-review queue. These are source-backed IA concerns; simultaneous visual density and actual discoverability still need browser observation.

Evidence: [DashboardCerbyl.js](/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:12), [LearningReviewHub.js](/Users/adityalanka/BrainwaveAI/src/pages/LearningReviewHub.js:47).

Recommendation: lead with Continue learning, due review, and one evidence-based next action tied to current sources/topic. Keep All tools and search for expert access. Suggested workflows: shape/distill.

## Additional actionable findings

- **P1 · Keyboard entry barriers:** Login/Register route-changing spans are not native links or keyboard controls; password visibility buttons use tabIndex=-1. Replace with links and keyboard-reachable buttons. [Login.js](/Users/adityalanka/BrainwaveAI/src/pages/Login.js:294), [Register.js](/Users/adityalanka/BrainwaveAI/src/pages/Register.js:245).
- **P2 · Search semantics:** Dashboard feature search lacks complete combobox semantics and its persistent accessible label. A chat tile contains nested interactive controls. [DashboardCerbyl.js](/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:1948).
- **P2 · Invented rank:** `stats.rank || 1` displays #1 for unavailable rank. Use a pending/unavailable state. [DashboardCerbyl.js](/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:2010).
- **P2 · Login loses destination:** unauthenticated deep links redirect to Login without a return location; login routes to dashboard/onboarding. Preserve the intended destination after authentication. [ProtectedRoute.js](/Users/adityalanka/BrainwaveAI/src/components/ProtectedRoute.js:54), [Login.js](/Users/adityalanka/BrainwaveAI/src/pages/Login.js:115).
- **P2 · Internal vocabulary:** “Your Deck” and “searchable chunks” in source selection, plus “test account” instructions in WorkspaceSelect, expose internal concepts. Use study-source language and production-facing instructions. [ContextHubWorkspace.js](/Users/adityalanka/BrainwaveAI/src/pages/ContextHubWorkspace.js:550), [WorkspaceSelect.js](/Users/adityalanka/BrainwaveAI/src/pages/WorkspaceSelect.js:58).

## What to preserve

ContextHub passes selected document IDs into tutor and practice tools, prevents source-dependent generation without sources, and explains selection. Notes have useful quick switching, backlinks, slash commands and save shortcuts. MyNotes offers trash and clarifies that removing a folder preserves notes. LearningPaths has retry and continuation patterns worth sharing across tools. These are implementation strengths, not certified live usability outcomes.

## Provisional heuristic assessment

This is a source-review estimate, not a measured usability score. Visual and interaction scores may change after browser inspection.

| Heuristic | Score / 4 |
|---|---:|
| Visibility of system status | 2 |
| Match with the user's world | 2 |
| User control and freedom | 2 |
| Consistency and standards | 2 |
| Error prevention | 2 |
| Recognition rather than recall | 2 |
| Flexibility and efficiency | 3 |
| Aesthetic and minimalist design | 2 |
| Error recovery | 1 |
| Help and documentation | 2 |
| **Total, provisional** | **20/40** |

## People most affected

First-time learners must understand overlapping tools before starting a task. Interrupted/mobile learners face the note and quiz persistence risks. Keyboard/screen-reader users face concrete navigation semantics defects; actual focus order, announcements, target sizes and contrast remain untested. The emotional low points are uncertainty about saved work, apparently inert actions, and missing history. A completed task should end with a clear result and next step.

## Detector interpretation

667 style-pattern occurrences across 65 files: 508 font flags, 59 layout transitions, 41 side borders, 25 grid backgrounds, 23 gradient text, and 11 bounce-easing flags. These are not 667 UX defects. The dominant font/grid warnings overlap the documented Inter/geometric brand; some borders are triangle tails and some files are legacy surfaces. Layout transitions are candidates for performance review, not measured jank. No browser overlays or measured contrast claims are made.

## Remaining hands-on audit

Browser access is required for actual task completion, account/session behavior, content relevance, loading latency, save/reload recovery, keyboard focus, narrow screens, 200% zoom, theme contrast, social feedback, and student/educator workflows. Coverage is tracked in `artifacts/ux-audit-2026-09-06/coverage.md`. No route is marked browser-verified. Remediation prioritization is deferred until this requested evidence is available.
