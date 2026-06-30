import uuid
from datetime import datetime
from sqlalchemy import String, Float, Integer, Boolean, DateTime, Text, ForeignKey, Date
from sqlalchemy.dialects.postgresql import UUID as PgUUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
import enum
from database.db import Base


# ─── Enums ───────────────────────────────────────────────────────────────────

class UserRole(str, enum.Enum):
    PATIENT = "patient"
    DOCTOR = "doctor"

class Gender(str, enum.Enum):
    MALE = "male"
    FEMALE = "female"
    OTHER = "other"

class RiskLevel(str, enum.Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class ReportType(str, enum.Enum):
    CBC = "CBC"
    LFT = "LFT"
    KFT = "KFT"
    THYROID = "Thyroid"
    VITAMIN_D = "Vitamin D"
    VITAMIN_B12 = "Vitamin B12"
    LIPID = "Lipid Profile"
    DIABETES = "Diabetes"
    OTHER = "Other"

class ReminderFrequency(str, enum.Enum):
    ONCE_DAILY = "once_daily"
    TWICE_DAILY = "twice_daily"
    THRICE_DAILY = "thrice_daily"
    BEDTIME = "bedtime"
    CUSTOM = "custom"

class ReminderStatus(str, enum.Enum):
    PENDING = "pending"
    TAKEN = "taken"
    MISSED = "missed"
    SNOOZED = "snoozed"

class RelationshipType(str, enum.Enum):
    SELF = "Self"
    SPOUSE = "Spouse"
    FATHER = "Father"
    MOTHER = "Mother"
    SON = "Son"
    DAUGHTER = "Daughter"
    BROTHER = "Brother"
    SISTER = "Sister"
    GRANDPARENT = "Grandparent"
    OTHER = "Other"


def new_id() -> str:
    return str(uuid.uuid4())


# ─── Hospital ────────────────────────────────────────────────────────────────

class Hospital(Base):
    __tablename__ = "hospitals"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200))
    address: Mapped[str | None] = mapped_column(String(500), nullable=True)
    city: Mapped[str | None] = mapped_column(String(100), nullable=True)
    phone: Mapped[str | None] = mapped_column(String(30), nullable=True)
    email: Mapped[str | None] = mapped_column(String(255), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    users: Mapped[list["User"]] = relationship("User", back_populates="hospital", lazy="select")
    doctors: Mapped[list["Doctor"]] = relationship("Doctor", back_populates="hospital", lazy="select")


# ─── User ────────────────────────────────────────────────────────────────────

class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(100))
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    phone: Mapped[str | None] = mapped_column(String(20), nullable=True)
    role: Mapped[str] = mapped_column(String(20), default="patient")
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    weight: Mapped[float | None] = mapped_column(Float, nullable=True)
    height: Mapped[float | None] = mapped_column(Float, nullable=True)
    medical_history: Mapped[str | None] = mapped_column(Text, nullable=True)
    allergies: Mapped[str | None] = mapped_column(String(500), nullable=True)
    current_medicines: Mapped[str | None] = mapped_column(Text, nullable=True)
    language_preference: Mapped[str] = mapped_column(String(10), default="en")
    hospital_id: Mapped[str | None] = mapped_column(PgUUID(as_uuid=False), ForeignKey("hospitals.id"), nullable=True, index=True)
    password_hash: Mapped[str | None] = mapped_column(String(255), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    reports: Mapped[list["Report"]] = relationship("Report", back_populates="user", lazy="selectin", foreign_keys="[Report.user_id]")
    reminders: Mapped[list["Reminder"]] = relationship("Reminder", back_populates="user", lazy="selectin")
    family_members: Mapped[list["FamilyMember"]] = relationship("FamilyMember", back_populates="owner", lazy="selectin")
    symptoms: Mapped[list["Symptom"]] = relationship("Symptom", back_populates="user", lazy="selectin")
    hospital: Mapped["Hospital | None"] = relationship("Hospital", back_populates="users")


# ─── OTP ─────────────────────────────────────────────────────────────────────

class OTP(Base):
    __tablename__ = "otps"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), index=True)
    otp_code: Mapped[str] = mapped_column(String(6))
    is_used: Mapped[bool] = mapped_column(Boolean, default=False)
    expires_at: Mapped[datetime] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


