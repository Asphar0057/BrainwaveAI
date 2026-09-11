# AI feature audit — 11 September 2026

The chat-to-notes content loss and the identified weakness persistence/display defects are fixed locally. This is not a claim that every AI feature has been exercised end to end.

## Fixed

| Issue | Result |
|---|---|
| Chat conversion summarized away code, diagrams, and images | Original rich blocks are appended independently of the AI summary. Python/code fences, Mermaid, GraphJSON, and Markdown images survive conversion. |
| Uploaded chat images lived only in attachment metadata | Conversion reads stored images and embeds a durable copy in the note. A missing attachment stops conversion instead of producing a silently incomplete note. |
| Editor import corrupted code and dropped image-only blocks | A shared Markdown/import/serialization pipeline preserves indentation, literal HTML, code language, images, and graph source. |
| Diagrams lost their type on save; Mermaid labels disappeared | Graph language survives save/reopen. Note graph blocks use the existing interactive graph renderer. Mermaid uses SVG text labels compatible with sanitization. |
| Math and tables lost formatting during conversion | Math delimiters are protected outside code; tables load and save as table blocks. |
| Note autosave returned HTTP 422 | The editor now submits the note ID as the string required by the API. Reproduced and verified in Chrome. The footer also uses actual unsaved changes instead of reverting to “Unsaved” when a temporary success indicator expires. |
| Multi-chat conversion could skip an empty session and save the rest | Empty/error session results stop the operation before note creation. Session separators remain Markdown. |
| Chat note format option was ignored | Selected structured, Q&A, or summary style reaches the backend prompt. |
| Weakness practice updated mastery but not the weakness record | Each accepted answer updates weakness counts, accuracy, priority, status, and practice timestamp in the existing transaction. Duplicate answers remain rejected. |
| Correct tutor answers did not improve matching weakness records | Verified correct answers update matching topic/skill records; unverified conversation does not. Incorrect tutor attempts now record the practice timestamp. |
| AI personalization mixed 0–1 and 0–100 weakness scales | Starter prompt ranking and thresholds use the correct scale. Mastered records are excluded from the affected chat, note, quiz, and flashcard personalization paths. |
| Reading the weakness analysis could overwrite newer practice results with old flashcard aggregates | Historical flashcard evidence is projected for display without mutating persisted weakness records. |
| Main diagnosis showed historical mistake topics while its totals described active weaknesses | Main list and totals now use the same current analysis. Refresh reloads both the analysis and mistake details. Placeholder topics such as `none` are filtered from the analysis without deleting history. |
| AI Chat's topic-only Practice Weakness action returned to the list | Topic-only handoffs now start a focused solo quiz with normalized difficulty. Existing generated-question handoffs still work. |

## Browser verification

Used Chrome against the running local frontend and backend, including actual AI chat conversion calls.

- Converted the existing mean/standard-deviation conversation to a note.
- Created a clearly named local QA chat containing Python with literal HTML/Markdown characters, Mermaid, GraphJSON, a sample PNG attachment, math, and a table.
- Converted that chat through Notes → From Chat → Import.
- Verified the image loaded at 192 × 192 pixels, chart rendered, and Mermaid labels read Input and Output.
- Edited the code and title, observed Saved, reloaded the page, and verified the exact code, graph sources, table, and loaded image remained.
- Independently checked the saved note in the local database: image data, graph language markers, escaped code, table, and browser edit were all present.
- Opened Weak Areas, Topic Mastery, and Intelligence. Verified the final main diagnosis and totals both showed 30 active topics, without the placeholder entry.

