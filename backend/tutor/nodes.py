from __future__ import annotations

import json
import re
import logging
from datetime import datetime, timezone
from typing import Any, Optional

from starlette.concurrency import run_in_threadpool

from tutor.state import TutorState, StudentState, EvalResult, AttemptEvaluation, TutorPlan
from tutor import chroma_store
from tutor.prompt import build_tutor_prompt
from tutor.evaluator import evaluate

logger = logging.getLogger(__name__)

_dkt_vocab: dict | None = None
_lang_embedding_cache: dict = {}
_TUTOR_CONTRACT_LEAK_MARKERS = [
    "visible markdown answer with numbered step sections and latex",
    "json schema:",
    "[tutor mode active]",
    "return only valid json",
    "\"tutor_state\"",
    "\"options\"",
]

async def _agenerate(ai_client, prompt: str, max_tokens: int = 2000, temperature: float = 0.7) -> str:
    return await run_in_threadpool(
        ai_client.generate,
        prompt,
        max_tokens,
        temperature,
    )

def _get_vocab() -> dict | None:
    global _dkt_vocab
    if _dkt_vocab is None:
        try:
            from dkt.language_analyzer import load_vocab_if_available
            _dkt_vocab = load_vocab_if_available() or {}
        except Exception:
            _dkt_vocab = {}
    return _dkt_vocab or None

CONFUSION_PATTERNS = [
    r"\bi\s*don'?t\s*(get|understand)\b",
    r"\bwhat\s*do\s*you\s*mean\b",
    r"\bconfus",
    r"\bwait\s+what\b",
    r"\bhuh\b",
    r"\bstill\s*(don'?t|confused)\b",
    r"\bcan\s*you\s*(explain|clarify)\b",
    r"\bi'?m\s*lost\b",
]

GREETING_PATTERNS = [
    r"^(hi+|hello+|hey+|hiya|howdy|good\s*(morning|afternoon|evening|day))\b",
    r"^(what'?s\s*up|sup|yo+|hola+|hoi+|hai+|heya|ello|helo+)\b",
    r"^(greetings|salut|bonjour|namaste|ciao|hallo+)\b",
    r"^\W*(hi+|hello+|hey+|hola+)\W*$",
]

def _detect_greeting_energy(text: str) -> str:
    t = text.strip()
    if re.search(
        r'(yo[\s!]*){2,}|y[o]{3,}|h[e]{3,}y+|h[i]{3,}|s[u]{2,}p|!{2,}|[A-Z]{4,}|heyyyy|suuup',
        t, re.IGNORECASE
    ):
        return "high"
    if re.search(r'\byo\b|sup\b|heya|hiya|heyy+|hiii+|wazzup|wassup', t, re.IGNORECASE):
        return "medium"
    return "calm"

FOLLOWUP_PATTERNS = [
    r"\bwhat\s*about\b",
    r"\band\s+(what|how|why)\b",
    r"\bcan\s*you\s*(also|additionally)\b",
    r"\bfollow\s*up\b",
    r"\bmore\s*(on|about)\b",
    r"\bbut\s+(what|how|why)\b",
]

COMPREHENSION_CHECK_PATTERNS = [
    r"\bcomprehension\s+check\b",
    r"\bcheck\s+your\s+understanding\b",
    r"\bquick\s+(?:understanding\s+)?check\b",
    r"\bto\s+ensure\s+you'?re\s+following\s+along\b",
    r"\bcan\s+you\s+(?:briefly\s+)?(?:describe|explain|summari[sz]e|integrate|differentiate|solve|calculate|compute|find|apply|choose|select|identify|classify|compare)\b",
    r"\bhow\s+(?:would|do)\s+you\s+(?:explain|describe|understand|solve|calculate|compute|find|apply|choose|select|identify|classify|compare)\b",
    r"\bwhat\s+is\s+(?:the\s+)?(?:next\s+step|answer|result|value|integral|derivative|solution|cause|effect|reason|main\s+idea|correct\s+option)\b",
    r"\bwhat\s+do\s+you\s+understand\b",
    r"\btry\s+(?:answering|explaining|summari[sz]ing|solving|calculating|computing|finding|integrating|differentiating|applying|choosing|selecting|identifying|classifying|comparing)\b",
    r"\byour\s+turn\b",
    r"\bnow\s+(?:you|your)\b",
    r"\bwhich\s+(?:option|choice|answer)\b",
    r"\bselect\s+(?:one|the\s+best|the\s+correct)\b",
]

MATH_ATTEMPT_RE = re.compile(
    r"(?:\d|[a-z]\s*(?:\^|\*\*|²|³)|\\frac|\\sqrt|\\int|\\sum|[=+\-*/^()])",
    re.I,
)

NEW_QUESTION_START_RE = re.compile(
    r"^\s*(?:what|why|how|when|where|who|which|can|could|would|should|please|"
    r"explain|tell|show|give|quiz|make|create|generate)\b",
    re.I,
)

RECALL_PATTERNS = [
    r"\bwhat\s*did\s*(i|we)\s*(ask|discuss|talk|study|learn|cover|do|work)\b",
    r"\bdo\s*you\s*remember\b",
    r"\blast\s*(time|session|chat|conversation)\b",
    r"\bprevious(ly)?\s*(session|chat|conversation|topic)?\b",
    r"\bwhat\s*were\s*we\b",
    r"\bwhere\s*did\s*we\s*(leave|stop)\b",
    r"\bcontinue\s*(from)?\s*(where|last)\b",
    r"\bremember\s*(what|when|our)\b",
    r"\bwhat\s*(have\s*)?we\s*(been|covered)\b",
]

FLASHCARD_PATTERNS = [
    r"\bflashcard",
    r"\bflash\s*card",
    r"\bcards?\s*(i|we)\s*(stud|review|learn|creat|made|did)",
    r"\b(stud|review|learn|practic)\w*\s*(card|flashcard)",
    r"\bquiz\s*me\b",
    r"\bmy\s*cards?\b",
]

NOTE_PATTERNS = [
    r"\bnotes?\b",
    r"\bwhat\s*(did\s*)?(i|we)\s*(write|note|jot)",
    r"\bmy\s*notes?\b",
    r"\bstudy\s*notes?\b",
    r"\bnote\s*i\s*(took|made|wrote|created)",
]

ACTIVITY_PATTERNS = [
    r"\bwhat\s*(did|have)\s*(i|we)\s*(done|do|study|learn|work|cover)\b",
    r"\bmy\s*(progress|activity|history|learning)\b",
    r"\bhow\s*(am\s*i|have\s*i)\s*(doing|progressing)\b",
    r"\bsummar(y|ize)\s*(my|of)\b",
]

PROJECT_BUILD_ACTION_RE = re.compile(
    r"\b(?:build|create|develop|implement|make|scaffold|code|ship|launch|set\s*up|spin\s*up)\b"
    r"|\b(?:architect|design|prototype)\s+(?:an?|the|this|that|my|our)\b",
    re.I,
)

PROJECT_BUILD_TARGET_RE = re.compile(
    r"\b(?:"
    r"software|mvp|prototype|app|application|website|web\s*app|mobile\s*app|"
    r"dashboard|portal|platform|api|backend|frontend|full[-\s]*stack|service|"
    r"microservice|system|tool|cli|bot|chatbot|agent|assistant|workflow|pipeline|"
    r"automation|model|classifier|recommendation\s*engine|search\s*engine|"
    r"game|extension|plugin|integration|database|data\s*warehouse|etl|"
    r"python|javascript|typescript|react|next\.?js|node\.?js|fastapi|django|flask|"
    r"machine\s*learning|deep\s*learning|ai"
    r")\b",
    re.I,
)

PROJECT_BUILD_DIRECT_RE = re.compile(
    r"\b(?:"
    r"help\s+me\s+(?:build|create|develop|implement|make|code)|"
    r"(?:build|create|develop|implement|make|code)\s+me\s+|"
    r"give\s+me\s+(?:the\s+)?(?:code|architecture|implementation|project\s+structure)\s+for"
    r")\b",
    re.I,
)


def _is_project_build_request(text: str) -> bool:
    request = str(text or "").strip()
    if not request:
        return False
    return bool(
        PROJECT_BUILD_TARGET_RE.search(request)
        and (
            PROJECT_BUILD_ACTION_RE.search(request)
            or PROJECT_BUILD_DIRECT_RE.search(request)
        )
    )


def _is_repetitive(text: str, chat_history: list[dict]) -> bool:
    if not chat_history:
        return False
    text_lower = text.lower().strip()
    recent = chat_history[-5:]
    repeat_count = sum(
        1 for msg in recent
        if msg.get("user", "").lower().strip() == text_lower
    )
    return repeat_count >= 2

def _last_ai_message(chat_history: list[dict]) -> str:
    for turn in reversed(chat_history or []):
        if not isinstance(turn, dict):
            continue
        ai_text = (
            turn.get("ai")
            or turn.get("assistant")
            or turn.get("ai_response")
            or turn.get("response")
            or ""
        )
        if ai_text and str(ai_text).strip():
            return str(ai_text)
    return ""

def _extract_last_question(text: str) -> str:
    normalized = re.sub(r"\s+", " ", text or "").strip()
    if not normalized:
        return ""
    questions = re.findall(r"([^?]{8,320}\?)", normalized)
    if questions:
        return questions[-1].strip(" -#*")
    return normalized[-320:].strip()

def _previous_comprehension_check(chat_history: list[dict]) -> str:
    last_ai = _last_ai_message(chat_history)
    if not last_ai:
        return ""
    if not any(re.search(pattern, last_ai, re.I) for pattern in COMPREHENSION_CHECK_PATTERNS):
        return ""
    return _extract_last_question(last_ai)

def _looks_like_comprehension_answer(text: str) -> bool:
    stripped = (text or "").strip()
    if len(stripped) < 1:
        return False

    lower = stripped.lower()
    if NEW_QUESTION_START_RE.search(stripped):
        return False
    if stripped.endswith("?") and re.search(r"\b(what|why|how|can|could|explain|tell|show)\b", lower):
        return False

    if re.search(r"\b(i\s+don'?t\s+know|not\s+sure|no\s+idea|idk)\b", lower):
        return True

    if MATH_ATTEMPT_RE.search(stripped) and len(stripped) <= 160:
        return True

    words = re.findall(r"[a-zA-Z][a-zA-Z'-]*", stripped)
    if len(words) >= 5:
        return True

    return bool(re.search(r"\b(it|this|that|they|wave|particle|means?)\b", lower))

_CITATION_MARKER_RE = re.compile(r"\[(\d+)\]")

def _append_rag_citations(response: str, rag_sources: list) -> str:
    """If the tutor response uses [n] citation markers and doesn't already end with a
    Sources line, append one resolved from rag_sources (book_title/page), so citations
    are always accurate even if the model's own trailer is missing or wrong."""
    if not response or not rag_sources:
        return response
    if "sources:" in response.lower():
        return response
    used_indices = sorted({int(m) for m in _CITATION_MARKER_RE.findall(response)})
    if not used_indices:
        return response
    by_index = {s["index"]: s for s in rag_sources if isinstance(s, dict)}
    parts = []
    for i in used_indices:
        src = by_index.get(i)
        if not src:
            continue
        page_str = f", p.{src['page']}" if src.get("page") else ""
        parts.append(f"[{i}] {src.get('book_title', 'Unknown')}{page_str}")
    if not parts:
        return response
    return f"{response}\n\n**Sources:** {' · '.join(parts)}"

def _has_tutor_contract_leak(text: str) -> bool:
    lowered = str(text or "").strip().lower()
    if not lowered:
        return False
    return any(marker in lowered for marker in _TUTOR_CONTRACT_LEAK_MARKERS)

