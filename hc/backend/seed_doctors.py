"""
Seed 10 dummy doctors into the database.
Run from hc/backend/:  python seed_doctors.py
"""
import asyncio
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv()

from sqlalchemy import select
from database.db import AsyncSessionLocal, engine
from models.models import Base, Doctor


DOCTORS = [
    {
        "name": "Dr. Priya Sharma",
        "specialty": "General Physician",
        "qualification": "MBBS, MD (Internal Medicine)",
        "experience_years": 10,
        "rating": 4.8,
        "consultation_fee": 500,
        "languages": "English,Hindi",
        "location": "Mumbai",
        "avatar_seed": "PS",
        "bio": "Dr. Priya Sharma is an experienced general physician with expertise in managing chronic conditions, preventive care, and common illnesses.",
        "available_days": "Mon,Tue,Wed,Thu,Fri",
        "slot_duration_minutes": 30,
        "start_time": "09:00",
        "end_time": "17:00",
    },
    {
        "name": "Dr. Rajesh Kumar",
        "specialty": "Cardiologist",
        "qualification": "MBBS, MD, DM (Cardiology)",
        "experience_years": 20,
        "rating": 4.9,
        "consultation_fee": 1500,
        "languages": "English,Hindi",
        "location": "Delhi",
        "avatar_seed": "RK",
        "bio": "Senior cardiologist specialising in interventional cardiology, heart failure management, and preventive cardiac care.",
        "available_days": "Mon,Wed,Fri",
        "slot_duration_minutes": 30,
        "start_time": "10:00",
        "end_time": "16:00",
    },
    {
        "name": "Dr. Ananya Gupta",
        "specialty": "Endocrinologist",
        "qualification": "MBBS, MD, DM (Endocrinology)",
        "experience_years": 15,
        "rating": 4.7,
        "consultation_fee": 1200,
        "languages": "English,Hindi",
        "location": "Mumbai",
        "avatar_seed": "AG",
        "bio": "Specialist in diabetes, thyroid disorders, PCOS, and hormonal imbalances. Focuses on personalised lifestyle and medical management.",
        "available_days": "Tue,Thu,Sat",
        "slot_duration_minutes": 30,
        "start_time": "09:00",
        "end_time": "15:00",
    },
    {
        "name": "Dr. Sanjay Mehta",
        "specialty": "Hepatologist",
        "qualification": "MBBS, MD, DM (Hepatology)",
        "experience_years": 12,
        "rating": 4.6,
        "consultation_fee": 1000,
        "languages": "English,Hindi",
        "location": "Chennai",
        "avatar_seed": "SM",
        "bio": "Expert in fatty liver disease, hepatitis, liver cirrhosis, and advanced liver conditions. Associated with leading liver transplant centres.",
        "available_days": "Mon,Tue,Wed,Thu,Fri",
        "slot_duration_minutes": 30,
        "start_time": "09:30",
        "end_time": "17:30",
    },
    {
        "name": "Dr. Neha Patel",
        "specialty": "Dermatologist",
        "qualification": "MBBS, MD (Dermatology)",
        "experience_years": 8,
        "rating": 4.7,
        "consultation_fee": 800,
        "languages": "English,Hindi,Gujarati",
        "location": "Bengaluru",
        "avatar_seed": "NP",
        "bio": "Specialises in medical and cosmetic dermatology including acne, psoriasis, eczema, hair loss, and skin allergy management.",
        "available_days": "Mon,Tue,Wed,Thu,Fri,Sat",
        "slot_duration_minutes": 20,
        "start_time": "10:00",
        "end_time": "18:00",
    },
    {
        "name": "Dr. Arjun Singh",
        "specialty": "Pediatrician",
        "qualification": "MBBS, MD (Pediatrics)",
        "experience_years": 12,
        "rating": 4.9,
        "consultation_fee": 600,
        "languages": "English,Hindi",
        "location": "Delhi",
        "avatar_seed": "AS",
        "bio": "Dedicated pediatrician providing comprehensive child health care from birth through adolescence, including vaccinations and developmental assessment.",
        "available_days": "Mon,Tue,Wed,Thu,Fri,Sat",
        "slot_duration_minutes": 30,
        "start_time": "09:00",
        "end_time": "14:00",
    },
    {
        "name": "Dr. Kavitha Reddy",
        "specialty": "Gynecologist",
        "qualification": "MBBS, MS (Obstetrics & Gynecology)",
        "experience_years": 18,
        "rating": 4.8,
        "consultation_fee": 900,
        "languages": "English,Telugu,Hindi",
        "location": "Hyderabad",
        "avatar_seed": "KR",
        "bio": "Experienced OB-GYN with expertise in high-risk pregnancies, PCOS, fertility concerns, menstrual disorders, and minimally invasive surgery.",
        "available_days": "Mon,Tue,Wed,Thu,Fri",
        "slot_duration_minutes": 30,
        "start_time": "10:00",
        "end_time": "17:00",
    },
    {
        "name": "Dr. Vikram Malhotra",
        "specialty": "Orthopedic",
        "qualification": "MBBS, MS (Orthopaedics)",
        "experience_years": 22,
        "rating": 4.6,
        "consultation_fee": 1000,
        "languages": "English,Hindi",
        "location": "Mumbai",
        "avatar_seed": "VM",
        "bio": "Senior orthopaedic surgeon specialising in joint replacement, sports injuries, spine care, and arthritis management.",
        "available_days": "Mon,Wed,Thu,Fri",
        "slot_duration_minutes": 30,
        "start_time": "09:00",
        "end_time": "16:00",
    },
    {
        "name": "Dr. Meera Iyer",
        "specialty": "Neurologist",
        "qualification": "MBBS, MD, DM (Neurology)",
        "experience_years": 14,
        "rating": 4.5,
        "consultation_fee": 1200,
        "languages": "English,Tamil",
        "location": "Chennai",
        "avatar_seed": "MI",
        "bio": "Neurologist with expertise in migraine, epilepsy, Parkinson's disease, stroke management, and neuromuscular disorders.",
        "available_days": "Tue,Wed,Thu,Fri",
        "slot_duration_minutes": 30,
        "start_time": "10:00",
        "end_time": "16:00",
    },
    {
        "name": "Dr. Amit Verma",
        "specialty": "Pulmonologist",
        "qualification": "MBBS, MD (Pulmonary Medicine)",
        "experience_years": 9,
        "rating": 4.4,
        "consultation_fee": 800,
        "languages": "English,Hindi",
        "location": "Delhi",
        "avatar_seed": "AV",
        "bio": "Pulmonologist specialising in asthma, COPD, sleep apnea, interstitial lung disease, and respiratory infections.",
        "available_days": "Mon,Tue,Wed,Thu,Fri",
        "slot_duration_minutes": 30,
        "start_time": "09:00",
        "end_time": "17:00",
    },
]


async def seed():
    # Create tables (including the new doctors / appointments tables)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    print("Tables ensured.")

    async with AsyncSessionLocal() as session:
        result = await session.execute(select(Doctor).limit(1))
        if result.scalar_one_or_none():
            print("Doctors already seeded — skipping. Delete rows manually to re-seed.")
            return

        for d in DOCTORS:
            session.add(Doctor(**d))
        await session.commit()
        print(f"Seeded {len(DOCTORS)} doctors successfully.")


if __name__ == "__main__":
    asyncio.run(seed())
