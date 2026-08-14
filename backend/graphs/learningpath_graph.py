from __future__ import annotations

import json
import logging
import re
from typing import Any, Optional, TypedDict

from activity_context import clear_activity_context, set_activity_context

try:
    from langgraph.graph import StateGraph, END
except Exception:
    StateGraph = None
    END = None

logger = logging.getLogger(__name__)

class LearningPathState(TypedDict, total=False):
    user_id: str
    topic: str
    difficulty: str
    length: str
    goals: list[str]
    title: str
    description: str
    estimated_hours: float
    nodes: list[dict]
    _ai_client: Any

_LENGTH_TO_COUNT = {
    "short": 6,
    "medium": 8,
    "long": 10,
}

_LENGTH_PROFILES = {
    "short": {
        "count": 6,
        "minutes": 25,
        "description": "compressed path with only the essential sequence",
        "scope": "cover the minimum viable foundations, one guided practice loop, and one closing project",
        "flashcards": 4,
        "quiz": 4,
    },
    "medium": {
        "count": 8,
        "minutes": 40,
        "description": "balanced path with foundations, practice, application, and review",
        "scope": "cover foundations, common techniques, realistic practice, pitfalls, and a capstone",
        "flashcards": 6,
        "quiz": 5,
    },
    "long": {
        "count": 10,
        "minutes": 55,
        "description": "deep path with extra practice, tradeoffs, projects, and evaluation",
        "scope": "cover foundations, multiple techniques, failure modes, advanced applications, optimization, and portfolio work",
        "flashcards": 9,
        "quiz": 7,
    },
}

_DIFFICULTY_PROFILES = {
    "beginner": {
        "description": "assume no prior experience; define vocabulary before using it",
        "objective_style": "recognize, explain in plain language, and complete guided practice",
        "practice_style": "guided examples, small exercises, and confidence checks",
        "bloom": "understand",
        "cognitive_load": "low",
        "minutes_delta": -5,
        "xp_base": 35,
        "quiz_delta": -1,
        "flashcard_delta": 1,
    },
    "intermediate": {
        "description": "assume basic familiarity; focus on applying concepts to realistic tasks",
        "objective_style": "apply, compare, debug, and explain tradeoffs",
        "practice_style": "scenario practice, implementation choices, and short projects",
        "bloom": "apply",
        "cognitive_load": "medium",
        "minutes_delta": 0,
        "xp_base": 50,
        "quiz_delta": 0,
        "flashcard_delta": 0,
    },
    "advanced": {
        "description": "assume strong fundamentals; emphasize edge cases, architecture, and evaluation",
        "objective_style": "analyze, optimize, critique, and design under constraints",
        "practice_style": "open-ended projects, failure analysis, benchmarks, and production tradeoffs",
        "bloom": "analyze",
        "cognitive_load": "high",
        "minutes_delta": 10,
        "xp_base": 70,
        "quiz_delta": 2,
        "flashcard_delta": -1,
    },
}

def _clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())

def _normalize_choice(value: str | None, allowed: dict[str, Any], fallback: str) -> str:
    cleaned = _clean_text(str(value or "")).lower()
    return cleaned if cleaned in allowed else fallback

def _target_node_count(length: str) -> int:
    return _LENGTH_PROFILES[_normalize_choice(length, _LENGTH_PROFILES, "medium")]["count"]

def _target_minutes(length: str, difficulty: str) -> int:
    length_profile = _LENGTH_PROFILES[_normalize_choice(length, _LENGTH_PROFILES, "medium")]
    difficulty_profile = _DIFFICULTY_PROFILES[_normalize_choice(difficulty, _DIFFICULTY_PROFILES, "intermediate")]
    return max(15, length_profile["minutes"] + difficulty_profile["minutes_delta"])

def _difficulty_profile(difficulty: str) -> dict[str, Any]:
    return _DIFFICULTY_PROFILES[_normalize_choice(difficulty, _DIFFICULTY_PROFILES, "intermediate")]

def _length_profile(length: str) -> dict[str, Any]:
    return _LENGTH_PROFILES[_normalize_choice(length, _LENGTH_PROFILES, "medium")]

def _normalize_topic_prompt(topic: str) -> str:
    cleaned = _clean_text(topic)
    if not cleaned:
        return "Learning Path"

    patterns = [
        r"^(?:i\s+want\s+to|i\s+need\s+to|i'?d\s+like\s+to|please|can\s+you|help\s+me)\s+learn\s+(?:about\s+)?(.+)$",
        r"^(?:learn|study|master|understand|teach\s+me)\s+(?:about\s+)?(.+)$",
        r"^(?:build\s+a\s+path\s+for|create\s+a\s+path\s+for|make\s+a\s+path\s+for)\s+(.+)$",
    ]
    for pattern in patterns:
        match = re.match(pattern, cleaned, flags=re.IGNORECASE)
        if match:
            cleaned = _clean_text(match.group(1))
            break

    cleaned = re.sub(r"\b(from scratch|beginner to advanced|step by step)$", "", cleaned, flags=re.IGNORECASE).strip()
    if cleaned and cleaned == cleaned.lower():
        cleaned = cleaned.title()
    return cleaned or "Learning Path"

