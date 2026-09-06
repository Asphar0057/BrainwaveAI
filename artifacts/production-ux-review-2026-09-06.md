Method: dual-agent (A: /root/ux_design_review · B: /root/ux_technical_review), plus primary-agent browser validation.

# Cerbyl production UX review — 6 September 2026

**Release verdict: not ready for an unrestricted production launch.** This review identifies **44 issues: 18 P1 and 26 P2**. One P1 is conditional on institutional native-mobile support being part of the release promise. No P0 was established. P1 means a major task, data-integrity, accessibility or trust problem to address before releasing the affected flow; P2 means a significant usability/recovery improvement with a workaround or narrower impact.

This is a project-wide source and representative-browser audit, **not certification that every route, role, state, device or integration was exercised end to end**. Source-supported failure conditions are distinguished from live observations. No user content was intentionally created, edited, sent, graded, deleted or purchased during browser review. No application code was changed. Existing in-progress Learning Path changes were included as they stood.

## Coverage and method

- Read PRODUCT.md, route topology, incumbent CSS and component behavior. Browser review began in the Cerbyl profile, then moved to Aditya as requested.
- Live surfaces: landing, login, workspace failure, learner dashboard, flashcards library, Notes Hub, learning-path library and an existing path detail, AI Chat and its context panel, question bank, ContextHub, Quiz Hub, analytics, Social Hub, profile, slides, knowledge map, AI media notes.
- Responsive browser checks: dashboard at 390×844 and Notes Hub at phone widths, including a reproduced expanded-sidebar failure at 375×812. Viewport overrides were reset.
- Source review also covered student/educator submissions, grading, assignments, messaging and role handoffs; quizzes/challenges/battle completion; notes/media/canvas; sharing/playlists/friends; profile/billing; analytics/admin rate-limit loading; and native mobile auth, chat, notes, settings, calendar, shared content and review.
- Institutional role flows and native mobile were source-reviewed, not executed with role-specific accounts or a native runtime. Every admin panel, payment provider step, generated-content correctness, slow-network scenario and destructive recovery flow was not tested. No contrast-ratio, frame-rate or screen-reader conformance claim is made.
- The frontend compiled successfully with npm start. The backend initially refused connections, then became healthy during review; that temporary environment outage is not itself counted as a production defect. Its displayed recovery behavior informed issue UX-18.

## Design assessment

**The visual identity is coherent and recognizably Cerbyl:** graphite surfaces, warm gold, bold typography and geometric texture recur across the product. Keep that identity. The weak point is operational consistency: the same visual confidence is applied to saved, pending, failed and absent data even when the system cannot support that confidence.

The main opportunity is to make the connected learning loop visible: continue the right activity, know which source is being used, preserve work, and receive a trustworthy completion receipt. More feature tiles or visual effects will not resolve those failures.

Strengths:
- Question Bank and Learning Paths provide clear resume actions and actionable library summaries.
- Notes and media entry flows distinguish writing from source-based capture and explain the next step.
- Student coursework includes rubrics, attachments, drafts and feedback; educator views have the foundations for real teaching workflows.
- Institutional dialogs have stronger focus behavior than several older dialogs. Shared focus styles, lazy routes, and retryable battle completion are useful foundations.

Provisional reviewer heuristic score: **16/40**. This is a qualitative judgment, not a benchmark, measured usability test or compliance score. Higher is better.

| Heuristic | Score / 4 | Main reason |
|---|---:|---|
| Visibility of system status | 1 | Save failures and false completion/empty states |
| Match with users' expectations | 2 | Context and metric labels disagree with behavior |
| User control and freedom | 1 | Draft loss and interruption recovery |
| Consistency and standards | 2 | Different save, navigation and error contracts |
| Error prevention | 1 | Missing submitted answers, overwritten drafts |
| Recognition rather than recall | 2 | Course context and evidence handoffs lose specificity |
| Flexibility and efficiency | 2 | Repeated navigation and fragile grading workflow |
| Aesthetic and minimalist design | 2 | Strong identity; crowded dashboard and tiny operational text |
| Error recognition and recovery | 1 | Suppressed failures, misleading empty results |
| Help and documentation | 2 | Some contextual instructions; dead ends and technical copy |
| **Total** | **16/40** | **Major improvements required in affected flows** |

Cognitive-load concerns are concentrated in the dashboard's duplicate destinations, context terminology, course-to-tool handoffs and the burden of remembering what actually saved. Do not impose a universal four-option cap on libraries; use task relevance, grouping and progressive disclosure.

Persona risks:
- A distracted learner can lose a draft, omit a selected quiz answer, or see completion for unsaved study work.
- An educator can lose feedback for several students or schedule a shifted deadline.
- A keyboard or small-screen user can be prevented from reaching otherwise available destinations.
- A new visitor must explore company-oriented panels to infer the product's immediate study value.

## Prioritized issue register

Each item includes a reproducible condition or observed behavior, impact, implementation evidence and an acceptance condition. “Source” means the condition was established from implementation, not destructively reproduced against the signed-in account.

### UX-01 · P1 · Quiz submission omits the current selection

