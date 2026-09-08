**Cerbyl: product, competition, commercial viability, and priorities**

Reviewed 8 September 2026. This is a decision memo based on the current repository, the public website, official competitor sources, selected automated checks, and the existing cost workbook. It is not a claim to have exercised every route or proven learning outcomes. Application code and the workbook were not changed.

**1. My verdict**

Cerbyl contains substantial, real product work. It has more depth than a thin chat interface: material ingestion, tutoring state, mastery signals, practice, scheduling, institutional records, mobile screens, and background processing exist in code. However, the present broad positioning is weak, several advertised advantages are already offered by competitors, and important trust and billing defects remain. I would not scale acquisition or promise institutions a production-ready platform in this condition.

I would continue only with a narrow, paid validation effort after fixing the critical defects. I would not spend the next three months adding more tools. The most promising product is a course-specific practice and remediation system: it uses the learner's materials, identifies a demonstrated gap, teaches that gap, tests it again, and brings it back for review. That outcome is more valuable than a catalogue of generators. Whether Cerbyl performs it better than alternatives remains unproven.

My commercial judgments are:

| Question | Judgment |
|---|---|
| Is there real engineering here? | Yes. Substantial implementation and useful automated coverage. |
| Is the broad “all-in-one AI learning workspace” differentiated enough? | No. The category already has close substitutes. |
| Is it ready for broad paid growth? | No, because of identity, entitlements, grading, and unverified economics. |
| Can it become a small revenue-generating business? | Plausible with a narrow audience, reliable core loop, and accessible distribution. |
| Is there evidence of product–market fit? | None established in this review. Users, revenue, retention, and customer interviews were not supplied. This does not mean they do not exist. |
| Is it a dependable near-term income plan? | Not yet. Paid pilots and renewals must establish that. |
| Is a large institutional business established? | No. Classroom screens do not establish procurement readiness or educational efficacy. |

There is no responsible numerical success probability available from this evidence. The useful decision is whether a bounded experiment produces payment, repeat use, and a measurable advantage before you commit substantially more time and money.

**2. Scope, verification, and confidence**

Inspected product documents, earlier reviews, web route and page structure, representative learning services and graphs, tutoring and grading paths, mastery and DKT code, authentication, subscriptions and limits, institutional APIs, mobile root navigation, CI, queue recovery, public marketing, and the cost workbook's values and formulas. The earlier September 5 reviews were leads; current source was checked before carrying forward key claims.

| Check performed in this review | Result and practical limit |
|---|---|
| Full web unit/component suite | 43 suites, 304 tests passed. Does not establish a real signed-in journey or model quality. |
| Current production frontend build, directed to `/tmp/cerbyl-review-build` | Passed, compiled successfully. Does not establish correct deployed environment variables. |
| Mobile TypeScript check | `tsc --noEmit` passed. No device or store-distribution test. |
| Focused backend suites | 74 tests passed across AI workflow safety, security invariants, token usage, tutor comprehension, and mastery reconciliation. Existing temporary Python environment; not a clean dependency installation. |
| Authentication cache reproduction | Actual extracted cache functions with fabricated users returned ID 123 for a subject belonging to ID 7 after a numeric identifier collision. No production account touched. |
| Weakness grading reproduction | Actual extracted grading helper, with a malformed provider response stub, marked an empty string and one-letter answer correct. No paid AI call. |
| Independent UX assessment A and B | Separate design review and detector/browser assessment. A completed before B findings entered synthesis. Source detector returned zero findings for sampled files; this is not an accessibility certification. |
| Saved local build in browser | Failed with Firebase `auth/invalid-api-key`. This is a local artifact/configuration finding, not a production-outage claim. |
| Live public website | Landing page, comparison panels, and registration rendered successfully. Public hero differs from local source. No registration, login, payment, or uploaded learner material was submitted. |

Not verified: production configuration, real payment settlement, all backend integration suites, deployment topology, database restore, complete multi-user isolation, real provider answer quality, authenticated educator/student workflows, responsive layouts across devices, customer retention, revenue, or legal compliance. Browser-only temporary servers were stopped and research tabs closed.

I asked for customer traction, target market, budget, and income timeline. No answer was available while preparing this review. Strategy below therefore assumes an early-stage product with limited resources and no verified repeatable acquisition channel. Prices proposed below are experiments, not measured willingness to pay.

**3. Feature inventory and commercial value**

“Implemented” below means substantive source exists. It does not mean every edge case or live workflow was validated. Priority is relative to an initial course-specific study product.