async def _repair_tutor_contract_response(ai_client, broken_response: str, user_input: str) -> str:
    repair_prompt = f"""
You are repairing a broken tutor response.

Student request:
{user_input}

Broken tutor output:
{broken_response[:2500]}

Rewrite it as valid TutorResponse JSON only.

Rules:
- Do not repeat schema text, placeholder text, meta instructions, or internal labels.
- The answer field must contain only short student-facing markdown bullet points.
- Use 2-4 bullets maximum.
- The final bullet must be one concrete student action.
- Keep tutor_state concise and realistic.
- Use an empty options array unless an MCQ is genuinely helpful.

Return only JSON with keys: answer, tutor_state, options.
""".strip()
    return await _agenerate(ai_client, repair_prompt, max_tokens=900, temperature=0.2)


def _project_response_needs_repair(response: str) -> bool:
    text = str(response or "").strip()
    if len(text) < 500:
        return True

    lowered = text.lower()
    file_mentions = re.findall(
        r"\b[\w.-]+\.(?:py|js|jsx|ts|tsx|json|ya?ml|toml|sql|md|env|go|rs|java|kt|swift|html|css)\b",
        text,
        re.I,
    )
    has_file_tree = (
        len(set(file_mentions)) >= 2
        or bool(re.search(r"(?:^|\n)\s*[├└│]", text))
        or bool(re.search(r"(?:^|\n)\s*[\w.-]+/[\w./-]+", text))
    )
    has_commands = bool(
        re.search(
            r"`[^`\n]*(?:"
            r"npm|npx|pnpm|yarn|pip|python\s+-m|uvicorn|docker|cargo|go\s+run|"
            r"dotnet|mvn|gradle|git|mkdir|make|composer|bundle|flutter|expo"
            r")[^`\n]*`",
            text,
            re.I,
        )
        or re.search(
            r"(?:^|\n)\s*(?:\\$|>)?\s*(?:"
            r"npm|npx|pnpm|yarn|pip|python\s+-m|uvicorn|docker|cargo|go\s+run|"
            r"dotnet|mvn|gradle|git|mkdir|make|composer|bundle|flutter|expo"
            r")\s+",
            text,
            re.I,
        )
    )
    has_verification = bool(
        re.search(
            r"\b(?:verify|verification|acceptance criteria|success criteria|definition of done)\b",
            lowered,
        )
    )
    required_signals = [
        bool(re.search(r"\b(?:assumptions?|defaults?)\b", lowered)),
        bool(re.search(r"\b(?:stack|architecture|data flow|components?)\b", lowered)),
        has_file_tree,
        has_commands,
        has_verification,
    ]
    vague_handoff = bool(
        re.search(
            r"\b(?:"
            r"what framework (?:do you|would you)|"
            r"which (?:framework|database|model) (?:do you|would you)|"
            r"provide (?:the|your) (?:framework|parameters|requirements)|"
            r"let me know (?:the|your) (?:framework|stack|requirements)"
            r")\b",
            lowered,
        )
    )
    return (
        sum(required_signals) < 4
        or not has_file_tree
        or not has_commands
        or not has_verification
        or vague_handoff
    )


async def _repair_project_build_response(
    ai_client,
    broken_response: str,
    user_input: str,
) -> str:
    repair_prompt = f"""
Rewrite the response below as a concrete project-delivery blueprint.

User request:
{user_input}

Weak response:
{broken_response[:5000]}

Requirements:
- Infer sensible requirements, state assumptions, and choose one coherent stack.
- Do not ask the user to select a framework, model, database, or basic parameters.
- Start with the deliverable and selected defaults.
- Include architecture and data flow.
- Include a real file tree.
- Give exact setup and run commands.
- Give ordered implementation steps naming files, interfaces, and observable results.
- Include core data entities, API routes/request shapes, environment variables, and a runnable vertical slice.
- End with verification commands, measurable acceptance criteria, likely failure points, and the next milestone.
- Separate optional enhancements from the runnable MVP.
- Do not call anything latest unless it was verified.
- Do not narrate this rewrite or mention the weak response.

Return only the improved user-facing markdown response.
""".strip()
    return await _agenerate(ai_client, repair_prompt, max_tokens=3200, temperature=0.3)


def _detect_query_domain(text: str) -> list[str]:
    text_lower = text.lower()
    domains = []
    if any(re.search(p, text_lower) for p in FLASHCARD_PATTERNS):
        domains.append("flashcard")
    if any(re.search(p, text_lower) for p in NOTE_PATTERNS):
        domains.append("note")
    if any(re.search(p, text_lower) for p in ACTIVITY_PATTERNS):
        domains.append("activity")
    return domains

def detect_intent(state: TutorState) -> dict:
    text = state.get("user_input", "").lower().strip()
    chat_history = state.get("chat_history", [])
    previous_check = _previous_comprehension_check(chat_history)
    last_ai = _last_ai_message(chat_history)

    # Slide Explorer supplies a bounded, source-grounded study prompt. Deck text
    # can contain words such as "app", "tool", or "create" that otherwise look
    # like a project-build request, so honor the explicit handoff before applying
    # the generic project detector.
    if "[[presentation_study_context]]" in text:
        return {"intent": "question"}

    if _is_repetitive(text, chat_history):
        return {"intent": "repetitive"}

    if state.get("tutor_choice"):
        return {
            "intent": "comprehension_answer",
            "comprehension_check": previous_check or _extract_last_question(last_ai),
        }

    if previous_check and _looks_like_comprehension_answer(state.get("user_input", "")):
        return {
            "intent": "comprehension_answer",
            "comprehension_check": previous_check,
        }

    if state.get("tutor_mode") and _looks_like_comprehension_answer(state.get("user_input", "")):
        session_state = state.get("tutor_session_state") or {}
        tutor_step_active = (
            previous_check
            or session_state.get("next_action")
            or any(re.search(pattern, last_ai, re.I) for pattern in COMPREHENSION_CHECK_PATTERNS)
        )
        if tutor_step_active:
            return {
                "intent": "comprehension_answer",
                "comprehension_check": previous_check or session_state.get("next_action") or _extract_last_question(last_ai),
            }

    if _is_project_build_request(state.get("user_input", "")):
        return {"intent": "project_build"}

    if any(re.search(p, text) for p in GREETING_PATTERNS):
        if chat_history:
            return {"intent": "returning_greeting"}
        return {"intent": "greeting"}

    if any(re.search(p, text) for p in RECALL_PATTERNS):
        return {"intent": "recall"}

    if any(re.search(p, text) for p in CONFUSION_PATTERNS):
        return {"intent": "confusion"}

    if any(re.search(p, text) for p in FOLLOWUP_PATTERNS):
        return {"intent": "followup"}

    if not any(c.isalpha() for c in text) or len(text) < 3:
        return {"intent": "off_topic"}

    return {"intent": "question"}

def analyze_message(state: TutorState) -> dict:
    intent = state.get("intent", "")
    if intent in ("greeting", "returning_greeting", "off_topic", "recall"):
        return {"language_analysis": {}}

    text       = state.get("user_input", "")
    vocab      = _get_vocab()
    user_id    = state.get("user_id", "")
    db_factory = state.get("_db_factory")

    try:
        from dkt.language_analyzer import analyze
        db = db_factory() if db_factory else None
        try:
            uid    = int(user_id) if user_id else None
            result = analyze(text, vocab, user_id=uid, db=db)
        finally:
            if db is not None:
                db.close()

        analysis = result.to_dict()
        logger.info(
            f"[LANG] signal={analysis['signal_type']} ({result.classification_method}) "
            f"score={analysis['knowledge_signal']:+.2f} "
            f"concept={analysis['primary_concept']!r}"
        )
        _lang_embedding_cache[user_id] = result.embedding
        return {"language_analysis": analysis}
    except Exception as e:
        logger.warning(f"Language analysis failed: {e}")
        return {"language_analysis": {}}

async def fetch_student_state(state: TutorState) -> dict:
    user_id    = state.get("user_id", "")
    db_factory = state.get("_db_factory")
    chat_id    = state.get("chat_id")
    chat_history = state.get("chat_history", [])
    student    = StudentState(user_id=user_id)

    is_new_session    = len(chat_history) == 0
    session_gap_days  = None
    decayed_concepts  = []

    if db_factory:
        try:
            from models import ComprehensiveUserProfile, TopicMastery, UserWeakArea, User
            db = db_factory()
            try:
                uid = int(user_id)

                user_record = db.query(User).filter(User.id == uid).first()
                if user_record and user_record.first_name:
                    student.first_name = user_record.first_name

                profile = db.query(ComprehensiveUserProfile).filter(
                    ComprehensiveUserProfile.user_id == uid
                ).first()
                if profile:
                    student.difficulty_level = profile.difficulty_level or "intermediate"
                    student.current_subject  = profile.main_subject or ""
                    if profile.strong_areas:
                        student.strengths = [s.strip() for s in profile.strong_areas.split(",") if s.strip()]
                    if profile.weak_areas:
                        student.weaknesses = [s.strip() for s in profile.weak_areas.split(",") if s.strip()]

                weak_areas = db.query(UserWeakArea).filter(
                    UserWeakArea.user_id == uid
                ).order_by(UserWeakArea.weakness_score.desc()).limit(5).all()
                for wa in weak_areas:
                    topic = wa.topic or ""
                    if topic and topic not in student.weaknesses:
                        student.weaknesses.append(topic)

                mastery = db.query(TopicMastery).filter(
                    TopicMastery.user_id == uid,
                    TopicMastery.mastery_level >= 0.7,
                ).limit(5).all()
                for tm in mastery:
                    topic = tm.topic_name or ""
                    if topic and topic not in student.strengths:
                        student.strengths.append(topic)

                if is_new_session:
                    try:
                        from dkt.temporal_decay import get_session_gap, get_decayed_concepts
                        session_gap_days = get_session_gap(uid, chat_id, db)
                        decayed_concepts = get_decayed_concepts(uid, db, threshold_days=7)
                        if decayed_concepts:
                            logger.info(
                                f"[DECAY] user={uid} session_gap={session_gap_days}d "
                                f"decayed={[c['concept'] for c in decayed_concepts[:3]]}"
                            )
                    except Exception as e:
                        logger.warning(f"Temporal decay fetch failed: {e}")

            finally:
                db.close()
        except Exception as e:
            logger.warning(f"DB fetch failed: {e}")

    last_session_summary = None
    if is_new_session:
        last_session_summary = _fetch_last_session_summary(db_factory, user_id, current_chat_id=chat_id)

    return {
        "student_state":        student,
        "session_gap_days":     session_gap_days,
        "decayed_concepts":     decayed_concepts,
        "is_new_session":       is_new_session,
        "last_session_summary": last_session_summary,
    }