# ─── Report ───────────────────────────────────────────────────────────────────

class Report(Base):
    __tablename__ = "reports"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), ForeignKey("users.id"), index=True)
    report_type: Mapped[str] = mapped_column(String(50), default="Other")
    file_url: Mapped[str] = mapped_column(String(500))
    file_name: Mapped[str] = mapped_column(String(255))
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    raw_text: Mapped[str | None] = mapped_column(Text, nullable=True)
    analysis_result: Mapped[str | None] = mapped_column(Text, nullable=True)  # JSON string
    ai_summary: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_score: Mapped[float | None] = mapped_column(Float, nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    approval_status: Mapped[str] = mapped_column(String(20), default="pending")
    reviewed_by: Mapped[str | None] = mapped_column(PgUUID(as_uuid=False), ForeignKey("users.id"), nullable=True)
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    doctor_notes: Mapped[str | None] = mapped_column(Text, nullable=True)
    family_member_id: Mapped[str | None] = mapped_column(PgUUID(as_uuid=False), ForeignKey("family_members.id"), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="reports", foreign_keys="[Report.user_id]")
    reviewer: Mapped["User | None"] = relationship("User", foreign_keys="[Report.reviewed_by]")
    family_member: Mapped["FamilyMember | None"] = relationship("FamilyMember", back_populates="reports", foreign_keys="[Report.family_member_id]", lazy="select")
    parameters: Mapped[list["ReportParameter"]] = relationship("ReportParameter", back_populates="report", lazy="selectin", cascade="all, delete-orphan")


# ─── ReportParameter ──────────────────────────────────────────────────────────

class ReportParameter(Base):
    __tablename__ = "report_parameters"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    report_id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), ForeignKey("reports.id"), index=True)
    parameter_name: Mapped[str] = mapped_column(String(100))
    value: Mapped[str | None] = mapped_column(String(100), nullable=True)
    unit: Mapped[str | None] = mapped_column(String(50), nullable=True)
    reference_min: Mapped[float | None] = mapped_column(Float, nullable=True)
    reference_max: Mapped[float | None] = mapped_column(Float, nullable=True)
    is_abnormal: Mapped[bool] = mapped_column(Boolean, default=False)
    status: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Normal / Low / High / Borderline

    report: Mapped["Report"] = relationship("Report", back_populates="parameters")


# ─── Symptom ─────────────────────────────────────────────────────────────────

class Symptom(Base):
    __tablename__ = "symptoms"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), ForeignKey("users.id"), index=True)
    symptoms_text: Mapped[str] = mapped_column(Text)
    possible_conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_level: Mapped[str | None] = mapped_column(String(20), nullable=True)
    ai_response: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="symptoms")


# ─── Reminder ────────────────────────────────────────────────────────────────

class Reminder(Base):
    __tablename__ = "reminders"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), ForeignKey("users.id"), index=True)
    medicine_name: Mapped[str] = mapped_column(String(200))
    dosage: Mapped[str | None] = mapped_column(String(100), nullable=True)
    frequency: Mapped[str] = mapped_column(String(50), default="once_daily")
    times: Mapped[str] = mapped_column(Text, default='["08:00 AM"]')  # JSON array string
    duration: Mapped[str | None] = mapped_column(String(100), nullable=True)
    instructions: Mapped[str | None] = mapped_column(String(300), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    missed_count: Mapped[int] = mapped_column(Integer, default=0)
    taken_today: Mapped[bool] = mapped_column(Boolean, default=False)
    last_taken_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    user: Mapped["User"] = relationship("User", back_populates="reminders")


# ─── FamilyMember ────────────────────────────────────────────────────────────

class FamilyMember(Base):
    __tablename__ = "family_members"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    owner_id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(100))
    relationship_type: Mapped[str] = mapped_column(String(50), default="Other")
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    gender: Mapped[str | None] = mapped_column(String(20), nullable=True)
    conditions: Mapped[str | None] = mapped_column(Text, nullable=True)
    risk_level: Mapped[str] = mapped_column(String(20), default="Low")
    last_checkup: Mapped[str | None] = mapped_column(String(100), nullable=True)
    medicines: Mapped[str | None] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    owner: Mapped["User"] = relationship("User", back_populates="family_members")
    reports: Mapped[list["Report"]] = relationship("Report", back_populates="family_member", foreign_keys="[Report.family_member_id]", lazy="select")