**Evidence:** Source. [src/pages/SoloQuizSession.js:126](/Users/adityalanka/BrainwaveAI/src/pages/SoloQuizSession.js:126) · [src/pages/SoloQuizSession.js:252](/Users/adityalanka/BrainwaveAI/src/pages/SoloQuizSession.js:252)

Standard mode records an answer only on Next, while Submit grades the existing answer map. The final selected answer can be submitted as unanswered; sequential completion also reads state immediately after updating it.

**Fix and acceptance:** Commit selections immediately and pass an explicit answer snapshot to grading. Verify first/last questions, question jumps, all modes and timeout submission.

### UX-02 · P1 · Notes can lose the last 1.5 seconds of typing

**Evidence:** Source. [src/pages/NotesRedesign.js:1628](/Users/adityalanka/BrainwaveAI/src/pages/NotesRedesign.js:1628) · [src/pages/NotesRedesign.js:2128](/Users/adityalanka/BrainwaveAI/src/pages/NotesRedesign.js:2128)

Switching notes replaces the editor snapshot; effect cleanup cancels the pending autosave. No content recovery buffer or navigation guard protects that edit.

**Fix and acceptance:** Persist local drafts immediately and flush the outgoing note before switching. Type, leave within 1.5 seconds, return and confirm the exact text survives.

### UX-03 · P1 · Publishing one grade destroys other draft feedback

**Evidence:** Source. [src/pages/EducatorDashboard.js:276](/Users/adityalanka/BrainwaveAI/src/pages/EducatorDashboard.js:276) · [src/pages/EducatorDashboard.js:294](/Users/adityalanka/BrainwaveAI/src/pages/EducatorDashboard.js:294)

Saving one student reloads the submission list and reconstructs the entire drafts map. Unsaved scores and feedback in other rows are overwritten.

**Fix and acceptance:** Update the saved row only and preserve dirty drafts by student. Draft two rows, publish one, and confirm the other is untouched.

### UX-04 · P1 · Assignment deadline editing shifts local time

**Evidence:** Source. [src/pages/InstitutionClassroomPage.js:386](/Users/adityalanka/BrainwaveAI/src/pages/InstitutionClassroomPage.js:386)

datetime-local displays a sliced UTC value, then converts edits from local time to UTC. An edit can jump by the user's time-zone offset on the next render.

**Fix and acceptance:** Convert UTC to local for display; serialize only at save. Label the time zone and round-trip existing and edited deadlines outside UTC.

### UX-05 · P1 · Profile autosave silently drops changes

**Evidence:** Source + live autosave promise. [src/pages/ProfileNew.js:367](/Users/adityalanka/BrainwaveAI/src/pages/ProfileNew.js:367) · [src/pages/ProfileNew.js:724](/Users/adityalanka/BrainwaveAI/src/pages/ProfileNew.js:724) · [src/pages/ProfileNew.js:763](/Users/adityalanka/BrainwaveAI/src/pages/ProfileNew.js:763)

Leaving before the three-second debounce cancels saving. A second save returns while another request is active without queuing the latest snapshot. Saving/error state values are discarded, despite the visible autosave promise.

**Fix and acceptance:** Show Saving/Saved/Failed, serialize dirty snapshots and retain drafts on departure. Verify rapid edits, slow saves, rejection and navigation within three seconds.

### UX-06 · P1 · AI replies can appear in the wrong conversation

**Evidence:** Source. [src/pages/AIChat.js:1457](/Users/adityalanka/BrainwaveAI/src/pages/AIChat.js:1457) · [src/pages/AIChat.js:1691](/Users/adityalanka/BrainwaveAI/src/pages/AIChat.js:1691) · [mobile/src/screens/AIChatScreen.tsx:559](/Users/adityalanka/BrainwaveAI/mobile/src/screens/AIChatScreen.tsx:559)

Users can switch chats while sending; the old request appends its reply to the messages array currently displayed. Mobile has the same unguarded completion pattern.

**Fix and acceptance:** Bind every request and completion to the originating chat; preserve separate drafts. Send in A, switch to B, and verify A's reply never enters B.

### UX-07 · P1 · Canvas work is shared across accounts on the same browser

**Evidence:** Source. [src/pages/CanvasHub.js:10](/Users/adityalanka/BrainwaveAI/src/pages/CanvasHub.js:10) · [src/pages/CanvasHub.js:27](/Users/adityalanka/BrainwaveAI/src/pages/CanvasHub.js:27) · [src/utils/backendSession.js:4](/Users/adityalanka/BrainwaveAI/src/utils/backendSession.js:4)

Canvases are stored only under the global cerbyl_canvases key, loaded for any signed-in user, and not cleared by session cleanup. Another account on the same browser can see the previous account's canvases. No cloud-sync or local-only status is shown.

**Fix and acceptance:** Scope storage by account and provide explicit local/synced status plus recovery/export. Verify account switching and storage quota failure without exposing or losing drawings.

### UX-08 · P1 · Expanded mobile sidebar makes content unusable