def _fetch_flashcard_context(db_factory, user_id: str, top_k: int = 10) -> list[str]:
    if not db_factory:
        return []
    try:
        from models import FlashcardSet, Flashcard, FlashcardStudySession
        db = db_factory()
        try:
            uid = int(user_id)
            context_lines = []

            sets = (
                db.query(FlashcardSet)
                .filter(FlashcardSet.user_id == uid)
                .order_by(FlashcardSet.created_at.desc())
                .limit(top_k)
                .all()
            )
            if sets:
                context_lines.append(f"You have {len(sets)} recent flashcard sets:")
                for fs in sets:
                    card_count = db.query(Flashcard).filter(Flashcard.set_id == fs.id).count()
                    reviewed_cards = (
                        db.query(Flashcard)
                        .filter(Flashcard.set_id == fs.id, Flashcard.times_reviewed > 0)
                        .all()
                    )
                    total_reviewed = sum(c.times_reviewed or 0 for c in reviewed_cards)
                    total_correct = sum(c.correct_count or 0 for c in reviewed_cards)
                    accuracy = (
                        round(total_correct / total_reviewed * 100, 1)
                        if total_reviewed > 0
                        else 0
                    )
                    created = fs.created_at.strftime("%b %d, %Y") if fs.created_at else "unknown"
                    status = f"studied {total_reviewed} times, {accuracy}% accuracy" if total_reviewed > 0 else "not yet studied"
                    context_lines.append(
                        f"  - \"{fs.title}\" ({card_count} cards, created {created}, {status})"
                    )

            struggling_cards = (
                db.query(Flashcard)
                .join(FlashcardSet)
                .filter(
                    FlashcardSet.user_id == uid,
                    Flashcard.marked_for_review == True,
                )
                .limit(5)
                .all()
            )
            if struggling_cards:
                context_lines.append(f"\nCards marked for review ({len(struggling_cards)} cards you're struggling with):")
                for c in struggling_cards:
                    context_lines.append(f"  - Q: {c.question[:80]}")

            recent_reviewed = (
                db.query(Flashcard)
                .join(FlashcardSet)
                .filter(
                    FlashcardSet.user_id == uid,
                    Flashcard.last_reviewed != None,
                )
                .order_by(Flashcard.last_reviewed.desc())
                .limit(10)
                .all()
            )
            if recent_reviewed:
                context_lines.append(f"\nRecently reviewed flashcards:")
                for c in recent_reviewed:
                    outcome = "correct" if (c.correct_count or 0) > (c.times_reviewed or 0) / 2 else "needs practice"
                    reviewed_date = c.last_reviewed.strftime("%b %d") if c.last_reviewed else ""
                    context_lines.append(
                        f"  - Q: {c.question[:60]} ({outcome}, last reviewed {reviewed_date})"
                    )

            return context_lines
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Failed to fetch flashcard context: {e}")
        return []

def _fetch_notes_context(db_factory, user_id: str, top_k: int = 10) -> list[str]:
    if not db_factory:
        return []
    try:
        from models import Note
        db = db_factory()
        try:
            uid = int(user_id)
            context_lines = []

            notes = (
                db.query(Note)
                .filter(Note.user_id == uid, Note.is_deleted == False)
                .order_by(Note.updated_at.desc())
                .limit(top_k)
                .all()
            )
            if notes:
                context_lines.append(f"You have {len(notes)} recent notes:")
                for n in notes:
                    updated = n.updated_at.strftime("%b %d, %Y") if n.updated_at else ""
                    content_preview = ""
                    if n.content:
                        clean = re.sub(r'<[^>]+>', '', n.content)
                        clean = re.sub(r'[#*_\[\]()]', '', clean).strip()
                        content_preview = f" - {clean[:100]}..." if len(clean) > 100 else f" - {clean}"
                    context_lines.append(
                        f"  - \"{n.title}\" (updated {updated}){content_preview}"
                    )

            return context_lines
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Failed to fetch notes context: {e}")
        return []

def _fetch_activity_summary(db_factory, user_id: str) -> list[str]:
    if not db_factory:
        return []
    try:
        from models import FlashcardSet, Flashcard, Note, ChatMessage, FlashcardStudySession
        from sqlalchemy import func
        db = db_factory()
        try:
            uid = int(user_id)
            context_lines = ["Here's a summary of your recent learning activity:"]

            total_sets = db.query(func.count(FlashcardSet.id)).filter(
                FlashcardSet.user_id == uid
            ).scalar() or 0
            total_cards = (
                db.query(func.count(Flashcard.id))
                .join(FlashcardSet)
                .filter(FlashcardSet.user_id == uid)
                .scalar() or 0
            )
            cards_mastered = (
                db.query(func.count(Flashcard.id))
                .join(FlashcardSet)
                .filter(FlashcardSet.user_id == uid, Flashcard.correct_count >= 3)
                .scalar() or 0
            )
            context_lines.append(
                f"  - Flashcards: {total_sets} sets, {total_cards} total cards, {cards_mastered} mastered"
            )

            total_notes = db.query(func.count(Note.id)).filter(
                Note.user_id == uid, Note.is_deleted == False
            ).scalar() or 0
            context_lines.append(f"  - Notes: {total_notes} notes")

            total_chats = db.query(func.count(ChatMessage.id)).filter(
                ChatMessage.user_id == uid
            ).scalar() or 0
            context_lines.append(f"  - Chat interactions: {total_chats} messages")

            return context_lines
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Failed to fetch activity summary: {e}")
        return []

_TIME_RANGE_PATTERNS = [
    (r'\b(just now|right now|this (moment|second)|past hour|last hour)\b',              "last_hour",   1),
    (r'\b(today|this (morning|afternoon|evening|day)|past (few hours|2|3|4|5) hours)\b', "today",      24),
    (r'\b(recent(ly)?|lately|just|just now)\b',                                          "recent",     24),
    (r'\byesterday\b',                                                                    "yesterday",  48),
    (r'\b(this week|past (2|3|4|5|6) days|few days)\b',                                 "this_week", 168),
    (r'\b(last week|past week|7 days|seven days)\b',                                     "last_week", 336),
    (r'\b(last month|past month|30 days|thirty days)\b',                                 "last_month",720),
    (r'\b(ever|all time|always|everything|from the start|since I (started|joined))\b',  "all_time",  8760),
]

def _classify_recall_time_range(text: str) -> tuple[str, int]:
    t = text.lower()
    for pattern, label, hours in _TIME_RANGE_PATTERNS:
        if re.search(pattern, t):
            return label, hours
    return "last_session", 0

def _store_recall_signal(db_factory, user_id: str, user_input: str,
                          time_label: str, time_hours: int,
                          is_correction: bool = False) -> None:
    if not db_factory:
        return
    try:
        from models import StudentMemory
        db = db_factory()
        try:
            uid = int(user_id)
            content = (
                f"{'[CORRECTION] ' if is_correction else ''}"
                f"Query: '{user_input[:200]}' → range: {time_label} ({time_hours}h)"
            )
            mem = StudentMemory(
                user_id=uid,
                memory_type="recall_query",
                concept_name=time_label,
                source="recall",
                content=content,
                importance_score=0.8 if is_correction else 0.4,
            )
            db.add(mem)
            db.commit()
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"Recall signal store failed: {e}")

def _fetch_activity_in_range(db_factory, user_id: str, hours: int) -> list[str]:
    if not db_factory:
        return [f"No activity data available."]
    try:
        from datetime import timedelta
        from models import ChatSession, ChatMessage, Note, FlashcardSet, Activity
        db = db_factory()
        try:
            uid = int(user_id)
            cutoff = datetime.now(timezone.utc) - timedelta(hours=hours)
            label = {1: "last hour", 24: "last 24 hours", 48: "yesterday + today",
                     168: "this week", 336: "last week", 720: "last month",
                     8760: "all time"}.get(hours, f"past {hours} hours")
            lines = [f"Your activity — {label}:"]
            found = False

            sessions = (
                db.query(ChatSession)
                .filter(ChatSession.user_id == uid, ChatSession.updated_at >= cutoff)
                .order_by(ChatSession.updated_at.desc())
                .all()
            )
            for sess in sessions:
                msgs = (
                    db.query(ChatMessage)
                    .filter(ChatMessage.chat_session_id == sess.id,
                            ChatMessage.timestamp >= cutoff)
                    .order_by(ChatMessage.timestamp.asc())
                    .all()
                )
                if not msgs:
                    continue
                topics = _extract_message_topics(msgs, max_msgs=6)
                ts = sess.updated_at.strftime("%b %d %H:%M") if sess.updated_at else ""
                title = (sess.title or "Chat")[:40]
                topic_str = "; ".join(topics[:4]) if topics else f"{len(msgs)} messages"
                lines.append(f"  [Chat '{title}' {ts}]: {topic_str}")
                found = True

            notes = (
                db.query(Note)
                .filter(Note.user_id == uid, Note.updated_at >= cutoff,
                        Note.is_deleted == False)
                .order_by(Note.updated_at.desc())
                .all()
            )
            for note in notes:
                ts = note.updated_at.strftime("%b %d %H:%M") if note.updated_at else ""
                lines.append(f"  [Note '{note.title}' {ts}]")
                found = True

            fc_sets = (
                db.query(FlashcardSet)
                .filter(FlashcardSet.user_id == uid, FlashcardSet.created_at >= cutoff)
                .order_by(FlashcardSet.created_at.desc())
                .all()
            )
            for fc in fc_sets:
                ts = fc.created_at.strftime("%b %d %H:%M") if fc.created_at else ""
                lines.append(f"  [Flashcards '{fc.title}' created {ts}]")
                found = True

            activities = (
                db.query(Activity)
                .filter(Activity.user_id == uid, Activity.timestamp >= cutoff)
                .order_by(Activity.timestamp.desc())
                .limit(10)
                .all()
            )
            for act in activities:
                ts = act.timestamp.strftime("%b %d %H:%M") if act.timestamp else ""
                lines.append(f"  [Quiz/Practice '{act.topic}' {ts}]: {act.question[:60]}")
                found = True

            if not found:
                return [f"No activity found in the {label}."]
            return lines
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"_fetch_activity_in_range failed: {e}")
        return []

def _extract_message_topics(messages: list, max_msgs: int = 8) -> list[str]:
    from services.topic_utils import is_valid_topic
    topics = []
    seen_lower = set()
    for msg in messages[:max_msgs]:
        raw = (msg.user_message or "").strip()
        snippet = raw[:70].rstrip()
        low = snippet.lower()
        if low in seen_lower or not is_valid_topic(snippet):
            continue
        seen_lower.add(low)
        topics.append(snippet)
    return topics

def _days_ago(dt: Optional[datetime]) -> Optional[int]:
    if not dt:
        return None
    now = datetime.now(timezone.utc)
    aware = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt
    return max(0, (now - aware).days)

def _fetch_last_session_summary(db_factory, user_id: str, current_chat_id=None) -> Optional[dict]:
    if not db_factory:
        return None
    try:
        from models import ChatMessage, ChatSession, ChatConceptSignal
        db = db_factory()
        try:
            uid = int(user_id)
            q = db.query(ChatSession).filter(ChatSession.user_id == uid)
            if current_chat_id:
                q = q.filter(ChatSession.id != current_chat_id)
            candidates = q.order_by(ChatSession.created_at.desc()).limit(5).all()
            if not candidates:
                return None

            for sess in candidates:
                signals = (
                    db.query(ChatConceptSignal)
                    .filter(
                        ChatConceptSignal.user_id == uid,
                        ChatConceptSignal.chat_session_id == sess.id,
                    )
                    .order_by(ChatConceptSignal.created_at.asc())
                    .all()
                )
                seen: set = set()
                topics = []
                for s in signals:
                    c = (s.concept or "").strip()
                    cl = c.lower()
                    if c and cl not in seen:
                        seen.add(cl)
                        topics.append(c)
                topics = topics[:8]

                msg_count = (
                    db.query(ChatMessage)
                    .filter(ChatMessage.chat_session_id == sess.id)
                    .count()
                )

                if not topics:
                    continue

                date_str = sess.created_at.strftime("%b %d") if sess.created_at else "recently"
                title = (sess.title or "Chat session")[:60]
                ago = _days_ago(sess.created_at)

                return {
                    "title":         title,
                    "date_str":      date_str,
                    "days_ago":      ago,
                    "topics":        topics,
                    "message_count": msg_count,
                }

            return None
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"_fetch_last_session_summary failed: {e}")
        return None

