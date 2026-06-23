from dotenv import load_dotenv
load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from contextlib import asynccontextmanager
import os

from database.db import create_tables
from api.auth.router import router as auth_router
from api.reports.router import router as reports_router
from api.patients.router import router as patients_router
from api.doctors.router import doctors_router, appointments_router
from api.ai.router import router as ai_router
from api.reminders.router import router as reminders_router
from api.family.router import router as family_router
from api.hospital.router import router as hospital_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    os.makedirs("uploads", exist_ok=True)
    # create_tables() runs CREATE TABLE IF NOT EXISTS — it creates missing tables
    # but does NOT add new columns to tables that already exist.
    # If you add columns to existing models, either:
    #   a) Dev: run `python reset_db.py` to drop and recreate everything fresh.
    #   b) Prod: use Alembic migrations (already in requirements.txt).
    await create_tables()
    print("Healthcare Copilot API started — DB tables ready!")
    yield


app = FastAPI(title="Healthcare Copilot API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth_router,      prefix="/api/auth",      tags=["Auth"])
app.include_router(reports_router,   prefix="/api/reports",   tags=["Reports"])
app.include_router(patients_router,  prefix="/api/patients",  tags=["Patients"])
app.include_router(doctors_router,      prefix="/api/doctors",      tags=["Doctors"])
app.include_router(appointments_router, prefix="/api/appointments", tags=["Appointments"])
app.include_router(ai_router,        prefix="/api/ai",        tags=["AI"])
app.include_router(reminders_router, prefix="/api/reminders", tags=["Reminders"])
app.include_router(family_router,    prefix="/api/family",    tags=["Family"])
app.include_router(hospital_router,  prefix="/api/hospital",  tags=["Hospital"])


@app.get("/")
async def root():
    return {"status": "running", "app": "Healthcare Copilot", "docs": "/docs"}


@app.get("/health")
async def health():
    return {"status": "healthy"}
