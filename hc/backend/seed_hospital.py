"""
Seed a sample hospital, admin, and two doctors.

Run from hc/backend/:
    python seed_hospital.py

Credentials after seeding:
    Admin  — admin@sahaaytest.com   / Admin@1234
    Doctor — dr.sharma@sahaaytest.com / Doctor@1234
    Doctor — dr.verma@sahaaytest.com  / Doctor@1234
"""

import asyncio
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import select
import os

from models.models import Base, Hospital, User, Doctor
from core.security import hash_password

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./healthcare_copilot.db")

engine = create_async_engine(DATABASE_URL, echo=False)
AsyncSessionLocal = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


async def seed():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    async with AsyncSessionLocal() as db:
        # ── Check if already seeded ───────────────────────────────────────────
        existing = (await db.execute(
            select(User).where(User.email == "admin@sahaaytest.com")
        )).scalar_one_or_none()
        if existing:
            print("[seed] Already seeded — skipping.")
            return

        # ── Hospital ──────────────────────────────────────────────────────────
        hospital = Hospital(
            name="Sahaay Test Hospital",
            address="42, Health Park, MG Road",
            city="Bengaluru",
            phone="+91-80-12345678",
            email="contact@sahaaytest.com",
        )
        db.add(hospital)
        await db.flush()
        print(f"[seed] Hospital created: {hospital.name}  (id={hospital.id})")

        # ── Admin user ────────────────────────────────────────────────────────
        admin = User(
            name="Hospital Admin",
            email="admin@sahaaytest.com",
            role="admin",
            hospital_id=hospital.id,
            password_hash=hash_password("Admin@1234"),
        )
        db.add(admin)
        await db.flush()
        print(f"[seed] Admin created: {admin.email}")

        # ── Doctor 1 ──────────────────────────────────────────────────────────
        dr1_user = User(
            name="Dr. Anil Sharma",
            email="dr.sharma@sahaaytest.com",
            role="doctor",
            hospital_id=hospital.id,
            password_hash=hash_password("Doctor@1234"),
        )
        db.add(dr1_user)
        await db.flush()

        dr1 = Doctor(
            name="Dr. Anil Sharma",
            specialty="Cardiology",
            qualification="MBBS, MD (Cardiology), DM",
            experience_years=14,
            rating=4.8,
            consultation_fee=800,
            languages="English, Hindi, Kannada",
            location="Bengaluru",
            hospital_id=hospital.id,
            user_id=dr1_user.id,
        )
        db.add(dr1)
        print(f"[seed] Doctor created: {dr1_user.email}")

        # ── Doctor 2 ──────────────────────────────────────────────────────────
        dr2_user = User(
            name="Dr. Priya Verma",
            email="dr.verma@sahaaytest.com",
            role="doctor",
            hospital_id=hospital.id,
            password_hash=hash_password("Doctor@1234"),
        )
        db.add(dr2_user)
        await db.flush()

        dr2 = Doctor(
            name="Dr. Priya Verma",
            specialty="Endocrinology",
            qualification="MBBS, MD (Medicine), DM (Endocrinology)",
            experience_years=9,
            rating=4.7,
            consultation_fee=700,
            languages="English, Hindi",
            location="Bengaluru",
            hospital_id=hospital.id,
            user_id=dr2_user.id,
        )
        db.add(dr2)
        print(f"[seed] Doctor created: {dr2_user.email}")

        await db.commit()
        print("\n[seed] Done! Login credentials:")
        print("  Admin  → admin@sahaaytest.com   / Admin@1234")
        print("  Doctor → dr.sharma@sahaaytest.com / Doctor@1234")
        print("  Doctor → dr.verma@sahaaytest.com  / Doctor@1234")
        print(f"\n  Hospital ID: {hospital.id}")


if __name__ == "__main__":
    asyncio.run(seed())