**Evidence:** Live + source. [src/components/SocialHubChrome.css:850](/Users/adityalanka/BrainwaveAI/src/components/SocialHubChrome.css:850) · [src/components/SocialHubChrome.js:368](/Users/adityalanka/BrainwaveAI/src/components/SocialHubChrome.js:368)

At 375px, expanding Notes navigation retains a 280px sidebar inside the content grid. The live main area becomes a clipped strip of about 57px. Shared-shell screens inherit the geometry.

**Fix and acceptance:** Use an overlay drawer on narrow screens and restore focus on close. Verify 320, 375 and 390px, including expanded navigation and all primary actions.

### UX-09 · P1 · Authentication and Social Hub navigation exclude keyboard users

**Evidence:** Live accessibility tree + source. [src/pages/Login.js:294](/Users/adityalanka/BrainwaveAI/src/pages/Login.js:294) · [src/pages/Login.js:488](/Users/adityalanka/BrainwaveAI/src/pages/Login.js:488) · [src/pages/Register.js:245](/Users/adityalanka/BrainwaveAI/src/pages/Register.js:245) · [src/pages/Social.js:476](/Users/adityalanka/BrainwaveAI/src/pages/Social.js:476) · [src/pages/Social.js:568](/Users/adityalanka/BrainwaveAI/src/pages/Social.js:568)

Back/Create one/Sign in use clickable spans; Social Hub cards and leaderboard entry use clickable divs without keyboard semantics. Browser accessibility output exposes the social destinations only as text.

**Fix and acceptance:** Use real links/buttons and expose meaningful names. Complete login↔registration and every Social Hub destination using Tab and Enter only.

### UX-10 · P1 · Web flashcard review failures look like success or inactivity

**Evidence:** Source. [src/pages/Flashcards.js:577](/Users/adityalanka/BrainwaveAI/src/pages/Flashcards.js:577) · [src/pages/Flashcards.js:629](/Users/adityalanka/BrainwaveAI/src/pages/Flashcards.js:629) · [src/pages/Flashcards.js:4187](/Users/adityalanka/BrainwaveAI/src/pages/Flashcards.js:4187)

A failed due-card request leaves zero counts and displays 'You're all caught up'. Failed grade submission has no visible error or pending guard, so users can repeat taps without knowing whether progress saved.

**Fix and acceptance:** Separate loading/error/empty/saved states, show Retry and prevent duplicate grading. Test HTTP failures and disconnected saves without falsely completing a queue.

### UX-11 · P1 · Mobile review results count grades that never saved

**Evidence:** Source; native runtime untested. [mobile/src/screens/SpacedRepetitionScreen.tsx:106](/Users/adityalanka/BrainwaveAI/mobile/src/screens/SpacedRepetitionScreen.tsx:106) · [mobile/src/screens/FlashcardsScreen.tsx:798](/Users/adityalanka/BrainwaveAI/mobile/src/screens/FlashcardsScreen.tsx:798)

After persistence errors, native review still advances and increments completed totals. The displayed session result diverges from the scheduling record.

**Fix and acceptance:** Queue unsynced grades durably or retain the card with Retry. Reopen after a failed save and reconcile the session exactly once.

### UX-12 · P1 · Mobile note Back treats a pending save as successful

**Evidence:** Source; native runtime untested. [mobile/src/screens/notes/NoteEditorScreen.tsx:300](/Users/adityalanka/BrainwaveAI/mobile/src/screens/notes/NoteEditorScreen.tsx:300) · [mobile/src/screens/notes/NoteEditorScreen.tsx:336](/Users/adityalanka/BrainwaveAI/mobile/src/screens/notes/NoteEditorScreen.tsx:336)

save() returns true while another save is still pending; Back uses that return value to leave. A subsequent failure can occur after the editor has closed.

**Fix and acceptance:** Await the active save promise or retain a recoverable draft. Tap Done then Back during a delayed failing request and verify no work disappears.

### UX-13 · P1 · Classroom drafts disappear on accidental dismissal

**Evidence:** Source. [src/pages/StudentDashboard.js:64](/Users/adityalanka/BrainwaveAI/src/pages/StudentDashboard.js:64) · [src/pages/StudentDashboard.js:93](/Users/adityalanka/BrainwaveAI/src/pages/StudentDashboard.js:93) · [src/pages/EducatorDashboard.js:88](/Users/adityalanka/BrainwaveAI/src/pages/EducatorDashboard.js:88)

Submission, assignment and announcement text lives in component state; backdrop/Escape/Close can dismiss immediately. Manual student draft saving does not protect unsaved composition.

**Fix and acceptance:** Autosave drafts and protect dirty dismissal. Verify Escape, backdrop, navigation and close during submission for both student and educator writing.

### UX-14 · P1 · Challenge countdown includes AI generation time

**Evidence:** Source. [src/pages/ChallengeSession.js:33](/Users/adityalanka/BrainwaveAI/src/pages/ChallengeSession.js:33) · [src/pages/ChallengeSession.js:54](/Users/adityalanka/BrainwaveAI/src/pages/ChallengeSession.js:54)

The timer starts when challenge details arrive, before awaited question generation. Slow generation consumes time before learners can answer.

