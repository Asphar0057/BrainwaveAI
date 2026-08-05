import logging
import os
from datetime import datetime, timedelta, timezone
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, Body
from sqlalchemy.orm import Session

import models
from database import get_db
from deps import get_current_user

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["notifications"])

def _assert_user_matches_request(user_id: Optional[str], current_user: models.User) -> None:
    if user_id is None:
        return
    requested = str(user_id).strip().lower()
    allowed = {
        (current_user.username or "").strip().lower(),
        (current_user.email or "").strip().lower(),
    }
    if requested and requested not in allowed:
        raise HTTPException(status_code=403, detail="Access denied")

def _parse_hours_list(raw: str) -> List[float]:
    hours = []
    for part in (raw or "").split(","):
        part = part.strip()
        if not part:
            continue
        try:
            hours.append(float(part))
        except ValueError:
            continue
    return sorted(set(hours))

def _normalize_dt(dt: Optional[datetime]) -> Optional[datetime]:
    if not dt:
        return None
    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

def _safe_notify_before_minutes(reminder: models.Reminder, default: int = 15) -> int:
    try:
        value = reminder.notify_before_minutes
        if value is None:
            return default
        return int(value)
    except Exception:
        return default

def _format_offline_duration(hours: float) -> str:
    if hours < 24:
        rounded = max(1, int(hours))
        return f"{rounded} hour{'s' if rounded != 1 else ''}"
    days = int(hours // 24)
    return f"{days} day{'s' if days != 1 else ''}"

def _get_reminder_notif_meta(reminder: models.Reminder) -> tuple[str, str]:
    notif_type = "calendar_event" if reminder.reminder_type in ("event", "calendar_event") else "reminder"
    title_prefix = "Event" if notif_type == "calendar_event" else "Reminder"
    return notif_type, title_prefix

def _reminder_notification_marker(reminder_id: int) -> str:
    return f"[reminder_id:{reminder_id}]"

def _reminder_due_at_marker(reminder_dt: datetime) -> str:
    return f"[reminder_due_at:{reminder_dt.isoformat()}]"

@router.get("/get_notifications")
async def get_notifications(
    user_id: str = Query(...),
    timezone_offset: int = Query(0),
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user

        now = _normalize_dt(datetime.now(timezone.utc))
        reminder_now = now - timedelta(minutes=timezone_offset)
        try:
            reminder_candidates = db.query(models.Reminder).filter(
                models.Reminder.user_id == user.id,
                models.Reminder.is_completed == False,
                models.Reminder.reminder_date != None
            ).all()

            for reminder in reminder_candidates:
                notif_type, title_prefix = _get_reminder_notif_meta(reminder)
                reminder_dt = _normalize_dt(reminder.reminder_date)
                if not reminder_dt:
                    continue
                time_until = reminder_dt - reminder_now
                minutes_until = time_until.total_seconds() / 60
                notify_before = _safe_notify_before_minutes(reminder)

                if minutes_until <= notify_before:
                    notification_title = f"{title_prefix}: {reminder.title}"
                    notification_marker = _reminder_notification_marker(reminder.id)
                    due_at_marker = _reminder_due_at_marker(reminder_dt)
                    existing = db.query(models.Notification).filter(
                        models.Notification.user_id == user.id,
                        models.Notification.notification_type == notif_type,
                        models.Notification.message.contains(notification_marker)
                    ).first()

                    if existing:
                        if not reminder.is_notified:
                            reminder.is_notified = True
                            db.commit()
                        continue

                    claimed_reminder = False
                    if not reminder.is_notified:
                        claimed_reminder = db.query(models.Reminder).filter(
                            models.Reminder.id == reminder.id,
                            models.Reminder.user_id == user.id,
                            models.Reminder.is_notified == False,
                        ).update({"is_notified": True}, synchronize_session=False) == 1

                    if claimed_reminder:
                        reminder_time = reminder_dt.strftime("%I:%M %p")
                        notification = models.Notification(
                            user_id=user.id,
                            title=notification_title,
                            message=f"{reminder.description or 'Upcoming reminder'} - Due at {reminder_time} {notification_marker} {due_at_marker}",
                            notification_type=notif_type
                        )
                        db.add(notification)
                        logger.info(f"Created reminder notification for: {reminder.title}")
                    db.commit()
        except Exception as e:
            logger.error(f"Error generating reminder notifications: {str(e)}", exc_info=True)

        notifications = db.query(models.Notification).filter(
            models.Notification.user_id == user.id
        ).order_by(models.Notification.created_at.desc()).limit(limit).all()

        return {
            "notifications": [
                {
                    "id": n.id,
                    "title": n.title,
                    "message": n.message,
                    "notification_type": n.notification_type,
                    "is_read": n.is_read,
                    "created_at": n.created_at.isoformat() + 'Z'
                }
                for n in notifications
            ]
        }
    except HTTPException as he:
        logger.error(f"HTTPException in get_notifications: {he.detail}")
        raise
    except Exception as e:
        logger.error(f"Error getting notifications: {str(e)}", exc_info=True)
        return {"notifications": []}

@router.put("/mark_notification_read/{notification_id}")
async def mark_notification_read(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        notification = db.query(models.Notification).filter(
            models.Notification.id == notification_id,
            models.Notification.user_id == current_user.id,
        ).first()

        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")

        notification.is_read = True
        db.commit()

        return {"status": "success", "message": "Notification marked as read"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking notification as read: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/mark_all_notifications_read")
async def mark_all_notifications_read(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user

        db.query(models.Notification).filter(
            models.Notification.user_id == user.id,
            models.Notification.is_read == False
        ).update({"is_read": True})

        db.commit()

        return {"status": "success", "message": "All notifications marked as read"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error marking all notifications as read: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/create_notification")
async def create_notification(
    payload: dict = Body(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        user_id = payload.get("user_id")
        title = payload.get("title")
        message = payload.get("message")
        notification_type = payload.get("notification_type", "general")

        _assert_user_matches_request(user_id, current_user)
        user = current_user

        notification = models.Notification(
            user_id=user.id,
            title=title,
            message=message,
            notification_type=notification_type
        )

        db.add(notification)
        db.commit()
        db.refresh(notification)

        return {
            "status": "success",
            "notification_id": notification.id,
            "message": "Notification created"
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error creating notification: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/debug_notifications")
async def debug_notifications(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user

        notifications = db.query(models.Notification).filter(
            models.Notification.user_id == user.id
        ).order_by(models.Notification.created_at.desc()).limit(200).all()

        return {
            "user_id": user.id,
            "username": user.username,
            "total_notifications": len(notifications),
            "notifications": [
                {
                    "id": n.id,
                    "title": n.title,
                    "message": n.message[:100],
                    "type": n.notification_type,
                    "is_read": n.is_read,
                    "created_at": str(n.created_at)
                }
                for n in notifications
            ]
        }
    except Exception as e:
        logger.error("notification error: %s", e, exc_info=True)
        return {"error": "Internal server error"}

@router.delete("/delete_notification/{notification_id}")
async def delete_notification(
    notification_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        notification = db.query(models.Notification).filter(
            models.Notification.id == notification_id,
            models.Notification.user_id == current_user.id,
        ).first()

        if not notification:
            raise HTTPException(status_code=404, detail="Notification not found")

        db.delete(notification)
        db.commit()

        return {"status": "success", "message": "Notification deleted"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting notification: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/clear_old_notifications")
async def clear_old_notifications(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user
        logger.info(f"Clearing old notifications for user_id={user.id}")

        thirty_days_ago = datetime.now(timezone.utc) - timedelta(days=30)
        deleted = db.query(models.Notification).filter(
            models.Notification.user_id == user.id,
            models.Notification.created_at < thirty_days_ago,
        ).delete()

        db.commit()

        logger.info(f"Cleared {deleted} old notifications for user_id={user.id}")
        return {"status": "success", "cleared": deleted, "message": f"Cleared {deleted} old notifications"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error clearing notifications: %s", e, exc_info=True)
        return {"status": "error", "cleared": 0, "message": "Internal server error"}

@router.delete("/clear_all_notifications")
async def clear_all_notifications(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user
        logger.info(f"Clearing ALL notifications for user_id={user.id}")

        deleted = db.query(models.Notification).filter(
            models.Notification.user_id == user.id
        ).delete()

        db.commit()

        logger.info(f"Cleared {deleted} notifications for user_id={user.id}")
        return {"status": "success", "cleared": deleted, "message": f"Cleared {deleted} notifications"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error("Error clearing all notifications: %s", e, exc_info=True)
        db.rollback()
        return {"status": "error", "cleared": 0, "message": "Internal server error"}

@router.get("/check_reminder_notifications")
async def check_reminder_notifications(
    user_id: str = Query(...),
    current_time: str = Query(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user

        if current_time:
            try:
                now = datetime.fromisoformat(current_time.replace('Z', '').replace('+00:00', ''))
                logger.info(f"Using client time: {now}")
            except Exception:
                now = datetime.now(timezone.utc)
                logger.info(f"Failed to parse client time, using server time: {now}")
        else:
            now = datetime.now(timezone.utc)
            logger.info(f"No client time provided, using server time: {now}")
        now = _normalize_dt(now)

        notifications_created = []

        pending_reminders = db.query(models.Reminder).filter(
            models.Reminder.user_id == user.id,
            models.Reminder.is_completed == False,
            models.Reminder.is_notified == False,
            models.Reminder.reminder_date != None
        ).all()

        logger.info(f"Found {len(pending_reminders)} pending reminders for user {user_id}")

        for reminder in pending_reminders:
            reminder_dt = _normalize_dt(reminder.reminder_date)
            if not reminder_dt:
                continue

            time_until = reminder_dt - now
            minutes_until = time_until.total_seconds() / 60

            notify_before = _safe_notify_before_minutes(reminder)
            logger.info(f"Reminder '{reminder.title}': scheduled={reminder_dt}, now={now}, minutes_until={minutes_until:.1f}, notify_before={notify_before}")

            notify_window_start = notify_before
            is_in_notify_window = minutes_until <= notify_window_start and minutes_until >= -30

            if is_in_notify_window:
                notif_type, title_prefix = _get_reminder_notif_meta(reminder)
                existing_notification = db.query(models.Notification).filter(
                    models.Notification.user_id == user.id,
                    models.Notification.notification_type == notif_type,
                    models.Notification.title.contains(reminder.title),
                    models.Notification.created_at >= datetime.now(timezone.utc) - timedelta(hours=1)
                ).first()

                if existing_notification:
                    logger.info(f"Skipping duplicate notification for: {reminder.title}")
                    continue

                reminder_time = reminder.reminder_date.strftime('%I:%M %p')
                reminder_date_str = reminder.reminder_date.strftime('%B %d, %Y at %I:%M %p')

                base_title = f"{title_prefix}: {reminder.title}"
                if minutes_until <= 0:
                    notification = models.Notification(
                        user_id=user.id,
                        title=f"{base_title} - NOW!",
                        message=f"{reminder.description or 'Your event is happening now!'} - Scheduled for {reminder_time}",
                        notification_type=notif_type
                    )
                elif minutes_until <= 5:
                    notification = models.Notification(
                        user_id=user.id,
                        title=f"{base_title} - In {int(minutes_until)} min!",
                        message=f"{reminder.description or 'Your reminder is coming up!'} - Due at {reminder_time}",
                        notification_type=notif_type
                    )
                else:
                    notification = models.Notification(
                        user_id=user.id,
                        title=f"{base_title}",
                        message=f"{reminder.description or 'Your scheduled reminder'} - Due at {reminder_time} (in {int(minutes_until)} min)",
                        notification_type=notif_type
                    )

                db.add(notification)
                reminder.is_notified = True

                notifications_created.append({
                    "reminder_id": reminder.id,
                    "title": reminder.title,
                    "minutes_until": round(minutes_until),
                    "reminder_time": reminder_date_str
                })

                logger.info(f"Created reminder notification for: {reminder.title} at {reminder_date_str}")

        if notifications_created:
            db.commit()
            logger.info(f"Created {len(notifications_created)} reminder notifications")

        return {
            "status": "success",
            "notifications_created": len(notifications_created),
            "details": notifications_created,
            "server_time": datetime.now(timezone.utc).isoformat(),
            "client_time_received": current_time
        }
    except Exception as e:
        logger.error(f"Error checking reminder notifications: {str(e)}")
        logger.error("reminder notification check error: %s", e, exc_info=True)
        db.rollback()
        return {"status": "error", "message": "Internal server error", "notifications_created": 0}
