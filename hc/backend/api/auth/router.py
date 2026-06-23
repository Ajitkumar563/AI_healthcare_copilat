import random
import string
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, delete

from database.db import get_db
from models.models import User, OTP
from core.security import create_access_token, get_current_user_dep

router = APIRouter()


class SendOTPRequest(BaseModel):
    email: str
    name: str = ""
    role: str = "patient"


class VerifyOTPRequest(BaseModel):
    email: str
    otp_code: str


class UpdateProfileRequest(BaseModel):
    name: str | None = None
    phone: str | None = None
    age: int | None = None
    gender: str | None = None
    weight: float | None = None
    height: float | None = None
    medical_history: str | None = None
    allergies: str | None = None
    current_medicines: str | None = None
    language_preference: str | None = None


def generate_otp() -> str:
    return "".join(random.choices(string.digits, k=6))


@router.post("/send-otp")
async def send_otp(request: SendOTPRequest, db: AsyncSession = Depends(get_db)):
    # Create user if not exists
    result = await db.execute(select(User).where(User.email == request.email))
    user = result.scalar_one_or_none()
    if user is None:
        user = User(
            name=request.name or request.email.split("@")[0],
            email=request.email,
            role=request.role,
        )
        db.add(user)
        await db.flush()

    # Delete old OTPs for this email
    await db.execute(delete(OTP).where(OTP.email == request.email))

    otp_code = generate_otp()
    otp = OTP(
        email=request.email,
        otp_code=otp_code,
        expires_at=datetime.utcnow() + timedelta(minutes=10),
    )
    db.add(otp)
    await db.flush()

    print(f"[OTP] {request.email}: {otp_code}")

    return {
        "message": "OTP sent successfully",
        "email": request.email,
        "otp": otp_code,  # Remove in production
    }


@router.post("/verify-otp")
async def verify_otp(request: VerifyOTPRequest, db: AsyncSession = Depends(get_db)):
    result = await db.execute(
        select(OTP)
        .where(OTP.email == request.email, OTP.is_used == False)
        .order_by(OTP.created_at.desc())
    )
    otp_record = result.scalar_one_or_none()

    if otp_record is None:
        raise HTTPException(status_code=400, detail="OTP not found. Please request again.")

    if datetime.utcnow() > otp_record.expires_at:
        await db.delete(otp_record)
        raise HTTPException(status_code=400, detail="OTP expired. Please request again.")

    if otp_record.otp_code != request.otp_code:
        raise HTTPException(status_code=400, detail="Invalid OTP.")

    otp_record.is_used = True

    # Get user
    user_result = await db.execute(select(User).where(User.email == request.email))
    user = user_result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")

    token = create_access_token({
        "sub": user.id,
        "email": user.email,
        "name": user.name,
        "role": user.role,
        "hospital_id": user.hospital_id,
    })

    return {
        "access_token": token,
        "token_type": "bearer",
        "user": {
            "id": user.id,
            "email": user.email,
            "name": user.name,
            "role": user.role,
            "hospital_id": user.hospital_id,
            "age": user.age,
            "gender": user.gender,
        },
    }


@router.get("/me")
async def get_me(current_user: User = Depends(get_current_user_dep)):
    return {
        "id": current_user.id,
        "email": current_user.email,
        "name": current_user.name,
        "role": current_user.role,
        "hospital_id": current_user.hospital_id,
        "phone": current_user.phone,
        "age": current_user.age,
        "gender": current_user.gender,
        "weight": current_user.weight,
        "height": current_user.height,
        "medical_history": current_user.medical_history,
        "allergies": current_user.allergies,
        "current_medicines": current_user.current_medicines,
        "language_preference": current_user.language_preference,
        "created_at": current_user.created_at.isoformat(),
    }


@router.put("/me")
async def update_me(
    request: UpdateProfileRequest,
    current_user: User = Depends(get_current_user_dep),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == current_user.id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")

    for field, value in request.model_dump(exclude_none=True).items():
        setattr(user, field, value)

    return {"message": "Profile updated", "user": {"id": user.id, "name": user.name, "email": user.email}}
