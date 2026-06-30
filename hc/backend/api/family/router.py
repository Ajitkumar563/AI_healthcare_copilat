from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.db import get_db
from models.models import FamilyMember, User, Report
from core.security import get_current_user_dep

router = APIRouter()


class CreateFamilyMemberRequest(BaseModel):
    name: str
    relationship_type: str = "Other"
    age: int | None = None
    gender: str | None = None
    conditions: str | None = None
    medicines: str | None = None
    risk_level: str = "Low"
    last_checkup: str | None = None


class UpdateFamilyMemberRequest(BaseModel):
    name: str | None = None
    relationship_type: str | None = None
    age: int | None = None
    gender: str | None = None
    conditions: str | None = None
    medicines: str | None = None
    risk_level: str | None = None
    last_checkup: str | None = None


@router.get("/")
async def list_family_members(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FamilyMember)
        .where(FamilyMember.owner_id == current_user.id)
        .order_by(FamilyMember.created_at.asc())
    )
    members = result.scalars().all()
    return [_member_to_dict(m) for m in members]


_RISK_SCORE_MAP: dict[str, int] = {"Low": 85, "Medium": 62, "High": 38, "Critical": 18}


@router.get("/comparison")
async def get_family_comparison(
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FamilyMember)
        .where(FamilyMember.owner_id == current_user.id)
        .order_by(FamilyMember.created_at.asc())
    )
    members = result.scalars().all()
    return {
        "members": [
            {
                "id": m.id,
                "name": m.name,
                "relationship": m.relationship_type,
                "age": m.age,
                "risk_level": m.risk_level or "Low",
                "risk_score": _RISK_SCORE_MAP.get(m.risk_level or "Low", 70),
                "conditions": m.conditions,
                "last_checkup": m.last_checkup,
            }
            for m in members
        ]
    }


@router.post("/")
async def add_family_member(
    request: CreateFamilyMemberRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    member = FamilyMember(
        owner_id=current_user.id,
        name=request.name,
        relationship_type=request.relationship_type,
        age=request.age,
        gender=request.gender,
        conditions=request.conditions,
        medicines=request.medicines,
        risk_level=request.risk_level,
        last_checkup=request.last_checkup,
    )
    db.add(member)
    await db.flush()
    return _member_to_dict(member)


@router.put("/{member_id}")
async def update_family_member(
    member_id: str,
    request: UpdateFamilyMemberRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.id == member_id, FamilyMember.owner_id == current_user.id
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Family member not found")

    for field, value in request.model_dump(exclude_none=True).items():
        setattr(member, field, value)

    return _member_to_dict(member)


@router.delete("/{member_id}")
async def delete_family_member(
    member_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.id == member_id, FamilyMember.owner_id == current_user.id
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Family member not found")
    await db.delete(member)
    return {"message": "Family member removed"}


@router.get("/{member_id}/summary")
async def get_member_summary(
    member_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.id == member_id, FamilyMember.owner_id == current_user.id
        )
    )
    member = result.scalar_one_or_none()
    if member is None:
        raise HTTPException(status_code=404, detail="Family member not found")

    rep_result = await db.execute(
        select(Report)
        .where(Report.family_member_id == member_id)
        .order_by(Report.created_at.desc())
    )
    reports = rep_result.scalars().all()
    latest = reports[0] if reports else None

    approved_reports = [r for r in reports if r.approval_status == "approved"]
    latest_approved = approved_reports[0] if approved_reports else None

    effective_risk_level = (
        latest_approved.risk_level
        if latest_approved and latest_approved.risk_level
        else member.risk_level
    )
    effective_risk_score = (
        latest_approved.risk_score if latest_approved else _RISK_SCORE_MAP.get(member.risk_level or "Low", 70)
    )

    return {
        "member": _member_to_dict(member),
        "total_reports": len(reports),
        "latest_report_date": latest.created_at.isoformat() if latest and latest.created_at else None,
        "latest_report_name": latest.file_name if latest else None,
        "risk_level": effective_risk_level,
        "risk_score": effective_risk_score,
        "approval_status": latest.approval_status if latest else None,
    }


@router.get("/{member_id}/reports")
async def get_member_reports(
    member_id: str,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(FamilyMember).where(
            FamilyMember.id == member_id, FamilyMember.owner_id == current_user.id
        )
    )
    if result.scalar_one_or_none() is None:
        raise HTTPException(status_code=404, detail="Family member not found")

    rep_result = await db.execute(
        select(Report)
        .where(Report.family_member_id == member_id)
        .order_by(Report.created_at.desc())
    )
    reports = rep_result.scalars().all()
    return [_report_to_dict(r) for r in reports]


def _member_to_dict(m: FamilyMember) -> dict:
    return {
        "id": m.id,
        "owner_id": m.owner_id,
        "name": m.name,
        "relationship_type": m.relationship_type,
        "age": m.age,
        "gender": m.gender,
        "conditions": m.conditions,
        "medicines": m.medicines,
        "risk_level": m.risk_level,
        "last_checkup": m.last_checkup,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }


def _report_to_dict(r: Report) -> dict:
    return {
        "id": r.id,
        "file_name": r.file_name,
        "file_url": r.file_url,
        "report_type": r.report_type,
        "risk_level": r.risk_level,
        "risk_score": r.risk_score,
        "ai_summary": r.ai_summary,
        "approval_status": r.approval_status,
        "doctor_notes": r.doctor_notes,
        "created_at": r.created_at.isoformat() if r.created_at else None,
    }
