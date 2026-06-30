"""
PostgreSQL migration: add family_member_id to reports + medicines to family_members.
Reads DATABASE_URL from .env.  Safe to run multiple times (ADD COLUMN IF NOT EXISTS).

Run: python migrate_pg_family.py
"""
import asyncio
import os
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL", "")

# asyncpg needs postgresql:// not postgresql+asyncpg://
ASYNCPG_URL = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://").replace("postgresql://", "postgresql://")


async def migrate():
    try:
        import asyncpg
    except ImportError:
        print("asyncpg not installed — using psycopg2 fallback")
        _migrate_sync()
        return

    url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    conn = await asyncpg.connect(dsn=url)
    try:
        for table, col, definition in [
            ("reports",        "family_member_id", "UUID REFERENCES family_members(id)"),
            ("reports",        "approval_status",  "VARCHAR(20) DEFAULT 'pending'"),
            ("reports",        "reviewed_by",       "UUID REFERENCES users(id)"),
            ("reports",        "reviewed_at",       "TIMESTAMP"),
            ("reports",        "doctor_notes",      "TEXT"),
            ("family_members", "medicines",          "TEXT"),
        ]:
            exists = await conn.fetchval(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name=$1 AND column_name=$2",
                table, col
            )
            if not exists:
                await conn.execute(f'ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {definition}')
                print(f"  Added {table}.{col}")
            else:
                print(f"  {table}.{col} already exists — skipped")
    finally:
        await conn.close()
    print("Migration complete.")


def _migrate_sync():
    import psycopg2
    from urllib.parse import urlparse

    url = DATABASE_URL.replace("postgresql+asyncpg://", "postgresql://")
    conn = psycopg2.connect(url)
    conn.autocommit = True
    cur = conn.cursor()
    for table, col, definition in [
        ("reports",        "family_member_id", "UUID REFERENCES family_members(id)"),
        ("reports",        "approval_status",  "VARCHAR(20) DEFAULT 'pending'"),
        ("reports",        "reviewed_by",       "UUID REFERENCES users(id)"),
        ("reports",        "reviewed_at",       "TIMESTAMP"),
        ("reports",        "doctor_notes",      "TEXT"),
        ("family_members", "medicines",          "TEXT"),
    ]:
        cur.execute(
            "SELECT column_name FROM information_schema.columns "
            "WHERE table_name=%s AND column_name=%s",
            (table, col)
        )
        if not cur.fetchone():
            cur.execute(f"ALTER TABLE {table} ADD COLUMN IF NOT EXISTS {col} {definition}")
            print(f"  Added {table}.{col}")
        else:
            print(f"  {table}.{col} already exists — skipped")
    cur.close()
    conn.close()
    print("Migration complete.")


if __name__ == "__main__":
    if not DATABASE_URL:
        print("ERROR: DATABASE_URL not set")
        raise SystemExit(1)
    print(f"Migrating: {DATABASE_URL[:50]}...")
    asyncio.run(migrate())
