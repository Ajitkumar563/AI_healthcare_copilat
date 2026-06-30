"""
Migration: add family_member_id to reports + medicines to family_members.

Run: python migrate_family.py
Safe to run multiple times (skips if column already exists).
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "healthcare_copilot.db")


def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    for table, col, definition in [
        ("reports",        "family_member_id", "TEXT REFERENCES family_members(id)"),
        ("family_members", "medicines",         "TEXT"),
    ]:
        existing = [row[1] for row in cur.execute(f"PRAGMA table_info({table})").fetchall()]
        if col not in existing:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {col} {definition}")
            print(f"  Added {table}.{col}")
        else:
            print(f"  {table}.{col} already exists — skipped")

    conn.commit()
    conn.close()
    print("Done.")


if __name__ == "__main__":
    migrate()
