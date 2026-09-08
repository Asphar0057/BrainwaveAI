---
target: src/pages/Home.js
score: 21
max_score: 40
p0: 0
p1: 4
assessment: dual-agent
browser: live-public-only
timestamp: 2026-09-08T16-07-24Z
slug: src-pages-home-js
---
**Cerbyl UX review — September 8, 2026**

Provenance: dual independent subagents for assessment A (design) and B (detector/browser). A finished before B evidence was received. Parent subsequently inspected live public landing, comparison panels, and registration. Target: src/pages/Home.js, with sampled learner dashboard, sidebar and registration/onboarding sources. No live overlay; source detector returned zero findings. No authenticated workflow or full responsive audit was completed.

The public design is intentionally graphite/gold and geometric, but its architecture/team/competition panels read like a pitch deck. The product's useful connected-learning story deserves a real example and one obvious starting action. The live hero is “Turn your study materials into understanding.” The local source hero differs, so the source-based critique must not be mistaken for exact deployed copy.

Provisional source-based heuristics: visibility 3, real-world match 2, user control 2, consistency 2, prevention 3, recognition 2, efficiency 2, minimalism 2, recovery 2, help 1. Total 21/40. This is an editorial assessment, not measured usability or conversion data.

What works: distinct brand; shared native labelled sidebar buttons; dashboard recent items and actionable flashcard empty state; stale-data alert; OTP resend/edit recovery; educator task flow from materials to assignments and student evidence.

Priority findings:

1. P1: Six equally prominent landing panels obscure the learner outcome. Home.js:86, :428. Show one real source-to-practice-to-review example before Team and Architecture. Live screenshot corroborates the competing panels.
2. P1: First value comes after seven registration fields and OTP, followed by preference setup. Register.js:93, ProfileQuiz.js:123, :404. Live signup confirms seven inputs and Google disabled before the lower legal checkbox. Collect only necessary details and offer a direct skip for nonessential profile questions.
3. P1: Dashboard favors feature inventory; “Continue studying” always goes to notes/dashboard. DashboardCerbyl.js:1951, :2007. Resume actual work or show one due/recommended practice action. This is source evidence, not authenticated browser observation.
4. P1: Landing modal uses generic divs without full dialog/focus semantics; tile Enter handling omits Space. Home.js:376, :438, :461. Escape and labelled modal controls already exist. Use semantic buttons and focus move/trap/restore.
5. P2: Absolute learning/memory promises exceed evidence. Home.js:65–74 and the live competitor table. Replace “nothing carries over” with a precise, current comparison; distinguish a structured practice record from generic memory.

Cognitive-load assessment: high, with five source-based failures in chunking, hierarchy, one-decision-at-a-time, choice prioritization and progressive disclosure. Six landing tiles, ten sidebar links/twelve modules, and several onboarding choice sets are examples. Menu size alone does not prove an unusable interface.

Persona implications: first-time learners need a concrete first action and plain labels; power users need direct skip and contextual resumption; keyboard/screen-reader users need correct modal and selection semantics. Emotional journey currently emphasizes ceremony and setup before a useful learning result.

Suggested future work: shape the public first-value journey, simplify the learner dashboard, improve progressive onboarding, and harden modal/selection semantics. No UI changes were requested or made. Questions skipped: the immediate findings are sufficiently clear to recommend those actions, and the broader commercial review already requested the missing customer/traction context.

Limitations: saved September 7 build was blank with Firebase auth/invalid-api-key in both independent browser attempts. Parent verified live cerbyl.com and /register render, so no production outage is claimed. Source detector scans returned no findings, which does not validate contrast, responsive behavior or accessibility. Temporary servers stopped, research tabs closed. Full commercial recommendation and evidence are in output/CERBYL_COMMERCIAL_REVIEW_2026-09-08.md.