def _fetch_last_session_topics(db_factory, user_id: str, current_chat_id=None) -> list[str]:
    if not db_factory:
        return []
    try:
        from models import ChatConceptSignal, ChatSession, ChatMessage
        db = db_factory()
        try:
            uid = int(user_id)
            sessions_q = db.query(ChatSession).filter(ChatSession.user_id == uid)
            if current_chat_id:
                sessions_q = sessions_q.filter(ChatSession.id != current_chat_id)
            recent_sessions = sessions_q.order_by(ChatSession.created_at.desc()).limit(3).all()

            if not recent_sessions:
                return ["No previous sessions found."]

            lines = ["What you worked on in recent sessions:"]
            found_any = False
            for sess in recent_sessions:
                date_str = sess.created_at.strftime("%b %d") if sess.created_at else "recently"
                title = (sess.title or "Untitled")[:40]

                signals = (
                    db.query(ChatConceptSignal)
                    .filter(
                        ChatConceptSignal.user_id == uid,
                        ChatConceptSignal.chat_session_id == sess.id,
                        ChatConceptSignal.knowledge_signal != 0,
                    )
                    .order_by(ChatConceptSignal.created_at.asc())
                    .all()
                )
                seen: set = set()
                concepts = []
                for s in signals:
                    c = (s.concept or "").strip()
                    if c and c.lower() not in seen:
                        seen.add(c.lower())
                        concepts.append(c)

                if not concepts:
                    msgs = (
                        db.query(ChatMessage)
                        .filter(ChatMessage.chat_session_id == sess.id)
                        .order_by(ChatMessage.timestamp.asc())
                        .limit(10)
                        .all()
                    )
                    concepts = _extract_message_topics(msgs, max_msgs=5)

                if concepts:
                    lines.append(f"  [{date_str}] '{title}': {'; '.join(concepts[:6])}")
                    found_any = True
                else:
                    lines.append(f"  [{date_str}] '{title}': (no topics detected)")

            if not found_any:
                return ["No specific topics recorded in recent sessions yet."]
            return lines
        finally:
            db.close()
    except Exception as e:
        logger.warning(f"_fetch_last_session_topics failed: {e}")
        return []

def gate_and_retrieve(state: TutorState) -> dict:
    intent = state.get("intent", "")
    user_input = state.get("user_input", "")
    student = state.get("student_state")
    db_factory = state.get("_db_factory")
    user_id = state.get("user_id", "")
    chat_id = state.get("chat_id")
    context_doc_ids = state.get("context_doc_ids") or []
    context_only = bool(state.get("context_only"))

    should_retrieve = intent in ("recall", "confusion", "followup", "question", "comprehension_answer")

    if not should_retrieve and student and student.weaknesses:
        input_lower = user_input.lower()
        for w in student.weaknesses:
            if w.lower() in input_lower:
                should_retrieve = True
                break

    memories = []
    structured_context = []

    if chroma_store.available():
        try:
            prefs = chroma_store.retrieve_important(user_id, query="student preferences instructions", top_k=5)
            for p in prefs:
                if p.get("metadata", {}).get("source") == "preference":
                    memories.insert(0, f"[STUDENT PREFERENCE] {p['document']}")
        except Exception as e:
            logger.warning(f"Preference retrieval failed: {e}")

    domains = _detect_query_domain(user_input)

    if should_retrieve and not context_only:
        if intent != "recall":
            if "flashcard" in domains:
                fc_context = _fetch_flashcard_context(db_factory, user_id)
                if fc_context:
                    structured_context.extend(fc_context)

                if chroma_store.available():
                    try:
                        fc_memories = chroma_store.retrieve_episodes_filtered(
                            user_id, user_input, source_filter="flashcard_review", top_k=5
                        )
                        for m in fc_memories:
                            memories.append(m["document"])
                        fc_created = chroma_store.retrieve_episodes_filtered(
                            user_id, user_input, source_filter="flashcard_created", top_k=5
                        )
                        for m in fc_created:
                            memories.append(m["document"])
                    except Exception as e:
                        logger.warning(f"Chroma flashcard retrieval failed: {e}")

            if "note" in domains:
                note_context = _fetch_notes_context(db_factory, user_id)
                if note_context:
                    structured_context.extend(note_context)

                if chroma_store.available():
                    try:
                        note_memories = chroma_store.retrieve_episodes_filtered(
                            user_id, user_input, source_filter="note_activity", top_k=5
                        )
                        for m in note_memories:
                            memories.append(m["document"])
                    except Exception as e:
                        logger.warning(f"Chroma note retrieval failed: {e}")

            if "activity" in domains:
                activity_context = _fetch_activity_summary(db_factory, user_id)
                if activity_context:
                    structured_context.extend(activity_context)

        if chroma_store.available() and intent not in ("recall",) and chat_id is not None:
            try:
                general_memories = chroma_store.retrieve_episodes(
                    user_id,
                    user_input,
                    top_k=3,
                    chat_session_id=chat_id,
                )
                for m in general_memories:
                    if m not in memories:
                        memories.append(m)
            except Exception as e:
                logger.warning(f"Chroma retrieval failed: {e}")

        if intent == "recall":
            time_label, time_hours = _classify_recall_time_range(user_input)

            chat_history = state.get("chat_history", [])
            is_correction = False
            if chat_history and len(chat_history) >= 2:
                prev_user = chat_history[-2].get("content", "") if len(chat_history) >= 2 else ""
                _, prev_hours = _classify_recall_time_range(prev_user)
                is_correction = (prev_hours != time_hours) and bool(prev_user)

            _store_recall_signal(db_factory, user_id, user_input, time_label, time_hours, is_correction)
            logger.info(f"[RECALL] user={user_id} range={time_label}({time_hours}h) correction={is_correction}")

            if time_hours > 0:
                ranged = _fetch_activity_in_range(db_factory, user_id, time_hours)
                structured_context.extend(ranged)
            else:
                chat_id = state.get("chat_id")
                session_topics = _fetch_last_session_topics(db_factory, user_id, current_chat_id=chat_id)
                structured_context.extend(session_topics)

            fc_context = _fetch_flashcard_context(db_factory, user_id, top_k=5)
            structured_context.extend(fc_context)
            note_context = _fetch_notes_context(db_factory, user_id, top_k=5)
            structured_context.extend(note_context)
            activity_context = _fetch_activity_summary(db_factory, user_id)
            structured_context.extend(activity_context)

    rag_chunks: list[str] = []
    rag_sources: list[dict] = []
    use_hs = state.get("use_hs_context", True)
    use_hs_for_query = bool(use_hs) and not bool(context_doc_ids)
    should_query_context = bool(user_input.strip()) and (bool(use_hs) or bool(context_doc_ids))
    logger.info(
        f"[TUTOR RAG] query='{user_input[:80]}' use_hs_context={use_hs} "
        f"use_hs_for_query={use_hs_for_query} context_only={context_only} "
        f"user_id={user_id} context_doc_ids={len(context_doc_ids)}"
    )
    if should_query_context:
        try:
            from services import context_store
            if context_store.available():
                rag_results = context_store.search_context(
                    query=user_input,
                    user_id=user_id,
                    use_hs=use_hs_for_query,
                    top_k=8,
                    doc_ids=context_doc_ids or None,
                )
                rag_chunks = [r["text"] for r in rag_results]
                rag_sources = context_store.build_rag_sources(rag_results)
                if rag_chunks:
                    logger.info(
                        f"[TUTOR RAG] *** HS CONTEXT FOUND *** {len(rag_chunks)} chunk(s) retrieved"
                    )
                    for i, r in enumerate(rag_results):
                        preview = r["text"][:120].replace("\n", " ")
                        logger.info(
                            f"[TUTOR RAG]   chunk[{i}] source={r['source']} dist={r['distance']:.4f} | {preview}..."
                        )
                else:
                    logger.info("[TUTOR RAG] No matching chunks found for query")
            else:
                logger.info("[TUTOR RAG] context_store not available — skipping RAG")
        except Exception as e:
            logger.warning(f"RAG context fetch failed in tutor: {e}")
    else:
        logger.info("[TUTOR RAG] Context query skipped (HS off and no selected docs)")

    return {
        "retrieval_gated": should_retrieve,
        "episodic_memories": memories,
        "structured_context": structured_context,
        "rag_context": rag_chunks,
        "rag_sources": rag_sources,
        "context_only": context_only,
        "context_only_no_match": bool(context_only and use_hs and not rag_chunks),
    }

def select_teaching_style(state: TutorState) -> dict:
    intent     = state.get("intent", "")
    db_factory = state.get("_db_factory")
    user_id    = state.get("user_id", "")
    analysis   = state.get("language_analysis") or {}

    if intent in ("greeting", "returning_greeting", "off_topic", "recall", "repetitive"):
        return {"selected_style": "Axiom", "style_context": [], "style_scores": {}, "style_selection_source": "rule"}

    if not db_factory:
        return {"selected_style": "Exemplar", "style_context": [], "style_scores": {}, "style_selection_source": "rule"}

    try:
        from dkt.style_bandit import (
            StyleBandit, build_context, load_bandit,
            get_recent_signals, STYLES,
        )

        uid      = int(user_id)
        db       = db_factory()
        try:
            bandit         = load_bandit(uid, db)
            recent_signals = get_recent_signals(uid, db)
            quiz_style     = None
            if all(arm.n_updates == 0 for arm in bandit.arms.values()):
                # Bandit has zero real feedback yet -- its arms are still
                # near-identical near-zero-initialized nets, so an early pick
                # is close to random. Use the ProfileQuiz-derived style as a
                # cold-start prior instead; the moment any arm gets a real
                # update (via persist_updates' reward-closing), this check
                # goes false forever for this student and the bandit takes
                # over for real, as normal.
                import models as _models
                profile = db.query(_models.ComprehensiveUserProfile).filter_by(user_id=uid).first()
                quiz_style = profile.derived_teaching_style if profile else None
        finally:
            db.close()

        student          = state.get("student_state")
        difficulty       = (student.difficulty_level if student else None) or "intermediate"
        session_gap      = state.get("session_gap_days")
        n_interactions   = len(recent_signals)

        primary_concept    = analysis.get("primary_concept")
        concept_mastery    = 0.5
        mastery_dict       = None
        n_decayed          = len(state.get("decayed_concepts") or [])
        dkt_n_interactions = 0
        try:
            from dkt.inference import get_mastery
            m            = get_mastery(uid, db_factory, apply_decay=True)
            mastery_dict = m.get("effective_mastery") or {}
            dkt_n_interactions = m.get("n_interactions", 0) if m.get("model_available") else 0
            if primary_concept and primary_concept in mastery_dict:
                concept_mastery = mastery_dict[primary_concept]
        except Exception:
            pass

        # Reconcile with BKT's real-time estimate for the same concept
        # (services/mastery_reconciliation.py) so this scalar -- fed into
        # StyleBandit's context vector -- is the same evidence-weighted
        # blend as the number shown in the chat prompt, not a DKT-only
        # figure that can silently disagree with it.
        if primary_concept:
            try:
                import models as _models
                from services.ml_pipeline import MessageMLPipeline
                from services.mastery_reconciliation import blend_mastery
                bkt_concept_id = primary_concept.strip().lower().replace(" ", "_")
                recon_db = db_factory()
                try:
                    bkt_state = recon_db.query(_models.StudentKnowledgeState).filter_by(
                        user_id=uid, concept_id=bkt_concept_id
                    ).first()
                finally:
                    recon_db.close()
                if bkt_state:
                    bkt_mastery = MessageMLPipeline._decayed_mastery(
                        bkt_state.p_mastery, bkt_state.last_updated, bkt_state.interaction_count or 0
                    )
                    dkt_mastery = mastery_dict.get(primary_concept) if mastery_dict else None
                    concept_mastery = blend_mastery(
                        bkt_mastery, bkt_state.interaction_count or 0,
                        dkt_mastery, dkt_n_interactions if dkt_mastery is not None else 0,
                    )
            except Exception:
                pass

        context = build_context(
            difficulty_level = difficulty,
            recent_signals   = recent_signals,
            session_gap_days = session_gap,
            n_interactions   = n_interactions,
            concept_mastery  = concept_mastery,
            mastery_dict     = mastery_dict,
            n_decayed        = n_decayed,
        )

        explicit_style   = analysis.get("explicit_style")
        forced_style     = explicit_style or quiz_style
        selected, scores = bandit.select(context, forced=forced_style)

        source = "explicit" if explicit_style else ("quiz_cold_start" if quiz_style else "bandit")
        logger.info(
            f"[BANDIT] user={uid} selected={selected!r} source={source} "
            f"scores={{{', '.join(f'{k}: {v:.3f}' for k, v in scores.items())}}}"
        )

        return {
            "selected_style": selected,
            "style_context":  context.tolist(),
            "style_scores":   scores,
            "style_selection_source": source,
        }

    except Exception as e:
        logger.warning(f"[BANDIT] style selection failed: {e}")
        return {"selected_style": "Exemplar", "style_context": [], "style_scores": {}, "style_selection_source": "fallback"}

