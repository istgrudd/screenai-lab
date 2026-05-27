# ScreenAI Lab — MBC Laboratory Recruitment Screening System

An AI-powered candidate screening platform for **MBC Laboratory, Telkom University**, forked and adapted from [ScreenAI (Capstone)](https://github.com/istgrudd/screenai). Adds a candidate portal for student registration and multi-document upload (CV, KHS, KTM, Motivation Letter, SWOT, Dokumen Pendukung) on top of the inherited **Blind Screening** (NER), **Competency Evaluation** (RAG), and **Explainable AI** pipeline.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | FastAPI + SQLAlchemy + SQLite (dev) / PostgreSQL (prod) |
| Auth | JWT (python-jose) + bcrypt (direct, no passlib) |
| PDF Parsing | PyMuPDF |
| NER (Anonymization) | IndoBERT (`ageng-anugrah/indobert-large-p2-finetuned-ner`) |
| RAG & Orchestration | LangChain + ChromaDB |
| LLM Inference | DeepSeek V3 (OpenAI-compatible API) |
| Frontend | React + Vite + Tailwind CSS + shadcn/ui |

---

## Prerequisites

- Python 3.10+
- Node.js 18+
- DeepSeek API key (get one at [platform.deepseek.com](https://platform.deepseek.com))
- ~4 GB disk space (for IndoBERT model cache)

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/istgrudd/screenai-lab.git
cd screenai-lab
```

### 2. Backend

```bash
# Create and activate virtual environment
python -m venv venv
source venv/bin/activate       # Linux/macOS
venv\Scripts\activate          # Windows

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Open .env and fill in your DEEPSEEK_API_KEY
```

Run the backend:

```bash
uvicorn backend.main:app --reload --port 8000
```

API will be available at `http://localhost:8000`. Health check: `GET /api/health`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

UI will be available at `http://localhost:5173`.

### 4. Seed default rubric

```bash
python -m scripts.seed_rubric
```

This populates the database with a sample rubric for testing.

---

## Project Structure

```
screenai-lab/
├── backend/
│   ├── main.py              # FastAPI entry point
│   ├── models/              # SQLAlchemy ORM models
│   ├── routers/             # API route handlers
│   ├── services/            # Core pipeline logic
│   │   ├── extractor.py     # PDF → raw text (PyMuPDF)
│   │   ├── anonymizer.py    # NER-based identity masking
│   │   ├── rag_pipeline.py  # LangChain RAG orchestration
│   │   └── scoring.py       # Weighted score aggregation
│   └── utils/               # Helpers (PDF, NER, LLM client)
├── frontend/
│   └── src/
│       ├── pages/           # Candidate, Recruiter, Admin pages
│       └── components/      # UI components
├── scripts/
│   └── seed_rubric.py       # Seed default rubric
├── data/                    # Local data (gitignored)
├── requirements.txt
├── .env.example
├── PRD.md                   # Product requirements
└── CLAUDE.md                # Execution plan
```

---

## Features

### Inherited from Capstone
- **Blind Screening** — Automatic anonymization of names, contacts, institutions via IndoBERT NER + regex fallback
- **Rubric Configuration** — Define competency dimensions, weights, and indicators per division
- **RAG-based Scoring** — Embed rubric → retrieve relevant CV chunks → generate structured scores via DeepSeek V3
- **Explainable AI** — Every score includes specific CV evidence and a justification
- **Candidate Ranking** — Dashboard sorted by weighted composite score
- **Score Override** — Recruiters can manually adjust dimension scores
- **Batch Processing** — Evaluate all candidates for a rubric in one action

### Added in ScreenAI Lab
- **Candidate Portal** — Registration, login, profile, and multi-step document upload
- **KHS Parser** — Extract IPK + relevant courses from Telkom University transcripts
- **KTM Validator** — Rule-based NIM verification for Telkom students
- **SWOT Highlight** — Read-only panel for recruiter qualitative review
- **Dokumen Pendukung** — Manual verification checklist for supporting evidence
- **Application Status Tracker** — Recruitment journey visualization for candidates
- **RBAC** — Super Admin, Recruiter, Candidate roles with JWT-based auth

See [PRD.md](./PRD.md) for the full product spec and [CLAUDE.md](./CLAUDE.md) for the execution plan.

---

## Team

**MBC Laboratory** — Telkom University 2026
Forked from Capstone Design *Kelompok 26* (ScreenAI).
