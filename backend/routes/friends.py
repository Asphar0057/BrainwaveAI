import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy import and_, func
from sqlalchemy.orm import Session, joinedload

import models
from database import get_db
from deps import get_user_by_username, get_user_by_email, verify_token
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["friends"])


@router.get("/search_users")
async def search_users(
    query: str = Query("", max_length=100),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="Current user not found")

        search_pattern = f"%{query}%"
        users = db.query(models.User).filter(
            and_(
                models.User.id != current_user.id,
                (models.User.username.ilike(search_pattern) | models.User.email.ilike(search_pattern))
            )
        ).order_by(models.User.username.asc()).limit(20).all()

        user_ids = [user.id for user in users]

        comp_profiles_by_user = {
            row.user_id: row for row in db.query(models.ComprehensiveUserProfile).filter(
                models.ComprehensiveUserProfile.user_id.in_(user_ids)
            ).all()
        }
        gam_stats_by_user = {
            row.user_id: row for row in db.query(models.UserGamificationStats).filter(
                models.UserGamificationStats.user_id.in_(user_ids)
            ).all()
        }
        friendships_by_user = {
            row.friend_id: row for row in db.query(models.Friendship).filter(
                and_(
                    models.Friendship.user_id == current_user.id,
                    models.Friendship.friend_id.in_(user_ids)
                )
            ).all()
        }
        pending_sent_by_user = {
            row.receiver_id: row for row in db.query(models.FriendRequest).filter(
                and_(
                    models.FriendRequest.sender_id == current_user.id,
                    models.FriendRequest.receiver_id.in_(user_ids),
                    models.FriendRequest.status == "pending"
                )
            ).all()
        }
        pending_received_by_user = {
            row.sender_id: row for row in db.query(models.FriendRequest).filter(
                and_(
                    models.FriendRequest.sender_id.in_(user_ids),
                    models.FriendRequest.receiver_id == current_user.id,
                    models.FriendRequest.status == "pending"
                )
            ).all()
        }

        result = []
        for user in users:
            comp_profile = comp_profiles_by_user.get(user.id)
            gam_stats = gam_stats_by_user.get(user.id)
            friendship = friendships_by_user.get(user.id)
            pending_request_sent = pending_sent_by_user.get(user.id)
            pending_request_received = pending_received_by_user.get(user.id)

            preferred_subjects = []
            if comp_profile and comp_profile.preferred_subjects:
                try:
                    preferred_subjects = json.loads(comp_profile.preferred_subjects)
                except Exception:
                    preferred_subjects = []

            result.append({
                "id": user.id,
                "username": user.username,
                "email": user.email,
                "first_name": user.first_name or "",
                "last_name": user.last_name or "",
                "picture_url": user.picture_url or "",
                "field_of_study": user.field_of_study or "",
                "preferred_subjects": preferred_subjects,
                "stats": {
                    "ai_chats": gam_stats.total_ai_chats if gam_stats else 0,
                    "flashcards": gam_stats.total_flashcards_created if gam_stats else 0,
                    "notes": gam_stats.total_notes_created if gam_stats else 0,
                    "quizzes": gam_stats.total_quizzes_completed if gam_stats else 0
                },
                "is_friend": friendship is not None,
                "request_sent": pending_request_sent is not None,
                "request_received": pending_request_received is not None
            })

        return {"users": result}

    except Exception as e:
        logger.error(f"Error searching users: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/send_friend_request")
