import logging
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List

from sqlalchemy import func
from sqlalchemy.orm import Session

import models

logger = logging.getLogger(__name__)


def _percentage_score_to_correct(score: Any, question_count: Any) -> int:
    """Convert a SoloQuiz percentage to an estimated number correct."""
    count = max(int(question_count or 0), 0)
    percentage = min(max(float(score or 0), 0.0), 100.0)
    return min(round((percentage / 100.0) * count), count)

class StudySessionAnalyzer:

    def __init__(self, db: Session, user_id: int, ai_client: Any = None):
        self.db = db
        self.user_id = user_id
        self.ai_client = ai_client

    def _get_session_start(self) -> datetime:
        now = datetime.now(timezone.utc)
        fallback_start = now - timedelta(hours=4)

        user = self.db.query(models.User).filter(models.User.id == self.user_id).first()
        if not user or not user.last_login:
            return fallback_start

        last_login = user.last_login
        if getattr(last_login, "tzinfo", None) is None:
            last_login = last_login.replace(tzinfo=timezone.utc)
        return max(last_login, fallback_start)

    def _collect_core_stats(self) -> Dict[str, Any]:
        session_start = self._get_session_start()

        chat_messages = self.db.query(func.count(models.ChatMessage.id)).join(
            models.ChatSession,
            models.ChatMessage.chat_session_id == models.ChatSession.id
        ).filter(
            models.ChatSession.user_id == self.user_id,
            models.ChatMessage.timestamp >= session_start
        ).scalar() or 0

        flashcards = self.db.query(models.Flashcard).join(
            models.FlashcardSet,
            models.Flashcard.set_id == models.FlashcardSet.id
        ).filter(
            models.FlashcardSet.user_id == self.user_id
        ).all()

        flashcards_studied = sum(1 for card in flashcards if (card.times_reviewed or 0) > 0)
        flashcard_reviews = sum(max(card.times_reviewed or 0, 0) for card in flashcards)
        flashcard_correct = sum(
            min(max(card.correct_count or 0, 0), max(card.times_reviewed or 0, 0))
            for card in flashcards
        )

        quiz_questions = 0
        quiz_correct = 0
        quiz_sessions = 0

        if hasattr(models, "SoloQuiz"):
            solo_quizzes = self.db.query(models.SoloQuiz).filter(
                models.SoloQuiz.user_id == self.user_id,
                models.SoloQuiz.completed == True
            ).all()
            quiz_sessions += len(solo_quizzes)
            quiz_questions += sum(max(quiz.question_count or 0, 0) for quiz in solo_quizzes)
            quiz_correct += sum(
                _percentage_score_to_correct(quiz.score, quiz.question_count)
                for quiz in solo_quizzes
            )

        if hasattr(models, "QuestionSession"):
            question_sessions = self.db.query(models.QuestionSession).filter(
                models.QuestionSession.user_id == self.user_id
            ).all()
            quiz_sessions += len(question_sessions)
            quiz_questions += sum(max(qs.total_questions or 0, 0) for qs in question_sessions)
            quiz_correct += sum(max(qs.correct_count or 0, 0) for qs in question_sessions)

        total_answered = flashcard_reviews + quiz_questions
        total_correct = flashcard_correct + quiz_correct
        overall_accuracy = (total_correct / total_answered * 100) if total_answered > 0 else 0.0
        overall_accuracy = min(max(overall_accuracy, 0.0), 100.0)

        return {
            "session_start": session_start,
            "chat_messages": chat_messages,
            "flashcards_studied": flashcards_studied,
            "quiz_sessions": quiz_sessions,
            "quiz_questions": quiz_questions,
            "overall_accuracy": round(overall_accuracy, 1),
        }

    def _collect_weaknesses(self) -> List[Dict[str, Any]]:
        if not hasattr(models, "UserWeakArea"):
            return []

        weak_areas = self.db.query(models.UserWeakArea).filter(
            models.UserWeakArea.user_id == self.user_id
        ).order_by(
            models.UserWeakArea.weakness_score.desc(),
            models.UserWeakArea.accuracy.asc()
        ).limit(5).all()

        results: List[Dict[str, Any]] = []
        for area in weak_areas:
            results.append({
                "topic": area.topic,
                "accuracy": round(area.accuracy or 0, 1),
                "weakness_score": round(area.weakness_score or 0, 2),
                "status": area.status or "needs_practice",
            })
        return results

    def _build_recommendations(self, stats: Dict[str, Any], weaknesses: List[Dict[str, Any]]) -> List[Dict[str, str]]:
        recommendations: List[Dict[str, str]] = []

        if stats["chat_messages"] < 5:
            recommendations.append({
                "title": "Increase Question Volume",
                "description": "Ask at least 5 focused questions per study session to improve concept clarity."
            })

        if stats["flashcards_studied"] == 0:
            recommendations.append({
                "title": "Review Flashcards Daily",
                "description": "Complete at least one flashcard review pass to strengthen recall."
            })

        if stats["overall_accuracy"] < 70:
            recommendations.append({
                "title": "Reinforce Core Concepts",
                "description": "Focus on lower-accuracy topics before moving to advanced material."
            })

        if weaknesses:
            top_topic = weaknesses[0].get("topic", "your weakest topic")
            recommendations.append({
                "title": f"Targeted Practice: {top_topic}",
                "description": f"Do one short quiz and one note recap on {top_topic} this week."
            })

        if not recommendations:
            recommendations.append({
                "title": "Keep Consistent",
                "description": "Current learning signals look healthy. Maintain your weekly cadence."
            })

        return recommendations[:5]

    def generate_session_summary(self) -> Dict[str, Any]:
        stats = self._collect_core_stats()
        weaknesses = self._collect_weaknesses()
        recommendations = self._build_recommendations(stats, weaknesses)

        total_activities = (
            stats["chat_messages"]
            + stats["flashcards_studied"]
            + stats["quiz_sessions"]
        )

        return {
            "summary": {
                "total_activities": total_activities,
                "chat_messages": stats["chat_messages"],
                "flashcards_studied": stats["flashcards_studied"],
                "quiz_questions": stats["quiz_questions"],
                "overall_accuracy": stats["overall_accuracy"],
                "session_start": stats["session_start"].isoformat(),
            },
            "weaknesses": weaknesses,
            "recommendations": recommendations,
        }

    async def generate_ai_summary(self) -> str:
        summary = self.generate_session_summary()
        core = summary["summary"]
        weakness = summary["weaknesses"][0]["topic"] if summary["weaknesses"] else None

        if core["total_activities"] == 0:
            return "Welcome back. No recent study activity detected yet. Start with one short focused session today."

        message = (
            f"You completed {core['total_activities']} recent learning activities "
            f"with an overall accuracy of {core['overall_accuracy']}%."
        )
        if weakness:
            message += f" Prioritize extra practice on {weakness} next."
        return message

def get_study_session_analyzer(db: Session, user_id: int, ai_client: Any = None) -> StudySessionAnalyzer:
    return StudySessionAnalyzer(db=db, user_id=user_id, ai_client=ai_client)
