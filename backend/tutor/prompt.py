from __future__ import annotations

import logging

from tutor.contract import TUTOR_BASE_RULES, tutor_reply_style_rules
from tutor.state import TutorState, StudentState
from dkt.style_bandit import STYLE_INSTRUCTIONS

logger = logging.getLogger(__name__)

def build_tutor_prompt(state: TutorState) -> str:
    student            = state.get("student_state")
    memories           = state.get("episodic_memories", [])
    structured_context = state.get("structured_context", [])
    chat_history       = state.get("chat_history", [])
    task               = state.get("instructional_task", "")
    user_input         = state.get("user_input", "")
    rag_context        = state.get("rag_context", [])
    analysis           = state.get("language_analysis") or {}
    selected_style     = state.get("selected_style", "")
    intent             = state.get("intent", "")
    context_only       = bool(state.get("context_only"))
    tutor_mode         = bool(state.get("tutor_mode")) and intent != "project_build"

    is_greeting = intent in ("greeting", "returning_greeting")

    sections = []
    sections.append(_student_section(student, intent=intent, context_only=context_only))

    pref_memories = [m for m in memories if m.startswith("[STUDENT PREFERENCE]")]
    other_memories = [m for m in memories if not m.startswith("[STUDENT PREFERENCE]")]
    if pref_memories:
        sections.insert(1, _preferences_section(pref_memories))

    if not is_greeting:
        if context_only:
            sections.append(_context_only_section())
            if rag_context:
                logger.info(f"[TUTOR PROMPT] *** CONTEXT-ONLY: INJECTING {len(rag_context)} RAG chunk(s) ***")
                sections.append(_rag_section(rag_context))
            else:
                logger.info("[TUTOR PROMPT] CONTEXT-ONLY mode with no RAG chunks")
            if selected_style and intent != "project_build":
                sections.append(_style_section(selected_style))
        else:
            if chat_history:
                sections.append(_chat_history_section(chat_history))
            if structured_context:
                sections.append(_structured_context_section(structured_context))
            if other_memories:
                sections.append(_memory_section(other_memories))
            if rag_context:
                logger.info(f"[TUTOR PROMPT] *** INJECTING {len(rag_context)} RAG chunk(s) ***")
                sections.append(_rag_section(rag_context))
            else:
                logger.info("[TUTOR PROMPT] No RAG context — model knowledge only")
            if analysis:
                conf_section = _confidence_section(analysis)
                if conf_section:
                    sections.append(conf_section)
            if selected_style and intent != "project_build":
                sections.append(_style_section(selected_style))

    if tutor_mode and not is_greeting:
        sections.append(_tutor_mode_section(state))

    sections.append(_task_section(task, user_input, intent=intent))

    return "\n\n".join(sections)

def _student_section(s: StudentState | None, intent: str = "", context_only: bool = False) -> str:
    if not s:
        return "[STUDENT STATE]\nNo profile available."
    lines = ["[STUDENT STATE]"]
    if s.first_name:
        lines.append(f"- Name: {s.first_name}")
    if intent not in ("greeting", "returning_greeting") and not context_only:
        if s.strengths:
            lines.append(f"- Strengths: {', '.join(s.strengths)}")
        if s.weaknesses:
            lines.append(f"- Weaknesses: {', '.join(s.weaknesses)}")
        if s.current_subject:
            lines.append(f"- Current subject: {s.current_subject}")
    lines.append(f"- Preferred style: {s.preferred_style}")
    lines.append(f"- Difficulty level: {s.difficulty_level}")
    return "\n".join(lines)

def _chat_history_section(history: list[dict]) -> str:
    lines = [
        "[CURRENT CHAT HISTORY (recent messages from this conversation only)]",
        "Use this history to resolve short follow-ups such as 'give more', 'explain that', or 'continue'.",
        "If the student's current message clearly introduces a new topic, answer the new topic and do not force the old topic into it.",
    ]
    for msg in history[-6:]:
        lines.append(f"Student: {msg.get('user', '')}")
        ai_resp = msg.get("ai", "")
        if len(ai_resp) > 200:
            ai_resp = ai_resp[:200] + "..."
        lines.append(f"Cerbyl: {ai_resp}")
    lines.append("---")
    return "\n".join(lines)