def _normalize_node_title(title: str, topic: str) -> str:
    cleaned = _clean_text(title)
    normalized_topic = _normalize_topic_prompt(topic)
    if not cleaned:
        return normalized_topic

    raw_topic_pattern = re.escape(_clean_text(topic))
    if raw_topic_pattern:
        cleaned = re.sub(
            rf"\blearn\s+{raw_topic_pattern}\b",
            normalized_topic,
            cleaned,
            flags=re.IGNORECASE,
        )
    cleaned = re.sub(
        rf"\blearn\s+{re.escape(normalized_topic)}\b",
        normalized_topic,
        cleaned,
        flags=re.IGNORECASE,
    )
    if cleaned == cleaned.lower():
        cleaned = cleaned.title()
    return cleaned

def _safe_list(value) -> list:
    if not value:
        return []
    if isinstance(value, list):
        return [v for v in value if v]
    return [value]

def _topic_keywords(topic: str) -> list[str]:
    words = re.findall(r"[a-zA-Z0-9]+", topic.lower())
    stop = {"and", "or", "the", "of", "to", "in", "for", "with", "on", "a"}
    keywords = [w for w in words if w not in stop and len(w) > 2]
    seen = set()
    ordered = []
    for w in keywords:
        if w not in seen:
            seen.add(w)
            ordered.append(w)
    return ordered[:8]

def _join_focus_items(items: list[str], fallback: str, limit: int = 3) -> str:
    cleaned = [
        _clean_text(str(item)).rstrip(" .;:,")
        for item in items
        if _clean_text(str(item))
    ]
    if not cleaned:
        return fallback
    return "; ".join(cleaned[:limit])

def _subject_profile(topic: str, node_title: str) -> dict[str, Any]:
    subject = f"{topic} {node_title}".lower()
    if "cloud" in subject and "comput" in subject:
        return {
            "definition": (
                "Cloud computing means renting compute, storage, networking, and managed platform services from a provider "
                "instead of buying and operating every server yourself."
            ),
            "components": [
                "compute through virtual machines, containers, and serverless functions",
                "storage through object stores, block volumes, databases, and backup systems",
                "networking through VPCs, subnets, load balancers, DNS, gateways, and firewalls",
                "identity and access management for who can create, read, change, or delete resources",
                "regions and availability zones that shape latency, resilience, and disaster recovery",
                "monitoring, logging, autoscaling, and billing controls that keep systems reliable and affordable",
            ],
            "key_terms": ["compute", "storage", "networking", "IAM", "regions", "autoscaling", "cost control", "shared responsibility"],
            "practice_goal": "choosing the right services, responsibilities, security boundaries, and reliability tradeoffs",
            "mechanism": (
                "Providers pool physical data-center hardware, expose it through APIs and consoles, and let teams assemble "
                "services on demand. The important foundation is knowing which layer you manage, which layer the provider "
                "manages, and how those choices affect security, cost, scale, and reliability."
            ),
            "pitfalls": [
                "treating cloud resources as infinite instead of capacity with limits, quotas, latency, and cost",
                "ignoring IAM, network boundaries, encryption, and the shared-responsibility model",
                "designing for one region or one instance and discovering reliability problems only after failure",
                "forgetting egress, idle resources, over-provisioning, logs, and storage lifecycle costs",
            ],
            "example": (
                "For a web app, the cloud foundation is deciding where the API runs, where files and database records live, "
                "how traffic reaches the app, how credentials are scoped, how the app scales during load, and how failures are detected."
            ),
        }
    if any(term in subject for term in ("neural network", "deep learning", "machine learning")):
        return {
            "definition": (
                "Neural networks are layered function approximators that learn patterns by adjusting weights and biases from data."
            ),
            "components": [
                "input features that represent the data",
                "neurons, weights, biases, and activation functions that transform signals",
                "layers that build increasingly useful representations",
                "loss functions that measure prediction error",
                "backpropagation and gradient descent that update parameters",
                "training, validation, and test splits that reveal whether the model generalizes",
            ],
            "key_terms": ["weights", "biases", "activations", "loss", "gradients", "backpropagation", "overfitting", "generalization"],
            "practice_goal": "explaining how a model learns, why it fails, and how to evaluate whether it generalizes",
            "mechanism": (
                "A network makes a prediction, compares it with the target through a loss function, then pushes error signals "
                "backward so each weight changes in the direction that reduces future error."
            ),
            "pitfalls": [
                "memorizing training examples instead of learning general patterns",
                "using the wrong loss, activation, or data preprocessing for the task",
                "trusting accuracy without checking validation behavior, class imbalance, or failure cases",
                "making models larger before fixing data quality, leakage, or baseline comparisons",
            ],
            "example": (
                "For image classification, pixels become input features, hidden layers detect patterns, the output layer estimates "
                "classes, and training adjusts weights until the loss falls on examples the model has not memorized."
            ),
        }
    if "system design" in subject or "backend" in subject:
        return {
            "definition": (
                "Backend system design is the practice of structuring services, data stores, APIs, queues, caches, and infrastructure "
                "so an application stays correct, reliable, secure, and maintainable under real traffic."
            ),
            "components": [
                "API contracts and service boundaries",
                "databases, indexes, transactions, and consistency choices",
                "caches, queues, background workers, and event streams",
                "authentication, authorization, rate limits, and abuse controls",
                "observability through logs, metrics, traces, and alerts",
                "deployment, scaling, rollback, and failure recovery plans",
            ],
            "key_terms": ["APIs", "databases", "caches", "queues", "workers", "observability", "idempotency", "scaling"],
            "practice_goal": "turning requirements into service boundaries, data flows, bottleneck choices, and failure handling",
            "mechanism": (
                "A backend receives requests, validates them, coordinates business logic and data access, performs slow work "
                "asynchronously where needed, and exposes clear signals when something is slow or broken."
            ),
            "pitfalls": [
                "scaling the API before understanding database and queue bottlenecks",
                "mixing unrelated responsibilities into one service boundary",
                "ignoring idempotency, retries, timeouts, and partial failure",
                "shipping without enough observability to debug production behavior",
            ],
            "example": (
                "For a high-traffic AI app, a backend might accept a request quickly, enqueue model work, cache repeated results, "
                "stream progress to the client, and retry failed jobs without duplicating user-visible state."
            ),
        }
    return {
        "definition": (
            f"{topic} is a subject with concepts, methods, constraints, and applications that need to be understood as a working system, "
            "not as isolated vocabulary."
        ),
        "components": [
            f"the core definitions that make {topic} precise",
            "the mechanisms that explain how the subject works",
            "the constraints and tradeoffs that decide when one approach is better than another",
            "the examples and practice tasks that reveal whether understanding is usable",
        ],
        "key_terms": _topic_keywords(f"{topic} {node_title}"),
        "practice_goal": f"making practical decisions in {topic} with clear assumptions, tradeoffs, and evidence",
        "mechanism": (
            f"A strong foundation in {topic} connects terms to cause and effect: what changes, why it changes, how to measure it, "
            "and what can go wrong when assumptions are false."
        ),
        "pitfalls": [
            "memorizing labels without understanding the mechanism",
            "using examples that are too vague to test understanding",
            "skipping assumptions, constraints, and failure cases",
            "moving to advanced material before the foundation can explain real decisions",
        ],
        "example": f"For {topic}, explain a concrete case by naming the inputs, the process, the output, and the failure checks.",
    }

