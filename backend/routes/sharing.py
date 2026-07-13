import logging
from datetime import datetime, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from sqlalchemy import and_, or_
from sqlalchemy.orm import Session
from jose import JWTError, jwt

import models
from database import get_db
from deps import get_current_user, get_user_by_email, SECRET_KEY, ALGORITHM

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["sharing"])

security = HTTPBearer()


class ShareContentRequest(BaseModel):
    content_type: str
    content_id: int
    friend_ids: List[int]
    message: Optional[str] = None
    permission: str = "view"


@router.post("/share_content")
async def share_content(
    share_data: ShareContentRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"Sharing content for user {current_user.id}")

        if share_data.content_type == "note":
            content = db.query(models.Note).filter(
                models.Note.id == share_data.content_id,
                models.Note.user_id == current_user.id
            ).first()
            if not content:
                raise HTTPException(status_code=404, detail="Note not found or not owned by user")
        elif share_data.content_type == "chat":
            content = db.query(models.ChatSession).filter(
                models.ChatSession.id == share_data.content_id,
                models.ChatSession.user_id == current_user.id
            ).first()
            if not content:
                raise HTTPException(status_code=404, detail="Chat not found or not owned by user")
        else:
            raise HTTPException(status_code=400, detail="Invalid content type")

        shared_records = []
        for friend_id in share_data.friend_ids:
            friendship = db.query(models.Friendship).filter(
                and_(
                    or_(
                        and_(
                            models.Friendship.user_id == current_user.id,
                            models.Friendship.friend_id == friend_id
                        ),
                        and_(
                            models.Friendship.user_id == friend_id,
                            models.Friendship.friend_id == current_user.id
                        )
                    ),
                    models.Friendship.status == "active"
                )
            ).first()

            if not friendship:
                logger.warning(f"User {friend_id} is not a friend of {current_user.id}")
                continue

            existing_share = db.query(models.SharedContent).filter(
                models.SharedContent.owner_id == current_user.id,
                models.SharedContent.shared_with_id == friend_id,
                models.SharedContent.content_type == share_data.content_type,
                models.SharedContent.content_id == share_data.content_id
            ).first()

            if existing_share:
                existing_share.permission = share_data.permission
                existing_share.message = share_data.message
                existing_share.shared_at = datetime.now(timezone.utc)
                shared_records.append(existing_share)
                logger.info(f"Updated existing share for friend {friend_id}")
            else:
                shared_content = models.SharedContent(
                    owner_id=current_user.id,
                    shared_with_id=friend_id,
                    content_type=share_data.content_type,
                    content_id=share_data.content_id,
                    permission=share_data.permission,
                    message=share_data.message,
                    shared_at=datetime.now(timezone.utc)
                )
                db.add(shared_content)
                shared_records.append(shared_content)
                logger.info(f"Created new share for friend {friend_id}")

                content_title = content.title if hasattr(content, "title") else share_data.content_type
                share_notification = models.Notification(
                    user_id=friend_id,
                    title="New Shared Content",
                    message=f"{current_user.username} shared a {share_data.content_type} with you: {content_title}",
                    notification_type="content_shared",
                    is_read=False
                )
                db.add(share_notification)

        db.commit()

        return {
            "success": True,
            "message": f"Content shared with {len(shared_records)} friend(s)",
            "shared_count": len(shared_records)
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sharing content: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/shared_with_me")
def get_shared_with_me(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"Starting shared_with_me endpoint for user: {current_user.id}")

        shared_items = db.query(models.SharedContent).filter(
            models.SharedContent.shared_with_id == current_user.id
        ).order_by(models.SharedContent.shared_at.desc()).all()

        logger.info(f"Found {len(shared_items)} shared items for user {current_user.id}")

        result = []
        for item in shared_items:
            owner = db.query(models.User).filter(models.User.id == item.owner_id).first()
            if not owner:
                logger.warning(f"Owner not found for shared item {item.id}")
                continue

            title = "Untitled"
            content_exists = False

            if item.content_type == "note":
                note = db.query(models.Note).filter(models.Note.id == item.content_id).first()
                if note:
                    title = note.title or "Untitled Note"
                    content_exists = True
                else:
                    title = "Deleted Note"
            elif item.content_type == "chat":
                chat = db.query(models.ChatSession).filter(models.ChatSession.id == item.content_id).first()
                if chat:
                    title = chat.title or "Untitled Chat"
                    content_exists = True
                else:
                    title = "Deleted Chat"

            if content_exists:
                result.append({
                    "id": item.id,
                    "content_type": item.content_type,
                    "content_id": item.content_id,
                    "title": title,
                    "permission": item.permission,
                    "message": item.message,
                    "shared_at": item.shared_at.isoformat() + "Z" if item.shared_at else None,
                    "shared_by": {
                        "id": owner.id,
                        "username": owner.username,
                        "email": owner.email,
                        "first_name": owner.first_name or "",
                        "last_name": owner.last_name or "",
                        "picture_url": owner.picture_url or ""
                    }
                })

        logger.info(f"Returning {len(result)} valid shared items")
        return {"shared_items": result}

    except Exception as e:
        logger.error(f"Error getting shared content: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/debug_friendships")
def debug_friendships(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        friendships = db.query(models.Friendship).filter(
            models.Friendship.user_id == current_user.id
        ).all()

        reverse_friendships = db.query(models.Friendship).filter(
            models.Friendship.friend_id == current_user.id
        ).all()

        result = {
            "user": {
                "id": current_user.id,
                "username": current_user.username
            },
            "friendships": [
                {
                    "id": f.id,
                    "user_id": f.user_id,
                    "friend_id": f.friend_id,
                    "status": f.status,
                    "created_at": f.created_at.isoformat() + "Z"
                }
                for f in friendships
            ],
            "reverse_friendships": [
                {
                    "id": f.id,
                    "user_id": f.user_id,
                    "friend_id": f.friend_id,
                    "status": f.status,
                    "created_at": f.created_at.isoformat() + "Z"
                }
                for f in reverse_friendships
            ],
            "total_friendships": len(friendships) + len(reverse_friendships)
        }

        return result

    except Exception as e:
        return {"error": str(e)}


@router.get("/shared/{content_type}/{content_id}")
def get_shared_content(
    content_type: str,
    content_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"Accessing shared content: {content_type} {content_id} for user: {current_user.id}")

        shared = db.query(models.SharedContent).filter(
            models.SharedContent.content_type == content_type,
            models.SharedContent.content_id == content_id,
            models.SharedContent.shared_with_id == current_user.id
        ).first()

        if content_type == "note":
            content = db.query(models.Note).filter(models.Note.id == content_id).first()
            if not content:
                raise HTTPException(status_code=404, detail="Note not found")

            is_owner = content.user_id == current_user.id
            if not is_owner and not shared:
                raise HTTPException(status_code=403, detail="No access to this note")

            owner = db.query(models.User).filter(models.User.id == content.user_id).first()

            return {
                "content_type": "note",
                "content_id": content.id,
                "title": content.title,
                "content": content.content,
                "canvas_data": getattr(content, "canvas_data", None) or "",
                "created_at": content.created_at.isoformat() + "Z",
                "updated_at": content.updated_at.isoformat() + "Z",
                "permission": shared.permission if shared else "owner",
                "is_owner": is_owner,
                "owner": {
                    "id": owner.id,
                    "username": owner.username,
                    "first_name": owner.first_name or "",
                    "last_name": owner.last_name or "",
                    "picture_url": owner.picture_url or ""
                }
            }

        elif content_type == "chat":
            content = db.query(models.ChatSession).filter(models.ChatSession.id == content_id).first()
            if not content:
                raise HTTPException(status_code=404, detail="Chat not found")

            is_owner = content.user_id == current_user.id
            if not is_owner and not shared:
                raise HTTPException(status_code=403, detail="No access to this chat")

            messages = db.query(models.ChatMessage).filter(
                models.ChatMessage.chat_session_id == content_id
            ).order_by(models.ChatMessage.timestamp.asc()).all()

            owner = db.query(models.User).filter(models.User.id == content.user_id).first()

            return {
                "content_type": "chat",
                "content_id": content.id,
                "title": content.title,
                "created_at": content.created_at.isoformat() + "Z",
                "updated_at": content.updated_at.isoformat() + "Z",
                "permission": shared.permission if shared else "owner",
                "is_owner": is_owner,
                "owner": {
                    "id": owner.id,
                    "username": owner.username,
                    "first_name": owner.first_name or "",
                    "last_name": owner.last_name or "",
                    "picture_url": owner.picture_url or ""
                },
                "messages": [
                    {
                        "user_message": msg.user_message,
                        "ai_response": msg.ai_response,
                        "timestamp": msg.timestamp.isoformat() + "Z"
                    }
                    for msg in messages
                ]
            }
        else:
            raise HTTPException(status_code=400, detail="Invalid content type")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting shared content: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/debug_shared_content")
def debug_shared_content(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        shared_items = db.query(models.SharedContent).filter(
            models.SharedContent.shared_with_id == current_user.id
        ).all()

        owned_shares = db.query(models.SharedContent).filter(
            models.SharedContent.owner_id == current_user.id
        ).all()

        return {
            "user": {
                "id": current_user.id,
                "username": current_user.username,
                "email": current_user.email
            },
            "received_shares": [
                {
                    "id": item.id,
                    "owner_id": item.owner_id,
                    "shared_with_id": item.shared_with_id,
                    "content_type": item.content_type,
                    "content_id": item.content_id,
                    "permission": item.permission,
                    "message": item.message,
                    "shared_at": item.shared_at.isoformat() + "Z" if item.shared_at else None
                }
                for item in shared_items
            ],
            "sent_shares": [
                {
                    "id": item.id,
                    "owner_id": item.owner_id,
                    "shared_with_id": item.shared_with_id,
                    "content_type": item.content_type,
                    "content_id": item.content_id,
                    "permission": item.permission,
                    "message": item.message
                }
                for item in owned_shares
            ],
            "total_received": len(shared_items),
            "total_sent": len(owned_shares)
        }

    except Exception as e:
        return {"error": str(e)}


@router.delete("/remove_shared_access/{share_id}")
def remove_shared_access(
    share_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    try:
        logger.info(f"User {current_user.id} attempting to remove shared access {share_id}")

        shared = db.query(models.SharedContent).filter(
            models.SharedContent.id == share_id
        ).first()

        if not shared:
            logger.error(f"Shared content not found: {share_id}")
            raise HTTPException(status_code=404, detail="Shared content not found")

        can_remove = (shared.shared_with_id == current_user.id) or (shared.owner_id == current_user.id)

        if not can_remove:
            logger.warning(f"User {current_user.id} not authorized to remove share {share_id}")
            raise HTTPException(status_code=403, detail="Not authorized to remove this shared content")

        logger.info(f"Removing shared access: share_id={share_id}, owner={shared.owner_id}, recipient={shared.shared_with_id}")

        db.delete(shared)
        db.commit()

        return {
            "success": True,
            "message": "Access removed successfully",
            "removed_share_id": share_id
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error removing shared access: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.put("/social/update_shared_note/{note_id}")
def update_shared_note(
    note_id: int,
    note_data: dict,
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    try:
        payload = jwt.decode(
            credentials.credentials,
            SECRET_KEY,
            algorithms=[ALGORITHM],
            audience="brainwave-client",
            issuer="brainwave-backend",
        )
        user_email = payload.get("sub")
        user = get_user_by_username(db, user_email) or get_user_by_email(db, user_email)
        if not user:
            raise HTTPException(status_code=404, detail="User not found")

        note = db.query(models.Note).filter(models.Note.id == note_id).first()
        if not note:
            raise HTTPException(status_code=404, detail="Note not found")

        if note.user_id != user.id:
            shared = db.query(models.SharedContent).filter(
                models.SharedContent.content_type == "note",
                models.SharedContent.content_id == note_id,
                models.SharedContent.shared_with_id == user.id,
                models.SharedContent.permission == "edit"
            ).first()

            if not shared:
                raise HTTPException(status_code=403, detail="No edit permission for this note")

        if "content" in note_data:
            note.content = note_data["content"]
        if "title" in note_data:
            note.title = note_data["title"]
        if "canvas_data" in note_data:
            note.canvas_data = note_data["canvas_data"]

        note.updated_at = datetime.now(timezone.utc)
        db.commit()

        return {
            "success": True,
            "message": "Note updated successfully",
            "note": {
                "id": note.id,
                "title": note.title,
                "content": note.content,
                "canvas_data": getattr(note, "canvas_data", None) or "",
                "updated_at": note.updated_at.isoformat() + "Z"
            }
        }

    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating shared note: {str(e)}", exc_info=True)
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")
