# 🏥 Sahaay — AI Healthcare Copilot

> Developed by **Prarthna Gautam**

An intelligent AI-powered healthcare platform that helps patients understand 
their medical reports, track their health, and connect with doctors.

## 👩‍💻 Developer
- **Name:** Prarthna Gautam
- **Email:** prarthnagautam1094@gmail.com
- **Project:** Sahaay AI Healthcare Copilot

## 🚀 Features
- 🤖 AI-powered medical report analysis
- 📊 Health risk scoring (Liver, Heart, Diabetes, Kidney)
- 💬 Chat with your medical reports
- 🏥 Hospital management dashboard
- 👨‍👩‍👧 Family health tracking
- 💊 Medicine interaction checker
- 🗣️ Voice assistant
- 📱 WhatsApp health alerts (Twilio)
- 🌍 Multi-language support (English, Hindi, Hinglish, Arabic, French)
- 📅 Appointment booking with video consultation (Jitsi Meet)
- 🚨 Emergency risk detection with alerts
- 📄 PDF health summary download
- ⚕️ Doctor approval workflow
- 📈 Lab report trend graphs
- 💉 Prescription scanner (OCR + AI)
- 🔬 Medicine interaction checker
- 🏨 Multi-hospital enterprise system
- 🔐 Role-based access (Patient, Doctor, Admin)

## 🛠️ Tech Stack
**Frontend:** Next.js 16, TypeScript, Tailwind CSS, Framer Motion  
**Backend:** FastAPI (Python), PostgreSQL, SQLAlchemy  
**AI:** Google Gemini AI  
**Other:** Twilio WhatsApp API, Jitsi Meet (Video), ReportLab (PDF)

## ⚙️ Setup

### Prerequisites
- Python 3.10+
- Node.js 18+
- PostgreSQL

### Backend
```bash
cd hc/backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
python reset_db.py
python seed_doctors.py
python seed_hospital.py
python -m uvicorn main:app --reload
```

### Frontend
```bash
cd hc/frontend
npm install
npm run dev
```

## 🔑 Environment Variables
Create `hc/backend/.env`:
```
DATABASE_URL=postgresql+asyncpg://postgres:password@localhost:5432/sahaay
GEMINI_API_KEY=your_gemini_key
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_WHATSAPP_FROM=whatsapp:+14155238886
TWILIO_WHATSAPP_TO=whatsapp:+91XXXXXXXXXX
```

## 📱 Demo Credentials
- **Patient:** Login with OTP (any email)
- **Hospital Admin:** admin@sahaaytest.com / Admin@1234
- **Doctor:** dr.sharma@sahaaytest.com / Doctor@1234

## 🌐 URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

## ⚠️ Disclaimer
This application is for informational purposes only and is not a substitute 
for professional medical advice. Always consult a qualified doctor.

---
© 2026 Prarthna Gautam — Sahaay AI Healthcare Copilot