# ─── Doctor ───────────────────────────────────────────────────────────────────

class Doctor(Base):
    __tablename__ = "doctors"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(100))
    specialty: Mapped[str] = mapped_column(String(100))
    qualification: Mapped[str] = mapped_column(String(200))
    experience_years: Mapped[int] = mapped_column(Integer, default=5)
    rating: Mapped[float] = mapped_column(Float, default=4.5)
    consultation_fee: Mapped[int] = mapped_column(Integer, default=500)
    languages: Mapped[str] = mapped_column(String(200), default="English")
    location: Mapped[str] = mapped_column(String(100), default="Mumbai")
    avatar_seed: Mapped[str] = mapped_column(String(50), default="")
    bio: Mapped[str | None] = mapped_column(Text, nullable=True)
    available_days: Mapped[str] = mapped_column(String(100), default="Mon,Tue,Wed,Thu,Fri")
    slot_duration_minutes: Mapped[int] = mapped_column(Integer, default=30)
    start_time: Mapped[str] = mapped_column(String(10), default="09:00")
    end_time: Mapped[str] = mapped_column(String(10), default="17:00")
    hospital_id: Mapped[str | None] = mapped_column(PgUUID(as_uuid=False), ForeignKey("hospitals.id"), nullable=True, index=True)
    user_id: Mapped[str | None] = mapped_column(PgUUID(as_uuid=False), ForeignKey("users.id"), nullable=True)

    appointments: Mapped[list["Appointment"]] = relationship(
        "Appointment", back_populates="doctor", lazy="select"
    )
    hospital: Mapped["Hospital | None"] = relationship("Hospital", back_populates="doctors")
    linked_user: Mapped["User | None"] = relationship("User", foreign_keys=[user_id])


# ─── Appointment ─────────────────────────────────────────────────────────────

class Appointment(Base):
    __tablename__ = "appointments"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    patient_id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), ForeignKey("users.id"), index=True)
    doctor_id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), ForeignKey("doctors.id"), index=True)
    appointment_date: Mapped[str] = mapped_column(String(20))   # "YYYY-MM-DD"
    appointment_time: Mapped[str] = mapped_column(String(10))   # "HH:MM"
    type: Mapped[str] = mapped_column(String(20), default="video")
    status: Mapped[str] = mapped_column(String(20), default="upcoming")
    reason: Mapped[str | None] = mapped_column(Text, nullable=True)
    video_room_id: Mapped[str | None] = mapped_column(String(100), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    patient: Mapped["User"] = relationship("User")
    doctor: Mapped["Doctor"] = relationship("Doctor", back_populates="appointments")


# ─── Subscription ────────────────────────────────────────────────────────────

class Subscription(Base):
    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    hospital_id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), ForeignKey("hospitals.id"), unique=True, index=True)
    plan: Mapped[str] = mapped_column(String(20), default="free")        # free | pro | enterprise
    status: Mapped[str] = mapped_column(String(20), default="active")    # active | expired
    start_date: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
    end_date: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    max_doctors: Mapped[int | None] = mapped_column(Integer, nullable=True)
    max_patients: Mapped[int | None] = mapped_column(Integer, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)

    hospital: Mapped["Hospital"] = relationship("Hospital")


# ─── Notification ─────────────────────────────────────────────────────────────

class Notification(Base):
    __tablename__ = "notifications"

    id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(PgUUID(as_uuid=False), ForeignKey("users.id"), index=True)
    type: Mapped[str] = mapped_column(String(30))  # emergency | report_approved | appointment | reminder
    title: Mapped[str] = mapped_column(Text)
    message: Mapped[str] = mapped_column(Text)
    action_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    is_read: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)