**Fix and acceptance:** Start a server-consistent deadline only after questions are ready and the attempt starts. Delaying generation must not reduce answering time.

### UX-15 · P1 · Quiz average misrepresents performance

**Evidence:** Live + source. [backend/routes/analytics.py:1052](/Users/adityalanka/BrainwaveAI/backend/routes/analytics.py:1052) · [backend/routes/analytics.py:1063](/Users/adityalanka/BrainwaveAI/backend/routes/analytics.py:1063) · [src/pages/Analytics.js:667](/Users/adityalanka/BrainwaveAI/src/pages/Analytics.js:667)

The backend averages raw score counts, and the UI labels that value as a percentage; individual rows separately divide by total. Live Quiz History showed avg 4% beside results of 50%, 42%, 83%, 0%, 50% and 100%.

**Fix and acceptance:** Normalize scores and document whether the aggregate is weighted. Check mixed quiz lengths and score/percentage payloads against a calculated expected result.

### UX-16 · P1 · Quiz interruption loses answers and hides failed completion

**Evidence:** Source. [src/pages/SoloQuizSession.js:37](/Users/adityalanka/BrainwaveAI/src/pages/SoloQuizSession.js:37) · [src/pages/SoloQuizSession.js:307](/Users/adityalanka/BrainwaveAI/src/pages/SoloQuizSession.js:307)

Refresh restores quiz setup but not answers/index/deadline. Failed remote grading shows local results without the completion warning, then removes quizData.

**Fix and acceptance:** Checkpoint attempts and show 'result not synced' when needed. Refresh midway, retry grading and verify an attempt is restored and recorded once.

### UX-17 · P1 · Dashboard avatar dialog leaves focus behind the modal

**Evidence:** Source. [src/pages/DashboardCerbyl.js:1579](/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:1579) · [src/pages/DashboardCerbyl.js:2446](/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:2446)

The dialog has Escape and ARIA attributes but no initial focus, focus containment or return-focus behavior. Background controls remain reachable.

**Fix and acceptance:** Reuse the project's stronger dialog focus implementation. Keyboard focus must enter, remain inside and return to the opener.

### UX-18 · P2 · Authentication loses the user's intended destination

**Evidence:** Live outage state + source. [src/components/ProtectedRoute.js:55](/Users/adityalanka/BrainwaveAI/src/components/ProtectedRoute.js:55) · [src/components/RoleProtectedRoute.js:23](/Users/adityalanka/BrainwaveAI/src/components/RoleProtectedRoute.js:23) · [src/config/api.js:26](/Users/adityalanka/BrainwaveAI/src/config/api.js:26)

Login redirects do not preserve the requested page. Any role lookup error redirects to login, so a service outage can resemble sign-out; the live workspace fallback exposed 'Failed to fetch' and test-account instructions.

**Fix and acceptance:** Preserve a validated internal return path and distinguish expired credentials from service failure. Retry in place; return to the original task after reauthentication.

### UX-19 · P2 · Saved notes revert to 'Unsaved' without a new edit

**Evidence:** Source. [src/pages/NotesRedesign.js:2080](/Users/adityalanka/BrainwaveAI/src/pages/NotesRedesign.js:2080) · [src/pages/NotesRedesign.js:3273](/Users/adityalanka/BrainwaveAI/src/pages/NotesRedesign.js:3273)

The Saved flag is cleared after two seconds and reused to decide whether the editor says Unsaved. The label is not derived from actual snapshot equality.

**Fix and acceptance:** Keep saved/dirty state tied to content snapshots. After a successful save, wait without editing: the status must remain Saved.

### UX-20 · P2 · Collections conflate failed loading with an empty library

**Evidence:** Source. [src/pages/NotesHub.js:61](/Users/adityalanka/BrainwaveAI/src/pages/NotesHub.js:61) · [src/pages/NotesHub.js:205](/Users/adityalanka/BrainwaveAI/src/pages/NotesHub.js:205) · [src/pages/KnowledgeMap.js:562](/Users/adityalanka/BrainwaveAI/src/pages/KnowledgeMap.js:562) · [src/pages/SlideExplorer.js:124](/Users/adityalanka/BrainwaveAI/src/pages/SlideExplorer.js:124) · [src/pages/AIMediaNotes.js:419](/Users/adityalanka/BrainwaveAI/src/pages/AIMediaNotes.js:419)

Notes can show an error plus 'Create first note'; map/slide/media collection failures leave empty-looking lists. Existing work appears absent during outages.

**Fix and acceptance:** Render distinct failed, genuinely empty and filtered-empty states with Retry. Existing cached items must be labeled stale rather than silently replaced with emptiness.

### UX-21 · P2 · Challenge HTTP errors can leave permanent loading

**Evidence:** Source. [src/pages/ChallengeSession.js:45](/Users/adityalanka/BrainwaveAI/src/pages/ChallengeSession.js:45) · [src/pages/ChallengeSession.js:200](/Users/adityalanka/BrainwaveAI/src/pages/ChallengeSession.js:200) · [src/pages/Challenges.js:52](/Users/adityalanka/BrainwaveAI/src/pages/Challenges.js:52)

