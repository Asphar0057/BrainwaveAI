import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from pydantic import BaseModel, field_validator
from sqlalchemy import and_, desc, func, or_
from sqlalchemy.orm import Session, joinedload

import models
from deps import get_current_user, get_db, get_user_by_email, get_user_by_username
from uid_utils import resolve_by_id_or_uid

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["playlists"])


def _resolve_playlist(db: Session, playlist_id: str) -> models.LearningPlaylist:
    playlist = resolve_by_id_or_uid(
        db.query(models.LearningPlaylist), models.LearningPlaylist, str(playlist_id), uid_field="uid"
    ).first()
    if not playlist:
        raise HTTPException(status_code=404, detail="Playlist not found")
    return playlist

class PlaylistCreateRequest(BaseModel):
    model_config = {"extra": "ignore"}

    title: str
    description: Optional[str] = None
    category: Optional[str] = None
    difficulty_level: str = "intermediate"
    estimated_hours: Optional[float] = None
    is_public: bool = True
    is_collaborative: bool = False
    cover_color: str = "#4A90E2"
    tags: Optional[List[str]] = None
    items: Optional[List] = None

    @field_validator("estimated_hours", mode="before")
    @classmethod
    def empty_str_to_none(cls, v):
        if v == "" or v is None:
            return None
        return v

class PlaylistItemRequest(BaseModel):
    model_config = {"extra": "ignore"}

    item_type: str
    item_id: Optional[int] = None
    title: str
    url: Optional[str] = None
    description: Optional[str] = None
    duration_minutes: Optional[int] = None
    platform: Optional[str] = None
    is_required: bool = True
    notes: Optional[str] = None

@router.get("/playlists/test")
async def test_playlist_endpoint():
    return {"message": "Playlist API is working!"}

