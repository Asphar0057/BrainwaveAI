import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import APIRouter, Depends, Form, HTTPException, Query
from sqlalchemy import and_, func
from sqlalchemy.orm import Session

import models
from database import get_db
from deps import get_current_user, get_user_by_email, get_user_by_username

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["reminders"])

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

def serialize_reminder(r):
    return {
        "id": r.id,
        "list_id": r.list_id,
        "parent_id": r.parent_id,
        "title": r.title,
        "description": r.description,
        "notes": r.notes,
        "url": r.url,
        "reminder_date": r.reminder_date.isoformat() if r.reminder_date else None,
        "due_date": r.due_date.isoformat() if r.due_date else None,
        "reminder_type": r.reminder_type,
        "priority": r.priority,
        "color": r.color,
        "is_completed": r.is_completed,
        "completed_at": r.completed_at.isoformat() + "Z" if r.completed_at else None,
        "is_flagged": r.is_flagged,
        "is_notified": r.is_notified,
        "notify_before_minutes": r.notify_before_minutes,
        "recurring": r.recurring,
        "recurring_interval": r.recurring_interval,
        "recurring_end_date": r.recurring_end_date.isoformat() if r.recurring_end_date else None,
        "location": r.location,
        "tags": json.loads(r.tags) if r.tags else [],
        "sort_order": r.sort_order,
        "created_at": r.created_at.isoformat() + "Z",
        "subtasks": [serialize_reminder(s) for s in r.subtasks] if r.subtasks else [],
    }

def _get_reminder_notif_meta(reminder: models.Reminder) -> tuple[str, str]:
    notif_type = "calendar_event" if reminder.reminder_type in ("event", "calendar_event") else "reminder"
    title_prefix = "Event" if notif_type == "calendar_event" else "Reminder"
    return notif_type, title_prefix

def _reminder_notification_marker(reminder_id: int) -> str:
    return f"[reminder_id:{reminder_id}]"

def _reminder_due_at_marker(reminder_dt: datetime) -> str:
    return f"[reminder_due_at:{reminder_dt.isoformat()}]"

def _safe_notify_before_minutes(reminder: models.Reminder, default: int = 15) -> int:
    try:
        return int(reminder.notify_before_minutes if reminder.notify_before_minutes is not None else default)
    except Exception:
        return default

def _local_now_from_offset(timezone_offset: int = 0) -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=timezone_offset or 0)

def _create_due_reminder_notification(
    db: Session,
    user: models.User,
    reminder: models.Reminder,
    timezone_offset: int = 0,
) -> bool:
    if not reminder.reminder_date or reminder.is_completed:
        return False

    reminder_dt = reminder.reminder_date
    if reminder_dt.tzinfo is not None:
        reminder_dt = reminder_dt.astimezone(timezone.utc).replace(tzinfo=None)

    minutes_until = (reminder_dt - _local_now_from_offset(timezone_offset)).total_seconds() / 60
    if minutes_until > _safe_notify_before_minutes(reminder):
        return False

    notif_type, title_prefix = _get_reminder_notif_meta(reminder)
    notification_title = f"{title_prefix}: {reminder.title}"
    notification_marker = _reminder_notification_marker(reminder.id)
    due_at_marker = _reminder_due_at_marker(reminder_dt)
    existing = db.query(models.Notification).filter(
        models.Notification.user_id == user.id,
        models.Notification.notification_type == notif_type,
        models.Notification.message.contains(notification_marker),
    ).first()
    if existing:
        if not reminder.is_notified:
            reminder.is_notified = True
            db.commit()
        return False

    claimed_reminder = False
    if not reminder.is_notified:
        claimed_reminder = db.query(models.Reminder).filter(
            models.Reminder.id == reminder.id,
            models.Reminder.user_id == user.id,
            models.Reminder.is_notified == False,
        ).update({"is_notified": True}, synchronize_session=False) == 1

    if not claimed_reminder:
        return False

    reminder_time = reminder_dt.strftime("%I:%M %p")
    base_title = notification_title
    if minutes_until <= 0:
        title = f"{base_title} - NOW!"
        message = f"{reminder.description or 'Your reminder is due now.'} - Scheduled for {reminder_time}"
    elif minutes_until <= 5:
        title = f"{base_title} - In {max(1, int(minutes_until))} min!"
        message = f"{reminder.description or 'Your reminder is coming up.'} - Due at {reminder_time}"
    else:
        title = base_title
        message = f"{reminder.description or 'Your scheduled reminder'} - Due at {reminder_time} (in {int(minutes_until)} min)"
    message = f"{message} {notification_marker} {due_at_marker}"

    notification = models.Notification(
        user_id=user.id,
        title=title,
        message=message,
        notification_type=notif_type,
    )
    db.add(notification)
    db.commit()
    logger.info(f"Created reminder notification for: {reminder.title}")
    return True