Normal non-OK responses are ignored in load/create/join/progress paths. The loader can stay active or an action can appear inert.

**Fix and acceptance:** Handle non-OK outcomes and clear pending state in all paths. Test 403, 404 and 500 for load, join and completion.

### UX-22 · P2 · Media regeneration discards the previous result before success

**Evidence:** Source. [src/pages/AudioVideoNotes.js:145](/Users/adityalanka/BrainwaveAI/src/pages/AudioVideoNotes.js:145)

Regenerate clears generatedNotes before requesting replacement content. If generation fails, the existing unsaved result is gone.

**Fix and acceptance:** Keep the previous output until the replacement succeeds and permit restoration. A failed regeneration must retain copy/save access to the original.

### UX-23 · P2 · Saving existing media notes depends on another AI job

**Evidence:** Source. [src/pages/AIMediaNotes.js:235](/Users/adityalanka/BrainwaveAI/src/pages/AIMediaNotes.js:235) · [src/pages/AIMediaNotes.js:250](/Users/adityalanka/BrainwaveAI/src/pages/AIMediaNotes.js:250) · [src/pages/AIMediaNotes.js:272](/Users/adityalanka/BrainwaveAI/src/pages/AIMediaNotes.js:272)

Save awaits AI title generation in the same try block before persisting already-generated notes. A title job rejection blocks saving; no save guard prevents repeated attempts.

**Fix and acceptance:** Save with a fallback filename even if title generation fails; make the save pending and idempotent. Verify AI unavailability does not prevent saving existing text.

### UX-24 · P2 · Media progress is a synthetic percentage

**Evidence:** Source. [src/pages/AudioVideoNotes.js:74](/Users/adityalanka/BrainwaveAI/src/pages/AudioVideoNotes.js:74)

The UI adds 10% every half second until 90%, independent of job progress, while the task can wait up to five minutes. It communicates near-completion without evidence.

**Fix and acceptance:** Show real queued/uploading/transcribing/generating stages, or an honest indeterminate state. Expose cancellation/recovery where supported.

### UX-25 · P2 · Dashboard duplicates navigation and hides the next study task

**Evidence:** Live + source; design judgment. [src/pages/DashboardCerbyl.js:1864](/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:1864) · [src/pages/DashboardCerbyl.js:1930](/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:1930) · [src/pages/DashboardCerbyl.js:2235](/Users/adityalanka/BrainwaveAI/src/pages/DashboardCerbyl.js:2235)

The module strip repeats the same 12 buttons three times in the accessibility tree, alongside sidebar and feature cards. At 390px, account metrics/context links take most of the first viewport before study actions.

**Fix and acceptance:** Give one primary continue-study action, a static browse area and one accessible copy of each destination. Verify a keyboard user does not traverse repeated marquee links.

### UX-26 · P2 · AI source scope is difficult to predict

**Evidence:** Live + source; copy/interaction inconsistency. [src/components/ContextPanel.js:138](/Users/adityalanka/BrainwaveAI/src/components/ContextPanel.js:138) · [src/components/ContextPanel.js:172](/Users/adityalanka/BrainwaveAI/src/components/ContextPanel.js:172) · [src/components/ContextPanel.js:274](/Users/adityalanka/BrainwaveAI/src/components/ContextPanel.js:274) · [src/pages/ContextHubWorkspace.js:651](/Users/adityalanka/BrainwaveAI/src/pages/ContextHubWorkspace.js:651)

Live tutor context showed 'No context set' while also explaining that no selection uses all available context. ContextHub called an empty deck 'No active context' and disabled actions. HS Mode, Deck, stack and chunks add terminology without clarifying scope.

**Fix and acceptance:** Show the exact effective source scope next to the composer and use consistent empty-selection behavior across tools. Explain curriculum mode in plain language.

### UX-27 · P2 · Course tutor handoff does not carry course scope

**Evidence:** Source. [src/pages/StudentDashboard.js:29](/Users/adityalanka/BrainwaveAI/src/pages/StudentDashboard.js:29) · [src/pages/StudentDashboard.js:273](/Users/adityalanka/BrainwaveAI/src/pages/StudentDashboard.js:273)

'Ask with context' sends students to generic /ai-chat without section, assignment or approved-material identity in the handoff.

**Fix and acceptance:** Carry and display course/assignment context through the tutor entry. Verify the destination shows the intended class and material scope; separately validate backend AI policy.

### UX-28 · P2 · Institutional search promises content but searches tool names

**Evidence:** Source. [src/pages/StudentDashboard.js:262](/Users/adityalanka/BrainwaveAI/src/pages/StudentDashboard.js:262) · [src/pages/StudentDashboard.js:391](/Users/adityalanka/BrainwaveAI/src/pages/StudentDashboard.js:391) · [src/pages/EducatorDashboard.js:408](/Users/adityalanka/BrainwaveAI/src/pages/EducatorDashboard.js:408)

Search copy includes classes and assignments, but filtering operates on static tool definitions. Searching for a real assignment or student cannot fulfill the stated promise.