def _structured_context_section(context_lines: list[str]) -> str:
    lines = ["[STRUCTURED LEARNING DATA (from database - use this for accurate answers)]"]
    lines.extend(context_lines)
    return "\n".join(lines)

def _memory_section(memories: list[str]) -> str:
    lines = [
        "[SUPPLEMENTARY MEMORY FROM THIS CHAT ONLY]",
        "This may support the current-chat history, but the student's latest message has priority.",
    ]
    for m in memories:
        lines.append(f"- {m}")
    return "\n".join(lines)

def _rag_section(chunks: list[str]) -> str:
    lines = ["[CURRICULUM CONTEXT (from student's uploaded documents and HS curriculum)]"]
    lines.append("Prioritise this material when relevant. Use it to give accurate, curriculum-aligned answers.")
    for i, chunk in enumerate(chunks[:5], 1):
        lines.append(f"\n--- Source {i} ---")
        lines.append(chunk)
    return "\n".join(lines)

def _context_only_section() -> str:
    return (
        "[CONTEXT-ONLY GROUNDED ANSWERING]\n"
        "Use only the selected context chunks below. "
        "Do not rely on prior conversation, profile data, or general knowledge."
    )

def _confidence_section(analysis: dict) -> str:
    signal_type      = analysis.get("signal_type", "neutral")
    knowledge_signal = analysis.get("knowledge_signal", 0.0)
    concept          = analysis.get("primary_concept")
    markers          = analysis.get("matched_markers", [])
    sem_conf         = analysis.get("semantic_confidence", 0.0)

    if signal_type in ("neutral", "neutral_question") or not signal_type:
        return ""

    lines = ["[DETECTED CONFIDENCE STATE]"]

    signal_labels = {
        "confusion":  "CONFUSION (student does not understand)",
        "re_ask":     "RE-ASK (student needs a completely different explanation)",
        "doubt":      "CONFIRMATION SEEKING (student is checking their understanding)",
        "hesitation": "HESITATION (student is uncertain but trying)",
        "mastery":    "MASTERY SIGNAL (student indicates they understood)",
        "extension":  "CONCEPTUAL EXTENSION (student making connections — strong signal)",
    }
    label = signal_labels.get(signal_type, signal_type.upper())
    lines.append(f"- Signal: {label}")

    if sem_conf >= 0.80:
        conf_tier = f"HIGH ({sem_conf:.0%}) — act on this strongly"
    elif sem_conf >= 0.50:
        conf_tier = f"MODERATE ({sem_conf:.0%}) — lean toward this signal"
    elif sem_conf > 0.0:
        conf_tier = f"WEAK ({sem_conf:.0%}) — treat as a soft hint"
    else:
        conf_tier = None

    if conf_tier:
        lines.append(f"- Classifier confidence: {conf_tier}")

    if concept:
        lines.append(f"- Concept in focus: {concept}")

    lines.append(f"- Knowledge signal: {knowledge_signal:+.2f} (−1 = forgot/lost, +1 = mastered)")

    if markers:
        lines.append(f"- Detected phrase: \"{markers[0]}\"")

    lines.append(
        "IMPORTANT: Let this signal shape your response structure. "
        "Do NOT ignore it. Do NOT narrate it — just act on it."
    )

    return "\n".join(lines)

def _preferences_section(pref_memories: list[str]) -> str:
    lines = ["[STUDENT PREFERENCES — MUST FOLLOW]"]
    lines.append("The student has explicitly stated these preferences. You MUST respect them in every response:")
    for p in pref_memories:
        clean = p.replace("[STUDENT PREFERENCE]", "").strip()
        lines.append(f"• {clean}")
    lines.append("Ignoring these preferences is a critical failure.")
    return "\n".join(lines)

def _style_section(style: str) -> str:
    instructions = STYLE_INSTRUCTIONS.get(style)
    if not instructions:
        return ""
    return f"[TEACHING FORMAT]\n{instructions}"

