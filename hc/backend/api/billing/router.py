"""
Subscription & Billing — basic plan/usage tracking for hospitals.

No real payment gateway is wired up yet. POST /upgrade is a mock that flips
the Subscription row directly; this is intentional for the current release.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, distinct

from database.db import get_db
from models.models import User, Doctor, Appointment, Subscription
from core.security import require_role

router = APIRouter()


def _require_hospital(user: User) -> str:
    if not user.hospital_id:
        raise HTTPException(status_code=403, detail="No hospital association on this account")
    return user.hospital_id


# Single source of truth for plan limits + display info.
# max_doctors / max_patients = None means unlimited.
_PLAN_DEFS: dict[str, dict] = {
    "free": {
        "name": "Starter",
        "price_inr": 0,
        "billing_cycle_days": None,
        "max_doctors": 5,
        "max_patients": 100,
        "features": ["Up to 100 patients", "5 doctors", "Basic analytics", "Email support"],
    },
    "pro": {
        "name": "Growth",
        "price_inr": 2999,
        "billing_cycle_days": 30,
        "max_doctors": 20,
        "max_patients": 1000,
        "features": ["Up to 1,000 patients", "20 doctors", "Advanced analytics", "WhatsApp alerts", "Priority support"],
    },
    "enterprise": {
        "name": "Enterprise",
        "price_inr": None,
        "billing_cycle_days": None,
        "max_doctors": None,
        "max_patients": None,
        "features": ["Unlimited patients", "Unlimited doctors", "Custom integrations", "Dedicated account manager", "SLA guarantee"],
    },
}


class UpgradeRequest(BaseModel):
    plan: str   # "free" | "pro" | "enterprise"


async def _get_or_create_subscription(hospital_id: str, db: AsyncSession) -> Subscription:
    sub = (await db.execute(
        select(Subscription).where(Subscription.hospital_id == hospital_id)
    )).scalar_one_or_none()

    if sub is None:
        plan_def = _PLAN_DEFS["free"]
        sub = Subscription(
            hospital_id=hospital_id,
            plan="free",
            status="active",
            start_date=datetime.utcnow(),
            end_date=None,
            max_doctors=plan_def["max_doctors"],
            max_patients=plan_def["max_patients"],
        )
        db.add(sub)
        await db.flush()
        return sub

    # Lazily expire subscriptions whose billing cycle has passed.
    if sub.status == "active" and sub.end_date and sub.end_date < datetime.utcnow():
        sub.status = "expired"
        await db.flush()

    return sub


async def _usage(hospital_id: str, db: AsyncSession) -> dict:
    total_doctors = (await db.execute(
        select(func.count()).select_from(Doctor).where(Doctor.hospital_id == hospital_id)
    )).scalar() or 0

    total_patients = (await db.execute(
        select(func.count(distinct(Appointment.patient_id)))
        .join(Doctor, Doctor.id == Appointment.doctor_id)
        .where(Doctor.hospital_id == hospital_id)
    )).scalar() or 0

    return {"doctors": total_doctors, "patients": total_patients}


def _subscription_to_dict(sub: Subscription) -> dict:
    plan_def = _PLAN_DEFS.get(sub.plan, _PLAN_DEFS["free"])
    return {
        "id": sub.id,
        "plan": sub.plan,
        "plan_name": plan_def["name"],
        "status": sub.status,
        "start_date": sub.start_date.isoformat() if sub.start_date else None,
        "end_date": sub.end_date.isoformat() if sub.end_date else None,
        "max_doctors": sub.max_doctors,
        "max_patients": sub.max_patients,
        "price_inr": plan_def["price_inr"],
    }


@router.get("/current")
async def get_current_billing(
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Returns the hospital's current subscription, usage, and the full plan catalogue."""
    hospital_id = _require_hospital(current_user)
    sub = await _get_or_create_subscription(hospital_id, db)
    usage = await _usage(hospital_id, db)

    return {
        "subscription": _subscription_to_dict(sub),
        "usage": usage,
        "plans": _PLAN_DEFS,
    }


@router.post("/upgrade")
async def upgrade_plan(
    body: UpgradeRequest,
    current_user: User = Depends(require_role(["admin"])),
    db: AsyncSession = Depends(get_db),
):
    """Mock plan change — no payment gateway. Flips the Subscription row directly."""
    if body.plan not in _PLAN_DEFS:
        raise HTTPException(status_code=400, detail=f"Unknown plan '{body.plan}'. Choose from: {', '.join(_PLAN_DEFS)}")

    hospital_id = _require_hospital(current_user)
    sub = await _get_or_create_subscription(hospital_id, db)
    plan_def = _PLAN_DEFS[body.plan]

    sub.plan = body.plan
    sub.status = "active"
    sub.start_date = datetime.utcnow()
    sub.end_date = (
        datetime.utcnow() + timedelta(days=plan_def["billing_cycle_days"])
        if plan_def["billing_cycle_days"] else None
    )
    sub.max_doctors = plan_def["max_doctors"]
    sub.max_patients = plan_def["max_patients"]
    await db.flush()

    usage = await _usage(hospital_id, db)

    return {
        "message": f"Plan changed to {plan_def['name']}",
        "subscription": _subscription_to_dict(sub),
        "usage": usage,
    }