def _practical_goal(objectives: list[str], profile: dict[str, Any]) -> str:
    generic_markers = (
        "explain the core ideas",
        "apply ",
        "identify risks",
        "quality checks",
        "focused practice task",
    )
    cleaned = [
        _clean_text(str(item)).rstrip(" .;:,")
        for item in objectives
        if _clean_text(str(item))
    ]
    useful = [
        item for item in cleaned
        if not any(marker in item.lower() for marker in generic_markers)
    ]
    return _join_focus_items(useful, profile.get("practice_goal") or "making practical decisions with evidence", limit=2)

def _format_focus_list(items: list[str], limit: int = 4) -> str:
    cleaned = [_clean_text(str(item)).rstrip(" .;:,") for item in items if _clean_text(str(item))]
    if not cleaned:
        return ""
    visible = cleaned[:limit]
    if len(visible) == 1:
        return visible[0]
    return ", ".join(visible[:-1]) + f", and {visible[-1]}"

def _default_node_titles(topic: str, count: int, difficulty: str) -> list[str]:
    difficulty = _normalize_choice(difficulty, _DIFFICULTY_PROFILES, "intermediate")
    beginner = [
        f"Orientation to {topic}",
        f"Essential Vocabulary in {topic}",
        f"Fundamentals of {topic}",
        f"Guided Practice with {topic}",
        f"Common Mistakes in {topic}",
        f"First Complete {topic} Project",
        f"Review and Confidence Checks for {topic}",
        f"Next Steps After {topic} Foundations",
        f"Simple Real-World Uses of {topic}",
        f"Beginner Portfolio Exercise in {topic}",
    ]
    intermediate = [
        f"Foundations of {topic}",
        f"Core Concepts in {topic}",
        f"Essential Techniques for {topic}",
        f"Working with {topic} in Practice",
        f"Patterns and Pitfalls in {topic}",
        f"Applied Projects in {topic}",
        f"Advanced {topic} Strategies",
        f"Capstone and Next Steps in {topic}",
        f"Optimization and Scaling for {topic}",
        f"Real-World Systems with {topic}",
    ]
    advanced = [
        f"Advanced Foundations of {topic}",
        f"Architecture and Tradeoffs in {topic}",
        f"Deep Techniques for {topic}",
        f"Failure Modes and Edge Cases in {topic}",
        f"Performance and Scaling in {topic}",
        f"Security, Reliability, and Quality in {topic}",
        f"Production-Grade {topic} Workflows",
        f"Evaluation and Benchmarking in {topic}",
        f"Expert Project in {topic}",
        f"Portfolio-Ready {topic} System Design",
    ]
    title_sets = {
        "beginner": beginner,
        "intermediate": intermediate,
        "advanced": advanced,
    }
    return title_sets[difficulty][:count]

def _node_phase(node_title: str) -> str:
    title = _clean_text(node_title).lower()
    if any(term in title for term in ("orientation", "vocabulary", "foundation", "fundamental")):
        return "foundation"
    if any(term in title for term in ("core concept", "architecture", "deep technique")):
        return "model"
    if any(term in title for term in ("technique", "workflow", "working with", "guided practice")):
        return "workflow"
    if any(term in title for term in ("pitfall", "mistake", "failure mode", "edge case")):
        return "diagnostic"
    if any(term in title for term in ("project", "application", "real-world", "system")):
        return "build"
    if any(term in title for term in ("advanced", "optimization", "scaling", "evaluation", "benchmark")):
        return "optimize"
    if any(term in title for term in ("capstone", "portfolio", "next step", "review")):
        return "synthesis"
    return "practice"


