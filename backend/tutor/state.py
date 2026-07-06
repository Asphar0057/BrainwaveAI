from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, TypedDict, Optional

@dataclass
class StudentState:
    user_id: str = ""
    first_name: str = ""
    strengths: list[str] = field(default_factory=list)
    weaknesses: list[str] = field(default_factory=list)
    preferred_style: str = "balanced"
    difficulty_level: str = "intermediate"
    current_subject: str = ""

@dataclass
class EvalResult:
    confusion_persists: bool = False
    strategy_worked: Optional[bool] = None
    mastery_confirmed: Optional[bool] = None
    new_struggle: Optional[bool] = None
    distilled_memory: Optional[str] = None

@dataclass
class AttemptEvaluation:
    verdict: str = "not_applicable"
    confidence: float = 0.0
    rationale: str = ""
    expected_answer: str = ""
    next_action: str = ""
    is_final_answer: bool = False
    final_answer_correct: Optional[bool] = None
    misconception: str = ""

@dataclass
class TutorPlan:
    goal: str = ""
    current_step: int = 1
    total_steps: int = 0
    steps: list[dict] = field(default_factory=list)
    expected_step_answer: str = ""
    final_answer: str = ""
    skills_used: list[str] = field(default_factory=list)
    misconceptions: list[str] = field(default_factory=list)
    mastery_score: float = 0.0

class TutorState(TypedDict, total=False):
    user_id: str
    user_input: str
    chat_id: Optional[int]
    chat_history: list[dict]
    intent: str
    comprehension_check: Optional[str]
    student_state: StudentState
    episodic_memories: list[str]
    structured_context: list[str]
    rag_context: list[str]
    use_hs_context: bool
    context_doc_ids: list[str]
    context_only: bool
    tutor_mode: bool
    tutor_reply_style: str
    tutor_choice: Optional[str]
    tutor_session_state: Optional[dict]
    tutor_plan: TutorPlan
    attempt_evaluation: AttemptEvaluation
    context_only_no_match: bool
    retrieval_gated: bool
    language_analysis: dict
    is_new_session: bool
    session_gap_days: Optional[float]
    decayed_concepts: list[dict]
    last_session_summary: Optional[dict]
    selected_style: str
    style_context: list[float]
    style_scores: dict
    instructional_task: str
    response: str
    evaluation: EvalResult
    chroma_writes: list[dict]
    error: Optional[str]
    intelligence_context: Optional[str]
    _ai_client: Any
    _hs_ai_client: Any
    _db_factory: Any
