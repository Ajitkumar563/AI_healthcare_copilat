# Healthcare Copilot

## Setup

### 1. PostgreSQL start karo
```
cd docker
docker-compose up -d
```

### 2. Backend
```
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

### 3. Frontend
```
cd frontend
npm install
npm run dev
```

API Docs: http://localhost:8000/docs