def _default_content_plan(node_title: str, difficulty: str, length: str) -> list[dict]:
    length_profile = _length_profile(length)
    difficulty_profile = _difficulty_profile(difficulty)
    flashcard_count = max(3, length_profile["flashcards"] + difficulty_profile["flashcard_delta"])
    quiz_count = max(3, length_profile["quiz"] + difficulty_profile["quiz_delta"])
    phase = _node_phase(node_title)
    activity_copy = {
        "foundation": ("Create a concise concept map that defines each term and shows how the ideas connect.", "Recall the essential vocabulary and explain each term in your own words.", "Test whether you can distinguish the core definitions in realistic examples.", "Ask for a plain-language explanation of any concept that still feels abstract."),
        "model": ("Build a mechanism note: inputs, components, flow, outputs, and the assumptions that connect them.", "Practice the relationships between the model's components and their roles.", "Reason through a scenario by tracing cause and effect through the model.", "Challenge the model with a counterexample or an alternative design."),
        "workflow": ("Write a step-by-step operating checklist, including the decision points and validation signals.", "Review the sequence, tools, and checks required at each stage.", "Choose the next action for a realistic workflow and justify it.", "Walk through a workflow problem and identify where it can fail."),
        "diagnostic": ("Document failure modes, their early warning signals, and the recovery action for each.", "Memorize the mistake-to-symptom-to-fix relationships.", "Diagnose a flawed example and select the strongest corrective action.", "Review a failure case and ask for help tracing it back to its root cause."),
        "build": ("Draft an applied solution with requirements, constraints, implementation steps, and success criteria.", "Practice the components and tradeoffs needed to build the solution.", "Make design choices for a project scenario and defend them with evidence.", "Get feedback on your proposed implementation plan before building."),
        "optimize": ("Create an evaluation brief with a baseline, constraints, metrics, and improvement hypotheses.", "Review the tradeoffs, metrics, and failure modes that shape optimization.", "Compare competing approaches under production-like constraints.", "Critique an optimization decision and test its assumptions."),
        "synthesis": ("Produce a one-page synthesis linking the major decisions, evidence, and outcomes from this path.", "Recall the concepts that should guide an independent solution.", "Solve an end-to-end scenario that combines prior concepts and tradeoffs.", "Use the tutor as a reviewer for your final reasoning and next-step plan."),
        "practice": (f"Write a focused study note for {node_title} that states the decision, evidence, and tradeoffs.", "Review the key concepts and the relationships between them.", f"Apply {node_title} through {difficulty_profile['practice_style']}.", "Ask focused follow-up questions about the hardest assumption."),
    }[phase]

    return [
        {
            "type": "notes",
            "description": activity_copy[0],
        },
        {
            "type": "flashcards",
            "description": activity_copy[1],
            "count": flashcard_count,
        },
        {
            "type": "quiz",
            "description": activity_copy[2],
            "question_count": quiz_count,
        },
        {
            "type": "chat",
            "description": activity_copy[3],
        },
    ]

def _normalize_content_plan(plan: Any, node_title: str, difficulty: str, length: str) -> list[dict]:
    defaults = _default_content_plan(node_title, difficulty, length)
    if not isinstance(plan, list):
        return defaults

    by_type = {
        _clean_text(str(item.get("type", ""))).lower(): dict(item)
        for item in plan
        if isinstance(item, dict) and _clean_text(str(item.get("type", "")))
    }
    normalized = []
    for default in defaults:
        item_type = default["type"]
        incoming = by_type.get(item_type, {})
        description = _clean_text(str(incoming.get("description", "")))
        generic_description = any(marker in description.lower() for marker in (
            "build structured notes",
            "lock in vocabulary and key facts",
            "check understanding through",
            "ask follow-up questions and resolve",
        ))
        merged = {**default, **({} if generic_description else incoming)}
        if item_type == "flashcards":
            merged["count"] = default["count"]
        if item_type == "quiz":
            merged["question_count"] = default["question_count"]
        normalized.append(merged)
    return normalized

def _normalize_estimated_minutes(value: Any, difficulty: str, length: str) -> int:
    target = _target_minutes(length, difficulty)
    lower = max(15, target - 10)
    upper = min(90, target + 15)
    try:
        minutes = int(value)
    except (TypeError, ValueError):
        return target
    if minutes < lower or minutes > upper:
        return target
    return minutes

