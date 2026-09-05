"""Failure contract shared by tutor graphs, HTTP handlers and workers."""
from __future__ import annotations


class AIWorkflowError(RuntimeError):
    pass


def require_ai_success(result: dict, *, answer_key: str | None = None) -> dict:
    if not isinstance(result, dict):
        raise AIWorkflowError("AI returned an invalid result")
    if (
        result.get("error")
        or result.get("attachment_error")
        or result.get("success") is False
        or result.get("query_type") in {"error", "multimodal_error", "provider_quota_fallback"}
        or result.get("status") in {"error", "failed"}
    ):
        raise AIWorkflowError(str(result.get("error") or result.get("attachment_error") or "AI generation failed"))
    if answer_key and not str(result.get(answer_key) or "").strip():
        raise AIWorkflowError("AI returned an empty answer")
    return result
