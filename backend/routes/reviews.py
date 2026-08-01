import json
import logging
import re
from datetime import datetime, timezone

from fastapi import APIRouter, Body, Depends, HTTPException, Query
from sqlalchemy.orm import Session

import models
from database import get_db
from deps import (
    call_ai,
    enforce_request_user_scope,
    get_comprehensive_profile_safe,
    get_current_user,
    get_user_by_email,
    get_user_by_username,
)

logger = logging.getLogger(__name__)
router = APIRouter(
    prefix="/api",
    tags=["reviews"],
    dependencies=[Depends(enforce_request_user_scope)],
)

@router.get("/get_learning_reviews")
def get_learning_reviews(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        reviews = db.query(models.LearningReview).filter(
            models.LearningReview.user_id == user.id
        ).order_by(models.LearningReview.created_at.desc()).all()

        review_session_ids: dict[int, list] = {}
        review_slide_ids: dict[int, list] = {}
        all_session_ids: set = set()
        all_slide_ids: set = set()

        for review in reviews:
            try:
                if review.source_sessions:
                    session_ids = json.loads(review.source_sessions)
                    review_session_ids[review.id] = session_ids
                    all_session_ids.update(session_ids)
            except Exception:
                pass
            try:
                if review.source_slides:
                    slide_ids = json.loads(review.source_slides)
                    review_slide_ids[review.id] = slide_ids
                    all_slide_ids.update(slide_ids)
            except Exception:
                pass

        session_titles_by_id = {
            s.id: s.title for s in (
                db.query(models.ChatSession).filter(models.ChatSession.id.in_(all_session_ids)).all()
                if all_session_ids else []
            )
        }
        slide_filenames_by_id = {
            s.id: s.original_filename for s in (
                db.query(models.UploadedSlide).filter(models.UploadedSlide.id.in_(all_slide_ids)).all()
                if all_slide_ids else []
            )
        }

        result = []
        for review in reviews:
            session_titles = [
                session_titles_by_id[sid] for sid in review_session_ids.get(review.id, [])
                if sid in session_titles_by_id
            ]
            slide_filenames = [
                slide_filenames_by_id[sid] for sid in review_slide_ids.get(review.id, [])
                if sid in slide_filenames_by_id
            ]

            result.append({
                "id": review.id,
                "title": review.title,
                "status": review.status,
                "total_points": review.total_points,
                "best_score": round(review.best_score, 1),
                "attempt_count": review.attempt_count,
                "current_attempt": review.current_attempt,
                "session_titles": session_titles,
                "slide_filenames": slide_filenames,
                "created_at": review.created_at.isoformat() + "Z",
                "updated_at": review.updated_at.isoformat() + "Z",
                "completed_at": review.completed_at.isoformat() + "Z" if review.completed_at else None,
                "can_continue": review.status == "active" and review.current_attempt < 5,
            })

        return {"reviews": result}

    except Exception as e:
        logger.error(f"Error getting learning reviews: {str(e)}")
        return {"reviews": []}

@router.post("/create_learning_review")
async def create_learning_review(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        chat_session_ids = payload.get("chat_session_ids", [])
        slide_ids = payload.get("slide_ids", [])
        review_title = payload.get("review_title", "Learning Review")
        review_type = payload.get("review_type", "comprehensive")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if not chat_session_ids and not slide_ids:
            raise HTTPException(status_code=400, detail="At least one source required")

        session_titles = []
        slide_filenames = []
        combined_text = ""

        if chat_session_ids:
            sessions = db.query(models.ChatSession).filter(
                models.ChatSession.id.in_(chat_session_ids),
                models.ChatSession.user_id == user.id,
            ).all()

            if sessions:
                session_titles = [s.title for s in sessions]
                session_ids = [s.id for s in sessions]

                messages = db.query(models.ChatMessage).filter(
                    models.ChatMessage.chat_session_id.in_(session_ids)
                ).order_by(models.ChatMessage.timestamp.asc()).all()

                for msg in messages:
                    combined_text += f"Q: {msg.user_message}\nA: {msg.ai_response}\n\n"

        if slide_ids:
            slides = db.query(models.UploadedSlide).filter(
                models.UploadedSlide.id.in_(slide_ids),
                models.UploadedSlide.user_id == user.id,
            ).all()

            if slides:
                slide_filenames = [s.original_filename for s in slides]

                for slide in slides:
                    if slide.extracted_text:
                        combined_text += f"\n\nSlide: {slide.original_filename}\n{slide.extracted_text}\n"

        combined_text = combined_text[:8000]

        prompt = f"""
        You are an intelligent learning assistant.
        Extract 8-12 key learning points from the following content.
        Return them strictly as a JSON list: ["Point 1", "Point 2", ...].

        Content:
        {combined_text}
        """

        ai_response = call_ai(prompt, max_tokens=1024, temperature=0.7)

        try:
            json_match = re.search(r"\[.*\]", ai_response, re.DOTALL)
            if json_match:
                learning_points = json.loads(json_match.group())
            else:
                learning_points = ["Key concepts covered", "Important principles", "Main ideas"]
        except Exception:
            learning_points = ["Key ideas extracted", "More points will appear after review"]

        review = models.LearningReview(
            user_id=user.id,
            title=review_title,
            source_sessions=json.dumps(chat_session_ids) if chat_session_ids else None,
            source_slides=json.dumps(slide_ids) if slide_ids else None,
            source_content=combined_text[:4000],
            expected_points=json.dumps(learning_points),
            review_type=review_type,
            total_points=len(learning_points),
            best_score=0.0,
            current_attempt=0,
            attempt_count=0,
            status="active",
            created_at=datetime.now(timezone.utc),
        )

        db.add(review)
        db.commit()
        db.refresh(review)

        return {
            "status": "success",
            "review_id": review.id,
            "id": review.id,
            "title": review.title,
            "session_titles": session_titles,
            "slide_filenames": slide_filenames,
            "learning_points": learning_points,
            "total_points": len(learning_points),
        }

    except Exception as e:
        logger.error(f"Error creating review: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/update_learning_review")
async def update_learning_review(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        review_id = payload.get("review_id")
        slide_ids = payload.get("slide_ids", [])

        review = db.query(models.LearningReview).filter(
            models.LearningReview.id == review_id,
            models.LearningReview.user_id == current_user.id,
        ).first()

        if not review:
            raise HTTPException(status_code=404, detail="Review not found")

        if slide_ids:
            slides = db.query(models.UploadedSlide).filter(
                models.UploadedSlide.id.in_(slide_ids),
                models.UploadedSlide.user_id == current_user.id,
            ).all()

            slide_content = ""
            for slide in slides:
                if slide.extracted_text:
                    slide_content += f"\n{slide.extracted_text[:1000]}\n"

            current_content = review.source_content or ""
            review.source_content = (current_content + "\n" + slide_content)[:8000]

            for slide_id in slide_ids:
                link = models.LearningReviewSlide(
                    review_id=review_id,
                    slide_id=slide_id,
                )
                db.add(link)

        review.updated_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "status": "success",
            "message": "Review updated with slides",
        }

    except Exception as e:
        logger.error(f"Error updating review: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/reviews/get_hints/{question_id}")
def get_hints_for_question(
    question_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        question = (
            db.query(models.Question)
            .join(models.QuestionSet, models.Question.question_set_id == models.QuestionSet.id)
            .filter(
                models.Question.id == question_id,
                models.QuestionSet.user_id == current_user.id,
            )
            .first()
        )

        if not question:
            raise HTTPException(status_code=404, detail="Question not found")

        hints = []

        if question.question_type == "multiple_choice":
            options = json.loads(question.options) if question.options else []
            if len(options) >= 2:
                hints.append(f"Consider the options carefully. Eliminate obviously wrong answers first.")
                hints.append(f"The correct answer relates to: {question.topic}")

        elif question.question_type == "true_false":
            hints.append(f"Think about the fundamental concepts of {question.topic}")
            hints.append(f"Consider real-world applications of this concept")

        else:
            hints.append(f"Focus on the key terms related to {question.topic}")
            hints.append(f"Think about how this concept is applied in practice")

        hints.append(f"Review your notes on {question.topic} if you're unsure")

        return {
            "question_id": question_id,
            "hints": hints[:3],
        }

    except Exception as e:
        logger.error(f"Error getting hints: {str(e)}")
        return {"question_id": question_id, "hints": ["Think about the main concepts covered in this topic."]}

@router.post("/submit_review_response")
async def submit_review_response(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        review_id = payload.get("review_id")
        response_text = payload.get("response_text", "")
        user = current_user

        review = db.query(models.LearningReview).filter(
            models.LearningReview.id == review_id,
            models.LearningReview.user_id == current_user.id,
        ).first()

        if not review:
            raise HTTPException(status_code=404, detail="Learning review not found")

        try:
            expected_points = json.loads(review.expected_points)
        except Exception:
            expected_points = []

        covered_points = []
        for point in expected_points:
            if any(keyword in response_text.lower() for keyword in point.lower().split()[:3]):
                covered_points.append(point)

        coverage_percentage = (len(covered_points) / len(expected_points)) * 100 if expected_points else 0

        if coverage_percentage >= 80:
            feedback = "Excellent! You've covered most of the key concepts thoroughly."
            strengths = ["Comprehensive understanding", "Good recall of main points"]
            improvements = ["Consider adding more specific examples"]
        elif coverage_percentage >= 60:
            feedback = "Good effort! You've captured the main ideas but missed some details."
            strengths = ["Solid grasp of core concepts", "Clear expression"]
            improvements = ["Add more specific details", "Expand on the applications"]
        else:
            feedback = "You're on the right track but missed several key concepts. Review the material and try again."
            strengths = ["Good attempt at explaining what you remember"]
            improvements = ["Review the main concepts more thoroughly", "Focus on key definitions and applications"]

        attempt = models.LearningReviewAttempt(
            review_id=review_id,
            attempt_number=review.current_attempt + 1,
            user_response=response_text,
            covered_points=json.dumps(covered_points),
            missing_points=json.dumps([p for p in expected_points if p not in covered_points]),
            completeness_percentage=coverage_percentage,
            feedback=feedback,
            submitted_at=datetime.now(timezone.utc),
        )
        db.add(attempt)

        review.current_attempt += 1
        if coverage_percentage > review.best_score:
            review.best_score = coverage_percentage

        if coverage_percentage >= 80:
            review.status = "completed"
            review.completed_at = datetime.now(timezone.utc)

        db.commit()

        return {
            "status": "success",
            "score": round(coverage_percentage, 1),
            "feedback": feedback,
            "strengths": strengths,
            "improvements": improvements,
            "covered_points": covered_points,
            "total_points": len(expected_points),
        }

    except Exception as e:
        logger.error(f"Error submitting review response: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/reviews/save_archetype_profile")
async def save_archetype_profile(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        primary_archetype = payload.get("primary_archetype")
        secondary_archetype = payload.get("secondary_archetype")
        archetype_scores = payload.get("archetype_scores", {})
        archetype_description = payload.get("archetype_description", "")
        quiz_responses = payload.get("quiz_responses", {})

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        if not comprehensive_profile:
            comprehensive_profile = models.ComprehensiveUserProfile(
                user_id=user.id,
                primary_archetype=primary_archetype,
                secondary_archetype=secondary_archetype,
                archetype_scores=json.dumps(archetype_scores),
                archetype_description=archetype_description,
                quiz_responses=json.dumps(quiz_responses),
            )
            db.add(comprehensive_profile)
        else:
            comprehensive_profile.primary_archetype = primary_archetype
            comprehensive_profile.secondary_archetype = secondary_archetype
            comprehensive_profile.archetype_scores = json.dumps(archetype_scores)
            comprehensive_profile.archetype_description = archetype_description
            comprehensive_profile.quiz_responses = json.dumps(quiz_responses)

        db.commit()
        db.refresh(comprehensive_profile)

        return {
            "status": "success",
            "message": "Archetype profile saved successfully",
            "primary_archetype": primary_archetype,
            "secondary_archetype": secondary_archetype,
        }

    except Exception as e:
        logger.error(f"Error saving archetype: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/reviews/get_comprehensive_profile")
async def get_comprehensive_profile(user_id: str = Query(...), db: Session = Depends(get_db)):
    try:
        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        result = {
            "firstName": user.first_name or "",
            "lastName": user.last_name or "",
            "email": user.email or "",
            "fieldOfStudy": user.field_of_study or "",
            "brainwaveGoal": "",
            "preferredSubjects": [],
            "difficultyLevel": "intermediate",
            "learningPace": "moderate",
            "primaryArchetype": "",
            "secondaryArchetype": "",
            "archetypeDescription": "",
        }

        if comprehensive_profile:
            show_insights_value = comprehensive_profile.show_study_insights
            notifications_value = comprehensive_profile.notifications_enabled
            result.update({
                "difficultyLevel": comprehensive_profile.difficulty_level or "intermediate",
                "learningPace": comprehensive_profile.learning_pace or "moderate",
                "brainwaveGoal": comprehensive_profile.brainwave_goal or "",
                "primaryArchetype": comprehensive_profile.primary_archetype or "",
                "secondaryArchetype": comprehensive_profile.secondary_archetype or "",
                "archetypeDescription": comprehensive_profile.archetype_description or "",
                "showStudyInsights": show_insights_value if show_insights_value is not None else True,
                "notificationsEnabled": notifications_value if notifications_value is not None else True,
            })

            try:
                if comprehensive_profile.preferred_subjects:
                    result["preferredSubjects"] = json.loads(comprehensive_profile.preferred_subjects)
            except Exception:
                result["preferredSubjects"] = []
        else:
            result["showStudyInsights"] = True
            result["notificationsEnabled"] = True

        return result

    except Exception as e:
        logger.error(f"Error getting profile: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/reviews/update_comprehensive_profile")
async def update_comprehensive_profile(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")
        if not user_id:
            raise HTTPException(status_code=400, detail="user_id is required")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        if payload.get("firstName"):
            user.first_name = payload["firstName"]
        if payload.get("lastName"):
            user.last_name = payload["lastName"]
        if payload.get("email"):
            user.email = payload["email"]
        if payload.get("fieldOfStudy"):
            user.field_of_study = payload["fieldOfStudy"]

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        if not comprehensive_profile:
            comprehensive_profile = models.ComprehensiveUserProfile(user_id=user.id)
            db.add(comprehensive_profile)

        if payload.get("difficultyLevel"):
            comprehensive_profile.difficulty_level = payload["difficultyLevel"]
        if payload.get("learningPace"):
            comprehensive_profile.learning_pace = payload["learningPace"]
        if payload.get("brainwaveGoal"):
            comprehensive_profile.brainwave_goal = payload["brainwaveGoal"]

        if "preferredSubjects" in payload:
            comprehensive_profile.preferred_subjects = json.dumps(payload["preferredSubjects"])

        if "showStudyInsights" in payload:
            value = payload["showStudyInsights"]
            if isinstance(value, str):
                value = value.lower() == "true"
            comprehensive_profile.show_study_insights = bool(value)

        if "notificationsEnabled" in payload:
            value = payload["notificationsEnabled"]
            if isinstance(value, str):
                value = value.lower() == "true"
            comprehensive_profile.notifications_enabled = bool(value)

        comprehensive_profile.updated_at = datetime.now(timezone.utc)

        db.commit()

        try:
            from caching.db_cache import invalidate_user_cache
            invalidate_user_cache(user.id)
        except Exception as cache_error:
            logger.warning(f"Cache invalidation failed (non-critical): {cache_error}")

        return {
            "status": "success",
            "message": "Profile updated successfully",
        }

    except Exception as e:
        logger.error(f"Error updating profile: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/reviews/suggest_subjects")
async def suggest_subjects(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        input_text = payload.get("input", "")
        college_level = payload.get("college_level", "")

        if len(input_text) < 2:
            return {"suggestions": []}

        prompt = f"""Based on the input "{input_text}" and college level "{college_level}", suggest 5 relevant academic subjects or courses.

Return ONLY a JSON array of subject names, nothing else. Format: ["Subject 1", "Subject 2", ...]

Examples:
- Input "calc" → ["Calculus I", "Calculus II", "Calculus III", "Multivariable Calculus", "Differential Calculus"]
- Input "bio" → ["Biology", "Molecular Biology", "Cell Biology", "Microbiology", "Biochemistry"]
- Input "comp" → ["Computer Science", "Computer Architecture", "Computational Theory", "Computer Networks", "Computer Graphics"]

Input: "{input_text}"
College Level: "{college_level}"
Suggestions:"""

        response = call_ai(prompt, max_tokens=200, temperature=0.7)

        try:
            json_match = re.search(r"\[.*\]", response, re.DOTALL)
            if json_match:
                suggestions = json.loads(json_match.group())
            else:
                suggestions = [s.strip().strip('"').strip("'").strip("-").strip()
                               for s in response.split("\n") if s.strip()]
                suggestions = [s for s in suggestions if len(s) > 2 and len(s) < 50][:5]
        except Exception:
            suggestions = []

        return {"suggestions": suggestions}

    except Exception as e:
        logger.error(f"Error generating subject suggestions: {str(e)}")
        return {"suggestions": []}

@router.post("/reviews/save_complete_profile")
async def save_complete_profile(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
):
    try:
        user_id = payload.get("user_id")

        user = get_user_by_username(db, user_id) or get_user_by_email(db, user_id)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        comprehensive_profile = db.query(models.ComprehensiveUserProfile).filter(
            models.ComprehensiveUserProfile.user_id == user.id
        ).first()

        if not comprehensive_profile:
            comprehensive_profile = models.ComprehensiveUserProfile(user_id=user.id)
            db.add(comprehensive_profile)

        if "is_college_student" in payload:
            comprehensive_profile.is_college_student = payload["is_college_student"]

        if "college_level" in payload:
            comprehensive_profile.college_level = payload["college_level"]

        if "major" in payload:
            comprehensive_profile.major = payload["major"]

        if "preferred_subjects" in payload:
            comprehensive_profile.preferred_subjects = json.dumps(payload["preferred_subjects"])

        if "main_subject" in payload:
            user.field_of_study = payload["main_subject"]
            comprehensive_profile.main_subject = payload["main_subject"]

        if "brainwave_goal" in payload:
            comprehensive_profile.brainwave_goal = payload["brainwave_goal"]

        if payload.get("quiz_completed"):
            comprehensive_profile.primary_archetype = payload.get("primary_archetype", "")
            comprehensive_profile.secondary_archetype = payload.get("secondary_archetype", "")
            comprehensive_profile.archetype_scores = json.dumps(payload.get("archetype_scores", {}))
            comprehensive_profile.archetype_description = payload.get("archetype_description", "")

        comprehensive_profile.quiz_completed = payload.get("quiz_completed", False)
        comprehensive_profile.quiz_skipped = payload.get("quiz_skipped", False)
        comprehensive_profile.updated_at = datetime.now(timezone.utc)

        db.flush()
        db.commit()
        db.refresh(comprehensive_profile)

        if payload.get("quiz_completed"):
            try:
                from deps import unified_ai
                from proactive_ai_system import get_proactive_ai_engine

                get_proactive_ai_engine(unified_ai)

                user_profile = {
                    "first_name": user.first_name or "there",
                    "field_of_study": user.field_of_study or "General Studies",
                    "is_college_student": payload.get("is_college_student", True),
                    "college_level": payload.get("college_level", ""),
                    "subjects": payload.get("preferred_subjects", []),
                    "main_subject": payload.get("main_subject", ""),
                    "goal": payload.get("brainwave_goal", ""),
                }

                greeting_prompt = f"""You are an AI tutor greeting {user_profile['first_name']} for the first time after they completed their profile.

Profile:
- College Student: {user_profile['is_college_student']}
- Level: {user_profile['college_level']}
- Main Subject: {user_profile['main_subject']}
- Goal: {user_profile['goal']}

Generate a warm, personalized greeting message (2-3 sentences) that:
1. Welcomes them by name
2. Acknowledges their specific subject and goal
3. Expresses excitement to help them succeed
4. Sounds natural and encouraging

Keep it brief and friendly."""

                greeting_message = call_ai(greeting_prompt, max_tokens=150, temperature=0.8)

                new_session = models.ChatSession(
                    user_id=user.id,
                    title="Welcome to Cerbyl",
                    created_at=datetime.now(timezone.utc),
                    updated_at=datetime.now(timezone.utc),
                )
                db.add(new_session)
                db.commit()
                db.refresh(new_session)

                greeting_chat = models.ChatMessage(
                    chat_session_id=new_session.id,
                    user_id=user.id,
                    user_message="PROFILE_COMPLETED",
                    ai_response=greeting_message,
                    timestamp=datetime.now(timezone.utc),
                )
                db.add(greeting_chat)
                db.commit()

            except Exception as e:
                logger.error(f"Error generating greeting: {str(e)}")

        return {
            "status": "success",
            "message": "Profile saved successfully",
            "quiz_completed": comprehensive_profile.quiz_completed,
            "quiz_skipped": comprehensive_profile.quiz_skipped,
        }

    except Exception as e:
        logger.error(f"Error saving complete profile: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")