async def create_next_recurring_reminder(db: Session, original: models.Reminder):
    if not original.reminder_date or original.recurring == "none":
        return

    next_date = original.reminder_date
    interval = original.recurring_interval or 1

    if original.recurring == "daily":
        next_date += timedelta(days=interval)
    elif original.recurring == "weekly":
        next_date += timedelta(weeks=interval)
    elif original.recurring == "monthly":
        month = next_date.month + interval
        year = next_date.year + (month - 1) // 12
        month = ((month - 1) % 12) + 1
        day = min(
            next_date.day,
            [31, 29 if year % 4 == 0 else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1],
        )
        next_date = next_date.replace(year=year, month=month, day=day)
    elif original.recurring == "yearly":
        next_date = next_date.replace(year=next_date.year + interval)

    if original.recurring_end_date and next_date > original.recurring_end_date:
        return

    new_reminder = models.Reminder(
        user_id=original.user_id,
        list_id=original.list_id,
        title=original.title,
        description=original.description,
        notes=original.notes,
        url=original.url,
        reminder_date=next_date,
        due_date=original.due_date,
        reminder_type=original.reminder_type,
        priority=original.priority,
        color=original.color,
        is_flagged=original.is_flagged,
        notify_before_minutes=original.notify_before_minutes,
        recurring=original.recurring,
        recurring_interval=original.recurring_interval,
        recurring_end_date=original.recurring_end_date,
        location=original.location,
        tags=original.tags,
    )

    db.add(new_reminder)
    db.commit()

