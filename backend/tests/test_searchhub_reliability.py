from types import SimpleNamespace

import pytest

from routes import searchhub
from routes.analytics import _solo_quiz_display_title
from study_session_analyzer import _percentage_score_to_correct


@pytest.fixture(autouse=True)
def disable_searchhub_graph(monkeypatch):
    import graphs.searchhub_graph

    monkeypatch.setattr(graphs.searchhub_graph, "get_searchhub_graph", lambda: None)
    monkeypatch.setattr(searchhub, "_resolve_user", lambda db, user_id: SimpleNamespace(id=1))


@pytest.mark.asyncio
async def test_incomplete_creation_command_requests_topic_instead_of_creating_content():
    response = await searchhub.searchhub_agent(
        searchhub.SearchHubRequest(user_id="student", query="/notes", use_hs_context=False),
        db=object(),
    )

    assert response["metadata"]["action"] == "need_topic"
    assert response["metadata"]["topic"] == ""
    assert "topic" in response["ai_response"].lower()


@pytest.mark.asyncio
async def test_quiz_command_honors_count_and_single_requested_difficulty(monkeypatch):
    captured = {}

    async def fake_generate_practice_questions(payload, db):
        captured.update(payload)
        return {"question_set_id": 42, "title": payload["title"]}

    from routes import questions
    monkeypatch.setattr(questions, "generate_practice_questions", fake_generate_practice_questions)

    response = await searchhub.searchhub_agent(
        searchhub.SearchHubRequest(
            user_id="student",
            query="/quiz Newton laws 4 easy",
            use_hs_context=False,
        ),
        db=object(),
    )

    assert captured["question_count"] == 4
    assert captured["difficulty"] == "easy"
    assert captured["difficulty_mix"] == {"easy": 4, "medium": 0, "hard": 0}
    assert response["navigate_to"] == "/question-bank?set_id=42"


def test_study_insights_uses_solo_quiz_subject_when_title_column_does_not_exist():
    assert _solo_quiz_display_title(SimpleNamespace(subject="Newton's laws")) == "Newton's laws"


def test_solo_quiz_percentage_is_not_counted_as_raw_correct_answers():
    assert _percentage_score_to_correct(75, 4) == 3
    assert _percentage_score_to_correct(150, 4) == 4
    assert _percentage_score_to_correct(-20, 4) == 0


@pytest.mark.asyncio
async def test_regular_search_passes_authenticated_user_to_search_contract(monkeypatch):
    captured = {}

    async def fake_search_content(**kwargs):
        captured.update(kwargs)
        return {
            "results": [{"id": 1, "type": "note", "title": "Photosynthesis"}],
            "related_searches": [],
        }

    from routes import search
    monkeypatch.setattr(search, "search_content", fake_search_content)
    monkeypatch.setattr(searchhub, "_get_chroma_suggestions", lambda *args, **kwargs: [])

    response = await searchhub.searchhub_agent(
        searchhub.SearchHubRequest(
            user_id="student",
            query="photosynthesis",
            use_hs_context=False,
        ),
        db=object(),
    )

    assert captured["current_user"].id == 1
    assert "user_id" not in captured
    assert response["search_results"][0]["title"] == "Photosynthesis"
