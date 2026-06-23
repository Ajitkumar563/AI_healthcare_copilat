from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from database.db import get_db
from models.models import FamilyMember, User
from core.security import get_current_user_dep

router = APIRouter()


class CreateFamilyMemberRequest(BaseModel):
    name: str
    relationship_type: str = "Other"
    age: int | None = None
    gender: str | None = None
    conditions: str | None = None
    risk_level: str = "Low"
    last_checkup: str | None = None


class UpdateFamilyMemberRequest(BaseModel):
    name: str | None = None
    relationship_type: str | None = None
    age: int | None = None
    gender: str | None = None
    conditions: str | None = None
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


def _member_to_dict(m: FamilyMember) -> dict:
    return {
        "id": m.id,
        "owner_id": m.owner_id,
        "name": m.name,
        "relationship_type": m.relationship_type,
        "age": m.age,
        "gender": m.gender,
        "conditions": m.conditions,
        "risk_level": m.risk_level,
        "last_checkup": m.last_checkup,
        "created_at": m.created_at.isoformat() if m.created_at else None,
    }