def _topic_specific_core_sections(
    node_title: str,
    topic: str,
    objectives: list[str] | None = None,
    prerequisites: list[str] | None = None,
    keywords: list[str] | None = None,
    applications: list[str] | None = None,
    difficulty: str = "intermediate",
) -> list[dict]:
    objectives = _safe_list(objectives)
    prerequisites = _safe_list(prerequisites)
    keywords = _safe_list(keywords) or _topic_keywords(f"{topic} {node_title}")
    applications = _safe_list(applications)
    difficulty_profile = _difficulty_profile(difficulty)

    profile = _subject_profile(topic, node_title)
    component_focus = _format_focus_list(profile["components"], limit=4)
    pitfalls_focus = _format_focus_list(profile["pitfalls"], limit=3)
    objective_focus = _practical_goal(objectives, profile)
    prerequisite_focus = _join_focus_items(prerequisites, "the earlier concepts in this path", limit=2)
    keyword_focus = _format_focus_list(profile.get("key_terms") or keywords, limit=6) or topic
    application_focus = _join_focus_items(applications, profile["example"], limit=1)

    return [
        {
            "title": f"Why {node_title} matters",
            "content": (
                f"{profile['definition']} {node_title} matters because it gives you the base model for the rest of the path: "
                f"how the subject works, which responsibilities or mechanisms matter, and how to reason from {prerequisite_focus} "
                f"toward {objective_focus}. At the {difficulty} level, this node should {difficulty_profile['objective_style']}."
            ),
            "example": (
                f"{profile['example']} Use that example to point out the decision {node_title.lower()} helps you make, "
                f"the evidence you would check, and the tradeoff you would explain through {difficulty_profile['practice_style']}."
            ),
        },
        {
            "title": f"Key ideas in {node_title}",
            "content": (
                f"The main ideas to learn are {component_focus}. {profile['mechanism']} In this node, connect those ideas to "
                f"{keyword_focus} so the terms explain real behavior instead of staying as definitions. Keep the pacing aligned to "
                f"{difficulty_profile['description']}."
            ),
            "example": (
                f"Turn {application_focus} into a checklist: inputs, resources or components involved, assumptions, tradeoffs, "
                "failure modes, and validation steps."
            ),
        },
        {
            "title": f"Common pitfalls in {node_title}",
            "content": (
                f"The common mistakes are {pitfalls_focus}. These mistakes happen when {node_title.lower()} is treated as a "
                f"set of labels instead of an explanation of how {topic} behaves in practice. The expected depth here is "
                f"{difficulty_profile['cognitive_load']} cognitive load, so examples and checks should match that level."
            ),
            "example": (
                f"Before moving on, take {application_focus} and describe one wrong design, prediction, or explanation. Then name "
                "the metric, log, test, diagram, or example that would prove it wrong."
            ),
        },
    ]

def _default_core_sections(node_title: str, topic: str, difficulty: str = "intermediate") -> list[dict]:
    return _topic_specific_core_sections(node_title, topic, difficulty=difficulty)

def _section_text(section: Any) -> str:
    if not isinstance(section, dict):
        return ""
    return " ".join(_clean_text(str(section.get(key, ""))).lower() for key in ("title", "content", "example"))

def _core_sections_are_generic(sections: Any, node_title: str, topic: str) -> bool:
    if not isinstance(sections, list) or not sections:
        return True
    text = " ".join(_section_text(section) for section in sections)
    generic_markers = [
        "why this matters",
        "key ideas",
        "common pitfalls",
        "anchors your understanding",
        "sets the mental model used in later chapters",
        "break ",
        "usual mistakes early",
        "quick checklist you can apply",
        "where assumptions fail",
        "the bridge between",
        "work you need next",
        "treat this section as the mental model",
        "one observable signal",
        "common mistake is treating",
        "as vocabulary instead of a working tool",
    ]
    marker_hits = sum(1 for marker in generic_markers if marker in text)
    duplicated_example = "example: example:" in text
    node_specific_terms = set(_topic_keywords(f"{node_title} {topic}"))
    specific_hits = sum(1 for term in node_specific_terms if term in text)
    return duplicated_example or marker_hits >= 2 or (marker_hits >= 1 and specific_hits < min(2, len(node_specific_terms)))

def _normalize_core_sections(
    sections: Any,
    *,
    node_title: str,
    topic: str,
    objectives: list[str] | None = None,
    prerequisites: list[str] | None = None,
    keywords: list[str] | None = None,
    applications: list[str] | None = None,
    difficulty: str = "intermediate",
) -> list[dict]:
    if _core_sections_are_generic(sections, node_title, topic):
        return _topic_specific_core_sections(node_title, topic, objectives, prerequisites, keywords, applications, difficulty=difficulty)

    normalized = []
    for section in sections:
        if not isinstance(section, dict):
            continue
        title = _clean_text(str(section.get("title", ""))) or f"{node_title} focus"
        content = _clean_text(str(section.get("content", "")))
        example = _clean_text(str(section.get("example", "")))
        if example.lower().startswith("example:"):
            example = _clean_text(example.split(":", 1)[1])
        normalized.append({
            **section,
            "title": title,
            "content": content,
            "example": example,
        })
    return normalized or _topic_specific_core_sections(node_title, topic, objectives, prerequisites, keywords, applications, difficulty=difficulty)

def _default_summary(node_title: str) -> list[str]:
    phase = _node_phase(node_title)
    focus = {
        "foundation": "definitions, distinctions, and the language needed for later work",
        "model": "components, mechanisms, and the causal relationships between them",
        "workflow": "sequence, decision points, validation signals, and handoffs",
        "diagnostic": "failure modes, observable symptoms, root causes, and recovery actions",
        "build": "requirements, constraints, implementation choices, and success criteria",
        "optimize": "baselines, metrics, tradeoffs, and evidence for improvement",
        "synthesis": "how prior concepts combine into one defensible end-to-end solution",
        "practice": "the decisions, evidence, and tradeoffs needed to apply the concept",
    }[phase]
    return [
        f"Use {node_title} to reason about {focus}.",
        f"Apply {node_title} to a concrete scenario instead of recalling it as isolated vocabulary.",
        f"Explain the evidence that would show whether your {node_title} decision is working.",
    ]