@router.post("/create_reminder_list")
async def create_reminder_list(
    user_id: str = Form(...),
    name: str = Form(...),
    color: str = Form("#3b82f6"),
    icon: str = Form("list"),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user

        max_order = (
            db.query(func.max(models.ReminderList.sort_order))
            .filter(models.ReminderList.user_id == user.id)
            .scalar()
            or 0
        )

        reminder_list = models.ReminderList(
            user_id=user.id,
            name=name,
            color=color,
            icon=icon,
            sort_order=max_order + 1,
        )

        db.add(reminder_list)
        db.commit()
        db.refresh(reminder_list)

        return {
            "id": reminder_list.id,
            "name": reminder_list.name,
            "color": reminder_list.color,
            "icon": reminder_list.icon,
            "sort_order": reminder_list.sort_order,
            "reminder_count": 0,
        }
    except Exception as e:
        logger.error(f"Error creating reminder list: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_reminder_lists")
async def get_reminder_lists(
    user_id: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user

        lists = (
            db.query(models.ReminderList)
            .filter(
                models.ReminderList.user_id == user.id,
                models.ReminderList.is_smart_list == False,
            )
            .order_by(models.ReminderList.sort_order)
            .all()
        )

        result = []
        for lst in lists:
            count = (
                db.query(models.Reminder)
                .filter(
                    models.Reminder.list_id == lst.id,
                    models.Reminder.is_completed == False,
                    models.Reminder.parent_id == None,
                )
                .count()
            )
            result.append(
                {
                    "id": lst.id,
                    "name": lst.name,
                    "color": lst.color,
                    "icon": lst.icon,
                    "sort_order": lst.sort_order,
                    "reminder_count": count,
                }
            )

        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow = today + timedelta(days=1)

        today_count = (
            db.query(models.Reminder)
            .filter(
                models.Reminder.user_id == user.id,
                models.Reminder.is_completed == False,
                models.Reminder.reminder_date >= today,
                models.Reminder.reminder_date < tomorrow,
            )
            .count()
        )

        scheduled_count = (
            db.query(models.Reminder)
            .filter(
                models.Reminder.user_id == user.id,
                models.Reminder.is_completed == False,
                models.Reminder.reminder_date != None,
            )
            .count()
        )

        flagged_count = (
            db.query(models.Reminder)
            .filter(
                models.Reminder.user_id == user.id,
                models.Reminder.is_completed == False,
                models.Reminder.is_flagged == True,
            )
            .count()
        )

        all_count = (
            db.query(models.Reminder)
            .filter(
                models.Reminder.user_id == user.id,
                models.Reminder.is_completed == False,
                models.Reminder.parent_id == None,
            )
            .count()
        )

        completed_count = (
            db.query(models.Reminder)
            .filter(
                models.Reminder.user_id == user.id,
                models.Reminder.is_completed == True,
            )
            .count()
        )

        smart_lists = {
            "today": today_count,
            "scheduled": scheduled_count,
            "flagged": flagged_count,
            "all": all_count,
            "completed": completed_count,
        }

        return {"lists": result, "smart_lists": smart_lists}
    except Exception as e:
        logger.error(f"Error getting reminder lists: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/update_reminder_list/{list_id}")
async def update_reminder_list(
    list_id: int,
    name: str = Form(None),
    color: str = Form(None),
    icon: str = Form(None),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        reminder_list = (
            db.query(models.ReminderList).filter(
                models.ReminderList.id == list_id,
                models.ReminderList.user_id == current_user.id,
            ).first()
        )
        if not reminder_list:
            raise HTTPException(status_code=404, detail="List not found")

        if name is not None:
            reminder_list.name = name
        if color is not None:
            reminder_list.color = color
        if icon is not None:
            reminder_list.icon = icon

        reminder_list.updated_at = datetime.now(timezone.utc)
        db.commit()

        return {"status": "success", "message": "List updated"}
    except Exception as e:
        logger.error(f"Error updating reminder list: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/delete_reminder_list/{list_id}")
async def delete_reminder_list(
    list_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        reminder_list = (
            db.query(models.ReminderList).filter(
                models.ReminderList.id == list_id,
                models.ReminderList.user_id == current_user.id,
            ).first()
        )
        if not reminder_list:
            raise HTTPException(status_code=404, detail="List not found")

        db.delete(reminder_list)
        db.commit()

        return {"status": "success", "message": "List deleted"}
    except Exception as e:
        logger.error(f"Error deleting reminder list: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/create_reminder")
async def create_reminder(
    user_id: str = Form(...),
    title: str = Form(...),
    description: str = Form(None),
    notes: str = Form(None),
    url: str = Form(None),
    reminder_date: str = Form(None),
    due_date: str = Form(None),
    reminder_type: str = Form("reminder"),
    priority: str = Form("none"),
    color: str = Form("#3b82f6"),
    is_flagged: bool = Form(False),
    notify_before_minutes: int = Form(15),
    list_id: int = Form(None),
    parent_id: int = Form(None),
    recurring: str = Form("none"),
    recurring_interval: int = Form(1),
    recurring_end_date: str = Form(None),
    location: str = Form(None),
    tags: str = Form(None),
    user_timezone: str = Form("UTC"),
    timezone_offset: int = Form(0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user

        if list_id is not None:
            list_record = db.query(models.ReminderList).filter(
                models.ReminderList.id == list_id,
                models.ReminderList.user_id == user.id,
            ).first()
            if not list_record:
                raise HTTPException(status_code=404, detail="Reminder list not found")

        if parent_id is not None:
            parent = db.query(models.Reminder).filter(
                models.Reminder.id == parent_id,
                models.Reminder.user_id == user.id,
            ).first()
            if not parent:
                raise HTTPException(status_code=404, detail="Parent reminder not found")

        parsed_reminder_date = None
        parsed_due_date = None
        parsed_recurring_end = None

        if reminder_date:
            parsed_reminder_date = datetime.fromisoformat(
                reminder_date.replace("Z", "").replace("+00:00", "")
            )
            logger.info(f"Raw input: {reminder_date}")
            logger.info(f"Parsed as: {parsed_reminder_date} (treated as local time)")
            logger.info(f"User timezone: {user_timezone}")
            logger.info(f"Timezone offset: {timezone_offset} minutes")
        if due_date:
            parsed_due_date = datetime.fromisoformat(
                due_date.replace("Z", "").replace("+00:00", "")
            )
            logger.info(f"Parsed due_date: {parsed_due_date} (treated as local time)")
        if recurring_end_date:
            parsed_recurring_end = datetime.fromisoformat(
                recurring_end_date.replace("Z", "").replace("+00:00", "")
            )
            logger.info(f"Parsed recurring_end_date: {parsed_recurring_end} (treated as local time)")

        max_order = (
            db.query(func.max(models.Reminder.sort_order))
            .filter(
                models.Reminder.user_id == user.id,
                models.Reminder.list_id == list_id,
            )
            .scalar()
            or 0
        )

        reminder = models.Reminder(
            user_id=user.id,
            list_id=list_id,
            parent_id=parent_id,
            title=title,
            description=description,
            notes=notes,
            url=url,
            reminder_date=parsed_reminder_date,
            due_date=parsed_due_date,
            reminder_type=reminder_type,
            priority=priority,
            color=color,
            is_flagged=is_flagged,
            notify_before_minutes=notify_before_minutes,
            recurring=recurring,
            recurring_interval=recurring_interval,
            recurring_end_date=parsed_recurring_end,
            location=location,
            tags=tags,
            sort_order=max_order + 1,
        )

        db.add(reminder)
        db.commit()
        db.refresh(reminder)
        _create_due_reminder_notification(db, user, reminder, timezone_offset)

        logger.info(f"Created reminder {reminder.id} for user {user.email}")

        return serialize_reminder(reminder)
    except Exception as e:
        logger.error(f"Error creating reminder: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_reminders")
async def get_reminders(
    user_id: str = Query(...),
    list_id: int = Query(None),
    smart_list: str = Query(None),
    start_date: str = Query(None),
    end_date: str = Query(None),
    include_completed: bool = Query(False),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user

        query = db.query(models.Reminder).filter(
            models.Reminder.user_id == user.id,
            models.Reminder.parent_id == None,
        )

        today = datetime.now(timezone.utc).replace(hour=0, minute=0, second=0, microsecond=0)
        tomorrow = today + timedelta(days=1)

        if smart_list == "today":
            query = query.filter(
                models.Reminder.is_completed == False,
                models.Reminder.reminder_date >= today,
                models.Reminder.reminder_date < tomorrow,
            )
        elif smart_list == "scheduled":
            query = query.filter(
                models.Reminder.is_completed == False,
                models.Reminder.reminder_date != None,
            )
        elif smart_list == "flagged":
            query = query.filter(
                models.Reminder.is_completed == False,
                models.Reminder.is_flagged == True,
            )
        elif smart_list == "all":
            query = query.filter(models.Reminder.is_completed == False)
        elif smart_list == "completed":
            query = query.filter(models.Reminder.is_completed == True)
        elif list_id:
            query = query.filter(models.Reminder.list_id == list_id)
            if not include_completed:
                query = query.filter(models.Reminder.is_completed == False)
        else:
            if not include_completed:
                query = query.filter(models.Reminder.is_completed == False)

        if start_date:
            query = query.filter(
                models.Reminder.reminder_date
                >= datetime.fromisoformat(start_date.replace("Z", "").replace("+00:00", ""))
            )
        if end_date:
            query = query.filter(
                models.Reminder.reminder_date
                <= datetime.fromisoformat(end_date.replace("Z", "").replace("+00:00", ""))
            )

        reminders = query.order_by(
            models.Reminder.is_completed,
            models.Reminder.reminder_date.nullslast(),
            models.Reminder.sort_order,
        ).limit(2000).all()

        return [serialize_reminder(r) for r in reminders]
    except Exception as e:
        logger.error(f"Error getting reminders: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/update_reminder/{reminder_id}")
async def update_reminder(
    reminder_id: int,
    title: str = Form(None),
    description: str = Form(None),
    notes: str = Form(None),
    url: str = Form(None),
    reminder_date: str = Form(None),
    due_date: str = Form(None),
    reminder_type: str = Form(None),
    priority: str = Form(None),
    color: str = Form(None),
    is_completed: bool = Form(None),
    is_flagged: bool = Form(None),
    notify_before_minutes: int = Form(None),
    list_id: int = Form(None),
    recurring: str = Form(None),
    recurring_interval: int = Form(None),
    recurring_end_date: str = Form(None),
    location: str = Form(None),
    tags: str = Form(None),
    timezone_offset: int = Form(0),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        reminder = (
            db.query(models.Reminder).filter(
                models.Reminder.id == reminder_id,
                models.Reminder.user_id == current_user.id,
            ).first()
        )
        if not reminder:
            raise HTTPException(status_code=404, detail="Reminder not found")
        reminder_date_changed = reminder_date is not None

        if title is not None:
            reminder.title = title
        if description is not None:
            reminder.description = description
        if notes is not None:
            reminder.notes = notes
        if url is not None:
            reminder.url = url
        if reminder_date is not None:
            if reminder_date == "":
                reminder.reminder_date = None
            else:
                reminder.reminder_date = datetime.fromisoformat(
                    reminder_date.replace("Z", "").replace("+00:00", "")
                )
            reminder.is_notified = False
        if due_date is not None:
            if due_date == "":
                reminder.due_date = None
            else:
                reminder.due_date = datetime.fromisoformat(
                    due_date.replace("Z", "").replace("+00:00", "")
                )
        if reminder_type is not None:
            reminder.reminder_type = reminder_type
        if priority is not None:
            reminder.priority = priority
        if color is not None:
            reminder.color = color
        if is_completed is not None:
            reminder.is_completed = is_completed
            if is_completed:
                reminder.completed_at = datetime.now(timezone.utc)
                if reminder.recurring != "none" and reminder.recurring:
                    await create_next_recurring_reminder(db, reminder)
            else:
                reminder.completed_at = None
        if is_flagged is not None:
            reminder.is_flagged = is_flagged
        if notify_before_minutes is not None:
            reminder.notify_before_minutes = notify_before_minutes
        if list_id is not None:
            if list_id > 0:
                list_record = db.query(models.ReminderList).filter(
                    models.ReminderList.id == list_id,
                    models.ReminderList.user_id == current_user.id,
                ).first()
                if not list_record:
                    raise HTTPException(status_code=404, detail="Reminder list not found")
            reminder.list_id = list_id if list_id > 0 else None
        if recurring is not None:
            reminder.recurring = recurring
        if recurring_interval is not None:
            reminder.recurring_interval = recurring_interval
        if recurring_end_date is not None:
            if recurring_end_date == "":
                reminder.recurring_end_date = None
            else:
                reminder.recurring_end_date = datetime.fromisoformat(
                    recurring_end_date.replace("Z", "").replace("+00:00", "")
                )
        if location is not None:
            reminder.location = location
        if tags is not None:
            reminder.tags = tags

        reminder.updated_at = datetime.now(timezone.utc)
        db.commit()
        db.refresh(reminder)
        if reminder_date_changed or notify_before_minutes is not None or is_completed is False:
            _create_due_reminder_notification(db, current_user, reminder, timezone_offset)

        return {
            "status": "success",
            "message": "Reminder updated",
            "reminder": serialize_reminder(reminder),
        }
    except Exception as e:
        logger.error(f"Error updating reminder: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.delete("/delete_reminder/{reminder_id}")
async def delete_reminder(
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        reminder = (
            db.query(models.Reminder).filter(
                models.Reminder.id == reminder_id,
                models.Reminder.user_id == current_user.id,
            ).first()
        )
        if not reminder:
            raise HTTPException(status_code=404, detail="Reminder not found")

        db.delete(reminder)
        db.commit()

        return {"status": "success", "message": "Reminder deleted"}
    except Exception as e:
        logger.error(f"Error deleting reminder: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.post("/add_subtask/{reminder_id}")
async def add_subtask(
    reminder_id: int,
    title: str = Form(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        parent = db.query(models.Reminder).filter(
            models.Reminder.id == reminder_id,
            models.Reminder.user_id == current_user.id,
        ).first()
        if not parent:
            raise HTTPException(status_code=404, detail="Parent reminder not found")

        subtask = models.Reminder(
            user_id=parent.user_id,
            parent_id=reminder_id,
            list_id=parent.list_id,
            title=title,
            color=parent.color,
        )

        db.add(subtask)
        db.commit()
        db.refresh(subtask)

        return serialize_reminder(subtask)
    except Exception as e:
        logger.error(f"Error adding subtask: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.put("/toggle_reminder_flag/{reminder_id}")
async def toggle_reminder_flag(
    reminder_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        reminder = (
            db.query(models.Reminder).filter(
                models.Reminder.id == reminder_id,
                models.Reminder.user_id == current_user.id,
            ).first()
        )
        if not reminder:
            raise HTTPException(status_code=404, detail="Reminder not found")

        reminder.is_flagged = not reminder.is_flagged
        reminder.updated_at = datetime.now(timezone.utc)
        db.commit()

        return {"status": "success", "is_flagged": reminder.is_flagged}
    except Exception as e:
        logger.error(f"Error toggling flag: {str(e)}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/get_upcoming_reminders")
async def get_upcoming_reminders(
    user_id: str = Query(...),
    hours: int = Query(24),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user

        now = datetime.now(timezone.utc)
        future = now + timedelta(hours=hours)

        reminders = (
            db.query(models.Reminder)
            .filter(
                and_(
                    models.Reminder.user_id == user.id,
                    models.Reminder.reminder_date >= now,
                    models.Reminder.reminder_date <= future,
                    models.Reminder.is_completed == False,
                )
            )
            .order_by(models.Reminder.reminder_date)
            .all()
        )

        return [serialize_reminder(r) for r in reminders]
    except Exception as e:
        logger.error(f"Error getting upcoming reminders: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")

@router.get("/search_reminders")
async def search_reminders(
    user_id: str = Query(...),
    query: str = Query(...),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    try:
        _assert_user_matches_request(user_id, current_user)
        user = current_user

        reminders = (
            db.query(models.Reminder)
            .filter(
                models.Reminder.user_id == user.id,
                (
                    models.Reminder.title.ilike(f"%{query}%")
                    | models.Reminder.description.ilike(f"%{query}%")
                ),
            )
            .order_by(models.Reminder.reminder_date.nullslast())
            .limit(200)
            .all()
        )

        return [serialize_reminder(r) for r in reminders]
    except Exception as e:
        logger.error(f"Error searching reminders: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")
