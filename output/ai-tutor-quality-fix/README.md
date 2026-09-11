# Tutor quality fixes — 11 September 2026

**Implementation and local regression checks are complete. Final live quality verification is blocked by the configured AI key-pool budget. Do not treat this as a passed autonomous-teaching evaluation.**

## Changes

- A single difficulty resolver now controls the prompt, returned label and saved session. Explicit requests override profile defaults. Verified streaks adjust the next response rather than relabeling an explanation after generation.
- Grading no longer replaces the next question's expected answer with the previous attempt's answer. Completing an old problem no longer marks a new check complete.
- The tutor plans the actual pending move during response generation. It no longer makes an extra speculative lesson-plan call on each new question.
- Removed the separate call that inferred learning success from the tutor's own explanation. Student grading remains separate; the tutor's response cannot prove that a student learned.
- Added a compact independent response review covering arithmetic, sampling assumptions, repetition, missing problem data and the pending answer key. This is an additional model check, not a mathematical guarantee.
- Short numerical counterexamples are no longer forced into an analogy template. Corrections use fewer, non-redundant sections. A repeated final action is rendered from the saved pending action, while retaining new problem data.
- Groq tutor calls use JSON output mode and configurable `TUTOR_REASONING_EFFORT` (default `low`, supported alternatives `medium`/`high`). Ordinary chat generation is unchanged.
- The language classifier and prototype vectors warm during startup when startup embeddings are enabled.
- Interactive structured calls disable hidden SDK retries and have a 12-second request timeout. Temporary capacity errors return an explicit retry message rather than silently waiting or exhausting a daily key. This bounds individual provider calls, not every possible end-to-end request.
- On a retryable chat error, the browser restores the message in the composer and shows the server's explanation. Failed responses no longer produce study-tool suggestions. Fixed the collapsed-sidebar CSS overriding the mobile composer width.

## Validation

- **116 backend regression tests passed**, covering B2B workflows, mastery, tutor behavior, provider handling and the new quality cases.
- **26 AI workflow safety tests passed** separately, including failure paths that must not save successful messages or award rewards.
- **3 frontend error-formatting tests passed.**
- Production frontend build passed.
- Actual browser login, saved conversation display, desktop/mobile screenshots, injected 503 response, restored draft and mobile composer width were verified. No browser runtime errors were observed.
- `git diff --check` passed.

## Live evidence and limits

The original three response times were **10.28, 18.29 and 38.92 seconds**. A profiled baseline showed time in lesson planning, generation, post-response evaluation and first-use classifier loading.

The latest successful response took **2.25 seconds**, returned `beginner`, correctly described four equally likely counters and left the probability calculation unanswered. Its provider calls took 1.264 and 0.686 seconds (reported server generation times 0.653 and 0.188 seconds). This is **one successful final-version sample**, not a median, tail-latency claim or load test.

Earlier intermediate tests confirmed requested levels and progression through a saved conversation. They also exposed failures: a wrong weighted-spinner total, repeated/multiple questions, and a renderer that could drop a new question's setup. Those findings drove further changes. Intermediate transcripts are retained rather than presented as passing final evidence.

The final run stopped obtaining responses because no configured key could reserve the next request within its local daily budget. At inspection, the 22 Groq entries had a combined 220,000-token configured budget and 199,992 tokens recorded; remaining capacity was fragmented across entries and insufficient for the required reservations. **The provider pool budget was not raised.** A request for a temporary 50,000-token audit allowance is pending.

For test traffic, the currently running local backend has a process-only allowance for the fictional `northstar.student@example.com` account. Usage logging remains enabled. No `.env` file, production plan or provider key-pool budget was changed. This process-only allowance disappears when the server restarts normally.

**Still required:** fresh misconception and advanced samples on the final build, repeated runs, a saved multi-turn replay, and burst-capacity measurements with adequate provider capacity. Response quality and reliable sub-10-second latency are not yet fully established.

## Outputs

- [Screenshot gallery](SCREENSHOTS.html)
- [Final live run](after.json)
- [Original samples](before.json)
- [Profiled baseline](profiled-before.json)
- [Provider timings](provider-timings.log)
- [Backend tests](tests.log), [AI safety tests](safety-tests.log), [frontend tests](frontend-tests.log), [browser verification](browser-check.log), [build](build.log)

Screenshots 01 and 02 display a saved conversation generated during an intermediate run; they verify rendering and persistence, not final-model quality. Screenshot 03 demonstrates the current retry interface using an intentionally injected 503 response.

## Reproduce once an audit allowance is authorized

From the repository root:

```sh
/Users/adityalanka/miniconda3/envs/brainwave311/bin/python backend/scripts/tutor_quality_audit.py \
  --credentials .local/b2b-demo/credentials.json \
  --output output/ai-tutor-quality-fix/final-retest.json \
  --rounds 3 --pause-seconds 30
```

A paced run tests correctness without an artificial request burst. Separately run with `--pause-seconds 0` to measure capacity; report rate limits and failed requests as failures, not as fast successful responses.

Provider parameters were checked against [Groq's API reference](https://console.groq.com/docs/api-reference) and [reasoning documentation](https://console.groq.com/docs/reasoning).