| Capability | Evidence in project | Commercial assessment | Recommended treatment |
|---|---|---|---|
| AI tutor with guided steps | `backend/tutor/graph.py`, `nodes.py`, `evaluator.py`, `src/pages/AIChat.js` | Important core function, widely available elsewhere. Guided teaching and accurate assessment matter more than model routing. | Keep central; benchmark on one subject. |
| Document-grounded answers | `backend/services/context_store.py`, `backend/tutor/nodes.py:1185`, `:1978` | Essential trust capability. Selected-source and no-match handling are valuable. | Make citations inspectable; test unsupported questions and mixed sources. |
| Persistent learning context | `memory_service.py`, `personalization_context.py`, tutor retrieval | Useful if it changes the next task appropriately. Storage of history alone is not differentiation. | Show which evidence prompted a recommendation; allow correction/reset. |
| Notes and block editor | `NotesRedesign.js`, editor components, note graph | Helpful supporting workspace, expensive to keep polishing; competes with established habits. | Keep a dependable minimum; stop chasing a full Notion replacement. |
| PDF/material library and context selection | ContextHub, Vault routes, document processor | Necessary input workflow, little standalone pricing power. | Optimize upload success, source clarity, and time to first useful practice. |
| Audio/video notes | media routes, media processor, AudioVideoNotes/AIMediaNotes | Useful for lectures but crowded and potentially costly. | Retain as an input option; meter minutes and processing. |
| Slide Explorer | question-bank slide processing and SlideExplorer | Potentially valuable for specific courses. | Connect explanations to actual slide/page/diagram evidence. |
| AI podcasts | podcast service, NotesPodcastMode | Convenience feature with strong substitutes. Passive listening does not itself prove learning. | Optional; test actual repeat use and cost before expansion. |
| Flashcards | flashcard routes/graph and Flashcards UI | Expected in the category. Card quality and editing/import are important. | Keep; generate only useful cards, allow correction and export. |
| FSRS review scheduling | `backend/services/fsrs_scheduler.py` | Valuable retention mechanism, not a proprietary moat. | Validate due dates and scheduling behavior; correct version claims. |
| Adaptive quizzes and question bank | quiz graph, adaptive_quiz, difficulty allocation, question bank | Can be core if questions match the course and diagnose concepts accurately. | Invest in expert-reviewed items, calibrated difficulty, and explanations. |
| Wrong-answer analysis and weakness practice | `backend/routes/weakness.py`, weakness services | One of the strongest possible reasons to return and pay. | Highest product priority, but fix grading and evidence integrity first. |
| Learning paths and activities | learningpath graph, lessons/activity services | Useful guidance; generated plans are common. | Tie to an exam deadline and observed performance rather than generic topic lists. |
| Knowledge maps / Concept Web | route/page and service code | Visualization may help some users, but a graph is not automatically a useful prerequisite model. | Secondary view; do not market an unverified semantic graph as validated curriculum structure. |
| BKT/DKT and adaptive strategies | ML pipeline, DKT trainer/inference, style/content bandits | Real implementation effort; predictive and instructional advantage unproven. | Compare against simple baselines before investing further. |
| Analytics, insights, activity timeline | analytics routes, Statistics, StudyInsights | Valuable only when it answers “what should I do next?” | Explain evidence; separate engagement, correctness, and uncertain mastery estimates. |
| XP, streaks, achievements, roadmaps | gamification and XP systems | Can support habits, but easily copied and can reward empty activity. | Reward completed meaningful practice; simplify display. |
| Quiz battles, friends, social feeds | battles/social routes, WebSocket service | Possible engagement and class distribution tool; cold-start and reliability burden. | Deprioritize until cohorts use it and networking/answer exposure is fixed. |
| Sharing, public sets, playlists | sharing/public routes and playlist UI | More plausible early distribution mechanism than a general social network. | Make a useful course set easy to share; measure recipients reaching first value. |
| Student and educator workspaces | institution models/routes, StudentDashboard, EducatorDashboard | Provides a foundation for paid cohorts and teacher intervention. | Pilot a single teaching workflow; do not sell a full LMS replacement. |
| Attendance, assignments, submissions, feedback | institution classroom APIs | Real administrative surface, but defects directly undermine teacher trust. | Repair only what a paid pilot needs, then test end-to-end. |
| Atlas / 3D and canvas experiences | Atlas/Canvas pages and graphics libraries | Distinctive presentation, no demonstrated incremental willingness to pay. | Freeze additional investment while validating the core. |
| Mobile client | Expo app, screens, navigation, auth | Important access channel, doubles QA and release workload. | Prioritize reliable daily review; institutional roles currently hand off to web. |
| Billing, quotas, background jobs | subscription catalog/routes, token limits, worker lifecycle | Necessary commercial infrastructure. | Treat accuracy and cost control as launch requirements. |

The product has enough feature breadth to test demand now. Adding another generator is unlikely to resolve the main commercial uncertainty.

**4. Competitors: what the market already offers**

