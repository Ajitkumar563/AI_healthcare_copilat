import psycopg2
from psycopg2 import sql
import os
from dotenv import load_dotenv

load_dotenv()

# Try to create the database
password = input("Postgresql321 ")
try:
    conn = psycopg2.connect(
        host="localhost",
        port=5432,
        user="postgres",
        password=password
    )
    conn.autocommit = True
    cursor = conn.cursor()
    cursor.execute("SELECT 1 FROM pg_database WHERE datname='sahaay'")
    if not cursor.fetchone():
        cursor.execute(sql.SQL("CREATE DATABASE {}").format(sql.Identifier('sahaay')))
        print("✅ Database 'sahaay' created successfully!")
    else:
        print("✅ Database 'sahaay' already exists!")

    # Update .env file
    env_path = ".env"
    with open(env_path, "r") as f:
        content = f.read()

    import re
    new_url = f"postgresql+asyncpg://postgres:{password}@localhost:5432/sahaay"
    content = re.sub(r'DATABASE_URL=.*', f'DATABASE_URL={new_url}', content)

    with open(env_path, "w") as f:
        f.write(content)

    print(f"✅ .env updated with your password!")
    print("Now run: python -m uvicorn main:app --reload")

    cursor.close()
    conn.close()
except Exception as e:
    print(f"❌ Error: {e}")
    print("Make sure PostgreSQL is running and password is correct")
