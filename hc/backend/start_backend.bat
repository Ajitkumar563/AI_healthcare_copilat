@echo off
echo =================================================
echo  Sahaay Backend — Installing dependencies...
echo =================================================
pip install -r requirements.txt
echo.
echo =================================================
echo  Starting FastAPI server on http://localhost:8000
echo  API docs: http://localhost:8000/docs
echo =================================================
python -m uvicorn main:app --reload
pause
