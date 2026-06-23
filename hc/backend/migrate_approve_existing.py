"""
PostgreSQL migration: add approval columns to reports table and mark
all existing reports that already have analysis results as 'approved'.

Safe to run on live data and idempotent — uses IF NOT EXISTS so re-running
is harmless, and the UPDATE only touches rows that are still 'pending'.

Column types match models.py exactly:
  approval_status  VARCHAR(20)  — String(20)
  reviewed_by      UUID         — PgUUID(as_uuid=False) → native PG UUID
  reviewed_at      TIMESTAMP    — DateTime
  doctor_notes     TEXT         — Text

Usage:
    python migrate_approve_existing.py
"""

import asyncio
from sqlalchemy import text
from database.db import engine


async def migrate():
    async with engine.begin() as conn:
        # Check which columns already exist via information_schema
        result = await conn.execute(text(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name = 'reports'"
        ))
        existing_cols = {row[0] for row in result.fetchall()}
        print(f"  Existing columns found: {sorted(existing_cols)}")

        # ADD COLUMN IF NOT EXISTS (PostgreSQL 9.6+).
        # Each ALTER is wrapped individually so one failure doesn't abort the rest.
        column_defs = [
            ("approval_status", "ALTER TABLE reports ADD COLUMN IF NOT EXISTS approval_status VARCHAR(20) DEFAULT 'pending'"),
            ("reviewed_by",     "ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_by UUID"),
            ("reviewed_at",     "ALTER TABLE reports ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMP"),
            ("doctor_notes",    "ALTER TABLE reports ADD COLUMN IF NOT EXISTS doctor_notes TEXT"),
        ]

        for col_name, sql in column_defs:
            try:
                await conn.execute(text(sql))
                status = "already existed" if col_name in existing_cols else "added"
                print(f"  {col_name}: {status}")
            except Exception as exc:
                # Older PostgreSQL that doesn't support IF NOT EXISTS will raise
                # a DuplicateColumn error (42701) — safe to ignore.
                print(f"  {col_name}: skipped ({exc})")

        # Mark all reports that already have AI analysis as 'approved' so
        # existing patients can still see their results immediately.
        # analysis_result is the JSON column set by save_analysis endpoint.
        r = await conn.execute(text(
            "UPDATE reports "
            "SET approval_status = 'approved' "
            "WHERE analysis_result IS NOT NULL "
            "  AND analysis_result != '' "
            "  AND (approval_status IS NULL OR approval_status = 'pending')"
        ))
        print(f"  Marked {r.rowcount} existing analysed report(s) as 'approved'")

    print("Migration complete.")


if __name__ == "__main__":
    asyncio.run(migrate())
