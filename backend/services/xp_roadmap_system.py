from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
import models
from typing import List, Dict, Any, Optional, Tuple
from copy import deepcopy
import os
import re
import time
from services.suggestion_engine import get_related_topic_recommendations

_ROADMAP_CACHE: Dict[int, Tuple[float, Dict[str, Any]]] = {}
_ROADMAP_CACHE_MAX = 500

def _topic_from_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    cleaned = re.sub(
        r"^(explain|teach me|help me learn|help me understand|create|make|generate|quiz me on|give me)\s+",
        "",
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r"^(notes?|flashcards?|questions?|quiz)\s+(on|about|for)?\s*", "", cleaned, flags=re.IGNORECASE)
    cleaned = cleaned.strip(" .?!:-")
    if not cleaned:
        return ""
    sentence = re.split(r"[.?!]", cleaned, maxsplit=1)[0].strip()
    words = sentence.split()
    return " ".join(words[:8])[:90].strip()

def _collect_quiz_topic_signals(db: Session, user_id: int) -> List[str]:
    topics: List[str] = []

    if hasattr(models, "QuizSession"):
        quiz_sessions = db.query(models.QuizSession).filter(
            models.QuizSession.user_id == user_id
        ).order_by(models.QuizSession.id.desc()).limit(50).all()
        for quiz in quiz_sessions:
            topic = getattr(quiz, "topic", None)
            if topic and str(topic).strip():
                topics.append(str(topic).strip())

    if hasattr(models, "SoloQuiz"):
        solo_quizzes = db.query(models.SoloQuiz).filter(
            models.SoloQuiz.user_id == user_id
        ).order_by(models.SoloQuiz.id.desc()).limit(50).all()
        for quiz in solo_quizzes:
            topic = getattr(quiz, "subject", None)
            if topic and str(topic).strip():
                topics.append(str(topic).strip())

    if hasattr(models, "QuestionSession"):
        question_sessions = db.query(models.QuestionSession).join(
            models.QuestionSet,
            models.QuestionSession.question_set_id == models.QuestionSet.id
        ).filter(
            models.QuestionSession.user_id == user_id
        ).order_by(models.QuestionSession.id.desc()).limit(50).all()
        for session in question_sessions:
            question_set = getattr(session, "question_set", None)
            title = getattr(question_set, "title", None) if question_set else None
            if title and str(title).strip():
                topics.append(str(title).strip())

    return topics

def _count_quiz_matches_for_topic(db: Session, user_id: int, topic: str) -> int:
    quiz_count = 0

    if hasattr(models, "QuizSession"):
        quiz_count += db.query(func.count(models.QuizSession.id)).filter(
            models.QuizSession.user_id == user_id,
            models.QuizSession.topic.ilike(f"%{topic}%")
        ).scalar() or 0

    if hasattr(models, "SoloQuiz"):
        quiz_count += db.query(func.count(models.SoloQuiz.id)).filter(
            models.SoloQuiz.user_id == user_id,
            models.SoloQuiz.subject.ilike(f"%{topic}%")
        ).scalar() or 0

    if hasattr(models, "QuestionSession"):
        quiz_count += db.query(func.count(models.QuestionSession.id)).join(
            models.QuestionSet,
            models.QuestionSession.question_set_id == models.QuestionSet.id
        ).filter(
            models.QuestionSession.user_id == user_id,
            models.QuestionSet.title.ilike(f"%{topic}%")
        ).scalar() or 0

    return quiz_count

def get_user_study_topics(db: Session, user_id: int, limit: int = 5) -> List[Dict[str, Any]]:
    topics = {}
    
    chat_sessions = db.query(models.ChatSession).filter(
        models.ChatSession.user_id == user_id
    ).order_by(models.ChatSession.id.desc()).limit(50).all()
    
    for session in chat_sessions:
        if session.title and session.title.strip():
            topic = session.title.strip()
            topics[topic] = topics.get(topic, 0) + 1

    recent_messages = db.query(models.ChatMessage).join(
        models.ChatSession,
        models.ChatMessage.chat_session_id == models.ChatSession.id
    ).filter(
        models.ChatSession.user_id == user_id,
        models.ChatMessage.user_message.isnot(None)
    ).order_by(
        models.ChatMessage.timestamp.desc()
    ).limit(12).all()

    for message in recent_messages:
        topic = _topic_from_text(getattr(message, "user_message", ""))
        if topic:
            topics[topic] = topics.get(topic, 0) + 2
    
    notes = db.query(models.Note).filter(
        models.Note.user_id == user_id
    ).order_by(models.Note.id.desc()).limit(50).all()
    
    for note in notes:
        if note.title and note.title.strip():
            topic = note.title.strip()
            topics[topic] = topics.get(topic, 0) + 2
    
    flashcard_sets = db.query(models.FlashcardSet).filter(
        models.FlashcardSet.user_id == user_id
    ).order_by(models.FlashcardSet.id.desc()).limit(50).all()
    
    for fs in flashcard_sets:
        if fs.title and fs.title.strip():
            topic = fs.title.strip()
            topics[topic] = topics.get(topic, 0) + 3
    
    quiz_topics = _collect_quiz_topic_signals(db, user_id)
    for topic in quiz_topics:
        topics[topic] = topics.get(topic, 0) + 2
    
    sorted_topics = sorted(topics.items(), key=lambda x: x[1], reverse=True)[:limit]
    
    return [
        {
            'topic': topic,
            'activity_count': count,
            'category': categorize_topic(topic)
        }
        for topic, count in sorted_topics
    ]

