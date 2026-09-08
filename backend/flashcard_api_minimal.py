
import logging
import random
import string
from datetime import datetime, timezone
from typing import Dict, List, Optional
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from pydantic import BaseModel

from flashcard_minimal import (
    generate_flashcards_minimal,
    get_agent,
    FlashcardGenerationRequest
)
import models

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/flashcards", tags=["Flashcards"])

def generate_share_code(length: int = 6) -> str:
    chars = string.ascii_uppercase + string.digits
    return ''.join(random.choices(chars, k=length))

def get_unique_share_code(db: Session, length: int = 6) -> str:
    for _ in range(10):
        code = generate_share_code(length)
        existing = db.query(models.FlashcardSet).filter(
            models.FlashcardSet.share_code == code
        ).first()
        if not existing:
            return code
    return generate_share_code(8)

class FlashcardSetCreate(BaseModel):
    user_id: str
    title: str = "New Flashcard Set"
    description: str = ""
    is_public: bool = False

class FlashcardCreate(BaseModel):
    set_id: int
    question: str
    answer: str
    difficulty: Optional[str] = "medium"

class CardReview(BaseModel):
    user_id: str
    card_id: str
    was_correct: bool
    mode: Optional[str] = "preview"

def get_db():
    from database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def get_user(db: Session, user_identifier: str):
    user = db.query(models.User).filter(
        (models.User.username == user_identifier) | 
        (models.User.email == user_identifier)
    ).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@router.post("/generate")
async def generate_flashcards(payload: FlashcardGenerationRequest, db: Session = Depends(get_db)):
    
    try:
        user = get_user(db, payload.user_id)
        
        from deps import unified_ai
        
        if payload.topic:
            flashcards = generate_flashcards_minimal(
                unified_ai,
                payload.topic,
                payload.card_count,
                payload.difficulty_level,
                is_topic=True
            )
        elif payload.chat_data:
            flashcards = generate_flashcards_minimal(
                unified_ai,
                payload.chat_data,
                payload.card_count,
                payload.difficulty_level,
                is_topic=False
            )
        else:
            raise HTTPException(status_code=400, detail="Provide topic or chat_data")
        
        if payload.save_to_set and flashcards:
            set_title = payload.set_title or f"Generated - {datetime.now(timezone.utc).strftime('%Y-%m-%d %H:%M')}"
            
            share_code = get_unique_share_code(db)
            
            flashcard_set = models.FlashcardSet(
                user_id=user.id,
                title=set_title,
                description=f"Generated {len(flashcards)} cards",
                source_type="ai_generated",
                share_code=share_code,
                is_public=payload.is_public
            )
            db.add(flashcard_set)
            db.commit()
            db.refresh(flashcard_set)
            
            for card in flashcards:
                db_card = models.Flashcard(
                    set_id=flashcard_set.id,
                    question=card["question"],
                    answer=card["answer"],
                    difficulty=card.get("difficulty", "medium")
                )
                db.add(db_card)
                
                agent = get_agent(payload.user_id)
                agent.add_card(str(db_card.id))
            
            db.commit()
            
            return {
                "success": True,
                "flashcards": flashcards,
                "set_id": flashcard_set.id,
                "share_code": share_code,
                "set_title": set_title
            }
        
        return {
            "success": True,
            "flashcards": flashcards
        }
        
    except Exception as e:
        logger.error(f"Generation error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/review")