@router.get("/playlists")
async def get_playlists(
    category: Optional[str] = None,
    difficulty: Optional[str] = None,
    search: Optional[str] = None,
    my_playlists: bool = False,
    following: bool = False,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        query = db.query(models.LearningPlaylist).options(joinedload(models.LearningPlaylist.creator))

        if my_playlists:
            query = query.filter(models.LearningPlaylist.creator_id == current_user.id)
        elif following:
            followed_ids = db.query(models.PlaylistFollower.playlist_id).filter(
                models.PlaylistFollower.user_id == current_user.id
            ).all()
            followed_ids = [f[0] for f in followed_ids]
            query = query.filter(models.LearningPlaylist.id.in_(followed_ids))
        else:
            query = query.filter(models.LearningPlaylist.is_public == True)

        if category:
            query = query.filter(models.LearningPlaylist.category == category)
        if difficulty:
            query = query.filter(models.LearningPlaylist.difficulty_level == difficulty)
        if search:
            search_term = f"%{search}%"
            query = query.filter(
                or_(
                    models.LearningPlaylist.title.ilike(search_term),
                    models.LearningPlaylist.description.ilike(search_term),
                )
            )

        playlists = query.order_by(desc(models.LearningPlaylist.created_at)).offset(offset).limit(limit).all()

        playlist_ids = [p.id for p in playlists]
        followers_by_playlist = {}
        item_counts_by_playlist = {}
        if playlist_ids:
            followers_by_playlist = {
                f.playlist_id: f
                for f in db.query(models.PlaylistFollower).filter(
                    and_(
                        models.PlaylistFollower.playlist_id.in_(playlist_ids),
                        models.PlaylistFollower.user_id == current_user.id,
                    )
                ).all()
            }
            item_counts_by_playlist = dict(
                db.query(models.PlaylistItem.playlist_id, func.count(models.PlaylistItem.id))
                .filter(models.PlaylistItem.playlist_id.in_(playlist_ids))
                .group_by(models.PlaylistItem.playlist_id)
                .all()
            )

        result = []
        for p in playlists:
            follower = followers_by_playlist.get(p.id)
            is_following = follower is not None

            user_progress = None
            if follower:
                user_progress = {
                    "progress_percentage": follower.progress_percentage or 0,
                    "completed_items": follower.completed_items or [],
                }

            item_count = item_counts_by_playlist.get(p.id, 0)

            result.append({
                "id": p.id,
                "uid": p.uid,
                "title": p.title,
                "description": p.description,
                "category": p.category,
                "difficulty_level": p.difficulty_level,
                "estimated_hours": p.estimated_hours,
                "is_public": p.is_public,
                "cover_color": p.cover_color,
                "tags": p.tags or [],
                "fork_count": p.fork_count or 0,
                "follower_count": p.follower_count or 0,
                "completion_count": p.completion_count or 0,
                "item_count": item_count,
                "created_at": p.created_at.isoformat() if p.created_at else None,
                "creator": {
                    "id": p.creator.id,
                    "username": p.creator.username,
                    "first_name": p.creator.first_name,
                    "picture_url": p.creator.picture_url,
                },
                "items": [],
                "is_owner": current_user.id == p.creator_id,
                "is_following": is_following,
                "user_progress": user_progress,
            })

        return {"playlists": result}
    except Exception as e:
        logger.error(f"Error getting playlists: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/playlists")
async def create_playlist(
    request: Request,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        body = await request.json()
        logger.info(f"Received playlist data: {body}")

        playlist_data = PlaylistCreateRequest(**body)
        new_playlist = models.LearningPlaylist(
            creator_id=current_user.id,
            title=playlist_data.title,
            description=playlist_data.description,
            category=playlist_data.category,
            difficulty_level=playlist_data.difficulty_level,
            estimated_hours=playlist_data.estimated_hours,
            is_public=playlist_data.is_public,
            is_collaborative=playlist_data.is_collaborative,
            cover_color=playlist_data.cover_color,
            tags=playlist_data.tags or [],
        )

        db.add(new_playlist)
        db.commit()
        db.refresh(new_playlist)

        return {
            "id": new_playlist.id,
            "uid": new_playlist.uid,
            "title": new_playlist.title,
            "description": new_playlist.description,
            "category": new_playlist.category,
            "difficulty_level": new_playlist.difficulty_level,
            "cover_color": new_playlist.cover_color,
            "creator": {
                "id": current_user.id,
                "username": current_user.username,
                "first_name": current_user.first_name,
                "picture_url": current_user.picture_url,
            },
            "items": [],
            "is_owner": True,
            "message": "Playlist created successfully",
        }
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating playlist: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/playlists/{playlist_id}")
async def delete_playlist(
    playlist_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        playlist = _resolve_playlist(db, playlist_id)

        if playlist.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only creator can delete playlist")

        db.query(models.PlaylistFollower).filter(
            models.PlaylistFollower.playlist_id == playlist.id
        ).delete(synchronize_session=False)
        db.query(models.PlaylistFork).filter(
            or_(
                models.PlaylistFork.original_playlist_id == playlist.id,
                models.PlaylistFork.forked_playlist_id == playlist.id,
            )
        ).delete(synchronize_session=False)
        db.query(models.PlaylistCollaborator).filter(
            models.PlaylistCollaborator.playlist_id == playlist.id
        ).delete(synchronize_session=False)
        db.query(models.PlaylistComment).filter(
            models.PlaylistComment.playlist_id == playlist.id
        ).delete(synchronize_session=False)

        db.delete(playlist)
        db.commit()

        return {"message": "Playlist deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting playlist: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/playlists/{playlist_id}")
async def get_playlist_detail(
    playlist_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        playlist = _resolve_playlist(db, playlist_id)

        if not playlist.is_public and playlist.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        items = db.query(models.PlaylistItem).filter(
            models.PlaylistItem.playlist_id == playlist.id
        ).order_by(models.PlaylistItem.order_index).all()

        follower = db.query(models.PlaylistFollower).filter(
            and_(
                models.PlaylistFollower.playlist_id == playlist.id,
                models.PlaylistFollower.user_id == current_user.id,
            )
        ).first()

        user_progress = None
        if follower:
            user_progress = {
                "progress_percentage": follower.progress_percentage or 0,
                "completed_items": follower.completed_items or [],
                "is_completed": follower.is_completed or False,
                "started_at": follower.started_at.isoformat() if follower.started_at else None,
                "last_accessed": follower.last_accessed.isoformat() if follower.last_accessed else None,
            }

        return {
            "id": playlist.id,
            "uid": playlist.uid,
            "title": playlist.title,
            "description": playlist.description,
            "category": playlist.category,
            "difficulty_level": playlist.difficulty_level,
            "estimated_hours": playlist.estimated_hours,
            "is_public": playlist.is_public,
            "is_collaborative": playlist.is_collaborative,
            "cover_color": playlist.cover_color,
            "tags": playlist.tags or [],
            "fork_count": playlist.fork_count or 0,
            "follower_count": playlist.follower_count or 0,
            "completion_count": playlist.completion_count or 0,
            "created_at": playlist.created_at.isoformat() if playlist.created_at else None,
            "creator": {
                "id": playlist.creator.id,
                "username": playlist.creator.username,
                "first_name": playlist.creator.first_name,
                "last_name": playlist.creator.last_name,
                "picture_url": playlist.creator.picture_url,
            },
            "items": [
                {
                    "id": item.id,
                    "order_index": item.order_index,
                    "item_type": item.item_type,
                    "item_id": item.item_id,
                    "title": item.title,
                    "url": item.url,
                    "description": item.description,
                    "duration_minutes": item.duration_minutes,
                    "platform": item.platform,
                    "is_required": item.is_required,
                    "notes": item.notes,
                }
                for item in items
            ],
            "is_owner": current_user.id == playlist.creator_id,
            "is_following": follower is not None,
            "user_progress": user_progress,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting playlist: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/playlists/{playlist_id}/items")
async def add_playlist_item(
    playlist_id: str,
    item_data: PlaylistItemRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        playlist = _resolve_playlist(db, playlist_id)

        if playlist.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only creator can add items")

        max_order = db.query(func.max(models.PlaylistItem.order_index)).filter(
            models.PlaylistItem.playlist_id == playlist.id
        ).scalar() or -1

        item = models.PlaylistItem(
            playlist_id=playlist.id,
            order_index=max_order + 1,
            item_type=item_data.item_type,
            item_id=item_data.item_id,
            title=item_data.title,
            url=item_data.url,
            description=item_data.description,
            duration_minutes=item_data.duration_minutes,
            platform=item_data.platform,
            is_required=item_data.is_required,
            notes=item_data.notes,
        )

        db.add(item)
        db.commit()
        db.refresh(item)

        return {"id": item.id, "message": "Item added successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error adding item: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/playlists/{playlist_id}/items/{item_id}")
async def delete_playlist_item(
    playlist_id: str,
    item_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        playlist = _resolve_playlist(db, playlist_id)

        if playlist.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Only creator can delete items")

        item = db.query(models.PlaylistItem).filter(
            and_(
                models.PlaylistItem.id == item_id,
                models.PlaylistItem.playlist_id == playlist.id,
            )
        ).first()

        if not item:
            raise HTTPException(status_code=404, detail="Item not found")

        db.delete(item)
        db.commit()

        return {"message": "Item deleted successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error deleting item: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/playlists/{playlist_id}/follow")
async def follow_playlist(
    playlist_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        playlist = _resolve_playlist(db, playlist_id)

        existing = db.query(models.PlaylistFollower).filter(
            and_(
                models.PlaylistFollower.playlist_id == playlist.id,
                models.PlaylistFollower.user_id == current_user.id,
            )
        ).first()

        if existing:
            return {"message": "Already following this playlist"}

        follower = models.PlaylistFollower(
            playlist_id=playlist.id,
            user_id=current_user.id,
            completed_items=[],
        )

        db.add(follower)
        playlist.follower_count = (playlist.follower_count or 0) + 1
        db.commit()

        return {"message": "Successfully following playlist"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error following playlist: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/playlists/{playlist_id}/follow")
async def unfollow_playlist(
    playlist_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        playlist = _resolve_playlist(db, playlist_id)

        follower = db.query(models.PlaylistFollower).filter(
            and_(
                models.PlaylistFollower.playlist_id == playlist.id,
                models.PlaylistFollower.user_id == current_user.id,
            )
        ).first()

        if not follower:
            raise HTTPException(status_code=404, detail="Not following this playlist")

        db.delete(follower)

        if playlist:
            playlist.follower_count = max(0, (playlist.follower_count or 0) - 1)

        db.commit()

        return {"message": "Successfully unfollowed playlist"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error unfollowing playlist: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/playlists/{playlist_id}/fork")
async def fork_playlist(
    playlist_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        original = _resolve_playlist(db, playlist_id)

        if not original.is_public and original.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        forked = models.LearningPlaylist(
            creator_id=current_user.id,
            title=f"{original.title} (Fork)",
            description=original.description,
            category=original.category,
            difficulty_level=original.difficulty_level,
            estimated_hours=original.estimated_hours,
            is_public=False,
            is_collaborative=original.is_collaborative,
            cover_color=original.cover_color,
            tags=original.tags,
        )

        db.add(forked)
        db.flush()

        original_items = db.query(models.PlaylistItem).filter(
            models.PlaylistItem.playlist_id == original.id
        ).order_by(models.PlaylistItem.order_index).all()

        for item in original_items:
            forked_item = models.PlaylistItem(
                playlist_id=forked.id,
                order_index=item.order_index,
                item_type=item.item_type,
                item_id=item.item_id,
                title=item.title,
                url=item.url,
                description=item.description,
                duration_minutes=item.duration_minutes,
                is_required=item.is_required,
                notes=item.notes,
            )
            db.add(forked_item)

        fork_record = models.PlaylistFork(
            original_playlist_id=original.id,
            forked_playlist_id=forked.id,
            forked_by_id=current_user.id,
        )
        db.add(fork_record)

        original.fork_count = (original.fork_count or 0) + 1
        db.commit()
        db.refresh(forked)

        return {"id": forked.id, "uid": forked.uid, "message": "Playlist forked successfully"}
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error forking playlist: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/playlists/{playlist_id}/items/{item_id}/view")
async def view_playlist_item(
    playlist_id: str,
    item_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        playlist = _resolve_playlist(db, playlist_id)

        if not playlist.is_public and playlist.creator_id != current_user.id:
            raise HTTPException(status_code=403, detail="Access denied")

        item = db.query(models.PlaylistItem).filter(
            and_(
                models.PlaylistItem.id == item_id,
                models.PlaylistItem.playlist_id == playlist.id,
            )
        ).first()

        if not item:
            raise HTTPException(status_code=404, detail="Item not found")

        if item.item_type == "note" and item.item_id:
            note = db.query(models.Note).filter(models.Note.id == item.item_id).first()
            if note:
                return {
                    "type": "note",
                    "id": note.id,
                    "title": note.title,
                    "content": note.content,
                    "created_at": note.created_at.isoformat() if note.created_at else None,
                    "owner": {
                        "id": note.user_id,
                        "username": note.user.username if note.user else None,
                    },
                    "can_edit": note.user_id == current_user.id,
                }

        elif item.item_type == "chat" and item.item_id:
            chat = db.query(models.ChatSession).filter(models.ChatSession.id == item.item_id).first()
            if chat:
                messages = db.query(models.ChatMessage).filter(
                    models.ChatMessage.chat_session_id == chat.id
                ).order_by(models.ChatMessage.timestamp).all()

                return {
                    "type": "chat",
                    "id": chat.id,
                    "title": chat.title,
                    "messages": [
                        {
                            "id": msg.id,
                            "user_message": msg.user_message,
                            "ai_response": msg.ai_response,
                            "timestamp": msg.timestamp.isoformat() if msg.timestamp else None,
                        }
                        for msg in messages
                    ],
                    "created_at": chat.created_at.isoformat() if chat.created_at else None,
                    "owner": {
                        "id": chat.user_id,
                        "username": chat.user.username if chat.user else None,
                    },
                    "can_edit": chat.user_id == current_user.id,
                }

        return {
            "type": item.item_type,
            "title": item.title,
            "url": item.url,
            "description": item.description,
            "can_edit": False,
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error viewing playlist item: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/playlists/{playlist_id}/progress")
async def update_playlist_progress(
    playlist_id: str,
    item_id: int,
    completed: bool,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    try:
        playlist = _resolve_playlist(db, playlist_id)

        follower = db.query(models.PlaylistFollower).filter(
            and_(
                models.PlaylistFollower.playlist_id == playlist.id,
                models.PlaylistFollower.user_id == current_user.id,
            )
        ).first()

        if not follower:
            raise HTTPException(status_code=404, detail="Not following this playlist")

        completed_items = follower.completed_items or []

        if completed and item_id not in completed_items:
            completed_items.append(item_id)
        elif not completed and item_id in completed_items:
            completed_items.remove(item_id)

        follower.completed_items = completed_items
        follower.last_accessed = datetime.now(timezone.utc)

        total_items = db.query(func.count(models.PlaylistItem.id)).filter(
            models.PlaylistItem.playlist_id == playlist.id
        ).scalar()

        if total_items > 0:
            follower.progress_percentage = (len(completed_items) / total_items) * 100

            if follower.progress_percentage >= 100 and not follower.is_completed:
                follower.is_completed = True
                follower.completed_at = datetime.now(timezone.utc)

                playlist.completion_count = (playlist.completion_count or 0) + 1

        db.commit()

        return {
            "message": "Progress updated",
            "progress_percentage": follower.progress_percentage,
            "completed_items": completed_items,
        }
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error updating progress: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
