"""
Drop all tables and recreate them from the current SQLAlchemy models.

Use this during LOCAL DEVELOPMENT when you've added new columns to existing
models (e.g. hospital_id, password_hash) and SQLAlchemy's create_tables()
didn't add them because the tables already existed.

WARNING: This destroys all data. Only run in development.

Usage (from hc/backend/):
    python reset_db.py
"""

import asyncio
from dotenv import load_dotenv
load_dotenv()

from sqlalchemy.ext.asyncio import create_async_engine
import os

# Import all models so their metadata is registered before we call drop_all
from models.models import Base  # noqa: F401 — side-effect import registers all tables
import models.models  # noqa: F401

DATABASE_URL = os.getenv("DATABASE_URL", "sqlite+aiosqlite:///./healthcare_copilot.db")


async def reset():
    engine = create_async_engine(DATABASE_URL, echo=False)

    async with engine.begin() as conn:
        print("Dropping all tables…")
        await conn.run_sync(Base.metadata.drop_all)
        print("Recreating all tables from current models…")
        await conn.run_sync(Base.metadata.create_all)

    await engine.dispose()
    print("\nDone. All tables recreated with the latest schema.")
    print("Next steps:")
    print("  python seed_doctors.py   # appointment doctors (no hospital dependency)")
    print("  python seed_hospital.py  # test hospital + admin + staff doctors")


if __name__ == "__main__":
    asyncio.run(reset())
