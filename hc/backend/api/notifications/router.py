from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update

from database.db import get_db
from models.models import Notification, User
from core.security import get_current_user_dep

router = APIRouter()


def _to_dict(n: Notification) -> dict:
    return {
        "id":         n.id,
        "type":       n.type,
        "title":      n.title,
        "message":    n.message,
        "action_url": n.action_url,
        "is_read":    n.is_read,
        "created_at": n.created_at.isoformat() if n.created_at else None,
    }


@router.get("")
async def list_notifications(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Return the 50 most-recent notifications for the current user."""
    result = await db.execute(
        select(Notification)
        .where(Notification.user_id == current_user.id)
        .order_by(Notification.created_at.desc())
        .limit(50)
    )
    notifs = result.scalars().all()
    return {
        "notifications": [_to_dict(n) for n in notifs],
        "unread_count":  sum(1 for n in notifs if not n.is_read),
    }


@router.post("/read-all")
async def mark_all_read(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Mark every unread notification as read for the current user."""
    await db.execute(
        update(Notification)
        .where(
            Notification.user_id == current_user.id,
            Notification.is_read.is_(False),
        )
        .values(is_read=True)
        .execution_options(synchronize_session=False)
    )
    return {"success": True}


@router.post("/{notif_id}/read")
async def mark_one_read(
    notif_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    """Mark a single notification as read. Returns 404 if it doesn't belong to the user."""
    result = await db.execute(
        select(Notification).where(
            Notification.id == notif_id,
            Notification.user_id == current_user.id,
        )
    )
    notif = result.scalar_one_or_none()
    if notif is None:
        raise HTTPException(status_code=404, detail="Notification not found")
    notif.is_read = True
    return {"success": True}