def _default_applications(topic: str) -> list[str]:
    return [
        f"Improve real-world projects that involve {topic}.",
        f"Communicate {topic} concepts clearly to teammates.",
        f"Evaluate tradeoffs when applying {topic} in production.",
    ]

def _default_scenarios(topic: str, node_title: str) -> list[dict]:
    phase = _node_phase(node_title)
    scenario_copy = {
        "foundation": ("A teammate confuses two foundational terms.", "Clarify each definition and show the boundary between them."),
        "model": ("A result changes unexpectedly after one component is adjusted.", "Trace the mechanism from the changed component to the observed outcome."),
        "workflow": ("A team needs to choose the next step in a multi-stage task.", "Use the workflow's decision point and validation signal to choose the next action."),
        "diagnostic": ("A system shows a symptom that could have several causes.", "Use evidence to isolate the root cause before applying a fix."),
        "build": ("A stakeholder gives requirements with real constraints.", "Turn the requirements into an implementation plan with measurable success criteria."),
        "optimize": ("Two approaches improve different metrics but add different risks.", "Compare the tradeoffs against a baseline and choose the option supported by evidence."),
        "synthesis": ("You must defend an end-to-end solution to a reviewer.", "Connect the design choices, constraints, evidence, and expected outcomes."),
        "practice": ("You are asked to make a practical decision.", "Link the decision to constraints, reasoning, and expected outcomes."),
    }[phase]
    return [
        {
            "title": f"{node_title} quick check",
            "description": f"{scenario_copy[0]} The setting is {topic}.",
            "question": f"What is the strongest way to apply {node_title}?",
            "options": [
                "Make a choice without checking the situation",
                scenario_copy[1],
                "Skip the evidence and rely on a generic rule",
                "Focus on terminology without explaining the decision",
            ],
            "correct": 1,
            "explanation": f"{scenario_copy[1]} This is the transferable skill for {node_title}.",
        }
    ]

def _default_concept_map(topic: str) -> dict:
    concepts = [topic, "Foundations", "Applications", "Evaluation"]
    return {
        "concepts": concepts,
        "relationships": [
            {"from": "Foundations", "to": topic, "label": "supports"},
            {"from": topic, "to": "Applications", "label": "enables"},
            {"from": "Applications", "to": "Evaluation", "label": "validated by"},
        ],
    }

def _default_outline(topic: str, difficulty: str, length: str, goals: list[str] | None) -> dict:
    topic = _normalize_topic_prompt(topic)
    difficulty = _normalize_choice(difficulty, _DIFFICULTY_PROFILES, "intermediate")
    length = _normalize_choice(length, _LENGTH_PROFILES, "medium")
    goals = goals or []

    count = _target_node_count(length)
    titles = _default_node_titles(topic, count, difficulty)
    minutes = _target_minutes(length, difficulty)
    difficulty_profile = _difficulty_profile(difficulty)

    nodes = []
    for idx, title in enumerate(titles):
        objectives = [
            f"{difficulty_profile['objective_style'].capitalize()} in {title}.",
            f"Use {title} through {difficulty_profile['practice_style']}.",
            "Identify risks, pitfalls, quality checks, and evidence of mastery.",
        ]
        if goals:
            objectives.append(f"Connect {title} to your goal: {goals[0]}")

        prerequisites = []
        if idx > 0:
            prerequisites.append(titles[idx - 1])

        nodes.append(
            {
                "title": title,
                "description": f"Build {difficulty} mastery in {title} through {difficulty_profile['practice_style']}.",
                "objectives": objectives,
                "prerequisites": prerequisites,
                "estimated_minutes": minutes,
                "content_plan": _default_content_plan(title, difficulty, length),
                "introduction": f"This {length} chapter focuses on {title} at a {difficulty} pace: {difficulty_profile['description']}.",
                "core_sections": _topic_specific_core_sections(
                    title,
                    topic,
                    objectives=objectives,
                    prerequisites=prerequisites,
                    keywords=_topic_keywords(f"{topic} {title}"),
                    applications=_default_applications(topic),
                    difficulty=difficulty,
                ),
                "summary": _default_summary(title),
                "real_world_applications": _default_applications(topic),
                "tags": _topic_keywords(topic),
                "keywords": _topic_keywords(topic),
                "bloom_level": difficulty_profile["bloom"],
                "cognitive_load": difficulty_profile["cognitive_load"],
                "connection_map": {
                    "builds_on": prerequisites,
                    "leads_to": [titles[idx + 1]] if idx + 1 < len(titles) else [],
                    "related_topics": _topic_keywords(topic)[:3],
                },
                "scenarios": _default_scenarios(topic, title),
                "concept_mapping": _default_concept_map(topic),
                "reward": {"xp": difficulty_profile["xp_base"] + idx * 5},
            }
        )

    total_minutes = sum(n.get("estimated_minutes", 30) for n in nodes)
    return {
        "title": topic,
        "description": f"A structured, goal-driven path to master {topic} with checkpoints, practice, and applied projects.",
        "estimated_hours": round(total_minutes / 60, 1),
        "nodes": nodes,
    }

