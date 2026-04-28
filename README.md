# Warehouse Native Experimentation Platform

This project implements a warehouse-native experimentation platform with:

- `backend/`: FastAPI API plus a shared SQLite warehouse (`backend/data/experiment.db`)
- `frontend/`: Next.js App Router UI for simulation controls, analysis, and health checks

## Run locally

### Backend

```bash
cd /Users/anasfarah/Documents/ExperimentationPlatform/backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend

```bash
cd /Users/anasfarah/Documents/ExperimentationPlatform/frontend
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_BASE_URL` if your API is not running at `http://127.0.0.1:8000`.