Official public sources were checked on September 8. Vendor claims establish advertised features, not independent quality. Dynamic pricing, country, tax, promotions, and annual commitments can change the actual checkout. An unverified feature is not treated as absent.

| Competitor | Verified overlap / strength | Price evidence | Implication for Cerbyl |
|---|---|---|---|
| StudyFetch | Source-based tutor, study plans, lecture notes, flashcards/quizzes, practice tests, games, audio and voice; site also describes guided chat and a spaced-learning hub. | Current official pricing could not be reliably retrieved. Do not use old comparison-blog numbers. | Closest broad product competitor. More features or “connected studying” alone is not a persuasive win. [Official product](https://www.studyfetch.com/) |
| RemNote | Connected notes, flashcards, PDF learning, exam scheduling, AI tutor and grading; supports FSRS. | Pricing page showed annual-billed Pro $8/month ($96/year), Pro with AI $18/month ($216/year). These are not month-to-month prices. | A major omission from your public competitor table. Directly challenges notes + memory + spaced review. [Pricing](https://www.remnote.com/pricing), [FSRS](https://help.remnote.com/en/articles/9124137-the-fsrs-spaced-repetition-algorithm) |
| NotebookLM / Google's study ecosystem | Source-based tutoring, quizzes, flashcards, explanations with citations, audio and other learning outputs. | A usable base offering and paid tiers exist, but current exact dollar pricing was not established here. | Your materials-to-study-aids bundle is not unique. Compete on longitudinal remediation and course outcomes. [Google's learning features](https://blog.google/innovation-and-ai/models-and-research/google-labs/notebooklm-student-features/) |
| Knowt | Free learning and spaced-repetition modes, AI study tools and shared resources; paid teaching integrations/analytics advertised. | Public plans output showed $24.99 monthly / $149.99 annually, but the extracted contents mixed teacher features. Verify student tab and regional checkout before quoting these as student prices. | Strong free alternative. FSRS branding does not explain why someone should switch. [Product](https://knowt.com/), [Plans](https://knowt.com/plans), [Student plan distinctions](https://help.knowt.com/en/articles/10298016-what-are-the-differences-between-free-and-paid-accounts-for-students) |
| Quizlet | Established study sets and practice subscription offering; free, Plus, and Plus Unlimited options. | Exact current regional price not established from the accessible official upgrade page. | You must overcome existing content and habits. “Not just flashcards” is too dismissive a comparison. [Official upgrade page](https://quizlet.com/upgrade) |
| Anki | Dedicated flashcard workflow, shared decks, free computer version and web synchronization. | Free computer version; do not generalize this to every mobile app. | For dedicated recall users, importing/exporting and fitting their workflow may beat replacing it. [Official Anki](https://apps.ankiweb.net/), [AnkiWeb](https://ankiweb.net/about) |
| Mindgrasp | Multi-format material ingestion, AI questions, study tools, recording and paid app features. | Official pick-plan page displayed annual equivalents $5.99/$8.99/$10.99 and monthly reference prices $9.99/$12.99/$14.99 for Basic/Scholar/Premium. Reconfirm checkout/offer. | Summaries and upload-to-study are price-pressured. [Official plan page](https://app.mindgrasp.ai/pick-plan?split=frm) |
| Gizmo | Tutor, automated flashcards, recall practice, games, sharing, and mobile use. | Exact subscription price not established. | Gaming and AI flashcards are not an uncontested market. [Product](https://try.gizmo.ai/), [Import capabilities](https://help.gizmo.ai/en/articles/15647624-what-is-magic-import), [Developer app listing](https://apps.apple.com/in/app/gizmo-ai-tutor/id1610516671) |
| Jungle | Document/video question generation, diagram questions, chat explanations and Anki export. | Free allowances visible; paid dollar amount did not render reliably. | Specific question formats and workflow compatibility can sell without a sprawling workspace. [Official pricing/features](https://jungleai.com/pricing) |
| ChatGPT | General-purpose AI substitute; persistent cross-chat memory exists. | Current plan pricing not needed or established for this comparison. | “Chatbots remember nothing” and “persistent memory” as an exclusive advantage are incorrect. A structured learning-evidence history is the more precise distinction to demonstrate. [Official memory documentation](https://learn.chatgpt.com/docs/customization/memories) |
| Khanmigo | Guided learning, teaching tools, institutional offering and curricular foundation. | Public price: $4/month or $44/year for learners/families; teacher tools free. Eligibility restrictions apply, including US requirements described on its site. | Low-price and institutional competition exists. Do not pitch administrative breadth as a substitute for trusted teaching. [Pricing](https://www.khanmigo.ai/pricing), [Eligibility](https://www.khanmigo.ai/) |
| MagicSchool | Teacher/student AI tools, instructional insights, enterprise oversight and school integrations. | $12.99/month or $8.33/month billed annually for Plus; free and custom enterprise plans. | Schools expect integrations and governance as well as AI features. [Official plans](https://www.magicschool.ai/pricing) |

There are also existing workflows: a general AI assistant plus a notes app, shared PDFs, a messaging group, and a teacher. You compete with the effort of changing that routine. This review covers the most relevant comparison set, not literally every study app in existence. It does not include paid hands-on trials of every competitor.

**5. Which selling points are credible?**

| Current / possible message | Judgment | Better statement or proof needed |
|---|---|---|
| All study tools in one place | True as a broad description, weak differentiation. | Demonstrate less repeated setup between explanation, practice and review. |
| AI that remembers | Too broad; competitors have memory. | “Uses your recent practice results to help choose what to review.” Show a concrete correct example. |
| Full study loop | Useful mechanism, already pursued by competitors. | Win on fewer steps, specific course relevance, accuracy, and completion. |
| Science-backed scheduling / FSRS-6 | FSRS is useful but available elsewhere. Version-specific claim is not established by the inspected dependency/wrapper. | Say “spaced review” until exact deployed algorithm and behavior are verified. |
| Adaptive difficulty | Potentially useful, not proof of superior learning. | Demonstrate difficulty changes that help learners answer unseen questions later. |
| Weakness remediation | Strong potential; currently compromised by grading defects. | “Find the concepts you missed and practice them again with explanations.” No guaranteed mastery claim. |
| Course-material grounding | Important baseline, not exclusive. | Show citations to the right page and a refusal when evidence is insufficient. |
| Teacher intervention | Plausible paid use case. | Show an instructor which misconception to address, with the underlying attempts, then verify saved teaching time. |
| Quiz battles / gamification | Possible habit or distribution feature. | Measure whether invited classmates complete more useful practice and return. |
| DKT, bandits, LangGraph, pgvector, multi-model routing | Implementation details. | Keep out of primary sales copy; explain the resulting learner benefit. |
| “Every time,” “before every reply,” fixed forgetting percentages | Too absolute or insufficiently evidenced. | Qualify scope and support scientific statements with relevant evidence rather than universal percentages. |

The best proposed student positioning is: **“Turn your course materials into a clear practice-and-review routine.”** A more focused exam campaign, after implementing the required workflow, could say: **“Find the gaps in your course knowledge before exam day.”** Supporting copy: “Use your lecture materials, check your understanding, and return to the concepts you missed.”

The best proposed educator positioning is: **“See what your class misunderstood before the next lesson.”** Supporting copy: “Assign practice from your materials, inspect the answers behind each signal, and give targeted follow-up.” These are candidate messages, not permission to claim measured gains that do not yet exist.

Do not promise higher grades, exam readiness percentages, guaranteed retention, exclusive memory, or less study time until the exact claim is supported. A narrated example of a correct remediation loop will be more convincing than an unsupported green-check comparison table.

**6. Product quality issues that affect revenue**

**Critical: account identity and entitlements.** In `backend/deps.py:231`, the same cache namespace accepts subjects, IDs, usernames, and email strings. I reproduced a numeric username colliding with another user's database ID using the actual functions and fabricated users. `auth.py:1044` and other issuance paths still use reusable usernames as JWT subjects; username changes introduce another identity risk. Use immutable account IDs consistently, migrate/revoke ambiguous tokens, and test rename, reuse, numeric names, and multiple workers. These are repository findings; I did not exploit a deployed account.

`backend/routes/auth.py:2089` accepts subscription tier from an ordinary profile payload and commits it. The internal unlimited tier is valid in `subscription_catalog.py`, and `token_limits.py:117` uses the tier to determine access. A guarded checkout-selection endpoint does not protect this second write path. Remove entitlement fields from ordinary profile writes. Only verified billing events or authorized administrative operations should grant paid access.

**High: the proposed remediation advantage can produce false evidence.** `backend/routes/weakness.py:162` has its own evaluator. On malformed JSON, it falls back to checking whether the user's answer is a substring of the expected answer. Empty strings and one-character answers can pass; this was reproduced without external calls. `:380` then feeds correctness into TopicMastery. The generator also has a fallback question whose expected answer is “Varies” (`:123`). Failed generation or grading should be an explicit retryable failure, never learning evidence. Reject empty answers, strictly validate boolean output, and give uncertain grading an ungraded state. The main tutor's recent safety fixes do not cover this separate path.

**High: billing lifecycle is incomplete.** `backend/routes/subscription.py:458` validates signatures, a positive, but the inspected webhook processing does not maintain a durable event ledger or reject stale transitions. `token_limits.py:117` resolves access from tier without status/expiry policy. Test duplicates, reversed order, cancellation, payment failure, bounded grace and reactivation against a billing sandbox. Verify real provider settlement and reconciliation before depending on recurring income.

**High for institutions: classroom policy and attendance.** `backend/routes/institution/__init__.py:18` applies shared request scope enforcement; `deps.py:336` treats `student_id` as self-identity, while attendance payloads legitimately contain the teacher's students. This remains a source-traced authorization conflict. `ai_policy` appears in institution storage/serialization but not the inspected tutor authorization paths. A “restricted” assignment setting should either be explicitly advisory or enforced within the relevant app workflow. Do not imply control over external AI use.

**High for social positioning: battle integrity and delivery.** `backend/routes/battles.py:658` and `:886` include correct answers in question payloads. Active delivery needs distinct response models from post-submission review. `websocket_manager.py:11` holds one socket per user in process-local memory. Multiple processes/devices need shared event delivery and multi-connection support before “live multiplayer” is dependable. Server time and lifecycle enforcement should govern competition, not submitted client timing alone.

**Release and maintainability concerns.** CI still runs one frontend service test plus build (`.github/workflows/test-frontend.yml`) rather than the full suites used here. The passing static entitlement test checks for guard text and does not detect the profile bypass. Add behavior tests for identity, entitlements, grading, classroom transitions and crash recovery. Several modules exceed 4,000 lines. Incremental extraction around core workflows will reduce regressions; a wholesale rewrite is not justified by this review.

**What improved since the old review.** Job acknowledgment, atomic claims, heartbeat and recovery code now exist (`ai_job_queue.py`, `ai_job_lifecycle.py`, `worker.py`). Tutor failure handling and selected-source grounding have focused tests. Graded attempts are distinguished from conversational signals in `mastery_evidence.py`. Mobile now retrieves the server role and sends institutional users to a clear web-workspace handoff (`mobile/App.tsx:40`, `:78`), so the old claim that it blindly routes every role to learner tabs is stale. Backend dependency compatibility was also adjusted. Credit these changes; do not assume every September 5 finding is unchanged. Current build no longer produced that review's CSS-order warning.

**7. AI quality: how to make adaptation a real advantage**

The project has both concept-level and topic-level signals. `personalization_context.py` merges them into generation context. That is useful infrastructure, but a percentage stored in a database is not a validated measurement of understanding.

The DKT trainer can begin retraining with as few as 20 interactions (`backend/dkt/trainer.py:151`). That threshold is an execution gate, not evidence that there is enough representative data for a trustworthy model. It evaluates held-out loss; I did not establish evidence that it outperforms simpler scheduling or that the resulting teaching recommendations improve outcomes. Start with a transparent baseline, then earn additional complexity with measured improvements.

Build a fixed, instructor-reviewed evaluation set for one course. A practical starting design is 100–200 questions across the important concepts, including diagrams, calculations, ambiguous wording, missing-source questions and deliberately wrong answers. This sample is for diagnosing quality, not claiming comprehensive safety or statistically definitive learning efficacy.

Measure separately:

1. Question correctness, unique answerability and curriculum fit.
2. Whether the cited source actually supports the explanation.
3. False acceptance of wrong answers, false rejection of valid alternatives, and uncertain cases.
4. Whether corrupted/empty model output enters saved materials or mastery records.
5. Learning transfer to unseen items, followed by a delayed check about a week later.
6. Task success rate, median/p95 latency, and provider cost per completed useful session.

Have reviewers blind to which product generated the material where practical. Compare Cerbyl with the alternatives your pilot users actually use, with the same source materials and tasks. Include a simple “wrong-answer list + fixed review schedule” baseline. If that baseline is as effective, keep it until a more complex method earns its cost. Use user- or time-held-out evaluation as appropriate; do not score a learner on the same questions used to teach them and present that as broad mastery.

One useful product improvement is an evidence panel: “Recommended because you missed these two concepts; last checked on this date; review these source pages.” Show sparse-data uncertainty. Let learners flag bad questions and teachers correct answer keys. Trace every mastery update to a particular graded event, model/rubric version and source. Distinguish learner self-ratings, quiz accuracy, estimated recall and course grades.

**8. UX and the path to first value**

UX provenance: dual independent assessments, CLI detector, local-build browser attempts, plus parent inspection of live public landing/comparison/signup. No overlay was injected. Authenticated dashboard findings are source-based. A provisional source-based usability total was 21/40: significant improvement needed, not a measured conversion result.

The live headline is “Turn your study materials into understanding.” This is better than the local source's “Study Workspace,” but still broad. The layout gives six similarly prominent tiles to Team, Problem, Architecture, Features, Why Cerbyl, and Competition. The dark/gold geometric brand is recognizable. Its visual effort exceeds its demonstration of the actual study benefit.

The landing should show one real worked example before the visitor must explore panels. Choose one course source, show the question, its cited explanation, a missed concept, and the follow-up practice. Put an immediate sample experience beside the signup action. Move architecture and team information later. Show pricing and meaningful limits publicly; no need to create an account to learn the commercial offer.

Live signup presents seven fields before OTP, with Google sign-in initially disabled until acceptance below the form. The source then adds a substantial profile questionnaire. Collect only necessary authentication information up front; gather phone, display name and learning preferences when a specific feature needs them. Explain the legal-acceptance dependency beside Google sign-in without pre-checking consent. Offer a direct skip for nonessential onboarding.

The learner dashboard's “Continue studying” always navigates to notes rather than resuming the actual last activity (`DashboardCerbyl.js:1951`). It exposes many overlapping tools and hubs. Promote one of: resume current work, review due items, or practice a demonstrated weak concept. Give the recommendation a short explanation. Put broader exploration behind grouped navigation.

Preserve useful existing work: recent items, actionable card empty states, a dashboard stale-data warning, OTP resend/edit recovery, and labelled sidebar buttons. Fix real gaps instead of claiming every state is absent. Landing modal focus semantics and keyboard controls need work; source detectors did not catch those problems. The educational accessibility check must eventually cover the full learning flow, not just a landing page.

Suggested first-value journey: choose a sample or upload a short source → identify course/exam goal → answer a few relevant questions → receive one sourced explanation → complete a fresh follow-up question → save/return for review. Make the first useful result happen before a long personality or study-preference survey. Treat a 90-second sample and a sub-five-minute first loop as design targets to validate, not current performance claims.

**9. Business model and cost-workbook problems**

The code currently specifies Starter: free/100,000 tokens, Pro: $15/month or $150/year/2 million tokens, Power: $25/month or $249/year/5 million tokens (`backend/services/subscription_catalog.py`). Token enforcement is a rolling 30-day window by default, not necessarily the subscription anniversary. Explain that clearly or align it with billing.

Catalog estimated included-usage costs are $0.74, $2.13 and $6.95. Those hardcoded estimates do not establish margins. The estimator divides a tier's assumed cost by included tokens, making cost per token depend on the subscription plan rather than the actual model/input/output mix. Use these only as provisional planning numbers; calculate actual provider costs separately.

The workbook has meaningful planning effort: it includes staff, facilities, software, bandwidth, storage and hardware. But its current profitability outputs should not guide investment decisions:

| Workbook problem | Exact evidence | Why it matters |
|---|---|---|
| All active users are effectively billed | Margin Playbook B4 = 2,000 MAU, B7 = $15, B26 = `(B23-B22)*B4` | No paid share. The implied revenue is $30,000/month; at 5% paying it would be $1,500, before recalculating usage costs. |
| Model assumptions differ from current code | Assumptions B6:B9 use Gemini 2.0 Flash/1.5 Pro; Margin Playbook labels Haiku/Sonnet while referencing those rates | Blended prices and labels are not a reliable operational cost model. Google documents Gemini 2.0 Flash as retired. |
| “Worst case” increases revenue | Margin Trend C17 = $15; I17 = $25 | Heavy usage becomes a higher-priced plan by assumption. Stress-test heavy users staying on Pro. |
| Free-trial arithmetic lacks a consistent calendar | Margin Playbook B27 = 12 months of margin; B28 = 2 more months of cost; B29 subtracts the latter | For two free months within a 12-month year, revenue is 10P and cost 12C. The existing expression is 12P−14C. For 12 paid months plus 2 free months it is a 14-month horizon, not annual. Annual-discount treatment needs a separate definition. |
| Gross profit mixes operating expenses | Salary, facilities/admin and licenses are inside total cost used for margin | Could be useful operating contribution, but labelling it gross margin obscures comparison and missing costs. |
| Acquisition and retention not modeled | No paid funnel, churn cohort, refund/failed-payment flow or channel CAC in the inspected sheets | A profitable fully paying population is not an acquisition business model. |
| Usage mismatch | Workbook best/worst use 0.5M/3M tokens; plan limits allow 2M/5M | Typical users and allowed heavy users need separate cost distributions. |

Workbook source: `src/assets/Cost_Model_Cerbyl_v2.xlsx`, Assumptions B4:B32; Margin Playbook B4:B29; Margin Trend C4:C23 and I4:I23. Values/formulas inspected directly from the XLSX; workbook not modified. [Current Google API pricing and retirement notice](https://ai.google.dev/gemini-api/docs/pricing).

Illustrative economics below are assumptions, not Cerbyl forecasts. Suppose $15 monthly realized revenue per payer, $3.50 variable cost per payer including AI/processing/payment/support allowance, and $0.15 per active free user. They exclude fixed overhead, acquisition and founder pay. Annual discounts, taxes and refunds would require additional treatment.

| Active users | Paying share | Payers | Monthly revenue | Variable costs | Contribution before fixed costs and acquisition |
|---|---:|---:|---:|---:|---:|
| 1,000 | 2% | 20 | $300 | $217 | $83 |
| 1,000 | 5% | 50 | $750 | $317.50 | $432.50 |
| 1,000 | 10% | 100 | $1,500 | $485 | $1,015 |
| 5,000 | 5% | 250 | $3,750 | $1,587.50 | $2,162.50 |

At 5% paying there are 19 active free users per payer. Their assumed subsidy is $2.85; the contribution per payer becomes $8.65. With an illustrative $500 fixed monthly cost, about 58 payers cover that cost. With $2,000 founder income on top, about 290 payers are needed, implying about 5,800 active users at that paid share. This is arithmetic, not a traffic or conversion prediction. If free use costs $0.74 instead of $0.15, the subsidy becomes $14.06 and contribution per payer is negative under the same other assumptions. Measure actual free usage rather than assuming everyone consumes the allowance.

The operating model should have separate active free users and paying cohorts, activation, conversion, renewal/churn, actual cash collected, net revenue, model-specific input/output/reasoning/media costs, storage, OTP, payment fees, refunds, support minutes, fixed infrastructure, and acquisition. Meter expensive audio/video independently; token counts alone do not describe every cost. Count retries and failed external calls in provider costs even when users are not charged.

**10. Pricing and packaging to test**

Do not start a price war and do not use unlimited paid AI as the default growth tactic. A useful free experience should show the complete learning benefit once or for one limited course. Retaining access to existing notes/review while metering new generation can preserve trust. Explain limits as material sizes, study sessions, or media minutes once telemetry supports accurate conversions; keep a detailed allowance page for transparency.

For a global English-language course-specific pilot, test one core plan around $9–15/month, with a clearly bounded source/AI allowance. Treat the existing $15 as a candidate, not automatically too expensive. Defer the $25 Power tier unless observed heavy users understand and want a distinct allowance or service. If “priority processing” is offered, verify there is actual priority scheduling; the sampled queue/worker did not establish tier-based priority behavior.

If India is the initial market, test local willingness to pay with actual paid offers rather than direct currency conversion. An experimental student range of ₹299–599/month or a ₹499–999 short exam-prep pass could be tested only if the allowed workload has positive contribution. These are intentionally proposed tests, not researched market-clearing prices. Avoid building all pricing variants at once. Watch exam seasonality: a short pass can match episodic demand better than assuming year-round subscription retention.

For a small tutoring/coaching cohort, propose a bounded six-week pilot with one course, one instructor and 25–50 students. An experimental ₹5,000–15,000 pilot range could test willingness to pay if your audience is in India and costs support it. Separate setup/content work from recurring software. Agree on material scope, review ownership, support hours, and what evidence the buyer receives. Three such pilots are validation revenue, not proof of scalable SaaS margins.

Stripe is integrated in code. If the business entity uses India onboarding, Stripe currently describes new accounts as invite-only; existing active accounts continue to be supported. This review did not inspect your merchant approval. Establish that your actual entity can accept and settle the intended payment method before planning around automated subscriptions. [Stripe's India access policy](https://support.stripe.com/questions/stripe-accounts-are-invite-only-in-india).

**11. Choose a first customer you can reach**

My default recommendation is one adult college course or an adult-focused tutoring/coaching cohort where you have direct access to learners and an instructor. It fits your uploaded-material workflow, provides repeated deadlines, and makes it easier to judge content correctness. The right initial subject depends on your own expertise and available reviewers; this review does not establish that a particular exam or curriculum is already covered accurately.

| Segment | Opportunity | Obstacle | Decision |
|---|---|---|---|
| One college course / cohort | Shared materials, repeated practice, reachable instructor/class channels | Price sensitivity and course seasonality | Best default validation setting if accessible. |
| Independent tutor / small coaching operator | Buyer feels repetitive doubt-solving and practice-review workload | Service demands, content approval, identifiable learning records | Strong option if you can reach actual owners. |
| Individual students worldwide | Large potential audience | Expensive attention, powerful free alternatives, weak positioning | Avoid broad acquisition until one segment retains. |
| School/district or university-wide contract | Potential larger contract | Procurement, privacy, integrations, onboarding and support | Later; classroom records alone are insufficient. |
| High-stakes national exam preparation | Clear urgency | Verified syllabus coverage, expert item quality, trusted content and established providers | Only after domain-specific validation; do not imply generic AI is exam expertise. |

Before targeting minors or institutions, verify your own public promises: parental involvement, account lifecycle, deletion, role permissions, isolation, auditability and assignment AI policy. The live acceptance checkbox is not by itself proof of a complete verifiable-consent process. This is a product-process gap to establish with appropriate expertise, not a legal compliance determination.

Distribution should start with existing relationships, instructor demonstrations, permissioned course-resource sharing, and a useful sample set for one course. Do not launch a generic social network to solve distribution. Track whether a shared set leads to meaningful practice and a later return, not just an account. Broad paid ads and a large generic AI blog are poor early substitutes for finding a cohort that actually pays.

Interview people about their last real study session: what materials they used, where they got stuck, which tools they paid for, and what failed near an exam. Watch them complete a task without coaching. Ask them to choose between Cerbyl and their current method using their own material. A concrete paid offer and renewal decision are stronger evidence than “Would you use this?”

**12. A 60-day plan with decision gates**

These are proposed operating targets, not industry benchmarks or promises that the implementation will fit the calendar. Small cohorts are noisy; use counts and interviews alongside percentages.

| Period | Work | Evidence required |
|---|---|---|
| Days 1–7 | Repair immutable identity/cache, profile entitlements, grading fallbacks and billing lifecycle. Define one target segment. | Behavioral regression checks, sandbox payment lifecycle, no ungraded result written as mastery. If unresolved, delay paid onboarding. |
| Days 8–14 | Instrument the learning loop; simplify public story and first value; prepare one reviewed sample course. | A learner can complete the core sequence without founder explanation; events connect source → practice → feedback → return. |
| Days 15–30 | Recruit 20–30 relevant learners and a few potential cohort buyers; run a paid, bounded pilot after safety gates pass. | Actual materials used, task success and cost logs, objections, payment decisions. Aim for at least 10 genuine paying learners or 2–3 paid cohort pilots across the experiment. |
| Days 31–45 | Fix the largest observed completion/quality problems. Measure delayed learning and week-to-week return. | About 60% of enrolled pilot users complete the defined first loop; roughly 40% return for meaningful practice in week two. Interpret directionally, not as statistically definitive PMF. |
| Days 46–60 | Test renewal and an independent second cohort; compute actual contribution. | A meaningful share renews at the intended ongoing price; ideally at least half of the first paying cohort, with reasons understood. One acquisition route works beyond founders' closest friends. |

Define activation as completing sourced practice, receiving understandable feedback, and saving/starting the next review. Do not define it as signup or opening chat. Define retention as meaningful practice in a stated window, not a background page view. Define paid share separately from trial conversion. Exclude founders/test accounts. Track refunds and support time.

The current PostHog integration explicitly identifies users and records page views (`src/components/PostHogRouteTracker.js:63`). Backend activity logs are useful additional raw material. I did not establish a complete business conversion/retention funnel. Add explicit events such as first source processed, first graded attempt, first remediation completed, review returned, paywall shown, checkout completed, entitlement activated, renewal and cancellation. Keep study content and unnecessary personal data out of event properties.

Continue investing if customers pay, return, prefer the core task experience, and the observed contribution can fund acquisition/support. If signups rise but practice does not repeat, fix usefulness and routine before marketing. If people complete the loop but refuse payment, test a narrower urgent use case or a cohort buyer. If people pay but your support cost is excessive, simplify what you sell. If users consistently prefer existing free tools after two focused iterations, pause expansion or reposition instead of adding more features.

**13. What to build, keep, and freeze**

Build or strengthen: reliable grading; accurate citations; a transparent mistake history; a single next practice/review action; course/exam scope; a complete payment lifecycle; measured cost controls; shareable course practice; and corrections/export that preserve trust.

Keep as supporting capabilities: notes, flashcards, library, selected-source chat, quizzes, mobile review, and the instructor evidence view. Reuse the substantial implementation already present.

Freeze additional scope: Atlas/3D, more cosmetic dashboard variants, extra gamification systems, general social feeds, new content formats without demand, a large notes-editor rewrite, and neural-model sophistication without baseline wins. “Freeze” means stop investing while gathering evidence, not delete work or disrupt current users.

A defensible advantage could eventually combine trusted course content, instructor correction data, well-calibrated remediation, longitudinal evidence of learner improvement, and a repeatable way to reach that audience. None of those is created merely by embedding more chats or putting multiple tools behind one login.

**14. Final decision**

The current product is not good enough to justify confidence in a broad consumer launch or immediate institutional scaling. Its largest weaknesses are focus, trust, and unproven demand, not a shortage of features. There is enough useful implementation to justify a focused paid experiment after critical repairs.

My recommended next milestone is one safe, correct, easy-to-complete course learning loop that ten people pay to use and then choose to use again. That would provide more evidence for your future than another ten features.

Do not equate the project's outcome with your own future. If income is urgently required, protect time for dependable income while keeping this experiment bounded. The decision to expand should follow observed payments, repeat use and costs, not sunk development time or this review's optimism.