def _build_prompt(topic: str, difficulty: str, length: str, goals: list[str]) -> str:
    difficulty = _normalize_choice(difficulty, _DIFFICULTY_PROFILES, "intermediate")
    length = _normalize_choice(length, _LENGTH_PROFILES, "medium")
    difficulty_profile = _difficulty_profile(difficulty)
    length_profile = _length_profile(length)
    node_count = _target_node_count(length)
    minutes = _target_minutes(length, difficulty)
    goals_text = ", ".join(goals) if goals else "(none)"
    return (
        "You are designing a personalized learning path.\n"
        "Return ONLY valid JSON.\n"
        "Schema: {title, description, estimated_hours, nodes:[{title, description, objectives, prerequisites, estimated_minutes, "
        "introduction, core_sections, summary, real_world_applications, content_plan, tags, keywords, bloom_level, cognitive_load, reward}]}\n"
        "core_sections is a list of objects with {title, content, example}.\n"
        "Every core section must be specific to the node title and the requested topic. Do not use generic headings like "
        "\"Why this matters\", \"Key ideas\", or \"Common pitfalls\" unless the text names the exact techniques, concepts, "
        "failure modes, examples, and decisions for this topic.\n"
        "content_plan is a list of objects with {type, description, count?, question_count?}.\n"
        f"Topic: {topic}\nDifficulty: {difficulty}\nLength: {length}\nGoals: {goals_text}\n"
        f"Length requirements: create EXACTLY {node_count} nodes. This is a {length_profile['description']}; {length_profile['scope']}. "
        f"Each node should be about {minutes} minutes.\n"
        f"Difficulty requirements: {difficulty_profile['description']}. Objectives must {difficulty_profile['objective_style']}. "
        f"Practice should use {difficulty_profile['practice_style']}. Set bloom_level to {difficulty_profile['bloom']} and "
        f"cognitive_load to {difficulty_profile['cognitive_load']} unless a later node clearly requires a higher value."
    )

def _parse_json_payload(raw: str) -> Optional[dict]:
    if not raw:
        return None
    cleaned = raw.strip()
    if cleaned.startswith("```"):
        cleaned = cleaned.split("\n", 1)[-1].rsplit("```", 1)[0]
    start = cleaned.find("{")
    end = cleaned.rfind("}")
    if start == -1 or end == -1:
        return None
    try:
        return json.loads(cleaned[start : end + 1])
    except Exception:
        return None

def build_outline(state: LearningPathState) -> dict:
    topic = _normalize_topic_prompt(state.get("topic", ""))
    difficulty = _normalize_choice(state.get("difficulty", "intermediate"), _DIFFICULTY_PROFILES, "intermediate")
    length = _normalize_choice(state.get("length", "medium"), _LENGTH_PROFILES, "medium")
    goals = _safe_list(state.get("goals"))
    ai_client = state.get("_ai_client")

    if not ai_client:
        return _default_outline(topic, difficulty, length, goals)

    try:
        prompt = _build_prompt(topic, difficulty, length, goals)
        response = ai_client.generate(prompt, max_tokens=1800, temperature=0.4)
        parsed = _parse_json_payload(response)
        if parsed and parsed.get("nodes"):
            try:
                from services.math_processor import process_math_in_json
                parsed = process_math_in_json(parsed)
            except Exception:
                pass
            return parsed
    except Exception as e:
        logger.warning(f"Learning path AI outline failed: {e}")

    return _default_outline(topic, difficulty, length, goals)