**Fix and acceptance:** Search actual records or rename the field 'Find a tool'. Verify known class, assignment and learner names return appropriate results.

### UX-29 · P2 · Educator evidence actions do not open the named learner's evidence

**Evidence:** Source. [src/pages/EducatorDashboard.js:457](/Users/adityalanka/BrainwaveAI/src/pages/EducatorDashboard.js:457) · [src/pages/EducatorDashboard.js:691](/Users/adityalanka/BrainwaveAI/src/pages/EducatorDashboard.js:691)

A button promises course evidence for a named student but only selects a section and scrolls to its leaderboard.

**Fix and acceptance:** Open a learner-specific evidence view with contributing work and the next intervention action. The selected student's identity must persist through the handoff.

### UX-30 · P2 · Class switching can show stale conversations under a new class

**Evidence:** Source. [src/pages/InstitutionClassroomPage.js:78](/Users/adityalanka/BrainwaveAI/src/pages/InstitutionClassroomPage.js:78) · [src/pages/InstitutionClassroomPage.js:332](/Users/adityalanka/BrainwaveAI/src/pages/InstitutionClassroomPage.js:332)

Section changes do not establish a new loading state before fetching. Previous conversation/recipient data can remain while the new class loads; assignments can show no matches before data arrives.

**Fix and acceptance:** Key resource state and requests by section, discard stale responses and replace old content during switching. Test rapid class changes with delayed responses.

### UX-31 · P2 · Long note previews become enormous accessible button names

**Evidence:** Live accessibility tree + source. [src/pages/NotesHub.js:209](/Users/adityalanka/BrainwaveAI/src/pages/NotesHub.js:209)

Recent-note rows embed the entire plain-text note in a button. The live accessibility tree contained thousands of words for a single note even though the visual preview is clamped.

**Fix and acceptance:** Give the link a concise title-based accessible name and a bounded preview. Verify screen-reader navigation announces title, type and useful metadata without reading the whole note.

### UX-32 · P2 · Small controls and metadata undermine mobile usability

**Evidence:** Source. [src/pages/InstitutionClassroomPage.css:80](/Users/adityalanka/BrainwaveAI/src/pages/InstitutionClassroomPage.css:80) · [src/pages/InstitutionClassroomPage.css:87](/Users/adityalanka/BrainwaveAI/src/pages/InstitutionClassroomPage.css:87) · [src/pages/ContextHubWorkspace.css:327](/Users/adityalanka/BrainwaveAI/src/pages/ContextHubWorkspace.css:327) · [src/pages/ContextHubWorkspace.css:470](/Users/adityalanka/BrainwaveAI/src/pages/ContextHubWorkspace.css:470)

Classroom fields use 11px text and metadata 8–10px; source removal hit areas are 22×22px and folder actions 25×28px. Breakpoints retain these sizes.

**Fix and acceptance:** Increase operational text and touch hit areas, then check 320/375px, zoom and long names. This is a usability finding, not a measured standards-conformance verdict.

### UX-33 · P2 · Global loading and some context actions are unnamed

**Evidence:** Source. [src/components/LoadingSpinner.js:5](/Users/adityalanka/BrainwaveAI/src/components/LoadingSpinner.js:5) · [src/pages/ContextHubWorkspace.js:651](/Users/adityalanka/BrainwaveAI/src/pages/ContextHubWorkspace.js:651) · [src/pages/ContextHubWorkspace.js:836](/Users/adityalanka/BrainwaveAI/src/pages/ContextHubWorkspace.js:836)

The full-screen route spinner has no accessible status text; create-folder and error-dismiss icon controls lack accessible names.

**Fix and acceptance:** Announce concise loading status and name icon actions. Verify loading and recovery are understandable without sight.

### UX-34 · P2 · Chat and shared-link failures masquerade as absent content

**Evidence:** Source. [src/pages/AIChat.js:1286](/Users/adityalanka/BrainwaveAI/src/pages/AIChat.js:1286) · [mobile/src/screens/AIChatScreen.tsx:320](/Users/adityalanka/BrainwaveAI/mobile/src/screens/AIChatScreen.tsx:320) · [src/pages/PublicChatView.js:48](/Users/adityalanka/BrainwaveAI/src/pages/PublicChatView.js:48) · [src/pages/PublicFlashcardView.js:61](/Users/adityalanka/BrainwaveAI/src/pages/PublicFlashcardView.js:61)

Failed chat-history requests clear messages, resembling an empty conversation. Public pages label network failures 'Link Not Found' with no retry in place.

**Fix and acceptance:** Separate unavailable, missing, forbidden and genuinely empty content. Preserve history or show a scoped error with Retry.

### UX-35 · P2 · Analytics can label stale data as the newly selected period

**Evidence:** Source. [src/pages/Analytics.js:98](/Users/adityalanka/BrainwaveAI/src/pages/Analytics.js:98) · [src/pages/Analytics.js:111](/Users/adityalanka/BrainwaveAI/src/pages/Analytics.js:111) · [src/pages/Analytics.js:120](/Users/adityalanka/BrainwaveAI/src/pages/Analytics.js:120)

