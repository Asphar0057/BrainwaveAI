# Assessment A — independent design review

Source-review complete; browser review pending saved-user-permission restoration. No browser request, workaround, detector, source edit, or other reviewer's output was used. This is a provisional assessment of code-backed UX, not a claim of observed live failures. Product authority: /Users/adityalanka/BrainwaveAI/PRODUCT.md. Critique reference read: /Users/adityalanka/.agents/skills/impeccable/reference/critique.md. Parent reports no ignore file.

## Scope and confidence

Read learner route structure and representative implementation of Dashboard, ContextHub, AIChat, NotesHub/MyNotes/editor, Flashcards, SoloQuizSession, LearningPaths, Social, Analytics and Profile. Sampled Login/Register and student/educator/workspace routing. Full rendered/mobile, focus-order, contrast, backend provenance and cross-role end-to-end coverage remain unverified. Do not describe this as a complete visual or accessibility audit. Source gives high confidence for explicit rendering/state transitions, medium for journey impact, low for visual hierarchy and responsive quality.

## Design specificity

The product is more specific than a generic AI chat wrapper: selected source handoffs, spaced study, editable notes, learning paths and practice outcomes form plausible pieces of Cerbyl's promised continuous learning loop. The interaction architecture nevertheless repeatedly presents an inventory of tools, leaving the learner to assemble the loop. The dashboard source privileges level/XP/global rank/streak/questions and Search Hub/ContextHub before the primary study tools. This conflicts with PRODUCT.md's instruction to prioritize the next useful action. Actual visual craft cannot be responsibly judged without a render; graphite/gold visual intent is documented but is not proof of readable execution.

## Provisional Nielsen scores

Scores are design evidence estimates, not measured usability results. 0=absent/broken; 4=excellent.

| Heuristic | Score | Evidence and uncertainty |
|---|---:|---|
| Visibility of system status | 2 | Good load/save states exist, but notes revert from Saved to Unsaved and social errors disappear. High source confidence. |
| Match system / real world | 2 | Useful task verbs coexist with Deck/chunks, overlapping review/quiz/map vocabulary and activity-first progress. Medium confidence. |
| User control and freedom | 2 | Trash, delete confirmations and back routes exist; interrupted quizzes do not persist answers. High source confidence. |
| Consistency and standards | 2 | Shared sidebar components exist, but custom shells, terminology and feedback vary. Medium confidence. |
| Error prevention | 2 | File limits, disabled generation and destructive confirmations; interrupted autosaves/quizzes have avoidable loss risks. High/medium confidence. |
| Recognition rather than recall | 2 | Recent notes/context chips/search help, but user must choose among feature families instead of following one study task. Medium confidence. |
| Flexibility and efficiency | 3 | Notes quick switcher/slash commands/save shortcut, flashcard bulk selections and dashboard customization. Actual keyboard reliability unverified. |
| Aesthetic and minimalist design | 2 | Dense catalogue and many competing metric/navigation choices in source. Provisional low visual confidence. |
| Error recovery | 1 | Social silently ignores reads/writes; analytics ignores settled errors; other tools provide better retry guidance. High source confidence. |
| Help and documentation | 2 | Contextual source descriptions, generation hints and empty-state CTAs exist; reviewed primary navigation exposes little task-oriented help. Medium/low confidence. |
| Total | 20/40 | Acceptable band; significant improvements needed. Entire score provisional until browser validation. |

## Five priorities

### P1 — Protect learner work and make save status truthful

The note editor sets autoSaved=true after successful PUT and unconditionally sets it false two seconds later. Its visible status then maps false to “Unsaved,” regardless of the saved snapshot. This is an explicit code-backed misleading status transition, not a runtime observation. Evidence: /Users/adityalanka/BrainwaveAI/src/pages/NotesRedesign.js:2039, :2040, :2080, :2081, :3273, :3275. A diligent learner can reasonably assume successful work is unsafe and repeatedly save. The header status lacks a live region in this local markup.

The same editor cancels its 1.5-second pending autosave on cleanup (:2126–2140); the profile cancels its 3-second pending save on cleanup (/Users/adityalanka/BrainwaveAI/src/pages/ProfileNew.js:763–770). No beforeunload/draft mechanism was found in the editor search; do not assert that a global guard is impossible. Treat interruption loss as a code-backed risk requiring browser validation, especially navigate-away immediately after an edit.

Fix: derive clean/dirty/saving/error from saved-versus-current snapshots; retain Saved while clean; announce success/error; persist a local draft on edits and flush or guard navigation; expose Retry next to a failed save. Suggested command: $impeccable harden.