async def review_card(payload: CardReview, db: Session = Depends(get_db)):
    
    try:
        user = get_user(db, payload.user_id)
        
        card = db.query(models.Flashcard).filter(
            models.Flashcard.id == int(payload.card_id)
        ).first()
        
        if card:
            card.times_reviewed = (card.times_reviewed or 0) + 1
            if payload.was_correct:
                card.correct_count = (card.correct_count or 0) + 1
            card.last_reviewed = datetime.now(timezone.utc)
            
            if not payload.was_correct:
                card.marked_for_review = True
            elif payload.mode == "study" and payload.was_correct:
                card.marked_for_review = False
            
            db.commit()
            
            flashcard_set = db.query(models.FlashcardSet).filter(
                models.FlashcardSet.id == card.set_id
            ).first()
            
            set_mastery = 0.0
            if flashcard_set:
                all_cards = db.query(models.Flashcard).filter(
                    models.Flashcard.set_id == flashcard_set.id
                ).all()
                
                total_cards = len(all_cards)
                if total_cards > 0:
                    preview_mastery = 0
                    study_mastery = 0
                    
                    for c in all_cards:
                        correct = c.correct_count or 0
                        reviewed = c.times_reviewed or 0
                        
                        if correct > 0:
                            if not c.marked_for_review:
                                study_mastery += 10
                            else:
                                preview_mastery += 5
                    
                    preview_mastery = min(preview_mastery, 50)
                    study_mastery = min(study_mastery, 100)
                    
                    set_mastery = max(preview_mastery, study_mastery)
        else:
            set_mastery = 0.0
        
        agent = get_agent(payload.user_id)
        result = agent.review_card(payload.card_id, payload.was_correct)
        
        return {
            "success": True,
            "data": result,
            "set_mastery": set_mastery
        }
        
    except Exception as e:
        logger.error(f"Review error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class StudySessionComplete(BaseModel):
    user_id: str
    set_id: int
    cards_studied: int
    correct_answers: int
    session_duration: int

@router.post("/complete-session")
async def complete_study_session(payload: StudySessionComplete, db: Session = Depends(get_db)):
    
    try:
        user = get_user(db, payload.user_id)
        if not db.query(models.FlashcardSet.id).filter_by(id=payload.set_id, user_id=user.id).first():
            raise HTTPException(status_code=404, detail="Flashcard set not found")
        if not 0 <= payload.correct_answers <= payload.cards_studied <= 10000 or not 0 <= payload.session_duration <= 86400:
            raise HTTPException(status_code=422, detail="Invalid study session totals")
        session = models.FlashcardStudySession(
            set_id=payload.set_id,
            user_id=user.id,
            cards_studied=payload.cards_studied,
            correct_answers=payload.correct_answers,
            session_duration=payload.session_duration,
            session_date=datetime.now(timezone.utc)
        )
        db.add(session)
        db.flush()
        from services.product_events import record_event
        record_event(db, "flashcard_session_completed", user.id, key=f"flashcard-session:{session.id}", origin="client")
        db.commit()
        
        logger.info(f"Saved study session for user {user.id}: {payload.cards_studied} cards, {payload.correct_answers} correct")
        
        return {
            "success": True,
            "session_id": session.id
        }
        
    except Exception as e:
        logger.error(f"Error saving study session: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/statistics")
async def get_statistics(user_id: str = Query(...)):
    
    try:
        agent = get_agent(user_id)
        stats = agent.get_statistics()
        
        return {
            "success": True,
            "data": stats
        }
        
    except Exception as e:
        logger.error(f"Statistics error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/weak-cards")
async def get_weak_cards(user_id: str = Query(...)):
    
    try:
        agent = get_agent(user_id)
        weak_cards = agent.get_weak_cards()
        
        return {
            "success": True,
            "data": {
                "weak_cards": weak_cards,
                "count": len(weak_cards)
            }
        }
        
    except Exception as e:
        logger.error(f"Weak cards error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/sets/create")
async def create_set(payload: FlashcardSetCreate, db: Session = Depends(get_db)):
    
    user = get_user(db, payload.user_id)
    
    share_code = get_unique_share_code(db)
    
    flashcard_set = models.FlashcardSet(
        user_id=user.id,
        title=payload.title,
        description=payload.description,
        is_public=payload.is_public,
        share_code=share_code
    )
    
    db.add(flashcard_set)
    db.commit()
    db.refresh(flashcard_set)
    
    return {
        "success": True,
        "set_id": flashcard_set.id,
        "share_code": share_code,
        "title": flashcard_set.title
    }

@router.post("/cards/create")
async def create_card(payload: FlashcardCreate, db: Session = Depends(get_db)):
    
    flashcard = models.Flashcard(
        set_id=payload.set_id,
        question=payload.question,
        answer=payload.answer,
        difficulty=payload.difficulty
    )
    
    db.add(flashcard)
    db.commit()
    db.refresh(flashcard)
    
    return {
        "success": True,
        "card_id": flashcard.id
    }

@router.get("/sets/user")
async def get_user_sets(user_id: str = Query(...), db: Session = Depends(get_db)):
    
    user = get_user(db, user_id)
    
    sets = db.query(models.FlashcardSet).filter(
        models.FlashcardSet.user_id == user.id
    ).all()
    
    result = []
    for s in sets:
        cards = db.query(models.Flashcard).filter(
            models.Flashcard.set_id == s.id
        ).all()
        
        total_reviews = sum(c.times_reviewed or 0 for c in cards)
        total_correct = sum(c.correct_count or 0 for c in cards)
        
        if total_reviews > 0:
            accuracy = (total_correct / total_reviews) * 100
        else:
            accuracy = 0.0
        
        result.append({
            "id": s.id,
            "share_code": s.share_code,
            "title": s.title,
            "description": s.description,
            "card_count": len(cards),
            "accuracy_percentage": round(accuracy, 1),
            "created_at": s.created_at.isoformat()
        })
    
    return {
        "success": True,
        "sets": result
    }

@router.get("/sets/{set_id}/cards")
async def get_set_cards(set_id: int, db: Session = Depends(get_db)):
    
    flashcard_set = db.query(models.FlashcardSet).filter(
        models.FlashcardSet.id == set_id
    ).first()
    
    if not flashcard_set:
        raise HTTPException(status_code=404, detail="Set not found")
    
    return {
        "success": True,
        "share_code": flashcard_set.share_code,
        "cards": [
            {
                "id": c.id,
                "question": c.question,
                "answer": c.answer,
                "difficulty": c.difficulty,
                "is_edited": bool(c.is_edited) if hasattr(c, 'is_edited') and c.is_edited else False,
                "edited_at": c.edited_at.isoformat() if hasattr(c, 'edited_at') and c.edited_at else None
            }
            for c in flashcard_set.flashcards
        ]
    }

@router.get("/by-code/{share_code}")
async def get_set_by_code(share_code: str, db: Session = Depends(get_db)):
    
    flashcard_set = db.query(models.FlashcardSet).filter(
        models.FlashcardSet.share_code == share_code.upper()
    ).first()
    
    if not flashcard_set:
        raise HTTPException(status_code=404, detail="Flashcard set not found")
    
    cards = db.query(models.Flashcard).filter(
        models.Flashcard.set_id == flashcard_set.id
    ).all()
    
    total_cards = len(cards)
    if total_cards > 0:
        mastered_cards = 0
        for card in cards:
            times_reviewed = card.times_reviewed or 0
            correct_count = card.correct_count or 0
            
            if times_reviewed > 0:
                card_accuracy = correct_count / times_reviewed
                review_weight = min(times_reviewed / 3, 1.0)
                mastered_cards += card_accuracy * review_weight
        
        mastery_percentage = (mastered_cards / total_cards) * 100
    else:
        mastery_percentage = 0.0
    
    return {
        "success": True,
        "set": {
            "id": flashcard_set.id,
            "share_code": flashcard_set.share_code,
            "title": flashcard_set.title,
            "description": flashcard_set.description,
            "card_count": total_cards,
            "accuracy_percentage": round(mastery_percentage, 1),
            "created_at": flashcard_set.created_at.isoformat()
        },
        "flashcards": [
            {
                "id": c.id,
                "question": c.question,
                "answer": c.answer,
                "difficulty": c.difficulty,
                "times_reviewed": c.times_reviewed or 0,
                "correct_count": c.correct_count or 0,
                "marked_for_review": c.marked_for_review or False,
                "is_edited": bool(c.is_edited) if hasattr(c, 'is_edited') and c.is_edited else False,
                "edited_at": c.edited_at.isoformat() if hasattr(c, 'edited_at') and c.edited_at else None
            }
            for c in cards
        ]
    }

@router.post("/reset-mastery")
async def reset_all_mastery(db: Session = Depends(get_db)):
    try:
        db.query(models.Flashcard).update({
            "times_reviewed": 0,
            "correct_count": 0,
            "marked_for_review": False,
            "last_reviewed": None
        })
        db.commit()
        
        return {
            "success": True,
            "message": "All mastery data has been reset"
        }
    except Exception as e:
        logger.error(f"Error resetting mastery: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/sets/{set_id}")
async def delete_set(set_id: int, db: Session = Depends(get_db)):
    
    flashcard_set = db.query(models.FlashcardSet).filter(
        models.FlashcardSet.id == set_id
    ).first()
    
    if not flashcard_set:
        raise HTTPException(status_code=404, detail="Set not found")

    db.query(models.FlashcardStudySession).filter(
        models.FlashcardStudySession.set_id == set_id
    ).delete(synchronize_session=False)
    db.query(models.Flashcard).filter(
        models.Flashcard.set_id == set_id
    ).delete(synchronize_session=False)

    db.delete(flashcard_set)
    db.commit()
    
    return {
        "success": True,
        "message": "Set deleted"
    }

@router.post("/toggle_visibility")
async def toggle_flashcard_set_visibility(
    set_id: int = Query(...),
    is_public: bool = Query(...),
    db: Session = Depends(models.get_db)
):
    flashcard_set = db.query(models.FlashcardSet).filter(
        models.FlashcardSet.id == set_id
    ).first()
    
    if not flashcard_set:
        raise HTTPException(status_code=404, detail="Flashcard set not found")
    
    flashcard_set.is_public = is_public
    db.commit()
    
    logger.info(f" Flashcard set {set_id} visibility changed to {'public' if is_public else 'private'}")
    
    return {
        "success": True,
        "message": f"Flashcard set is now {'public' if is_public else 'private'}",
        "is_public": is_public
    }

@router.get("/public")
async def get_public_flashcards(
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: Session = Depends(get_db)
):
    
    try:
        sets = db.query(models.FlashcardSet).filter(
            models.FlashcardSet.is_public == True
        ).order_by(models.FlashcardSet.created_at.desc()).offset(offset).limit(limit).all()
        
        result = []
        for s in sets:
            user = db.query(models.User).filter(models.User.id == s.user_id).first()
            if user:
                if user.first_name and user.last_name:
                    creator = f"{user.first_name} {user.last_name}"
                elif user.first_name:
                    creator = user.first_name
                else:
                    creator = user.username
            else:
                creator = 'Anonymous'
            
            card_count = db.query(models.Flashcard).filter(
                models.Flashcard.set_id == s.id
            ).count()
            
            result.append({
                "id": s.id,
                "share_code": s.share_code,
                "title": s.title,
                "description": s.description,
                "card_count": card_count,
                "creator": creator,
                "created_at": s.created_at.isoformat() if s.created_at else None
            })
        
        return {
            "success": True,
            "sets": result,
            "total": len(result)
        }
        
    except Exception as e:
        logger.error(f"Error fetching public flashcards: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/public/search")
async def search_public_flashcards(
    query: str = Query(""),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db)
):
    
    try:
        from sqlalchemy import or_, func
        
        search_term = f"%{query.lower()}%"
        
        sets = db.query(models.FlashcardSet).filter(
            models.FlashcardSet.is_public == True,
            or_(
                func.lower(models.FlashcardSet.title).like(search_term),
                func.lower(models.FlashcardSet.description).like(search_term)
            )
        ).order_by(models.FlashcardSet.created_at.desc()).limit(limit).all()
        
        result = []
        for s in sets:
            user = db.query(models.User).filter(models.User.id == s.user_id).first()
            if user:
                if user.first_name and user.last_name:
                    creator = f"{user.first_name} {user.last_name}"
                elif user.first_name:
                    creator = user.first_name
                else:
                    creator = user.username
            else:
                creator = 'Anonymous'
            
            card_count = db.query(models.Flashcard).filter(
                models.Flashcard.set_id == s.id
            ).count()
            
            result.append({
                "id": s.id,
                "share_code": s.share_code,
                "title": s.title,
                "description": s.description,
                "card_count": card_count,
                "creator": creator,
                "created_at": s.created_at.isoformat() if s.created_at else None
            })
        
        return {
            "success": True,
            "sets": result,
            "total": len(result)
        }
        
    except Exception as e:
        logger.error(f"Error searching public flashcards: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CopySetRequest(BaseModel):
    user_id: str
    source_set_id: int

@router.post("/public/copy")
async def copy_public_flashcard_set(
    payload: CopySetRequest,
    db: Session = Depends(get_db)
):
    
    try:
        user = get_user(db, payload.user_id)
        
        source_set = db.query(models.FlashcardSet).filter(
            models.FlashcardSet.id == payload.source_set_id,
            models.FlashcardSet.is_public == True
        ).first()
        
        if not source_set:
            raise HTTPException(status_code=404, detail="Public flashcard set not found")
        
        source_cards = db.query(models.Flashcard).filter(
            models.Flashcard.set_id == source_set.id
        ).all()
        
        new_share_code = get_unique_share_code(db)
        new_set = models.FlashcardSet(
            user_id=user.id,
            title=f"{source_set.title} (Copy)",
            description=source_set.description,
            source_type="copied",
            share_code=new_share_code,
            is_public=False
        )
        db.add(new_set)
        db.commit()
        db.refresh(new_set)
        
        for card in source_cards:
            new_card = models.Flashcard(
                set_id=new_set.id,
                question=card.question,
                answer=card.answer,
                difficulty=card.difficulty,
                category=card.category
            )
            db.add(new_card)
        
        db.commit()
        
        return {
            "success": True,
            "set_id": new_set.id,
            "share_code": new_share_code,
            "title": new_set.title,
            "card_count": len(source_cards)
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error copying flashcard set: {e}")
        raise HTTPException(status_code=500, detail=str(e))

class CardUpdate(BaseModel):
    question: str
    answer: str
    difficulty: Optional[str] = "medium"

@router.put("/cards/{card_id}")
async def update_card(card_id: int, payload: CardUpdate, db: Session = Depends(get_db)):
    
    card = db.query(models.Flashcard).filter(
        models.Flashcard.id == card_id
    ).first()
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    card.question = payload.question
    card.answer = payload.answer
    card.difficulty = payload.difficulty
    card.is_edited = True
    card.edited_at = datetime.now(timezone.utc)
    card.updated_at = datetime.now(timezone.utc)
    
    db.commit()
    
    return {
        "success": True,
        "card_id": card.id,
        "is_edited": True,
        "edited_at": card.edited_at.isoformat()
    }

@router.delete("/cards/{card_id}")
async def delete_card(card_id: int, db: Session = Depends(get_db)):
    
    card = db.query(models.Flashcard).filter(
        models.Flashcard.id == card_id
    ).first()
    
    if not card:
        raise HTTPException(status_code=404, detail="Card not found")
    
    db.delete(card)
    db.commit()
    
    return {
        "success": True,
        "message": "Card deleted"
    }

def register_flashcard_api_minimal(app):
    app.include_router(router)
    logger.info(" Minimal Flashcard API registered")
