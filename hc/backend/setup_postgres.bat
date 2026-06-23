@echo off
echo Installing dependencies...
pip install -r requirements.txt
echo.
echo Creating PostgreSQL database...
psql -U postgres -c "CREATE DATABASE sahaay;"
echo.
echo Starting backend...
python -m uvicorn main:app --reload
pause