QA note: [QA rich conversion September 11 — saved](http://localhost:3000/notes/editor/34). The local QA chat and note are retained for inspection. No production deployment was performed.

## Automated verification

- Full frontend suite: 321 tests across 50 suites (full 320-test run plus the final route regression suite).
- Backend: 96 tests across independently run suites covering product/weakness persistence, rich conversion, AI workflow safety, chat image handling, mastery reconciliation, document flashcard sources, and note grammar output.
- Production frontend build passed.
- Backend suites with process-wide dependency stubs were run separately to avoid cross-suite module contamination. Tests do not establish the correctness of arbitrary model-generated answers.

## Remaining issues and limits

| Priority | Finding | Evidence / impact |
|---|---|---|
| High | Long source conversions silently use only an initial excerpt | `backend/services/import_export_service.py` truncates note-to-flashcard, note-to-question, media-to-question, and playlist-to-flashcard input to 4,000 characters. Material later in the selected sources can be omitted. These need chunking and coverage checks. |
| Medium | ContextHub community listing is disconnected | `src/services/contextService.js` calls `/api/context/community`, which is absent from the live OpenAPI routes. ContextHub catches the failure silently. This needs an access-scoped backend contract, not an unrestricted public-document fallback. |
| Medium | “PDF” question export returns HTML | `export_questions_pdf` returns an `.html` file, while the conversion UI reports PDF export. It needs real PDF generation or an accurately labeled HTML/print export. |
| Medium | Some conversion controls are still unsupported | The format selector is shown for question-to-note conversion, but that backend path always creates its fixed study guide. Several service options, including question type preferences, are not forwarded to their generation routes. Chat format forwarding is fixed in this change. |
| Medium | Historical weakness data is not a clean measure of verified mastery | Old misconception records remain in the local account. This change does not infer which historical records were legitimate or rebuild them. Persisted weakness provenance is also incomplete: the comprehensive analyzer initially labels UserWeakArea entries as quiz-derived even when another feature created them. |

Live browser validation covered chat conversion, note persistence/rendering, and weakness screens. Voice/podcast, all media providers, every playlist path, all export formats, and production queue deployment were not fully browser-tested in this run. Uploaded images are embedded in notes to keep them durable; image-heavy notes therefore grow in size. Existing notes that already lost content must be converted again from their source chats.

## Follow-up: CSS and generated-content quality

Fixed the high-specificity note CSS reset that stripped block controls of spacing. Rich blocks now follow the note paper theme; tables wrap and grow to fit their contents, short code blocks size to their lines, and graph source is collapsed behind an explicit disclosure. Reading-view tables render math and inline code. Display equations now use readable paper colors. Nested lists no longer duplicate child entries or discard inline code. Existing saved content is retained.

Browser testing also found that importing from an open editor changed the route without loading the new note. The editor now reloads on note-ID changes; a regression test covers switching without remounting.

Conversion instructions now favor subject-specific explanations, relevant assumptions, fewer sections, and one useful example. They discourage repetitive summaries and unsupported assertions. Rich preservation appends the actual code/visual blocks instead of repeating the entire answer. The original note 34 is a synthetic regression fixture, so its discussion of fixtures is not an example of normal educational content.

Reviewed two real conversions of the mean/standard-deviation lesson. The first omitted finite-moment assumptions and repeated its recap. After tightening the prompt, [sample note 36](http://localhost:3000/notes/editor/36) includes those assumptions and has no repeated recap. Its mean (1.4) and variance (1.24) calculations are correct, but its rounded standard deviation is **1.115 instead of 1.114**. This observed arithmetic error remains an AI quality issue: prompt improvements alone do not verify calculations. The sample is retained unchanged so the evidence remains reviewable. A calculation-verification stage is needed before claiming numerical reliability.

Follow-up validation: Chrome edit/reading views, fresh provider conversions, table formula rendering, and route switching; 31 relevant backend tests; frontend tests above; production build. The mechanical UI detector flagged incumbent font, accent-border, and animation choices; these were outside this targeted rendering repair. This quality review sampled statistics and the rich-content fixture; it does not certify every AI output or feature.

## Follow-up: screenshot attachment and drag/drop

The configured Groq vision default referenced an unavailable Llama Scout model (live HTTP 404). Gemini had no configured key. The existing Groq account's model listing and official documentation confirmed `qwen/qwen3.8-27b` supports images; both application and client defaults now use it, retaining the deployment override. No new credential is required.

Live Chrome verification: pasted an image, submitted through AI Chat, and received the correct red-top/blue-bottom description with “1 file analyzed.” A separate live provider test read `7 x 8`, answered 56, and identified a blue triangle above a red square. That latter answer also invented a repeated arrangement, so visual answers still require factual review; this repair restores image processing rather than guaranteeing perfect descriptions.

The conversation area now accepts file drops and displays an animated overlay. Nested drag-enter/leave events no longer flicker the target off, cancelled drags reset, internal chat/text drags remain separate, and reduced-motion users receive a static indicator. Structured attachment failures display the message without raw HTTP/JSON. Automated verification: 6 focused frontend tests and 5 backend image tests passed; production build passed. Native OS dragging was not exercised end-to-end; drop behavior was covered with regression tests. Browser image submission was exercised through clipboard paste because the automation file chooser rejected file assignment.