### P1 — Preserve quiz answers across interruption and exit

SoloQuizSession initializes answers and question index in React state and restores only quiz input from sessionStorage. It resets the timer/start time when mounted. Evidence: /Users/adityalanka/BrainwaveAI/src/pages/SoloQuizSession.js:17–22, :37–54. Its “New quiz” and “Quiz setup” navigate away directly (:369, :374, :381). Thus the reviewed component offers no persisted attempt state or resume path. Refresh/navigation losing in-progress answers is strongly code-backed but has not been reproduced in the browser.

Fix: store attempt ID, answers, current question and original timing state on each answer; restore with a Resume/Restart choice; warn only when leaving an unpreserved attempt. Keep the result/review handoff (already present) and add an explicit next review action. Suggested command: $impeccable harden.

### P1 — Distinguish service failure from “you have no learning history”

Social reads ignore non-OK HTTP responses and silently catch failures (/Users/adityalanka/BrainwaveAI/src/pages/Social.js:84–121). Mutations such as friend requests have no failure path visible to users (:165–200); the default empty UI can therefore imply nothing exists or a click did nothing. Analytics awaits Promise.allSettled then stops loading without inspecting rejected results (/Users/adityalanka/BrainwaveAI/src/pages/Analytics.js:119–141), with empty outputs such as “No data for this period” (:518), “No activity yet” (:563), “No quizzes taken yet” (:671). This is particularly damaging in a product that claims understandable progress: absence of evidence and failed retrieval are not the same state.

Fix: track per-section idle/loading/ready/empty/stale/error state; retain cached data with an Updated timestamp; show inline Retry and specific recovery advice; mark mutations as pending and report failure without deleting the attempted action. Dashboard already demonstrates a partial pattern with its stale-stat warning (/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:1928–1929). Suggested command: $impeccable harden.

### P1 — Make the connected study loop the primary navigation

Dashboard contains twelve module definitions plus separate main tools and another sidebar list (/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:12–23, :60–70, :1859–1887). Its first metric row offers five gamification/activity metrics then two hub destinations (:1997–2027). Feature search indexes roughly thirty destinations (:27–57), including Analytics, Study Insights, Weak Areas, Knowledge Map, Concept Web and Review Hub. Review Hub itself is a four-tool selection screen, not an actual due-review queue (/Users/adityalanka/BrainwaveAI/src/pages/LearningReviewHub.js:47–84, :100–101). This makes “What should I study next?” a navigation problem.

Fix: lead Dashboard with one source/course/topic context, Continue last task, due review count and a single recommended next action explained by recent evidence. Keep the catalogue behind All tools. Distinguish progress from activity and consolidate confusing map/review/quiz entrances around goals. Reuse the contextual action chain already implemented by ContextHub and AIChat. Do not remove power-user access; make it secondary. Suggested commands: $impeccable distill and $impeccable shape.

### P2 — Repair semantics at the main entry points before calling keyboard support complete

Dashboard feature-search input has no visible associated label/aria-label and does not expose combobox expanded/controls/active-descendant state despite rendering a listbox (/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:1948–1983). Chat feature tile is role=button/tabIndex=0 and contains another button (:2038–2053), making nested action semantics ambiguous. Shared SidebarMenuItem expresses active state only as a CSS class (/Users/adityalanka/BrainwaveAI/src/components/Sidebar.js:74–79). These are source-confirmed semantic deficiencies; actual screen-reader impact and keyboard propagation need live testing.

Fix: give search a persistent label and complete combobox semantics; use a noninteractive card with explicit distinct links/buttons; add aria-current for navigation and native links for route changes. Audit the actual tab sequence and 200% zoom across the learner loop. Suggested command: $impeccable audit followed by $impeccable harden.

## Strengths

1. ContextHub meaningfully hands selected document IDs into tutor, flashcards, question generation and maps (/Users/adityalanka/BrainwaveAI/src/pages/ContextHubWorkspace.js:269–284). Its source selection has named remove controls, explicit empty guidance and disables outputs without sources (:561, :609, :616, :628). This is the strongest expression of the product's differentiator.
2. LearningPaths selects a lead active path and has concrete generation recovery copy while retaining input (/Users/adityalanka/BrainwaveAI/src/pages/LearningPaths.js:193–201, :213–235). Unlike the generic catalogue, it has the beginnings of a continuation model.
3. Notes offer a real power-user system: quick switcher, backlinks, slash commands and save shortcut (/Users/adityalanka/BrainwaveAI/src/pages/NotesRedesign.js:1998–2005, :2147 onward). MyNotes uses trash and clarifies folder removal preserves notes (:298, :446, :483, :523); these are thoughtful safeguards worth standardizing.

