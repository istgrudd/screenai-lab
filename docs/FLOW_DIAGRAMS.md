# Flow Diagrams

Mermaid diagrams covering the major runtime sequences in ScreenAI Lab.

> Render these in any Markdown viewer that supports Mermaid (GitHub, VSCode preview, MkDocs Material, etc.). Each diagram links back to the modules it depicts in [MODULE_ANALYSIS.md](MODULE_ANALYSIS.md) and the endpoints in [API_REFERENCE.md](API_REFERENCE.md).

---

## 1. Backend Bootstrap

What happens when uvicorn starts the FastAPI app. The lifespan hook ensures filesystem state, applies pending Alembic migrations, and idempotently seeds one empty rubric per division.

```mermaid
sequenceDiagram
    participant U as uvicorn
    participant F as FastAPI app<br/>(backend/main.py)
    participant LS as lifespan handler
    participant S as Settings
    participant DB as Database (SQLAlchemy)
    participant AL as Alembic (upgrade head)
    participant RS as rubric_seeding

    U->>F: import + start
    F->>LS: enter lifespan
    LS->>S: ensure_data_dirs()
    Note right of S: mkdir -p data/raw_pdfs<br/>data/extracted, data/anonymized<br/>uploads/, backend/vectorstore/
    LS->>DB: import backend.models
    Note right of DB: registers Base.metadata
    LS->>AL: command.upgrade(cfg, "head")
    AL-->>DB: apply 6 pending migrations
    LS->>RS: seed_division_rubrics(db)
    RS-->>DB: INSERT 4 empty rubrics<br/>(idempotent)
    LS-->>F: ✅ ready
    F->>U: app accepts requests
```