def categorize_topic(topic: str) -> str:
    topic_lower = topic.lower()
    
    if any(word in topic_lower for word in ['physics', 'chemistry', 'biology', 'science', 'quantum', 'molecular']):
        return 'science'
    
    if any(word in topic_lower for word in ['math', 'calculus', 'algebra', 'geometry', 'statistics', 'equation']):
        return 'mathematics'
    
    if any(word in topic_lower for word in ['programming', 'code', 'python', 'javascript', 'java', 'algorithm', 'data structure']):
        return 'programming'
    
    if any(word in topic_lower for word in ['language', 'english', 'spanish', 'french', 'grammar', 'vocabulary']):
        return 'language'
    
    if any(word in topic_lower for word in ['history', 'historical', 'war', 'ancient', 'medieval']):
        return 'history'
    
    if any(word in topic_lower for word in ['business', 'economics', 'finance', 'marketing', 'management']):
        return 'business'
    
    if any(word in topic_lower for word in ['art', 'music', 'literature', 'poetry', 'painting']):
        return 'arts'
    
    return 'general'

def get_topic_specific_milestones(db: Session, user_id: int, topic: str) -> List[Dict[str, Any]]:
    chat_count = db.query(func.count(models.ChatMessage.id)).join(
        models.ChatSession
    ).filter(
        models.ChatSession.user_id == user_id,
        models.ChatSession.title.ilike(f'%{topic}%')
    ).scalar() or 0
    
    note_count = db.query(func.count(models.Note.id)).filter(
        models.Note.user_id == user_id,
        models.Note.title.ilike(f'%{topic}%')
    ).scalar() or 0
    
    flashcard_count = db.query(func.count(models.FlashcardSet.id)).filter(
        models.FlashcardSet.user_id == user_id,
        models.FlashcardSet.title.ilike(f'%{topic}%')
    ).scalar() or 0
    
    quiz_count = _count_quiz_matches_for_topic(db, user_id, topic)
    
    milestones = []
    
    chat_milestones = [
        {'target': 5, 'title': f'First Steps in {topic}', 'description': 'Ask 5 questions', 'reward': '10 XP Bonus'},
        {'target': 10, 'title': f'{topic} Explorer', 'description': 'Ask 10 questions', 'reward': '20 XP Bonus'},
        {'target': 25, 'title': f'{topic} Enthusiast', 'description': 'Ask 25 questions', 'reward': '50 XP Bonus'},
        {'target': 50, 'title': f'{topic} Scholar', 'description': 'Ask 50 questions', 'reward': '100 XP Bonus'},
        {'target': 100, 'title': f'{topic} Expert', 'description': 'Ask 100 questions', 'reward': '200 XP Bonus'},
    ]
    
    for milestone in chat_milestones:
        milestones.append({
            'id': f'chat_{topic}_{milestone["target"]}',
            'type': 'ai_chat',
            'topic': topic,
            'target': milestone['target'],
            'current': chat_count,
            'title': milestone['title'],
            'description': milestone['description'],
            'reward': milestone['reward'],
            'completed': chat_count >= milestone['target'],
            'progress': min(100, (chat_count / milestone['target']) * 100)
        })
    
    note_milestones = [
        {'target': 3, 'title': f'{topic} Note Taker', 'description': 'Create 3 notes', 'reward': '15 XP Bonus'},
        {'target': 5, 'title': f'{topic} Documenter', 'description': 'Create 5 notes', 'reward': '30 XP Bonus'},
        {'target': 10, 'title': f'{topic} Archivist', 'description': 'Create 10 notes', 'reward': '60 XP Bonus'},
        {'target': 20, 'title': f'{topic} Knowledge Keeper', 'description': 'Create 20 notes', 'reward': '120 XP Bonus'},
    ]
    
    for milestone in note_milestones:
        milestones.append({
            'id': f'note_{topic}_{milestone["target"]}',
            'type': 'notes',
            'topic': topic,
            'target': milestone['target'],
            'current': note_count,
            'title': milestone['title'],
            'description': milestone['description'],
            'reward': milestone['reward'],
            'completed': note_count >= milestone['target'],
            'progress': min(100, (note_count / milestone['target']) * 100)
        })
    
    flashcard_milestones = [
        {'target': 2, 'title': f'{topic} Flashcard Starter', 'description': 'Create 2 flashcard sets', 'reward': '20 XP Bonus'},
        {'target': 5, 'title': f'{topic} Memory Master', 'description': 'Create 5 flashcard sets', 'reward': '50 XP Bonus'},
        {'target': 10, 'title': f'{topic} Recall Champion', 'description': 'Create 10 flashcard sets', 'reward': '100 XP Bonus'},
    ]
    
    for milestone in flashcard_milestones:
        milestones.append({
            'id': f'flashcard_{topic}_{milestone["target"]}',
            'type': 'flashcards',
            'topic': topic,
            'target': milestone['target'],
            'current': flashcard_count,
            'title': milestone['title'],
            'description': milestone['description'],
            'reward': milestone['reward'],
            'completed': flashcard_count >= milestone['target'],
            'progress': min(100, (flashcard_count / milestone['target']) * 100)
        })
    
    quiz_milestones = [
        {'target': 3, 'title': f'{topic} Quiz Taker', 'description': 'Complete 3 quizzes', 'reward': '25 XP Bonus'},
        {'target': 5, 'title': f'{topic} Test Master', 'description': 'Complete 5 quizzes', 'reward': '50 XP Bonus'},
        {'target': 10, 'title': f'{topic} Quiz Champion', 'description': 'Complete 10 quizzes', 'reward': '100 XP Bonus'},
    ]
    
    for milestone in quiz_milestones:
        milestones.append({
            'id': f'quiz_{topic}_{milestone["target"]}',
            'type': 'quizzes',
            'topic': topic,
            'target': milestone['target'],
            'current': quiz_count,
            'title': milestone['title'],
            'description': milestone['description'],
            'reward': milestone['reward'],
            'completed': quiz_count >= milestone['target'],
            'progress': min(100, (quiz_count / milestone['target']) * 100)
        })
    
    return milestones