def _build_instructional_task(state: TutorState) -> str:
    intent   = state.get("intent", "")
    student  = state.get("student_state")
    domains  = _detect_query_domain(state.get("user_input", ""))
    analysis = state.get("language_analysis") or {}
    tutor_mode = bool(state.get("tutor_mode"))

    signal_type = analysis.get("signal_type", "neutral")
    hint        = analysis.get("instructional_hint", "")

    if intent == "greeting":
        gap                  = state.get("session_gap_days")
        decayed              = state.get("decayed_concepts") or []
        last_summary         = state.get("last_session_summary")
        student_name         = student.first_name if student else ""

        energy = _detect_greeting_energy(state.get("user_input", ""))
        energy_tone = {
            "high":   "[TONE: high energy — be hyped, casual, match their vibe]",
            "medium": "[TONE: warm and upbeat]",
            "calm":   "[TONE: warm, grounded]",
        }[energy]

        name_part = f"Address them as {student_name}. " if student_name else ""

        recap = ""
        if last_summary and last_summary.get("topics"):
            topics_str = "; ".join(last_summary["topics"][:3])
            ago = last_summary.get("days_ago")
            if ago is None:
                time_hint = f"on {last_summary['date_str']}"
            elif ago == 0:
                time_hint = "earlier today"
            elif ago == 1:
                time_hint = "yesterday"
            else:
                time_hint = f"about {ago} days ago"
            recap = (
                f"Most recent substantive session ({time_hint}, {last_summary['message_count']} messages): "
                f"student worked on: {topics_str}. "
                f"Naturally mention this — e.g. 'Last time we covered [topic] — {time_hint}. Want to continue or start something new?' "
                f"Keep it 1-2 sentences, conversational. "
            )

        no_invent = "Do NOT invent or guess topics not listed above."

        if gap is None or gap < 1:
            if recap:
                return f"{energy_tone} {name_part}{recap}{no_invent}"
            return f"{energy_tone} {name_part}Ask what they'd like to work on. Keep it short."

        if decayed:
            top      = decayed[0]
            days_str = f"{int(top['last_seen_days'])} days"
            ret_pct  = int(top['retrievability'] * 100)
            decay_hint = (
                f"It has been {days_str} since they studied '{top['concept']}' "
                f"(estimated recall: {ret_pct}%). Weave this in naturally. "
            )
            return f"{energy_tone} {name_part}{recap}{decay_hint}{no_invent}"

        if gap > 7:
            gap_hint = f"They haven't been here in {int(gap)} days — acknowledge warmly. "
            return f"{energy_tone} {name_part}{recap}{gap_hint}{no_invent}"

        return f"{energy_tone} {name_part}{recap}{no_invent}" if recap else \
               f"{energy_tone} {name_part}Ask what they'd like to work on. Keep it short."

    if intent == "returning_greeting":
        energy = _detect_greeting_energy(state.get("user_input", ""))
        energy_tone = {
            "high":   "[TONE: high energy — be hyped, casual]",
            "medium": "[TONE: warm and friendly]",
            "calm":   "[TONE: warm, grounded]",
        }[energy]
        student_name = student.first_name if student else ""
        name_part = f"Address them as {student_name}. " if student_name else ""
        return (
            f"Student greeted again. {energy_tone} {name_part}"
            "1 sentence, ask what they want to work on. No topic suggestions."
        )

    if intent == "repetitive":
        return (
            "The student is sending the same message repeatedly. Acknowledge this politely. "
            "Ask if they need help with something specific or if something isn't working. "
            "Don't repeat your previous response - give a fresh, shorter reply. Address them by name."
        )

    if intent == "recall":
        time_label, time_hours = _classify_recall_time_range(state.get("user_input", ""))
        time_desc = {
            "last_hour": "the last hour",
            "today": "today",
            "recent": "recently (last 24 hours)",
            "yesterday": "yesterday",
            "this_week": "this week",
            "last_week": "last week",
            "last_month": "last month",
            "all_time": "all time",
            "last_session": "the last session",
        }.get(time_label, "recently")

        if "flashcard" in domains:
            domain_hints = (
                "The student is asking about FLASHCARD activity. "
                "Report actual set names, card counts, accuracy from STRUCTURED LEARNING DATA. "
            )
        elif "note" in domains:
            domain_hints = (
                "The student is asking about their NOTES. "
                "Report actual note titles and dates from STRUCTURED LEARNING DATA. "
            )
        else:
            domain_hints = (
                f"The student is asking what they did — time range: {time_desc}. "
                "STRUCTURED LEARNING DATA below contains their real activity for that period. "
                "Give a warm, specific summary like a tutor recap: "
                "'In the last 24 hours you asked about X, created a flashcard set on Y, and made a note on Z.' "
                "Use exact titles/topics from the data. Treat short user message snippets as questions they asked. "
            )

        return (
            f"{domain_hints}"
            "Only use what is in STRUCTURED LEARNING DATA. "
            "Never invent topics. If truly nothing is there, say so honestly and ask what they'd like to start."
        )

    if intent == "off_topic":
        last_summary  = state.get("last_session_summary")
        recent_topics = (last_summary or {}).get("topics") or []

        if not recent_topics:
            db_factory = state.get("_db_factory")
            current_session = _fetch_last_session_summary(db_factory, state.get("user_id", ""), current_chat_id=None)
            recent_topics = (current_session or {}).get("topics") or []

        recent_topics = recent_topics[:3]

        if recent_topics:
            topics_str = "; ".join(recent_topics)
            return (
                "The student sent a message that is not about a learning topic. "
                "Respond warmly and redirect them toward learning. "
                f"Their most recent real topics (from STRUCTURED LEARNING DATA) are: {topics_str}. "
                "Suggest picking up ONE of these specific recent topics, or ask what they'd like to study instead. "
                "Do NOT reference any other topic, weak area, or subject — only what is listed here or "
                "explicitly present elsewhere in STRUCTURED LEARNING DATA. Never invent a topic."
            )

        return (
            "The student sent a message that is not about a learning topic. "
            "Respond warmly and redirect them toward learning. "
            "You have no reliable record of their recent topics right now — "
            "do NOT invent or guess any topic, subject, or weak area. Just ask what they'd like to study."
        )

    if intent == "project_build":
        return (
            "The student wants a project built or an implementation blueprint. Respond as a decisive senior engineer "
            "who owns the path from idea to a working result.\n\n"
            "AUTONOMY RULES:\n"
            "- Do not make the student choose every framework, model, library, database, or folder name.\n"
            "- Infer reasonable requirements from the request, state the important assumptions briefly, choose one "
            "coherent default stack, and proceed.\n"
            "- Do not present a menu of equivalent technologies. Name the selected option and give one short reason.\n"
            "- Ask at most one blocking question, and only when proceeding could cause security/privacy risk, meaningful "
            "cost, destructive data changes, legal/compliance issues, or an incompatible deployment decision.\n"
            "- If a detail is merely unspecified, choose a conventional default and label it as an assumption.\n\n"
            "DELIVERY CONTRACT:\n"
            "1. Start with the concrete outcome being built and a short list of assumptions/defaults.\n"
            "2. Specify the exact stack and, when relevant, the primary AI model/provider plus a fallback strategy. "
            "Do not claim a version is latest unless the student supplied or verified it.\n"
            "3. Give the architecture and data flow with named components and responsibilities.\n"
            "4. Include a practical project/file tree using real filenames.\n"
            "5. Provide an ordered implementation workflow. Every step must name the files to create/change, the exact "
            "commands to run, and the observable result of that step.\n"
            "6. Include the core interfaces: database entities, API routes, request/response shapes, environment variables, "
            "and key functions/components appropriate to the project.\n"
            "7. Provide enough starter code or pseudocode to establish one working end-to-end vertical slice. Prefer code "
            "that can be copied and run over abstract suggestions.\n"
            "8. End with verification commands, acceptance criteria, likely failure points, and the next implementation "
            "milestone—not an open-ended request for more parameters.\n\n"
            "QUALITY BAR:\n"
            "- Be result-oriented and imperative: use 'Create', 'Run', 'Add', and 'Verify'. Avoid vague verbs such as "
            "'consider', 'explore', 'you could', or 'look into'.\n"
            "- Tie each recommendation to the requested product. Do not give a generic software-development checklist.\n"
            "- Preserve scope discipline: produce a lean runnable MVP first, then clearly separate optional enhancements.\n"
            "- If the request is too large for one response, fully specify and implement the first vertical slice, then "
            "list the remaining milestones in dependency order."
        )

    if intent == "comprehension_answer":
        previous_check = state.get("comprehension_check") or _previous_comprehension_check(state.get("chat_history", []))
        answer = state.get("user_input", "")
        clicked_choice = (state.get("tutor_choice") or "").strip()
        choice_context = f"The student selected this MCQ option: {clicked_choice}\n" if clicked_choice else ""
        return (
            "The student is answering your previous comprehension check, not asking a new question.\n"
            f"Previous comprehension check: {previous_check or 'the last check question'}\n"
            f"Student answer to evaluate: {answer}\n\n"
            f"{choice_context}"
            "Respond like a tutor evaluating understanding:\n"
            "- Format the visible answer only as markdown bullet points. Every visible line must start with '- '.\n"
            "- Start with a direct verdict in **Verdict**: correct, partly correct, or not yet.\n"
            "- Use these bullets in order: **Verdict**, **What you got**, **Missing point**, **Better answer**, **Quick check**.\n"
            "- Keep each bullet to 1 short sentence, except **Better answer** may use 2 short sentences.\n"
            "- Do not write a paragraph before or after the bullets.\n"
            "- Do not simply re-explain the whole topic unless the answer is empty or says they do not know."
        )

    if hint:
        style      = student.preferred_style if student else "balanced"
        difficulty = student.difficulty_level if student else "intermediate"
        conf       = analysis.get("semantic_confidence", 0.0)

        if conf >= 0.80:
            strength = "[HIGH CONFIDENCE — act on this signal strongly, do not hedge]"
        elif conf >= 0.50:
            strength = "[MODERATE CONFIDENCE — lean toward this signal, but stay flexible]"
        else:
            strength = "[WEAK SIGNAL — treat as a soft hint, stay observant for clarification]"

        return (
            f"{strength}\n"
            f"{hint}\n"
            f"Adjust complexity to {difficulty} level using a {style} style."
        )

    style      = student.preferred_style if student else "balanced"
    difficulty = student.difficulty_level if student else "intermediate"
    if tutor_mode:
        reply_style = (state.get("tutor_reply_style") or "guided").strip().lower()
        style_guidance = {
            "hint": (
                "Give the smallest useful hint only. "
                "Do not solve the step for the student."
            ),
            "guided": (
                "Teach only the next idea, then ask the student to perform one unsolved move. "
                "Do not give the full final answer up front."
            ),
            "check": (
                "First check whether the student's current reply is correct or incomplete. "
                "Then give one correction and one unsolved next step."
            ),
            "quiz": (
                "Prefer a short MCQ or practice check when appropriate. "
                "If you use an MCQ, put choices in the TutorResponse options array."
            ),
        }.get(reply_style, "Guide one step at a time and ask a short check question.")
        return (
            f"Tutor mode is active. Teach at a {difficulty} level using a {style} style. "
            "Use the recent chat context to judge what the student already understands. "
            f"{style_guidance} "
            "Format the visible answer as markdown bullet points, one step per line, like - **Step 1 — Identify the idea:** ... and - **Step 2 — Your turn:** ... "
            "Every visible line must start with '- '; do not write paragraph blocks before or after the bullets. "
            "Use 2-4 short steps maximum, with the final step as the student-owned action/check. "
            "Never ask the student to calculate or answer something you already calculated in this response. "
            "Show at most one setup/rule, then leave the requested operation for the student. "
            "If the student asks directly for an answer, provide a hint first unless they have already made a serious attempt. "
            "End with exactly one focused check or next-step question."
        )

    return (
        f"Answer the student's question clearly at a {difficulty} level. "
        f"Use a {style} explanation style. "
        "If the topic has common mistakes listed above, proactively address them. "
        "Follow explicit user instructions about length and format. "
        "Only ask a follow-up question when the user asks for tutoring, practice, or next steps."
    )