def _tutor_mode_section(state: TutorState) -> str:
    reply_style = (state.get("tutor_reply_style") or "guided").strip().lower()
    tutor_choice = (state.get("tutor_choice") or "").strip()
    session_state = state.get("tutor_session_state") or {}
    tutor_plan = state.get("tutor_plan")
    attempt_evaluation = state.get("attempt_evaluation")

    lines = [
        "[TUTOR MODE ACTIVE]",
        "- Bad: solving all terms in an integral and then asking the student to calculate a term already shown.",
        "- Good: state the power rule, identify the first term, then ask the student to integrate only that first term.",
        "- Good format: - **Step 1 - Identify the rule:** ... then - **Step 2 - Your turn:** ... on the next line.",
        *[f"- {rule}" for rule in TUTOR_BASE_RULES],
        *[f"- {rule}" for rule in tutor_reply_style_rules(reply_style)],
    ]
    if tutor_choice:
        lines.append(f"- The student clicked this option: {tutor_choice}. Evaluate it before teaching the next step.")
    if tutor_plan:
        current_step = getattr(tutor_plan, "current_step", 1)
        total_steps = getattr(tutor_plan, "total_steps", 0)
        steps = getattr(tutor_plan, "steps", []) or []
        current = next((step for step in steps if step.get("id") == current_step), steps[current_step - 1] if steps and current_step <= len(steps) else {})
        lines.extend([
            "[HIDDEN LESSON PLAN]",
            f"- Goal: {getattr(tutor_plan, 'goal', '')}",
            f"- Current step: {current_step} of {total_steps or max(1, len(steps))}",
            f"- Current step title: {current.get('title', 'Current step')}",
            f"- Expected current-step answer/key idea: {getattr(tutor_plan, 'expected_step_answer', '') or current.get('expected', '')}",
            f"- Known final answer: {getattr(tutor_plan, 'final_answer', '') or 'none'}",
            "- Do not reveal the full hidden plan. Only teach the current step and the immediate next student action.",
        ])
    if attempt_evaluation:
        verdict = getattr(attempt_evaluation, "verdict", "not_applicable")
        confidence = getattr(attempt_evaluation, "confidence", 0.0)
        rationale = getattr(attempt_evaluation, "rationale", "")
        expected_answer = getattr(attempt_evaluation, "expected_answer", "")
        next_action = getattr(attempt_evaluation, "next_action", "")
        if verdict and verdict != "not_applicable":
            lines.extend([
                "[GRAPH ATTEMPT EVALUATION]",
                f"- Verdict: {verdict}",
                f"- Confidence: {confidence}",
                f"- Reason: {rationale or 'No rationale provided.'}",
                f"- Accepted answer/key idea: {expected_answer or 'Use the prior step context.'}",
                f"- Recommended next action: {next_action or 'Advance one step if correct; repair the smallest gap if not.'}",
                "- You must honor this graph verdict in tutor_state.verdict.",
                "- If Verdict is correct, acknowledge the answer as correct and move to a new next step. Do not ask the same question again.",
                "- If Verdict is partly_correct, credit the correct part before fixing the missing part.",
                "- If Verdict is not_yet, explain only the smallest blocking misconception and ask for one retry or easier sub-step.",
            ])
    if session_state:
        lines.extend([
            "[CURRENT TUTOR SESSION STATE]",
            f"- Level: {session_state.get('level', 'intermediate')}",
            f"- Phase: {session_state.get('phase', 'teach')}",
            f"- Last verdict: {session_state.get('verdict', 'not_applicable')}",
            f"- Objective: {session_state.get('objective', 'Build understanding step by step')}",
            f"- Next action from last turn: {session_state.get('next_action', 'Try the next small step')}",
            f"- Attempts: {session_state.get('attempts', 0)}",
            f"- Correct answers: {session_state.get('correct_count', 0)}",
            f"- Mastery score: {session_state.get('mastery_score', 0.0)}",
            f"- Correct streak: {session_state.get('correct_streak', 0)}",
            f"- Wrong streak: {session_state.get('wrong_streak', 0)}",
            f"- Misconceptions seen: {', '.join(session_state.get('misconceptions') or []) or 'none'}",
            "- If correct streak is 2+, raise challenge slightly. If wrong streak is 2+, simplify or use an MCQ.",
        ])
    return "\n".join(lines)

def _task_section(task: str, user_input: str, intent: str = "") -> str:
    lines = ["[TASK]"]
    if task:
        lines.append(task)
    label = "Student's answer" if intent == "comprehension_answer" else "Student's question"
    lines.append(f"\n{label}: {user_input}")
    return "\n".join(lines)