def get_personalized_roadmap(
    db: Session,
    user_id: int,
    *,
    force_refresh: bool = False,
    ttl_seconds: Optional[int] = None,
) -> Dict[str, Any]:
    ttl = ttl_seconds if ttl_seconds is not None else int(os.getenv("XP_ROADMAP_CACHE_TTL_SECONDS", "600"))
    cached = _ROADMAP_CACHE.get(user_id)
    if not force_refresh and cached and time.time() - cached[0] < ttl:
        return deepcopy(cached[1])

    topics = get_user_study_topics(db, user_id, limit=5)
    seed_topics = [topic_data["topic"] for topic_data in topics]
    recommended_topics = {
        mode: get_related_topic_recommendations(str(user_id), seed_topics, mode, limit=5, allow_ai=False)
        for mode in ("chat", "note", "flashcards", "questions", "quiz", "review", "search")
    }
    
    topic_milestones = {}
    for topic_data in topics:
        topic = topic_data['topic']
        milestones = get_topic_specific_milestones(db, user_id, topic)
        topic_milestones[topic] = {
            'topic': topic,
            'category': topic_data['category'],
            'activity_count': topic_data['activity_count'],
            'milestones': milestones,
            'completed_count': sum(1 for m in milestones if m['completed']),
            'total_count': len(milestones)
        }
    
    roadmap = {
        'topics': topics,
        'recommended_topics': recommended_topics,
        'topic_milestones': topic_milestones,
        'total_topics': len(topics)
    }
    if len(_ROADMAP_CACHE) >= _ROADMAP_CACHE_MAX and user_id not in _ROADMAP_CACHE:
        oldest = next(iter(_ROADMAP_CACHE))
        _ROADMAP_CACHE.pop(oldest, None)
    _ROADMAP_CACHE[user_id] = (time.time(), deepcopy(roadmap))
    return roadmap