def _normalize_attempt_verdict(value: Any) -> str:
    verdict = str(value or "not_applicable").strip().lower().replace("-", "_").replace(" ", "_")
    if verdict in {"correct", "partly_correct", "not_yet", "needs_attempt", "not_applicable"}:
        return verdict
    if verdict in {"partial", "almost", "close"}:
        return "partly_correct"
    if verdict in {"incorrect", "wrong", "false"}:
        return "not_yet"
    return "not_applicable"

def _bounded_float(value: Any, default: float = 0.0) -> float:
    try:
        return max(0.0, min(1.0, float(value)))
    except (TypeError, ValueError):
        return default

def _extract_json_dict(text: str) -> dict:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[-1]
        if raw.rstrip().endswith("```"):
            raw = raw.rsplit("```", 1)[0]
    decoder = json.JSONDecoder()
    for index, char in enumerate(raw):
        if char != "{":
            continue
        try:
            obj, _ = decoder.raw_decode(raw[index:])
        except Exception:
            continue
        if isinstance(obj, dict):
            return obj
    return {}

def _attempt_evaluation_from_dict(data: dict) -> AttemptEvaluation:
    return AttemptEvaluation(
        verdict=_normalize_attempt_verdict(data.get("verdict")),
        confidence=round(_bounded_float(data.get("confidence")), 2),
        rationale=str(data.get("rationale") or "")[:500],
        expected_answer=str(data.get("expected_answer") or "")[:500],
        next_action=str(data.get("next_action") or "")[:220],
        is_final_answer=bool(data.get("is_final_answer")),
        final_answer_correct=(
            bool(data.get("final_answer_correct"))
            if data.get("final_answer_correct") is not None
            else None
        ),
        misconception=str(data.get("misconception") or "")[:180],
    )

def _format_recent_history_for_grading(chat_history: list[dict]) -> str:
    lines = []
    for turn in (chat_history or [])[-6:]:
        user = str(turn.get("user") or "").strip()
        ai = str(turn.get("ai") or turn.get("assistant") or turn.get("ai_response") or "").strip()
        if user:
            lines.append(f"Student: {user[:500]}")
        if ai:
            lines.append(f"Tutor: {ai[:900]}")
    return "\n".join(lines) or "No prior turns."

def _trim_plan_text(value: Any, fallback: str = "", max_len: int = 240) -> str:
    text = re.sub(r"\s+", " ", str(value or "").strip())
    return (text or fallback)[:max_len]

def _safe_int(value: Any, default: int = 0, min_value: int = 0, max_value: int = 999) -> int:
    try:
        parsed = int(value)
    except (TypeError, ValueError):
        parsed = default
    return max(min_value, min(max_value, parsed))

def _safe_string_list(value: Any, max_items: int = 8, max_len: int = 80) -> list[str]:
    if not isinstance(value, list):
        return []
    output = []
    for item in value[:max_items]:
        text = _trim_plan_text(item, "", max_len)
        if text:
            output.append(text)
    return output

def _normalize_tutor_plan(data: dict | None, fallback_goal: str = "") -> TutorPlan:
    source = data if isinstance(data, dict) else {}
    raw_steps = source.get("steps") if isinstance(source.get("steps"), list) else []
    steps = []
    for index, step in enumerate(raw_steps[:12], start=1):
        if not isinstance(step, dict):
            continue
        steps.append({
            "id": _safe_int(step.get("id"), index, 1, 99),
            "title": _trim_plan_text(step.get("title"), f"Step {index}", 80),
            "expected": _trim_plan_text(step.get("expected"), "", 300),
            "skill": _trim_plan_text(step.get("skill"), "", 80),
            "misconception": _trim_plan_text(step.get("misconception"), "", 140),
        })

    total_steps = _safe_int(source.get("total_steps") or len(steps), len(steps), 0, 99)
    current_step = _safe_int(source.get("current_step"), 1, 1, max(1, total_steps or len(steps) or 1))
    current = next((step for step in steps if step.get("id") == current_step), steps[current_step - 1] if steps and current_step <= len(steps) else {})

    return TutorPlan(
        goal=_trim_plan_text(source.get("goal"), fallback_goal or "Build understanding step by step", 140),
        current_step=current_step,
        total_steps=total_steps,
        steps=steps,
        expected_step_answer=_trim_plan_text(source.get("expected_step_answer") or current.get("expected"), "", 300),
        final_answer=_trim_plan_text(source.get("final_answer"), "", 500),
        skills_used=_safe_string_list(source.get("skills_used"), 10, 80),
        misconceptions=_safe_string_list(source.get("misconceptions"), 12, 140),
        mastery_score=round(_bounded_float(source.get("mastery_score"), 0.0), 2),
    )

def _tutor_plan_to_dict(plan: TutorPlan | None) -> dict:
    if not plan:
        return {}
    return {
        "goal": plan.goal,
        "current_step": plan.current_step,
        "total_steps": plan.total_steps,
        "steps": plan.steps,
        "expected_step_answer": plan.expected_step_answer,
        "final_answer": plan.final_answer,
        "skills_used": plan.skills_used,
        "misconceptions": plan.misconceptions,
        "mastery_score": plan.mastery_score,
    }

def _plan_from_session_state(session_state: dict) -> TutorPlan | None:
    if not isinstance(session_state, dict):
        return None
    raw_plan = session_state.get("lesson_plan")
    if isinstance(raw_plan, dict):
        plan_data = {
            **raw_plan,
            "current_step": session_state.get("current_step") or raw_plan.get("current_step"),
            "total_steps": session_state.get("total_steps") or raw_plan.get("total_steps"),
            "expected_step_answer": session_state.get("expected_step_answer") or raw_plan.get("expected_step_answer"),
            "final_answer": session_state.get("final_answer") or raw_plan.get("final_answer"),
            "skills_used": session_state.get("skills_used") or raw_plan.get("skills_used"),
            "misconceptions": session_state.get("misconceptions") or raw_plan.get("misconceptions"),
            "mastery_score": session_state.get("mastery_score") or raw_plan.get("mastery_score"),
        }
        return _normalize_tutor_plan(plan_data)
    if session_state.get("total_steps") or session_state.get("expected_step_answer") or session_state.get("final_answer"):
        return _normalize_tutor_plan(session_state)
    return None

async def plan_tutor_steps(state: TutorState) -> dict:
    if not state.get("tutor_mode"):
        return {"tutor_plan": TutorPlan()}

    session_state = state.get("tutor_session_state") or {}
    existing_plan = _plan_from_session_state(session_state)
    if existing_plan and state.get("intent") == "comprehension_answer":
        return {"tutor_plan": existing_plan}

    ai_client = state.get("_ai_client")
    user_input = state.get("user_input", "")
    if not ai_client:
        fallback = _normalize_tutor_plan({
            "goal": user_input[:140] or "Build understanding step by step",
            "steps": [
                {"id": 1, "title": "Understand the target", "expected": "State what is being asked", "skill": "problem framing"},
                {"id": 2, "title": "Apply the key idea", "expected": "Use the relevant rule or concept", "skill": "core concept"},
                {"id": 3, "title": "Check the result", "expected": "Verify the answer or reasoning", "skill": "verification"},
            ],
            "current_step": 1,
        })
        return {"tutor_plan": fallback}

    prompt = f"""
Create a hidden tutoring lesson plan. This plan is for the tutor graph only; it must not be shown fully to the student.

Requirements:
- Work for any subject: math, science, coding, language, history, reasoning, writing, definitions, and MCQ checks.
- Break the learning task into 2-6 small teachable steps.
- Each step needs an expected answer/key idea for grading.
- Include a final_answer when the task has a clear final answer; otherwise leave it empty.
- Include skills_used and likely misconceptions.
- Set current_step to 1 unless continuing an existing plan.

Student request:
{user_input}

Recent conversation:
{_format_recent_history_for_grading(state.get("chat_history", []))}

Existing tutor state:
{json.dumps(session_state, ensure_ascii=False)[:1500]}

Return only JSON:
{{"goal":"short learning goal","current_step":1,"total_steps":3,"steps":[{{"id":1,"title":"short title","expected":"accepted answer or key idea","skill":"skill name","misconception":"likely mistake"}}],"final_answer":"optional final answer","skills_used":["skill"],"misconceptions":["mistake"],"mastery_score":0.0}}
""".strip()

    try:
        raw = await _agenerate(ai_client, prompt, max_tokens=900, temperature=0.1)
        parsed = _extract_json_dict(raw)
        return {"tutor_plan": _normalize_tutor_plan(parsed, fallback_goal=user_input)}
    except Exception as exc:
        logger.warning(f"[TUTOR PLAN] planning skipped: {exc}")
        return {"tutor_plan": existing_plan or _normalize_tutor_plan({"goal": user_input[:140]})}