def normalize_outline(state: LearningPathState) -> dict:
    topic = _normalize_topic_prompt(state.get("topic", ""))
    difficulty = _normalize_choice(state.get("difficulty", "intermediate"), _DIFFICULTY_PROFILES, "intermediate")
    length = _normalize_choice(state.get("length", "medium"), _LENGTH_PROFILES, "medium")
    goals = _safe_list(state.get("goals"))
    target_count = _target_node_count(length)
    difficulty_profile = _difficulty_profile(difficulty)

    outline = state.get("nodes")
    if outline is None or not isinstance(outline, list):
        outline_data = _default_outline(topic, difficulty, length, goals)
    else:
        outline_data = {
            "title": _normalize_topic_prompt(state.get("title", topic)) or topic,
            "description": _clean_text(state.get("description", "")),
            "estimated_hours": state.get("estimated_hours"),
            "nodes": outline,
        }

    if not outline_data.get("description"):
        outline_data["description"] = f"A structured learning plan to master {topic}."

    nodes = []
    raw_nodes = outline_data.get("nodes", [])
    if len(raw_nodes) > target_count:
        raw_nodes = raw_nodes[:target_count]

    for idx, node in enumerate(raw_nodes):
        if not isinstance(node, dict):
            continue
        title = _normalize_node_title(node.get("title", ""), topic) or f"Chapter {idx + 1}"
        description = _clean_text(node.get("description", ""))
        objectives = _safe_list(node.get("objectives"))
        prerequisites = _safe_list(node.get("prerequisites"))
        if not objectives:
            objectives = [
                f"{difficulty_profile['objective_style'].capitalize()} in {title}.",
                f"Practice {title} through {difficulty_profile['practice_style']}.",
            ]
        estimated_minutes = _normalize_estimated_minutes(
            node.get("estimated_minutes") or node.get("estimatedMinutes"),
            difficulty,
            length,
        )
        intro = _clean_text(node.get("introduction", "")) or f"Focus on {title} within {topic}."

        summary = _safe_list(node.get("summary")) or _default_summary(title)
        real_world = _safe_list(node.get("real_world_applications")) or _default_applications(topic)
        content_plan = _normalize_content_plan(node.get("content_plan"), title, difficulty, length)
        node_keywords = node.get("keywords") or _topic_keywords(f"{topic} {title}")
        core_sections = _normalize_core_sections(
            node.get("core_sections"),
            node_title=title,
            topic=topic,
            objectives=objectives,
            prerequisites=prerequisites,
            keywords=node_keywords,
            applications=real_world,
            difficulty=difficulty,
        )

        nodes.append(
            {
                "title": title,
                "description": description or f"Build mastery in {title}.",
                "objectives": objectives,
                "prerequisites": prerequisites,
                "estimated_minutes": estimated_minutes,
                "content_plan": content_plan,
                "introduction": intro,
                "core_sections": core_sections,
                "summary": summary,
                "real_world_applications": real_world,
                "tags": node.get("tags") or _topic_keywords(f"{topic} {title}"),
                "keywords": node_keywords,
                "bloom_level": node.get("bloom_level") or difficulty_profile["bloom"],
                "cognitive_load": node.get("cognitive_load") or difficulty_profile["cognitive_load"],
                "connection_map": node.get("connection_map") or {
                    "builds_on": prerequisites,
                    "leads_to": [],
                    "related_topics": _topic_keywords(topic)[:3],
                },
                "scenarios": node.get("scenarios") or _default_scenarios(topic, title),
                "concept_mapping": node.get("concept_mapping") or _default_concept_map(topic),
                "reward": {
                    **(node.get("reward") if isinstance(node.get("reward"), dict) else {}),
                    "xp": difficulty_profile["xp_base"] + idx * 5,
                },
                "primary_resources": node.get("primary_resources") or [],
                "supplementary_resources": node.get("supplementary_resources") or [],
                "practice_resources": node.get("practice_resources") or [],
            }
        )

    if len(nodes) < target_count:
        seen_titles = {_clean_text(node.get("title", "")).lower() for node in nodes}
        for fallback_node in _default_outline(topic, difficulty, length, goals)["nodes"]:
            fallback_title = _clean_text(fallback_node.get("title", "")).lower()
            if fallback_title in seen_titles:
                continue
            nodes.append(fallback_node)
            seen_titles.add(fallback_title)
            if len(nodes) >= target_count:
                break

    if not nodes:
        nodes = _default_outline(topic, difficulty, length, goals)["nodes"][:target_count]

    total_minutes = sum(n.get("estimated_minutes", 30) for n in nodes)
    estimated_hours = outline_data.get("estimated_hours") or round(total_minutes / 60, 1)

    return {
        "title": outline_data.get("title") or topic,
        "description": outline_data.get("description"),
        "estimated_hours": estimated_hours,
        "nodes": nodes,
    }

class LearningPathGraph:
    def __init__(self, ai_client: Any, db_session_factory: Any = None):
        self.ai_client = ai_client
        self.db_factory = db_session_factory
        self._graph = self._build() if StateGraph else None

    def _build(self):
        g = StateGraph(LearningPathState)
        g.add_node("outline", build_outline)
        g.add_node("normalize", normalize_outline)
        g.set_entry_point("outline")
        g.add_edge("outline", "normalize")
        g.add_edge("normalize", END)
        return g.compile()

    def invoke(
        self,
        user_id: str,
        topic: str,
        difficulty: str = "intermediate",
        length: str = "medium",
        goals: Optional[list[str]] = None,
    ) -> dict:
        state: LearningPathState = {
            "user_id": str(user_id),
            "topic": topic,
            "difficulty": difficulty,
            "length": length,
            "goals": goals or [],
            "_ai_client": self.ai_client,
        }
        activity_token = set_activity_context({
            "user_id": str(user_id),
            "tool_name": "learning_path_ai",
            "action": "generate",
            "endpoint": "/api/learning-paths/generate",
            "method": "POST",
        })
        try:
            if self._graph:
                result = self._graph.invoke(state)
            else:
                result = normalize_outline({**state, **build_outline(state)})
            return {
                "title": result.get("title", topic),
                "description": result.get("description", ""),
                "estimated_hours": result.get("estimated_hours", 0.0),
                "nodes": result.get("nodes", []),
            }
        except Exception as e:
            logger.warning(f"LearningPath graph failed: {e}")
            fallback = _default_outline(topic, difficulty, length, goals or [])
            return {
                "title": fallback.get("title", topic),
                "description": fallback.get("description", ""),
                "estimated_hours": fallback.get("estimated_hours", 0.0),
                "nodes": fallback.get("nodes", []),
            }
        finally:
            clear_activity_context(activity_token)

_learningpath_graph: Optional[LearningPathGraph] = None

def create_learningpath_graph(ai_client: Any, db_session_factory: Any = None) -> LearningPathGraph:
    global _learningpath_graph
    _learningpath_graph = LearningPathGraph(ai_client, db_session_factory)
    return _learningpath_graph

def get_learningpath_graph() -> Optional[LearningPathGraph]:
    return _learningpath_graph
