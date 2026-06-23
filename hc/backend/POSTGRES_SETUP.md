# PostgreSQL Local Setup

## Prerequisites
1. Download and install PostgreSQL: https://www.postgresql.org/download/windows/
   - During install, set password as: password
   - Keep port as: 5432

## Setup Steps
1. Run setup_postgres.bat once
2. After that use start_backend.bat normally

## If password is different
Edit .env file and change:
DATABASE_URL=postgresql+asyncpg://postgres:YOUR_PASSWORD@localhost:5432/sahaay

## Notes
- Tables are created automatically on first startup via create_tables() in main.py
- Data from SQLite will not transfer — that is expected
- API docs available at http://localhost:8000/docs after startup