async def evaluate_tutor_attempt(state: TutorState) -> dict:
    if not state.get("tutor_mode"):
        return {"attempt_evaluation": AttemptEvaluation()}

    if state.get("intent") != "comprehension_answer":
        return {"attempt_evaluation": AttemptEvaluation()}

    user_answer = (state.get("tutor_choice") or state.get("user_input") or "").strip()
    if not user_answer:
        return {"attempt_evaluation": AttemptEvaluation(verdict="needs_attempt", confidence=0.8)}

    chat_history = state.get("chat_history", [])
    last_tutor_message = _last_ai_message(chat_history)
    session_state = state.get("tutor_session_state") or {}
    tutor_plan = state.get("tutor_plan")
    plan_dict = _tutor_plan_to_dict(tutor_plan if isinstance(tutor_plan, TutorPlan) else None)
    current_step = plan_dict.get("current_step") or session_state.get("current_step") or 1
    step_data = {}
    for step in plan_dict.get("steps", []) or []:
        if int(step.get("id") or 0) == int(current_step or 1):
            step_data = step
            break
    expected_step_answer = (
        plan_dict.get("expected_step_answer")
        or step_data.get("expected")
        or session_state.get("expected_step_answer")
        or ""
    )
    final_answer = plan_dict.get("final_answer") or session_state.get("final_answer") or ""
    previous_check = (
        state.get("comprehension_check")
        or _previous_comprehension_check(chat_history)
        or session_state.get("next_action")
        or _extract_last_question(last_tutor_message)
    )

    if not previous_check and not last_tutor_message:
        return {"attempt_evaluation": AttemptEvaluation(verdict="not_applicable", confidence=0.0)}

    ai_client = state.get("_ai_client")
    if not ai_client:
        return {"attempt_evaluation": AttemptEvaluation(verdict="not_applicable", confidence=0.0)}

    rag_context = "\n".join(str(chunk)[:800] for chunk in (state.get("rag_context") or [])[:4])

    prompt = f"""
You are the hidden grading node inside an educational tutor graph.
Grade the student's latest attempt against the previous tutor step. This must work for every subject: math, science, coding, language, history, reasoning, definitions, diagrams described in text, and multiple choice.

Rules:
- Judge semantic correctness, not exact wording.
- Accept equivalent forms, notation, units, synonyms, abbreviations, and algebraically equivalent expressions.
- For math, accept forms like (3x^2)/2 and 3x^2/2 as the same.
- Grade against the CURRENT STEP first, not against the whole original problem.
- If the previous tutor step asked for only one sub-step, grade only that sub-step.
- If the answer is right for the requested sub-step, verdict must be "correct" even if the full original problem is unfinished.
- Detect if the student jumped to the final answer. If so, set is_final_answer=true and grade final_answer_correct separately.
- If the final answer is correct but the current step reasoning has not been shown, verdict can be "correct" and next_action should ask for a brief justification of the key step.
- Use "partly_correct" when the core direction is right but an important piece is missing.
- Use "not_yet" only when the attempt is materially wrong or does not answer the step.
- Use "needs_attempt" when the student asks for help instead of attempting.
- Do not reveal hidden reasoning. Return only JSON.

Recent conversation:
{_format_recent_history_for_grading(chat_history)}

Previous tutor step to grade:
{previous_check or "Use the final tutor prompt from the recent conversation."}

Full previous tutor message:
{last_tutor_message[:1800] or "Unavailable"}

Persisted tutor state:
{json.dumps(session_state, ensure_ascii=False)[:1200]}

Hidden lesson plan:
{json.dumps(plan_dict, ensure_ascii=False)[:2200]}

Current step number:
{current_step}

Current step expected answer/key idea:
{expected_step_answer or "Use the previous tutor step and lesson plan."}

Known final answer:
{final_answer or "none"}

Retrieved document context:
{rag_context or "none"}

Student attempt:
{user_answer}

Return JSON with this exact shape:
{{"verdict":"correct|partly_correct|not_yet|needs_attempt|not_applicable","confidence":0.0,"rationale":"short factual grading reason","expected_answer":"accepted current-step answer or key idea","next_action":"one next tutor action","is_final_answer":false,"final_answer_correct":null,"misconception":"short misconception label if any"}}
""".strip()

    try:
        raw = await _agenerate(ai_client, prompt, max_tokens=550, temperature=0.0)
        parsed = _extract_json_dict(raw)
        evaluation = _attempt_evaluation_from_dict(parsed)
        if evaluation.verdict == "not_applicable" and parsed:
            evaluation.verdict = "not_yet"
        return {"attempt_evaluation": evaluation}
    except Exception as exc:
        logger.warning(f"[TUTOR ATTEMPT] grading skipped: {exc}")
        return {"attempt_evaluation": AttemptEvaluation()}

def update_tutor_plan_progress(state: TutorState) -> dict:
    plan = state.get("tutor_plan")
    if not isinstance(plan, TutorPlan):
        return {}

    evaluation = state.get("attempt_evaluation")
    if not isinstance(evaluation, AttemptEvaluation):
        return {"tutor_plan": plan}

    verdict = evaluation.verdict
    if verdict == "correct":
        if evaluation.is_final_answer and evaluation.final_answer_correct and plan.total_steps:
            plan.current_step = plan.total_steps
            plan.mastery_score = max(plan.mastery_score, 0.95)
        elif plan.total_steps and plan.current_step < plan.total_steps:
            plan.current_step += 1
            plan.mastery_score = min(1.0, max(plan.mastery_score, 0.0) + 0.15)
        else:
            plan.mastery_score = min(1.0, max(plan.mastery_score, 0.0) + 0.1)
    elif verdict == "partly_correct":
        plan.mastery_score = min(1.0, max(plan.mastery_score, 0.0) + 0.05)
        if evaluation.misconception and evaluation.misconception not in plan.misconceptions:
            plan.misconceptions.append(evaluation.misconception)
    elif verdict == "not_yet":
        plan.mastery_score = max(0.0, max(plan.mastery_score, 0.0) - 0.05)
        if evaluation.misconception and evaluation.misconception not in plan.misconceptions:
            plan.misconceptions.append(evaluation.misconception)

    current = next((step for step in plan.steps if step.get("id") == plan.current_step), None)
    if current:
        plan.expected_step_answer = _trim_plan_text(current.get("expected"), plan.expected_step_answer, 300)
    plan.misconceptions = plan.misconceptions[-12:]
    return {"tutor_plan": plan}

