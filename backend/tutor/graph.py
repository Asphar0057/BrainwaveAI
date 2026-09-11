from __future__ import annotations

import logging
import inspect
import os
from time import perf_counter
from typing import Any, Optional

from starlette.concurrency import run_in_threadpool

from langgraph.graph import StateGraph, END

from tutor.state import TutorState
from tutor import nodes
from services.ai_result import AIWorkflowError, require_ai_success

logger = logging.getLogger(__name__)

def _timed_node(name, node):
    async def run(state):
        started = perf_counter()
        try:
            if inspect.iscoroutinefunction(node):
                return await node(state)
            return await run_in_threadpool(node, state)
        finally:
            # Log timings only; never student content or provider credentials.
            log = logger.warning if os.getenv("TUTOR_PROFILE") == "1" else logger.debug
            log("[TUTOR TIMING] node=%s seconds=%.3f", name, perf_counter() - started)
    return run

class TutorGraph:

    def __init__(self, ai_client: Any, db_session_factory: Any = None, hs_ai_client: Any = None):
        self.ai_client = ai_client
        self.hs_ai_client = hs_ai_client
        self.db_factory = db_session_factory
        self._graph = self._build()

    def _build(self):
        g = StateGraph(TutorState)

        for name in ("detect_intent", "analyze_message", "fetch_student_state",
                     "gate_and_retrieve", "plan_tutor_steps", "evaluate_tutor_attempt",
                     "update_tutor_plan_progress", "select_teaching_style",
                     "build_prompt_and_respond", "review_tutor_response", "evaluate_response", "persist_updates"):
            g.add_node(name, _timed_node(name, getattr(nodes, name)))
        # Was defined in nodes.py but never registered here, so it never ran: state["selected_style"]
        # stayed permanently "" and both the STYLE_INSTRUCTIONS prompt injection (tutor/prompt.py's
        # _style_section) and the reward-closing half in persist_updates (gated on `if selected_style`)
        # were silently dead. Placed after update_tutor_plan_progress so intent (detect_intent),
        # language_analysis (analyze_message), and student_state/session_gap_days/decayed_concepts
        # (fetch_student_state) -- everything select_teaching_style reads -- are all already
        # populated, and before build_prompt_and_respond, the only consumer of selected_style.

        g.set_entry_point("detect_intent")
        g.add_edge("detect_intent",           "analyze_message")
        g.add_edge("analyze_message",         "fetch_student_state")
        g.add_edge("fetch_student_state",     "gate_and_retrieve")
        g.add_edge("gate_and_retrieve",       "plan_tutor_steps")
        g.add_edge("plan_tutor_steps",        "evaluate_tutor_attempt")
        g.add_edge("evaluate_tutor_attempt",  "update_tutor_plan_progress")
        g.add_edge("update_tutor_plan_progress","select_teaching_style")
        g.add_edge("select_teaching_style",   "build_prompt_and_respond")
        g.add_conditional_edges(
            "build_prompt_and_respond",
            lambda state: "failed" if state.get("error") else "ready",
            {"failed": END, "ready": "review_tutor_response"},
        )
        g.add_edge("review_tutor_response", "evaluate_response")
        g.add_edge("evaluate_response",       "persist_updates")
        g.add_edge("persist_updates",         END)

        return g.compile()

    async def invoke(
        self,
        user_id: str,
        user_input: str,
        chat_id: int | None = None,
        chat_history: list[dict] | None = None,
        use_hs_context: bool = True,
        ml_addendum: str = "",
        context_doc_ids: list = None,
        context_only: bool = False,
        tutor_mode: bool = False,
        tutor_reply_style: str = "guided",
        tutor_choice: str | None = None,
        tutor_session_state: dict | None = None,
    ) -> dict:
        selected_doc_ids = context_doc_ids or []
        initial_state: TutorState = {
            "user_id": user_id,
            "user_input": user_input,
            "chat_id": chat_id,
            "chat_history": chat_history or [],
            "use_hs_context": use_hs_context,
            "context_doc_ids": selected_doc_ids,
            "context_only": bool(context_only or selected_doc_ids),
            "tutor_mode": bool(tutor_mode),
            "tutor_reply_style": tutor_reply_style or "guided",
            "tutor_choice": tutor_choice,
            "tutor_session_state": tutor_session_state,
            "intelligence_context": ml_addendum or None,
            "_ai_client": self.ai_client,
            "_hs_ai_client": self.hs_ai_client,
            "_db_factory": self.db_factory,
        }
        try:
            result = await self._graph.ainvoke(initial_state)
            require_ai_success(result, answer_key="response")
            return {
                "response": result.get("response", ""),
                "intent": result.get("intent", ""),
                "tutor_plan": result.get("tutor_plan"),
                "attempt_evaluation": result.get("attempt_evaluation"),
                "tutor_level": result.get("tutor_level"),
                "evaluation": result.get("evaluation"),
                "chroma_writes": result.get("chroma_writes", []),
                "rag_sources": result.get("rag_sources", []),
            }
        except Exception as e:
            logger.error(f"Tutor graph failed: {e}")
            raise AIWorkflowError("Tutor generation failed") from e

_tutor: Optional[TutorGraph] = None

def create_tutor(ai_client: Any, db_session_factory: Any = None, hs_ai_client: Any = None) -> TutorGraph:
    global _tutor
    _tutor = TutorGraph(ai_client, db_session_factory, hs_ai_client=hs_ai_client)
    return _tutor

def get_tutor() -> Optional[TutorGraph]:
    return _tutor