Changing the range preserves old data if requests fail, while the new period is selected. ML/deep-stat failures are swallowed and can leave indefinite loaders.

**Fix and acceptance:** Track period-keyed loading/error/stale state per panel. With a failing range fetch, old data must retain its original label and offer Retry.

### UX-36 · P2 · Mobile optimistic actions fail without rollback

**Evidence:** Source; native runtime untested. [mobile/src/screens/CalendarScreen.tsx:195](/Users/adityalanka/BrainwaveAI/mobile/src/screens/CalendarScreen.tsx:195) · [mobile/src/screens/SharedWithMeScreen.tsx:138](/Users/adityalanka/BrainwaveAI/mobile/src/screens/SharedWithMeScreen.tsx:138) · [mobile/src/screens/SettingsScreen.tsx:52](/Users/adityalanka/BrainwaveAI/mobile/src/screens/SettingsScreen.tsx:52)

Reminder completion/deletion, shared-access removal and notification preference changes update the UI first, then silently ignore persistence failure.

**Fix and acceptance:** Rollback or durably queue failed changes and show status. Verify failed actions cannot appear permanently committed.

### UX-37 · P2 · Billing preview changes the displayed current billing cycle

**Evidence:** Source. [src/pages/ProfileNew.js:461](/Users/adityalanka/BrainwaveAI/src/pages/ProfileNew.js:461) · [src/pages/ProfileNew.js:683](/Users/adityalanka/BrainwaveAI/src/pages/ProfileNew.js:683) · [src/pages/ProfileNew.js:1254](/Users/adityalanka/BrainwaveAI/src/pages/ProfileNew.js:1254)

The same local billingCycle drives both plan preview and the 'Current plan' label. Choosing Yearly can relabel the current subscription without saving, while the same-plan guard prevents committing that cycle change.

**Fix and acceptance:** Separate persisted subscription state from preview controls. The current plan must not change until confirmed server success; support an explicit cycle change if offered.

### UX-38 · P1 · Native mobile has no institutional workspace routing

**Evidence:** Source; conditional release scope. [mobile/App.tsx:37](/Users/adityalanka/BrainwaveAI/mobile/App.tsx:37) · [mobile/App.tsx:66](/Users/adityalanka/BrainwaveAI/mobile/App.tsx:66) · [mobile/src/services/auth.ts:5](/Users/adityalanka/BrainwaveAI/mobile/src/services/auth.ts:5) · [mobile/src/navigation/TabNavigator.tsx:54](/Users/adityalanka/BrainwaveAI/mobile/src/navigation/TabNavigator.tsx:54)

All authenticated accounts enter learner onboarding/navigation; the reviewed auth model has no role. Student/educator classroom flows are unavailable through this navigation.

**Fix and acceptance:** Fetch authoritative role and provide the correct workspace or an explicit web handoff. Release gate applies if institutional use is promised on native mobile; otherwise declare that scope clearly.

### UX-39 · P2 · Mobile help and privacy entries are dead ends

**Evidence:** Source. [mobile/src/screens/SettingsScreen.tsx:64](/Users/adityalanka/BrainwaveAI/mobile/src/screens/SettingsScreen.tsx:64) · [mobile/src/screens/SettingsScreen.tsx:247](/Users/adityalanka/BrainwaveAI/mobile/src/screens/SettingsScreen.tsx:247)

Visible Help Center and Privacy & Security rows invoke 'Not available yet' alerts.

**Fix and acceptance:** Open supported help/privacy destinations, or communicate availability before interaction. A user must reach useful help from settings.

### UX-40 · P2 · Rate-limit administration hides request failures

**Evidence:** Source. [src/pages/AdminRateLimits.js:145](/Users/adityalanka/BrainwaveAI/src/pages/AdminRateLimits.js:145) · [src/pages/AdminRateLimits.js:178](/Users/adityalanka/BrainwaveAI/src/pages/AdminRateLimits.js:178)

Child loaders swallow exceptions and ignore non-OK responses, preventing the outer error UI from showing them. Operators can see empty or stale controls during an outage/forbidden response.

**Fix and acceptance:** Propagate typed failures and render forbidden/unavailable/stale states per section. Verify a failed load cannot look like valid empty configuration.

### UX-41 · P2 · Playlist open/delete actions can silently do nothing

**Evidence:** Source. [src/pages/PlaylistDetailPage.js:279](/Users/adityalanka/BrainwaveAI/src/pages/PlaylistDetailPage.js:279) · [src/pages/PlaylistDetailPage.js:321](/Users/adityalanka/BrainwaveAI/src/pages/PlaylistDetailPage.js:321) · [src/pages/PlaylistsPage.js:143](/Users/adityalanka/BrainwaveAI/src/pages/PlaylistsPage.js:143)

Failed item opening and deletion handlers only act on response.ok and silence catches, leaving no usable action feedback.

**Fix and acceptance:** Use per-item pending/error state and Retry. Verify opening and deletion errors retain context and explain the next action.

### UX-42 · P2 · Friend discovery labels a letter-filtered list as nearby