async def build_prompt_and_respond(state: TutorState) -> dict:
    rag_active = bool(state.get("rag_context"))
    context_only = bool(state.get("context_only"))
    context_only_no_match = bool(state.get("context_only_no_match"))

    if context_only and context_only_no_match:
        return {
            "response": (
                "I couldn’t find enough relevant information in the selected context documents "
                "to answer that. Please select more relevant context pages/files and try again."
            ),
            "instructional_task": state.get("instructional_task", ""),
        }

    hs_ai = state.get("_hs_ai_client")
    ai_client = (hs_ai if rag_active and hs_ai else None) or state.get("_ai_client")

    if not ai_client:
        return {"response": "AI client not available.", "error": "no_ai_client"}

    if rag_active and hs_ai:
        logger.info("[TUTOR GEN] *** Using HS context AI client (RAG-enriched prompt) ***")
    else:
        logger.info("[TUTOR GEN] Using main AI client (no RAG or HS client unavailable)")

    task = _build_instructional_task(state)
    state_with_task = {**state, "instructional_task": task}
    prompt = build_tutor_prompt(state_with_task)

    student = state.get("student_state")
    student_name = student.first_name if student and student.first_name else ""

    intent = state.get("intent", "")

    system = (
        "You are Cerbyl, an expert tutor and central learning agent. "
        "You are genuinely enthusiastic about teaching and learning — your energy is warm, encouraging, and upbeat. "
        "You celebrate student progress, make learning feel exciting, and bring positive energy to every response. "
        "You adapt your teaching to each student's level and learning style. "
        "You never dump information; you teach with intention. "
        "Be concise but thorough. Use markdown formatting for clarity. "
        "CRITICAL: Never narrate your internal reasoning, planning, or approach. "
        "Do NOT write things like 'Common mistakes to address:', 'For the style he prefers, I will:', "
        "'Let me think about this:', or any meta-commentary about how you are structuring your answer. "
        "Go directly to the answer — no preamble, no self-narration. "
        "When suggesting topics, weak areas, or past work — ONLY reference what appears in STRUCTURED LEARNING DATA. "
        "If no data exists for the student, ask what they want to study. "
        "NEVER invent topics, subjects, or examples that are not in the student's data. "
        "MATH FORMATTING — THIS IS MANDATORY: Every mathematical expression MUST be wrapped in LaTeX delimiters. "
        "Use \\( ... \\) for inline math and \\[ ... \\] for display/block equations. "
        "NEVER write bare math like: ax^2 + bx + c = 0. ALWAYS write: \\(ax^2 + bx + c = 0\\). "
        "This applies to ALL variables, equations, formulas, and expressions — no exceptions."
    )
    if student_name:
        system += f"\n\nThe student's name is {student_name}. Address them by name naturally (not every sentence)."

    intelligence_ctx = state.get("intelligence_context", "")
    if intelligence_ctx and intent not in ("greeting", "returning_greeting") and not context_only:
        system = intelligence_ctx + "\n\n" + system

    if context_only:
        system += (
            "\n\nCONTEXT-ONLY MODE — HARD RULES:\n"
            "1. Use only the provided CURRICULUM CONTEXT chunks from selected documents.\n"
            "2. Do NOT use general knowledge, prior chat memory, or inferred facts.\n"
            "3. If the answer is not supported by the provided chunks, say that clearly.\n"
            "4. Quote or paraphrase only what is present in those chunks."
        )

    if intent == "project_build" and not context_only:
        system += (
            "\n\nPROJECT DELIVERY MODE — HARD RULES:\n"
            "1. Own the implementation workflow. Choose sensible defaults instead of asking the user to supply every parameter.\n"
            "2. Select one coherent stack; do not answer with a technology shopping list.\n"
            "3. State assumptions, then proceed. Ask no follow-up question unless a missing choice is genuinely blocking or risky.\n"
            "4. Include concrete architecture, file tree, commands, core interfaces, implementation steps, and verification.\n"
            "5. Each numbered step must identify what to create/change and what successful completion looks like.\n"
            "6. Include a runnable end-to-end vertical slice or the most important starter code, not only explanations.\n"
            "7. End with measurable acceptance criteria and the next milestone. Do not end with 'tell me your framework' or "
            "'provide more details'.\n"
            "8. Student-profile restrictions about inventing learning topics do not prevent you from choosing conventional "
            "technical defaults required to build this project.\n"
            "9. Be honest about unverified versions, prices, provider limits, and deployment facts; do not label anything "
            "as latest without verification."
        )

    if (
        state.get("tutor_mode")
        and intent not in ("greeting", "returning_greeting", "project_build")
    ):
        system += (
            "\n\nTUTOR MODE — HARD RULES:\n"
            "1. Prioritize guided learning over complete answer dumps.\n"
            "2. Use chat history to estimate the student's current level from attempts, mistakes, and confidence.\n"
            "3. Evaluate student replies before moving ahead when they appear to answer a prior check.\n"
            "4. Ask for one small student action at the end, not multiple tasks.\n"
            "5. Sometimes provide an MCQ when it lowers friction or checks a misconception.\n"
            "6. Never solve the exact step you ask the student to do next.\n"
            "7. For math, show one rule/setup, then stop before the student-owned calculation.\n"
            "8. Do not reveal final answers on the first tutor turn unless the student already attempted the problem.\n"
            "9. The answer field must be formatted as markdown bullet points, one step per line: - **Step 1 — ...:** ... then - **Step 2 — ...:** ...\n"
            "10. Every visible line in the answer field must start with '- '. Do not write paragraph blocks before or after the bullets.\n"
            "11. Use 2-4 visible steps maximum. The final step must be the student-owned action/check, not a solved answer.\n"
            "12. Return ONLY valid JSON. Do not use markdown fences or any prose outside JSON.\n"
            "13. JSON schema: {\"answer\":\"visible markdown answer with numbered Step sections and LaTeX\",\"tutor_state\":{\"level\":\"beginner|intermediate|advanced\",\"phase\":\"diagnose|teach|practice|check|review\",\"verdict\":\"correct|partly_correct|not_yet|needs_attempt|not_applicable\",\"confidence\":0.0,\"objective\":\"short current skill\",\"next_action\":\"short student action\",\"hint_level\":1,\"current_step\":1,\"total_steps\":3,\"expected_step_answer\":\"hidden expected answer\",\"final_answer\":\"hidden final answer if known\",\"skills_used\":[\"skill\"],\"misconceptions\":[\"mistake\"],\"mastery_score\":0.0},\"options\":[{\"label\":\"A\",\"text\":\"option text\"}]}.\n"
            "14. Put any MCQ choices only in the options array. Use [] when no options are needed.\n"
            "15. The answer field is the only visible tutor response; keep it concise and student-facing."
        )
        attempt_evaluation = state.get("attempt_evaluation")
        attempt_verdict = getattr(attempt_evaluation, "verdict", "not_applicable") if attempt_evaluation else "not_applicable"
        if attempt_verdict and attempt_verdict != "not_applicable":
            system += (
                "\n\nGRAPH ATTEMPT EVALUATION — HARD RULES:\n"
                f"Verdict: {attempt_verdict}\n"
                f"Confidence: {getattr(attempt_evaluation, 'confidence', 0.0)}\n"
                f"Reason: {getattr(attempt_evaluation, 'rationale', '')}\n"
                f"Accepted answer/key idea: {getattr(attempt_evaluation, 'expected_answer', '')}\n"
                f"Recommended next action: {getattr(attempt_evaluation, 'next_action', '')}\n"
                "1. tutor_state.verdict must exactly match this Verdict.\n"
                "2. If Verdict is correct, say it is correct, briefly explain why, and move to a new next step.\n"
                "3. If Verdict is correct, do NOT ask the same prior question again.\n"
                "4. If Verdict is partly_correct or not_yet, repair only the smallest blocking gap.\n"
            )

    if intent in ("greeting", "returning_greeting"):
        system += (
            "\n\nGREETING MODE — HARD RULES:\n"
            "1. Do NOT suggest any subject, topic, concept, equation, or example whatsoever.\n"
            "2. Do NOT say things like 'we could explore math' or 'perhaps quadratic equations'.\n"
            "3. Do NOT reference any past conversations or behaviors you think you remember.\n"
            "4. ONLY greet the student and ask what THEY want to work on.\n"
            "5. Keep the response to 1-2 sentences maximum.\n"
            "6. Honor the [TONE: ...] tag in the prompt exactly.\n"
            "Violating any of these rules is a critical failure."
        )

    full_prompt = f"{system}\n\n{prompt}"

    try:
        max_tokens = 3200 if intent == "project_build" else 2000
        temperature = 0.45 if intent == "project_build" else 0.7
        response = await _agenerate(
            ai_client,
            full_prompt,
            max_tokens=max_tokens,
            temperature=temperature,
        )
        if intent == "project_build" and _project_response_needs_repair(response):
            logger.warning("[TUTOR GEN] Project response was too vague; rewriting to delivery contract")
            response = await _repair_project_build_response(
                ai_client,
                response,
                str(state.get("user_input") or ""),
            )
        if state.get("tutor_mode") and _has_tutor_contract_leak(response):
            logger.warning("[TUTOR GEN] Contract/schema leakage detected; retrying tutor response repair")
            response = await _repair_tutor_contract_response(
                ai_client,
                response,
                str(state.get("user_input") or ""),
            )
        response = _append_rag_citations(response, state.get("rag_sources") or [])
        return {"response": response, "instructional_task": task}
    except Exception as e:
        main_ai = state.get("_ai_client")
        if ai_client is hs_ai and main_ai and main_ai is not ai_client:
            logger.error(f"HS context AI generation failed; falling back to main AI client: {e}")
            try:
                response = await _agenerate(
                    main_ai,
                    full_prompt,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
                if intent == "project_build" and _project_response_needs_repair(response):
                    logger.warning(
                        "[TUTOR GEN] Fallback project response was too vague; rewriting to delivery contract"
                    )
                    response = await _repair_project_build_response(
                        main_ai,
                        response,
                        str(state.get("user_input") or ""),
                    )
                if state.get("tutor_mode") and _has_tutor_contract_leak(response):
                    logger.warning("[TUTOR GEN] Contract/schema leakage detected after fallback; retrying tutor response repair")
                    response = await _repair_tutor_contract_response(
                        main_ai,
                        response,
                        str(state.get("user_input") or ""),
                    )
                response = _append_rag_citations(response, state.get("rag_sources") or [])
                return {"response": response, "instructional_task": task}
            except Exception as fallback_error:
                logger.error(f"Fallback LLM generation failed: {fallback_error}")
                return {"response": "I'm having trouble responding right now. Please try again.", "error": str(fallback_error)}
        logger.error(f"LLM generation failed: {e}")
        return {"response": "I'm having trouble responding right now. Please try again.", "error": str(e)}

async def evaluate_response(state: TutorState) -> dict:
    ai_client = state.get("_ai_client")
    if not ai_client or state.get("intent") in ("greeting", "returning_greeting", "off_topic", "repetitive"):
        return {"evaluation": EvalResult()}

    result = await run_in_threadpool(
        evaluate,
        ai_client=ai_client,
        user_input=state.get("user_input", ""),
        response=state.get("response", ""),
        student_state=state.get("student_state"),
    )
    return {"evaluation": result}

async def persist_updates(state: TutorState) -> dict:
    user_id       = state.get("user_id", "")
    intent        = state.get("intent", "")
    user_input    = state.get("user_input", "")
    response_text = state.get("response", "")
    evaluation    = state.get("evaluation")
    analysis      = state.get("language_analysis") or {}
    chat_id       = state.get("chat_id")
    db_factory    = state.get("_db_factory")
    chroma_writes = []

    signal_type      = analysis.get("signal_type", "neutral")
    knowledge_signal = float(analysis.get("knowledge_signal", 0.0))
    primary_concept  = analysis.get("primary_concept")
    matched_concepts = analysis.get("matched_concepts", [])

    if primary_concept and db_factory and intent not in ("greeting", "returning_greeting", "off_topic", "recall"):
        try:
            from models import ChatConceptSignal, UserWeakArea
            from datetime import datetime, timezone
            db = db_factory()
            try:
                uid = int(user_id)

                sig = ChatConceptSignal(
                    user_id         = uid,
                    chat_session_id = chat_id,
                    concept         = primary_concept[:255],
                    signal_type     = signal_type,
                    knowledge_signal= round(knowledge_signal, 4),
                    message_snippet = user_input[:300],
                )
                db.add(sig)

                if knowledge_signal < -0.3:
                    existing = db.query(UserWeakArea).filter(
                        UserWeakArea.user_id == uid,
                        UserWeakArea.topic   == primary_concept,
                    ).first()
                    now = datetime.now(timezone.utc)
                    if existing:
                        existing.weakness_score  = min(1.0, (existing.weakness_score or 0.0) + abs(knowledge_signal) * 0.15)
                        existing.incorrect_count = (existing.incorrect_count or 0) + 1
                        existing.total_questions = (existing.total_questions or 0) + 1
                        accuracy = (existing.correct_count or 0) / max(existing.total_questions, 1)
                        existing.accuracy        = round(accuracy, 4)
                        existing.status          = "needs_practice" if existing.weakness_score > 0.4 else existing.status
                        existing.last_updated    = now
                    else:
                        wa = UserWeakArea(
                            user_id          = uid,
                            topic            = primary_concept[:255],
                            subtopic         = signal_type,
                            total_questions  = 1,
                            correct_count    = 0,
                            incorrect_count  = 1,
                            accuracy         = 0.0,
                            weakness_score   = abs(knowledge_signal),
                            status           = "needs_practice",
                            priority         = int(abs(knowledge_signal) * 10),
                            first_identified = now,
                            last_updated     = now,
                        )
                        db.add(wa)

                elif knowledge_signal > 0.4:
                    existing = db.query(UserWeakArea).filter(
                        UserWeakArea.user_id == uid,
                        UserWeakArea.topic   == primary_concept,
                    ).first()
                    if existing:
                        existing.weakness_score  = max(0.0, (existing.weakness_score or 0.0) - knowledge_signal * 0.1)
                        existing.correct_count   = (existing.correct_count or 0) + 1
                        existing.total_questions = (existing.total_questions or 0) + 1
                        accuracy = existing.correct_count / max(existing.total_questions, 1)
                        existing.accuracy        = round(accuracy, 4)
                        if existing.weakness_score < 0.2:
                            existing.status = "improving"
                        existing.last_updated = datetime.now(timezone.utc)

                db.commit()
                logger.info(
                    f"[LANG PERSIST] user={uid} concept={primary_concept!r} "
                    f"signal={signal_type} score={knowledge_signal:+.2f}"
                )

                try:
                    from dkt.language_analyzer import update_student_head
                    cached_emb  = _lang_embedding_cache.pop(user_id, None)
                    train_label = "neutral" if signal_type == "neutral_question" else signal_type
                    update_student_head(uid, user_input, train_label, db, embedding=cached_emb)
                except Exception as _e:
                    logger.debug(f"[LANG] head update skipped: {_e}")
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"ChatConceptSignal persist failed: {e}")

    selected_style = state.get("selected_style", "")
    style_context  = state.get("style_context") or []

    if db_factory and intent not in ("greeting", "returning_greeting", "off_topic", "recall", "repetitive"):
        try:
            import numpy as np
            from dkt.style_bandit import (
                load_bandit, save_bandit,
                get_pending_update, set_pending_update,
            )
            uid = int(user_id)
            db  = db_factory()
            try:
                pending = get_pending_update(uid, db)
                if pending:
                    bandit = load_bandit(uid, db)
                    reward = float(np.clip(knowledge_signal, -1.0, 1.0))
                    bandit.update(pending["style"], pending["context"], reward)
                    save_bandit(uid, bandit, db)
                    logger.info(
                        f"[BANDIT] reward loop closed: style={pending['style']!r} "
                        f"reward={reward:+.3f} user={uid}"
                    )

                if selected_style and style_context:
                    ctx = np.array(style_context, dtype=np.float64)
                    set_pending_update(uid, selected_style, ctx, db)
            finally:
                db.close()
        except Exception as e:
            logger.warning(f"[BANDIT] reward update failed: {e}")

    if chroma_store.available() and user_input:
        try:
            _PREF_PATTERNS = [
                r"\bdon'?t\b.{0,40}\b(suggest|recommend|tell|show|give)\b",
                r"\bstop\b.{0,40}\b(suggest|recommend|telling|showing)\b",
                r"\bnever\b.{0,40}\b(suggest|recommend|tell|show|give)\b",
                r"\bplease\s+(don'?t|stop|never)\b",
                r"\bi\s+(prefer|want|like|hate|dislike)\b.{0,60}",
                r"\balways\b.{0,40}\b(do|use|give|start)\b",
                r"\buntil\s+i\s+(ask|tell|say)\b",
            ]
            import re as _re
            is_preference = any(_re.search(p, user_input, _re.I) for p in _PREF_PATTERNS)
            if is_preference:
                chroma_store.write_important(
                    user_id  = user_id,
                    summary  = user_input[:300],
                    metadata = {
                        "source":    "preference",
                        "timestamp": __import__("datetime").datetime.utcnow().isoformat(),
                    },
                )
                logger.info(f"[PREF] Stored student preference: {user_input[:80]!r}")
        except Exception as e:
            logger.warning(f"Preference detection failed: {e}")

    if chroma_store.available() and intent not in ("greeting", "returning_greeting", "off_topic", "repetitive", "recall"):
        try:
            truncated_resp = response_text[:150] + "..." if len(response_text) > 150 else response_text
            memory_summary = (
                (evaluation.distilled_memory if evaluation and evaluation.distilled_memory else None)
                or f"Student asked: {user_input[:100]}. Cerbyl covered: {truncated_resp}"
            )
            chroma_store.write_episode(
                user_id  = user_id,
                summary  = memory_summary,
                metadata = {
                    "intent":           intent,
                    "concept":          primary_concept or "",
                    "signal_type":      signal_type,
                    "knowledge_signal": str(round(knowledge_signal, 2)),
                    "teaching_style":   selected_style or "",
                    "source":           "chat",
                    "chat_session_id":  str(state.get("chat_id")) if state.get("chat_id") is not None else "",
                },
            )
            chroma_writes.append({"summary": memory_summary})
        except Exception as e:
            logger.warning(f"Chroma persistence failed: {e}")

    return {"chroma_writes": chroma_writes}