## Cognitive load

- More than four source-defined options: twelve dashboard modules, five ContextHub output types, eight context slots, numerous tool-search destinations, five first-row metrics. This is a source choice-count, not a claim that every option is simultaneously visible at any viewport.
- First-task clarity: partial failure. Dashboard asks users to pick a tool; ContextHub asks them to assemble sources and choose an output; the product principle asks for the next useful action.
- Terminology: ContextHub calls document selections “Your Deck” and exposes “searchable chunks” (/Users/adityalanka/BrainwaveAI/src/pages/ContextHubWorkspace.js:550, :605, :616), while Flashcards naturally also uses card/deck concepts. Replace with “Study sources” and comprehensible readiness/status; hide chunk internals unless diagnostically necessary.
- Context retention: positive in source-ID handoffs and recent notes. Interrupted quiz state and delayed save cleanup undermine it.
- Progressive disclosure: NotesHub and generation panels show some restraint, but route-level sprawl makes the user hold a mental map of tools and overlapping analyses.

## Emotional journey

Entry: personalized greeting and recent work can make return visits feel familiar. Middle: selected sources and direct AI-to-study conversion create momentum. Valleys: empty analytics after failed loads, silent social actions, a Saved label turning Unsaved, and a refreshed quiz restarting all create uncertainty. End: results/review exists; prioritize one concrete next practice/review action so completion ends with competence rather than another catalogue. Avoid conflating an XP gain with knowledge mastery.

## Persona red flags

- Jordan, first-time learner: cannot easily distinguish Question Bank vs Solo Quiz vs Quiz Hub, Knowledge Map vs Concept Web, or Analytics vs Study Insights; “Deck” and “chunks” assume an internal model. Recommendation: one guided source → explain → practice → review entry.
- Sam, keyboard/screen-reader dependent learner: incomplete feature-search semantics, nested interactive tile, active navigation represented visually. Do not claim all controls are inaccessible: many buttons have labels and keyboard handlers.
- Casey, interrupted/mobile learner: quiz response state lives only in memory; note/profile debounces may be canceled before persistence. Actual mobile target size, layout overflow and virtual keyboard behavior remain untested.

## Other observations and role limits

- P2: Dashboard renders missing rank as #1 via stats.rank || 1 (/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:2010); rank starts null (:334). Display an em dash/pending label instead of inventing achievement. Analytics uses an em dash (:185), so a better existing convention is available.
- P2: AI initial-message failure may print internal error.message, including HTTP status text (/Users/adityalanka/BrainwaveAI/src/pages/AIChat.js:2824, :2865). Use action-oriented copy and retry preserving the prompt; developer details belong in diagnostics.
- P2: Profile autosave exits immediately while another save is in flight (:725). A second change whose timer fires during a slow save may need a pending-save queue to ensure eventual persistence. Code risk, untested.
- Authentication source sample: Login and Register have explicit labels and password visibility buttons; reset flow exists. Login validation and some failures use alert dialogs (/Users/adityalanka/BrainwaveAI/src/pages/Login.js:192–193, :220), registration password mismatch uses alert (:120–121). Prefer inline field errors that preserve context. Do not claim login/register success, recovery delivery or role provisioning was exercised.
- Institutional sample: StudentDashboard and EducatorDashboard contain explicit status/error models, labeled form fields and semantic dialogs. Their day-to-day completion cannot be certified without role sessions. Student “Course Tutor / Ask with context” routes to /ai-chat without route state (/Users/adityalanka/BrainwaveAI/src/pages/StudentDashboard.js:456–467, :30, :275–276). This is a handoff ambiguity to verify, not proof of missing backend grounding: confirm the active class/source and teacher AI policy are visibly carried into tutor.
- WorkspaceSelect exposes developer/test language to the user: “Sign in with another test account to test another role” (/Users/adityalanka/BrainwaveAI/src/pages/WorkspaceSelect.js:58). Remove test-environment instructions from general product copy.

## Questions for design direction

1. If the learner can only see one action on return, what evidence makes that the right action?
2. Can every tutor answer become useful practice without asking the learner to choose among five feature names?
3. What does the learner trust more after a month: the activity numbers or a demonstrable improvement in a topic?

## Pending browser plan

After explicit permission restoration only: own fresh tab; inspect dashboard hierarchy, source selection and tutor handoff, note save status over >2 seconds, interrupted solo quiz, social/analytics error presentation, keyboard focus/search and mobile/zoom. No browser server was started by this assessment, and no cleanup is needed beyond retaining this requested report.