Source: [backend/main.py:33–66](../backend/main.py#L33), [backend/database.py::init_db](../backend/database.py#L50), [backend/services/rubric_seeding.py](../backend/services/rubric_seeding.py).

---

## 2. Frontend Bootstrap

Browser load → role-aware landing page. Recruiter / super_admin land on `/` and see `DashboardPage` directly; candidate lands on `/dashboard`.

```mermaid
sequenceDiagram
    participant B as Browser
    participant V as Vite bundle
    participant A as App.jsx
    participant R as react-router
    participant RR as RootRedirect
    participant Auth as lib/auth.js

    B->>V: GET / (index.html)
    V-->>B: src/main.jsx loaded
    B->>A: render <App />
    A->>R: BrowserRouter + Routes
    R->>RR: path == "/"
    RR->>Auth: isAuthenticated()
    alt no token / expired
        Auth-->>RR: false
        RR-->>R: <Navigate to="/login">
    else valid JWT
        Auth-->>RR: true
        RR->>Auth: getCurrentUser()
        Auth-->>RR: { role }
        alt role = candidate
            RR-->>R: <Navigate to="/dashboard">
        else role ∈ {recruiter, super_admin}
            RR-->>R: render DashboardPage<br/>inside ProtectedRoute
        end
    end
```

Source: [frontend/src/App.jsx:175–192](../frontend/src/App.jsx#L175), [frontend/src/lib/auth.js](../frontend/src/lib/auth.js).

---

## 3. Auth Flow (Register / Login / Bearer)

End-to-end auth: registration creates a candidate, login returns a JWT, subsequent requests use the token, and protected routes go through `get_current_user` + (optionally) `require_role`.

```mermaid
sequenceDiagram
    participant FE as Frontend (lib/api.js)
    participant Auth as routers/auth.py
    participant Sec as utils/security.py
    participant Svc as services/auth_service.py
    participant DB as DB
    participant MW as middleware/auth_middleware.py

    Note over FE,DB: REGISTER
    FE->>Auth: POST /api/auth/register
    Auth->>DB: SELECT users WHERE email/nim
    DB-->>Auth: none
    Auth->>Sec: hash_password(plaintext)
    Sec-->>Auth: bcrypt hash
    Auth->>DB: INSERT users (role=candidate)
    Auth->>Svc: create_access_token(user)
    Svc-->>Auth: JWT
    Auth-->>FE: 201 { access_token, user }
    FE->>FE: localStorage.setItem(token)

    Note over FE,DB: LOGIN
    FE->>Auth: POST /api/auth/login
    Auth->>Svc: authenticate_user(db, email, pwd)
    Svc->>DB: SELECT user
    Svc->>Sec: verify_password
    alt invalid
        Svc-->>Auth: AuthResult.INVALID
        Auth-->>FE: 401
    else deactivated
        Svc-->>Auth: AuthResult.DEACTIVATED
        Auth-->>FE: 403
    else ok
        Svc-->>Auth: User
        Auth->>Svc: create_access_token
        Auth-->>FE: 200 { access_token, user }
    end

    Note over FE,DB: PROTECTED REQUEST
    FE->>MW: GET /api/applications/my<br/>Authorization: Bearer <jwt>
    MW->>Svc: decode_access_token
    Svc-->>MW: payload {sub, role, exp, ...}
    MW->>DB: SELECT user WHERE id = sub
    alt user missing or inactive or invalid token
        MW-->>FE: 401
    else ok and require_role passes
        MW-->>FE: hand off to route handler
    end
```

Source: [backend/routers/auth.py](../backend/routers/auth.py), [backend/services/auth_service.py](../backend/services/auth_service.py), [backend/middleware/auth_middleware.py](../backend/middleware/auth_middleware.py), [backend/utils/security.py](../backend/utils/security.py).

---

## 4. RecruitmentPeriod Phase Transition

The phase is a pure function of `(period, now)` — derived in [period_utils.py](../backend/utils/period_utils.py). The state machine:

```mermaid
stateDiagram-v2
    direction LR
    [*] --> UPCOMING : period created<br/>start_date in future

    UPCOMING --> SUBMISSION : now ≥ start_date
    SUBMISSION --> EVALUATION : now ≥ submission_end_date
    EVALUATION --> ANNOUNCEMENT : now ≥ evaluation_end_date
    ANNOUNCEMENT --> CLOSED : now ≥ end_date
    CLOSED --> [*]

    state "manual close (super_admin)" as MC
    SUBMISSION --> MC : PUT /periods/{id}/close
    EVALUATION --> MC : PUT /periods/{id}/close
    ANNOUNCEMENT --> MC : PUT /periods/{id}/close
    MC --> CLOSED : end_date := now,<br/>is_active := false

    note right of UPCOMING
      Legacy periods without
      submission_end / evaluation_end
      collapse those onto end_date —
      one continuous SUBMISSION
      window then CLOSED.
    end note
```

Phase semantics drive **gate enforcement** elsewhere:

| Phase | Submission | Evaluation | Bulk announcement |
|---|---|---|---|
| UPCOMING | 403 (period belum dibuka) | soft warn | 403 (super_admin bypass) |
| SUBMISSION | ✅ allowed | soft warn | 403 (super_admin bypass) |
| EVALUATION | 403 (pendaftaran ditutup) | ✅ "in window" | 403 (super_admin bypass) |
| ANNOUNCEMENT | 403 | soft warn | ✅ allowed |
| CLOSED | 403 (periode berakhir) | soft warn | 403 (super_admin bypass) |

Source: [backend/routers/applications.py:260](../backend/routers/applications.py#L260) (submit gate), [backend/routers/evaluate_batch.py:103](../backend/routers/evaluate_batch.py#L103) (soft-warn), [backend/routers/announcements.py:171](../backend/routers/announcements.py#L171) (bulk gate).

---

## 5. Candidate Submission Flow

End-to-end from "create application" to "submitted, NER scheduled".

```mermaid
sequenceDiagram
    participant C as Candidate (UI)
    participant API as Backend API
    participant DB as DB
    participant FS as uploads/ (disk)
    participant BG as BackgroundTasks
    participant NER as run_submit_anonymization

    Note over C,API: 1. Create application
    C->>API: POST /api/applications<br/>{ division }
    API->>DB: INSERT applications (status=draft)
    API-->>C: 201 ApplicationOut

    Note over C,API: 2. Upload 6 documents (looped)
    loop each doc_type ∈ {cv, khs, ktm, ml, swot, supporting_docs}
        C->>API: POST /api/documents/upload/{doc_type}
        API->>API: validate MIME + size (file_storage)
        API->>FS: write uploads/{app_id}/{doc_type}.{ext}
        API->>DB: UPSERT documents row
        API-->>C: 201 doc payload
    end

    Note over C,API: 3. Review + acknowledge + submit
    C->>API: POST /api/applications/{id}/submit
    API->>DB: SELECT active RecruitmentPeriod
    alt no active period
        API-->>C: 403 "Tidak ada periode aktif"
    else phase != SUBMISSION
        API-->>C: 403 (phase-aware Indonesian message)
    else missing required docs
        API-->>C: 400 { missing: ["khs", ...] }
    else all OK
        API->>DB: UPDATE applications<br/>status=submitted, submitted_at, period_id
        API->>BG: schedule run_submit_anonymization(app_id, fresh_db)
        API-->>C: 200 ApplicationOut
        Note right of API: BackgroundTask runs<br/>after the response is sent
        BG->>NER: extract → normalize → anonymize<br/>(CV + Motivation Letter)
        NER->>DB: UPSERT Candidate (rubric_id=null)
        NER->>DB: UPSERT CandidateDocument(s)<br/>with anonymized_text
    end
```

Source: [backend/routers/applications.py:212–307](../backend/routers/applications.py#L212), [backend/services/submit_anonymization.py](../backend/services/submit_anonymization.py).

---

## 6. Document Anonymization Pipeline (submit-time)

Detail of the BackgroundTask that fires after a successful submit. Failures are logged but never raised (the server must keep running).

```mermaid
flowchart TD
    A[Submit committed → BackgroundTask fires] --> B[Load Application from fresh db session]
    B --> C{Application exists?}
    C -- no --> Z[log warning + return]
    C -- yes --> D[Ensure Candidate row<br/>rubric_id=None, status=anonymized]

    D --> E{For each doc_type<br/>in &#123;CV, MOTIVATION_LETTER&#125;}
    E --> F[Lookup Document for this app + doc_type]
    F --> G{Found and file exists on disk?}
    G -- no --> E
    G -- yes --> H[extract_text_from_pdf<br/>PyMuPDF .get_text&#40;'text'&#41;]
    H --> I{raw_text empty?}
    I -- yes --> E
    I -- no --> J[normalize_and_segment<br/>text cleanup + section split]
    J --> K[anonymize_text<br/>NER + regex + context patterns]
    K --> L[UPSERT CandidateDocument<br/>raw_text, normalized_text,<br/>anonymized_text, entities_json]
    L --> E

    E -. all docs processed .-> M[db.commit&#40;&#41;]
    M --> N[log: NER completed for app X]
    N --> Z2[finally: db.close&#40;&#41;]

    style A fill:#dff
    style Z fill:#fee
    style Z2 fill:#efe
```

Source: [backend/services/submit_anonymization.py](../backend/services/submit_anonymization.py), [backend/services/anonymizer.py](../backend/services/anonymizer.py), [backend/services/extractor.py](../backend/services/extractor.py).

---

## 7. RAG Query Flow (Evaluation per Candidate)

What `_evaluate_one` does for a single application. Note: rubric context is currently inlined into the prompt; ChromaDB is wired but not used for retrieval at this point.

```mermaid
sequenceDiagram
    participant ES as evaluation_service<br/>_evaluate_one
    participant DB as DB
    participant KTM as ktm_validator
    participant KHS as khs_parser
    participant ANO as anonymizer<br/>(fallback)
    participant RAG as rag_pipeline.<br/>evaluate_candidate
    participant LLM as llm_client.call_llm_json_async
    participant DS as DeepSeek model
    participant SC as scoring.store_evaluation_results

    ES->>DB: load Application + User
    ES->>KTM: validate_ktm(file_path, expected_nim=user.nim)
    ES->>KHS: parse_khs(file_path)
    ES->>DB: ensure Candidate (set rubric_id)
    ES->>DB: SELECT CandidateDocument<br/>WHERE doc_type='cv'<br/>AND anonymized_text IS NOT NULL
    alt cache hit (submit-time NER ran)
        DB-->>ES: cached anonymized_text
    else cache miss
        ES->>ANO: extract → normalize → anonymize CV
        ANO-->>ES: anonymized_text
        ES->>ANO: same for motivation_letter (best-effort)
    end
    ES->>ES: prepend KHS block<br/>+ append ML block to full_text
    ES->>RAG: evaluate_candidate(<br/>{anonymized_text}, rubric_id, db)
    RAG->>DB: load Rubric + Dimensions
    RAG->>RAG: build SYSTEM_PROMPT<br/>+ rubric_context<br/>+ user_prompt
    RAG->>LLM: await call_llm_json_async(...)
    LLM->>DS: await chat.completions.create<br/>(temp=0.1, max=4096)
    DS-->>LLM: response.choices[0].message.content
    LLM->>LLM: strip ```json fence<br/>+ json.loads (3 retries)
    LLM-->>RAG: dict (dimension_scores + summary)
    RAG->>RAG: clamp scores 0–100, fuzzy-match dim names,<br/>fill missing dims with score=0
    RAG-->>ES: { composite_score, dimension_scores[], profile_summary }
    ES->>SC: store_evaluation_results(candidate_id, rubric_id, evaluation, db)
    SC->>DB: DELETE old DimensionScores for (candidate, rubric)
    SC->>DB: INSERT new DimensionScores
    SC->>DB: UPDATE Candidate.composite_score = weighted_total + lang_bonus<br/>status='scored'
```

Source: [backend/services/evaluation_service.py:165–325](../backend/services/evaluation_service.py#L165), [backend/services/rag_pipeline.py](../backend/services/rag_pipeline.py), [backend/services/scoring.py](../backend/services/scoring.py), [backend/utils/llm_client.py](../backend/utils/llm_client.py).

---

## 8. Batch Evaluation Flow (Recruiter-Initiated)

What happens when the recruiter clicks **Run Evaluation**.

```mermaid
flowchart TD
    A[Recruiter clicks Run Evaluation] --> B[POST /api/recruiter/evaluate/batch<br/>division, application_ids?, force?]
    B --> C[Load rubric WHERE division=X]
    C --> D{Rubric found?}
    D -- no --> E[404]
    D -- yes --> F{Rubric has dimensions?}
    F -- no --> G[400 'Please set up the rubric first']
    F -- yes --> H[SELECT Application<br/>WHERE division=X AND status=SUBMITTED<br/>+ optional id filter]

    H --> I{force=true?}
    I -- yes --> K[evaluate every row]
    I -- no --> J[skip rows whose Candidate<br/>already has composite_score]

    J --> K
    K --> L{For each Application}
    L --> M[_evaluate_one app, rubric, db]
    M --> N{exception?}
    N -- yes --> O[append to errors, traceback]
    N -- no --> P[Application.status = SCREENING]
    O --> L
    P --> L

    L -. done .-> Q[db.commit]
    Q --> R[Compute warning:<br/>None if active period in EVALUATION,<br/>else 'Evaluasi di luar window']
    R --> S[200 envelope with<br/>data, evaluated_count, skipped_count, warning]

    style E fill:#fee
    style G fill:#fee
```

Source: [backend/routers/evaluate_batch.py](../backend/routers/evaluate_batch.py), [backend/services/evaluation_service.py:49–158](../backend/services/evaluation_service.py#L49).

---

## 9. Bulk Announcement Flow

The recruiter selects passing candidates per division and clicks **Publish Hasil**. The endpoint is gated by phase (super_admin bypasses) and runs in a single transaction.

```mermaid
sequenceDiagram
    participant R as Recruiter (UI)
    participant API as POST /api/announcements/bulk
    participant DB as DB
    participant Phase as period_utils.get_current_phase
    participant Aud as AuditLog

    R->>API: { division, period_id, passed_application_ids: [int] }
    API->>DB: SELECT RecruitmentPeriod WHERE id=period_id
    alt period missing
        API-->>R: 404
    else found
        alt caller != super_admin
            API->>Phase: get_current_phase(period, now)
            Phase-->>API: phase
            alt phase != ANNOUNCEMENT
                API-->>R: 403 "Pengumuman hanya..."
            end
        end

        API->>DB: SELECT Application<br/>WHERE division=X AND period_id=Y<br/>AND status IN (screening, announced_pass, announced_fail)
        DB-->>API: scope (set of ids)
        API->>API: invalid = passed_ids - scope_ids
        alt invalid not empty
            API-->>R: 400 "Application(s) {invalid} do not belong to..."
        else valid
            loop each app in scope
                API->>API: new_status = PASS if id in passed else FAIL
                alt status changed
                    API->>DB: UPDATE applications.status
                    API->>Aud: INSERT AuditLog(action_type='bulk_announcement', old, new)
                end
            end
            API->>DB: db.commit()
            API-->>R: 200 { announced_pass, announced_fail, division, period_id }
        end
    end
```

Source: [backend/routers/announcements.py:139–242](../backend/routers/announcements.py#L139).

---

## 10. Frontend Page Hierarchy

Component tree at runtime. Public auth pages render outside the `AuthenticatedShell`; everything else is wrapped in the sidebar layout.

```mermaid
graph TD
    Root[main.jsx] --> App[App.jsx]
    App --> BR[BrowserRouter]
    BR --> Routes
    Routes --> P[Public]
    Routes --> AS[AuthenticatedShell<br/>Sidebar + main]

    P --> Login[LoginPage]
    P --> Reg[RegisterPage]

    AS --> RR[RootRedirect /]
    AS --> CT[Candidate tree]
    AS --> RT[Recruiter tree]
    AS --> AT[Admin tree]

    CT --> CD[/dashboard - DashboardPage/]
    CT --> CP[/profile - ProfilePage/]
    CT --> CDoc[/documents - DocumentsPage]
    CT --> CR[/review - ReviewPage/]
    CT --> CS[/submitted - SubmittedPage/]
    CT --> CRes[/result - ResultPage/]
    CT --> CHist[/my-applications/]
    CT --> CUp[/upload - legacy/]

    RT --> RDash[/ - DashboardPage/]
    RT --> RRub[/rubrics - RubricConfigPage/]
    RT --> RDet[/candidates/:id - CandidateDetailPage/]
    RT --> RProf[/recruiter/profile/]

    AT --> AUsers[/admin/users - AdminPage/]
    AT --> APer[/admin/periods - RecruitmentPeriodPage/]
    AT --> AProf[/admin/profile/]

    CDoc -.uses.-> DUS[DocumentUploadStep × 6]
    RDet -.uses.-> OD[OverrideDialog]
    RDet -.uses.-> JC[JustificationCard]
    RDet -.uses.-> SHP[SwotHighlightPanel]

    CD -.uses.-> RPC[RecruitmentPhaseCard]
    CD -.uses.-> RJ[RecruitmentJourney]
    RDash -.uses.-> RPC
    AUsers -.uses.-> RPC
```

Every authenticated route is wrapped with `<ProtectedRoute roles={[...]}>` (see [App.jsx](../frontend/src/App.jsx)). The Sidebar nav set is derived from `getCurrentUser().role`.

Source: [frontend/src/App.jsx](../frontend/src/App.jsx), [frontend/src/components/](../frontend/src/components/).

---

## 11. API Client Request Lifecycle

How every frontend API call goes through the same wrapper.

```mermaid
sequenceDiagram
    participant Page as React page
    participant API as lib/api.js<br/>request()
    participant Auth as lib/auth.js
    participant BE as Backend
    participant LS as localStorage

    Page->>API: e.g. listRecruiterApplications(...)
    API->>Auth: getToken()
    Auth->>LS: getItem("screenai_lab.token")
    LS-->>Auth: token | null
    Auth-->>API: token
    API->>BE: fetch(BASE_URL + endpoint,<br/>headers={Authorization: Bearer token})

    alt 401
        BE-->>API: 401
        API->>Auth: removeToken()
        Auth->>LS: removeItem(...)
        API->>Page: window.location.assign("/login")
        API->>Page: throw "Unauthorized"
    else !res.ok
        BE-->>API: 4xx/5xx + {detail}
        API->>Page: throw new Error(detail)
    else ok
        BE-->>API: { success, data, error }
        alt success === false
            API->>Page: throw new Error(error)
        else
            API->>Page: return data
        end
    end
```

Source: [frontend/src/lib/api.js:15–56](../frontend/src/lib/api.js#L15).

---

## 12. Composite Scoring Math

Reference for how the final composite score is built. Useful when reading override/recompute paths in [candidates.py](../backend/routers/candidates.py).

```
For one candidate against one rubric:

  weighted_score_d   = score_d × weight_d           # per dimension
  weighted_total     = Σ weighted_score_d
  language_bonus     = cefr_from_score(language_score)[1]    # 0, 2, 4, 6, 8

  composite_score    = round(weighted_total + language_bonus, 2)

EPrT TOTAL SCORE  →  CEFR  →  bonus
  ≤ 336                A1      0.0
  337-459              A2      2.0
  460-542              B1      4.0
  543-626              B2      6.0
  627-677              C1      8.0
  out of [310,677]     null    0.0  (rejected as invalid certificate)
```

Source: [backend/services/scoring.py:19–40](../backend/services/scoring.py#L19), [backend/services/rag_pipeline.py:166–230](../backend/services/rag_pipeline.py#L166).