async def send_friend_request(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="Current user not found")

        receiver_id = payload.get("receiver_id")
        if not receiver_id:
            raise HTTPException(status_code=400, detail="receiver_id is required")

        receiver = db.query(models.User).filter(models.User.id == receiver_id).first()
        if not receiver:
            raise HTTPException(status_code=404, detail="Receiver not found")

        existing_friendship = db.query(models.Friendship).filter(
            and_(
                models.Friendship.user_id == current_user.id,
                models.Friendship.friend_id == receiver_id
            )
        ).first()

        if existing_friendship:
            raise HTTPException(status_code=400, detail="Already friends")

        existing_request = db.query(models.FriendRequest).filter(
            and_(
                models.FriendRequest.sender_id == current_user.id,
                models.FriendRequest.receiver_id == receiver_id,
                models.FriendRequest.status == "pending"
            )
        ).first()

        if existing_request:
            raise HTTPException(status_code=400, detail="Friend request already sent")

        friend_request = models.FriendRequest(
            sender_id=current_user.id,
            receiver_id=receiver_id,
            status="pending"
        )
        db.add(friend_request)

        notification = models.Notification(
            user_id=receiver_id,
            title="New Friend Request",
            message=f"{current_user.username} wants to be your friend!",
            notification_type="friend_request",
            is_read=False
        )
        db.add(notification)
        db.commit()

        return {
            "status": "success",
            "message": "Friend request sent successfully"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending friend request: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/friend_requests")
async def get_friend_requests(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="Current user not found")

        received_requests = db.query(models.FriendRequest).options(
            joinedload(models.FriendRequest.sender)
        ).filter(
            and_(
                models.FriendRequest.receiver_id == current_user.id,
                models.FriendRequest.status == "pending"
            )
        ).order_by(models.FriendRequest.created_at.desc()).all()

        sent_requests = db.query(models.FriendRequest).options(
            joinedload(models.FriendRequest.receiver)
        ).filter(
            and_(
                models.FriendRequest.sender_id == current_user.id,
                models.FriendRequest.status == "pending"
            )
        ).order_by(models.FriendRequest.created_at.desc()).all()

        received_result = []
        for req in received_requests:
            sender = req.sender
            received_result.append({
                "request_id": req.id,
                "user_id": sender.id,
                "username": sender.username,
                "email": sender.email,
                "first_name": sender.first_name or "",
                "last_name": sender.last_name or "",
                "picture_url": sender.picture_url or "",
                "created_at": req.created_at.isoformat() + "Z"
            })

        sent_result = []
        for req in sent_requests:
            receiver = req.receiver
            sent_result.append({
                "request_id": req.id,
                "user_id": receiver.id,
                "username": receiver.username,
                "email": receiver.email,
                "first_name": receiver.first_name or "",
                "last_name": receiver.last_name or "",
                "picture_url": receiver.picture_url or "",
                "created_at": req.created_at.isoformat() + "Z"
            })

        return {
            "received": received_result,
            "sent": sent_result
        }

    except Exception as e:
        logger.error(f"Error getting friend requests: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/respond_friend_request")
async def respond_friend_request(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="Current user not found")

        request_id = payload.get("request_id")
        action = payload.get("action")

        if not request_id or not action:
            raise HTTPException(status_code=400, detail="request_id and action are required")

        friend_request = db.query(models.FriendRequest).filter(
            and_(
                models.FriendRequest.id == request_id,
                models.FriendRequest.receiver_id == current_user.id,
                models.FriendRequest.status == "pending"
            )
        ).first()

        if not friend_request:
            raise HTTPException(status_code=404, detail="Friend request not found")

        if action == "accept":
            friend_request.status = "accepted"
            friend_request.responded_at = datetime.now(timezone.utc)

            friendship1 = models.Friendship(
                user_id=current_user.id,
                friend_id=friend_request.sender_id
            )
            friendship2 = models.Friendship(
                user_id=friend_request.sender_id,
                friend_id=current_user.id
            )

            db.add(friendship1)
            db.add(friendship2)

            notification = models.Notification(
                user_id=friend_request.sender_id,
                title="Friend Request Accepted!",
                message=f"{current_user.username} accepted your friend request. You're now friends!",
                notification_type="friend_accepted",
                is_read=False
            )
            db.add(notification)
            db.commit()

            return {
                "status": "success",
                "message": "Friend request accepted"
            }

        elif action == "reject":
            friend_request.status = "rejected"
            friend_request.responded_at = datetime.now(timezone.utc)
            notification = models.Notification(
                user_id=friend_request.sender_id,
                title="Friend Request Declined",
                message=f"{current_user.username} declined your friend request.",
                notification_type="friend_rejected",
                is_read=False
            )
            db.add(notification)
            db.commit()

            return {
                "status": "success",
                "message": "Friend request rejected"
            }

        else:
            raise HTTPException(status_code=400, detail="Invalid action")

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error responding to friend request: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/friends")
async def get_friends(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="Current user not found")

        friendships = db.query(models.Friendship).options(
            joinedload(models.Friendship.friend)
        ).filter(
            models.Friendship.user_id == current_user.id
        ).order_by(models.Friendship.created_at.desc()).all()

        friend_ids = [friendship.friend_id for friendship in friendships]
        comp_profiles_by_user = {
            row.user_id: row for row in db.query(models.ComprehensiveUserProfile).filter(
                models.ComprehensiveUserProfile.user_id.in_(friend_ids)
            ).all()
        }
        gam_stats_by_user = {
            row.user_id: row for row in db.query(models.UserGamificationStats).filter(
                models.UserGamificationStats.user_id.in_(friend_ids)
            ).all()
        }

        result = []
        for friendship in friendships:
            friend = friendship.friend

            comp_profile = comp_profiles_by_user.get(friend.id)
            gam_stats = gam_stats_by_user.get(friend.id)

            preferred_subjects = []
            if comp_profile and comp_profile.preferred_subjects:
                try:
                    preferred_subjects = json.loads(comp_profile.preferred_subjects)
                except Exception:
                    preferred_subjects = []

            result.append({
                "id": friend.id,
                "username": friend.username,
                "email": friend.email,
                "first_name": friend.first_name or "",
                "last_name": friend.last_name or "",
                "picture_url": friend.picture_url or "",
                "field_of_study": friend.field_of_study or "",
                "preferred_subjects": preferred_subjects,
                "stats": {
                    "ai_chats": gam_stats.total_ai_chats if gam_stats else 0,
                    "flashcards": gam_stats.total_flashcards_created if gam_stats else 0,
                    "notes": gam_stats.total_notes_created if gam_stats else 0,
                    "quizzes": gam_stats.total_quizzes_completed if gam_stats else 0
                },
                "friends_since": friendship.created_at.isoformat() + "Z"
            })

        return {"friends": result}

    except Exception as e:
        logger.error(f"Error getting friends: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.delete("/remove_friend")
async def remove_friend(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="Current user not found")

        friend_id = payload.get("friend_id")
        if not friend_id:
            raise HTTPException(status_code=400, detail="friend_id is required")

        db.query(models.Friendship).filter(
            and_(
                models.Friendship.user_id == current_user.id,
                models.Friendship.friend_id == friend_id
            )
        ).delete()

        db.query(models.Friendship).filter(
            and_(
                models.Friendship.user_id == friend_id,
                models.Friendship.friend_id == current_user.id
            )
        ).delete()

        notification = models.Notification(
            user_id=friend_id,
            title="Friend Removed",
            message=f"{current_user.username} removed you from their friends list.",
            notification_type="friend_removed",
            is_read=False
        )
        db.add(notification)

        db.commit()

        return {
            "status": "success",
            "message": "Friend removed successfully"
        }

    except Exception as e:
        logger.error(f"Error removing friend: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/friend_activity_feed")
async def get_friend_activity_feed(
    username: str = Depends(verify_token),
    db: Session = Depends(get_db),
    limit: int = Query(50, le=100)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        friendships = db.query(models.Friendship).filter(
            models.Friendship.user_id == current_user.id
        ).all()
        friend_ids = [f.friend_id for f in friendships]

        if not friend_ids:
            return {"activities": []}

        activities = db.query(models.FriendActivity).options(
            joinedload(models.FriendActivity.user)
        ).filter(
            models.FriendActivity.user_id.in_(friend_ids)
        ).order_by(models.FriendActivity.created_at.desc()).limit(limit).all()

        activity_ids = [activity.id for activity in activities]
        kudos_counts_by_activity = dict(
            db.query(models.Kudos.activity_id, func.count(models.Kudos.id))
            .filter(models.Kudos.activity_id.in_(activity_ids))
            .group_by(models.Kudos.activity_id)
            .all()
        )
        user_kudos_activity_ids = {
            row.activity_id for row in db.query(models.Kudos.activity_id).filter(
                and_(
                    models.Kudos.activity_id.in_(activity_ids),
                    models.Kudos.user_id == current_user.id
                )
            ).all()
        }

        result = []
        for activity in activities:
            kudos_count = kudos_counts_by_activity.get(activity.id, 0)
            user_gave_kudos = activity.id in user_kudos_activity_ids

            result.append({
                "id": activity.id,
                "user": {
                    "id": activity.user.id,
                    "username": activity.user.username,
                    "first_name": activity.user.first_name or "",
                    "last_name": activity.user.last_name or "",
                    "picture_url": activity.user.picture_url or ""
                },
                "activity_type": activity.activity_type,
                "title": activity.title,
                "description": activity.description or "",
                "icon": activity.icon or "Trophy",
                "metadata": json.loads(activity.activity_data) if activity.activity_data else {},
                "kudos_count": kudos_count,
                "user_gave_kudos": user_gave_kudos,
                "created_at": activity.created_at.isoformat() + "Z"
            })

        return {"activities": result}

    except Exception as e:
        logger.error(f"Error fetching friend activity feed: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/give_kudos")
async def give_kudos(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        activity_id = payload.get("activity_id")
        reaction_type = payload.get("reaction_type", "👏")

        if not activity_id:
            raise HTTPException(status_code=400, detail="activity_id is required")

        existing = db.query(models.Kudos).filter(
            and_(
                models.Kudos.activity_id == activity_id,
                models.Kudos.user_id == current_user.id
            )
        ).first()

        if existing:
            db.delete(existing)
            db.commit()
            return {"status": "removed", "message": "Kudos removed"}
        else:
            kudos = models.Kudos(
                activity_id=activity_id,
                user_id=current_user.id,
                reaction_type=reaction_type
            )
            db.add(kudos)
            db.commit()
            return {"status": "added", "message": "Kudos given"}

    except Exception as e:
        logger.error(f"Error giving kudos: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.post("/create_activity")
async def create_activity(
    payload: dict = Body(...),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        activity = models.FriendActivity(
            user_id=current_user.id,
            activity_type=payload.get("activity_type"),
            title=payload.get("title"),
            description=payload.get("description", ""),
            icon=payload.get("icon", "Trophy"),
            activity_data=json.dumps(payload.get("metadata", {}))
        )

        db.add(activity)
        db.commit()

        return {"status": "success", "activity_id": activity.id}

    except Exception as e:
        logger.error(f"Error creating activity: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")


@router.get("/leaderboard")
async def get_leaderboard(
    category: str = Query("global", pattern="^(global|friends|subject|archetype)$"),
    limit: int = Query(50, le=100),
    username: str = Depends(verify_token),
    db: Session = Depends(get_db)
):
    try:
        current_user = get_user_by_username(db, username) or get_user_by_email(db, username)
        if not current_user:
            raise HTTPException(status_code=404, detail="User not found")

        if category == "friends":
            friendships = db.query(models.Friendship).filter(
                models.Friendship.user_id == current_user.id
            ).all()
            user_ids = [f.friend_id for f in friendships] + [current_user.id]
        else:
            user_ids = None

        query = db.query(models.UserGamificationStats, models.User).join(
            models.User, models.UserGamificationStats.user_id == models.User.id
        )

        if user_ids:
            query = query.filter(models.UserGamificationStats.user_id.in_(user_ids))

        results = query.order_by(
            models.UserGamificationStats.total_points.desc(),
            models.UserGamificationStats.user_id.asc(),
        ).limit(limit).all()

        leaderboard = []
        for rank, (stats, user) in enumerate(results, start=1):
            leaderboard.append({
                "rank": rank,
                "user_id": user.id,
                "username": user.username,
                "first_name": user.first_name or "",
                "last_name": user.last_name or "",
                "picture_url": user.picture_url or "",
                "score": stats.total_points or 0,
                "total_points": stats.total_points or 0,
                "level": stats.level or 1,
                "experience": stats.experience or 0,
                "metric": "xp",
                "is_current_user": user.id == current_user.id
            })

        current_user_rank = next((item for item in leaderboard if item["is_current_user"]), None)
        if current_user_rank is None:
            current_stats = db.query(models.UserGamificationStats).filter(
                models.UserGamificationStats.user_id == current_user.id
            ).first()
            if current_stats and (not user_ids or current_user.id in user_ids):
                current_points = current_stats.total_points or 0
                rank_query = db.query(models.UserGamificationStats).filter(
                    (
                        models.UserGamificationStats.total_points > current_points
                    ) | (
                        (models.UserGamificationStats.total_points == current_points)
                        & (models.UserGamificationStats.user_id < current_user.id)
                    )
                )
                if user_ids:
                    rank_query = rank_query.filter(
                        models.UserGamificationStats.user_id.in_(user_ids)
                    )
                current_user_rank = {
                    "rank": rank_query.count() + 1,
                    "user_id": current_user.id,
                    "username": current_user.username,
                    "first_name": current_user.first_name or "",
                    "last_name": current_user.last_name or "",
                    "picture_url": current_user.picture_url or "",
                    "score": current_points,
                    "total_points": current_points,
                    "level": current_stats.level or 1,
                    "experience": current_stats.experience or 0,
                    "metric": "xp",
                    "is_current_user": True,
                }

        return {
            "leaderboard": leaderboard,
            "current_user_rank": current_user_rank,
            "category": category,
            "metric": "xp",
            "period": "all_time"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fetching leaderboard: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
