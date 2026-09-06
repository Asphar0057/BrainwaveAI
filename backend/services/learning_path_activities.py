"""Deterministic activities grounded in the stored learning node."""

def _lesson_facts(node) -> list[dict]:
    """Use stored lesson content, never invented answer placeholders."""
    facts = []
    for section in node.core_sections or []:
        if not isinstance(section, dict):
            continue
        content = str(section.get("content") or "").strip()
        title = str(section.get("title") or node.title).strip()
        if content:
            facts.append({"title": title, "content": content, "example": section.get("example") or ""})
    if not facts:
        summary = node.summary if isinstance(node.summary, list) else [node.summary]
        for index, item in enumerate(summary):
            if isinstance(item, str) and item.strip():
                facts.append({"title": f"{node.title}: takeaway {index + 1}", "content": item.strip(), "example": ""})
    return facts


def _build_flashcards(node, topic: str, count: int, difficulty: str) -> list[dict]:
    return [
        {"question": f"Explain {fact['title']} in the context of {topic}.",
         "answer": fact["content"] + (f"\n\nExample: {fact['example']}" if fact["example"] else ""),
         "difficulty": difficulty}
        for fact in _lesson_facts(node)[:max(1, min(count, 30))]
    ]


def _build_completion_quiz(node, topic: str, count: int, difficulty: str) -> list[dict]:
    facts = _lesson_facts(node)
    questions = []
    # Match explanations to the actual concepts in this lesson. Distractors are
    # other lesson concepts, not universally wrong boilerplate answers.
    titles = list(dict.fromkeys(fact["title"] for fact in facts))
    if len(titles) < 2:
        return []
    for index, fact in enumerate(facts[:max(1, min(count, 10))]):
        options = [title for title in titles if title != fact["title"]][:3]
        correct_index = index % (len(options) + 1)
        options.insert(correct_index, fact["title"])
        questions.append({
            "question": f"Which lesson concept does this explanation describe?\n\n{fact['content']}",
            "options": options,
            "correct_answer": correct_index,
            "difficulty": difficulty,
            "explanation": f"{fact['title']}: {fact['content']}",
        })
    return questions


def _build_question_bank_quiz(node, topic: str, count: int, difficulty: str) -> list[dict]:
    return [{
        "id": f"lp-q-{node.id}-{index}",
        "question_text": question["question"],
        "question_type": "multiple_choice",
        "options": question["options"],
        "correct_answer": question["options"][question["correct_answer"]],
        "difficulty": difficulty,
        "topic": topic,
        "explanation": question["explanation"],
    } for index, question in enumerate(_build_completion_quiz(node, topic, count, difficulty))]


def _build_chat_prompt(node, topic: str) -> str:
    facts = _lesson_facts(node)
    context = "\n\n".join(f"### {fact['title']}\n{fact['content']}" for fact in facts)
    return (f"## {node.title}\nLearning path: {topic}\n\n{context}\n\n"
            "Apply one of these ideas to a concrete example. Explain your inputs, decisions, "
            "expected outcome, and how you would check the result. Which lesson evidence supports your approach?")