**Evidence:** Source. [src/pages/FriendsDashboard.js:129](/Users/adityalanka/BrainwaveAI/src/pages/FriendsDashboard.js:129) · [src/pages/FriendsDashboard.js:442](/Users/adityalanka/BrainwaveAI/src/pages/FriendsDashboard.js:442) · [src/pages/FriendsDashboard.js:584](/Users/adityalanka/BrainwaveAI/src/pages/FriendsDashboard.js:584)

Empty-query discovery requests search_users?query=a, then calls that arbitrary subset 'learners nearby'. It does not represent proximity or a full directory.

**Fix and acceptance:** Use a discover endpoint or label the actual search behavior accurately. Verify empty-query discovery does not exclude people solely because their name lacks a.

### UX-43 · P2 · Landing page makes visitors discover the product proposition

**Evidence:** Live; design judgment. [src/pages/Home.js:1](/Users/adityalanka/BrainwaveAI/src/pages/Home.js:1)

The first viewport presents Team, Problem, Architecture, Features, Why Cerbyl and Competition, plus 'Learning unified', without explaining a learner outcome. It resembles a company presentation more than a clear start to a study task.

**Fix and acceptance:** State who the product helps, what task it improves and what Get Started does; retain the existing brand. Test first-time comprehension without opening the tiles.

### UX-44 · P2 · Unknown URLs redirect silently to the marketing home

**Evidence:** Source. [src/App.js:396](/Users/adityalanka/BrainwaveAI/src/App.js:396)

The wildcard route navigates to /, erasing the failed destination and giving no explanation. Broken internal/shared links can look like an unexpected exit from the workspace.

**Fix and acceptance:** Show a not-found page with Back and a role-aware workspace action. Keep useful URL context and verify malformed/stale links.

## Fix order and release checks

1. **Protect work and correctness:** UX-01–07, 11–16. Use durable drafts, explicit request snapshots, correct time/score conversions and idempotent completion. Reproduce each failure condition before accepting its fix.
2. **Restore access and trustworthy status:** UX-08–10, 17–20, 30–36. Standardize responsive drawers, keyboard links, modal focus and loading/error/empty/saved states.
3. **Complete the learning handoffs:** UX-25–29 and the remaining P2s. Carry learner/course/source identity, clarify progress and previews, and remove dead ends.
4. **Validate platform scope:** UX-38 before promising classroom functionality on native mobile.
5. **Polish after behavioral fixes:** typography, target size, concise names, accurate copy and reduced-motion behavior.

Suggested skill paths: `$impeccable harden` for persistence/recovery and interaction behavior; `$impeccable adapt` for mobile layout; `$impeccable clarify` for scope/status copy; `$impeccable distill` for dashboard hierarchy; `$impeccable polish` after those changes. Implementation was not part of this review.

Release acceptance should include:
- Refresh/navigation/account switching cannot silently lose or mix user work.
- Submitted answers, grades, timestamps and displayed averages match the persisted records.
- Rejected requests never display success, a completed study queue or a new-user empty state.
- Keyboard users can reach all primary destinations, operate dialogs and recover from errors.
- 320/375/390px layouts keep the working area usable with navigation open; check zoom and long content.
- Native completion reconciles with the backend or clearly shows a durable unsynced queue.
- Role-specific smoke tests cover learner, student and educator accounts with representative records.

## Detector evidence and exclusions

The independent deterministic scan covered **356 scannable files** (227 JS, 129 CSS) and returned **749 pattern candidates across 88 files**, not 749 validated UX defects.

| Rule | Candidates |
|---|---:|
| overused-font | 572 |
| layout-transition | 65 |
| side-tab | 45 |
| codex-grid-background | 30 |
| gradient-text | 23 |
| bounce-easing | 14 |

There were 719 warnings and 30 advisories. Inter and geometric motifs are incumbent brand decisions and are not counted as production defects merely because a detector flags them. Concrete exclusions include six test font matches, intentional Canvas paper guides, mathematical borders and CSS message-bubble triangles. Layout-transition matches require actual performance measurement before claiming dropped frames.

The browser API exposes read-only evaluation; mutation/injected overlays were unavailable, so no detector overlay or injection server was created. Direct browser accessibility trees, screenshots and responsive viewport checks supplied the live evidence.

## Outstanding validation, not asserted defects

- Public flashcard faces have a fixed Flip flashcard name and CSS-only backface hiding. Verify the currently visible content and answer exposure with an actual screen reader before declaring a specific accessibility failure.
- Measure contrast on actual theme combinations; test reduced motion, 200% zoom and large text.
- Exercise role-specific coursework with test accounts and native iOS/Android runtimes.
- Validate payment completion/cancellation, large uploads, AI job retries, source-grounding correctness and offline recovery using designated test data.
- No exhaustive interaction coverage is claimed for every admin analytics subpanel, activity-feed variant or generated-content state.

## Run notes

Target: `src/App.js`; slug: `src-app-js`. No critique ignore file was present. Assessments A and B ran independently; detector findings were withheld until A finished. Parent synthesis validated source details and performed browser checks. No application changes or new tests were made. The detector JSON is retained alongside this report. Existing user changes and previous audit artifacts were preserved.

