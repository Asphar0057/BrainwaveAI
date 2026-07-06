from __future__ import annotations

import json
import logging
from typing import Optional

from services.ai_utils import UnifiedAIClient
from tutor.state import EvalResult, StudentState

logger = logging.getLogger(__name__)

EVAL_PROMPT = """You are a learning evaluator. Given a student-tutor exchange, determine the learning outcome.

Student profile:
- Weaknesses: {weaknesses}

Student said: {user_input}

Tutor responded: {response}

Respond with ONLY valid JSON:
{{
  "confusion_persists": true/false,
  "strategy_worked": true/false/null,
  "mastery_confirmed": true/false/null,
  "new_struggle": true/false/null,
  "distilled_memory": "one-sentence learning insight or null"
}}

Rules:
- confusion_persists: true if the student seems confused or the question reveals misunderstanding
- strategy_worked: true if the explanation approach clearly helped, null if unclear
- mastery_confirmed: true only if the student demonstrates solid understanding, null if unclear
- new_struggle: true if this reveals a new topic the student struggles with
- distilled_memory: a short factual sentence about what happened pedagogically, or null if nothing noteworthy"""

def evaluate(
    ai_client: UnifiedAIClient,
    user_input: str,
    response: str,
    student_state: Optional[StudentState] = None,
) -> EvalResult:
    weaknesses = ", ".join(student_state.weaknesses) if student_state else "unknown"

    prompt = EVAL_PROMPT.format(
        weaknesses=weaknesses,
        user_input=user_input,
        response=response[:1000],
    )

    try:
        raw = ai_client.generate(prompt, max_tokens=300, temperature=0.1)
        raw = raw.strip()
        if raw.startswith("```"):
            raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0]
        data = json.loads(raw)
        return EvalResult(
            confusion_persists=bool(data.get("confusion_persists", False)),
            strategy_worked=data.get("strategy_worked"),
            mastery_confirmed=data.get("mastery_confirmed"),
            new_struggle=data.get("new_struggle"),
            distilled_memory=data.get("distilled_memory"),
        )
    except Exception as e:
        logger.warning(f"Evaluation failed, defaulting to no-op: {e}")
        return EvalResult()
