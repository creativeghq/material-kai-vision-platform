**Copilot / AI Agent Instructions for Material Kai Vision Platform**

This file gives concise, task-oriented context to help code-assist agents be productive immediately in this repository.

- **Project Purpose**: Material Kai Vision Platform converts PDF material catalogs into a searchable multi-vector knowledge base (text + image + color + texture embeddings) with AI agents and a FastAPI backend (`mivaa-pdf-extractor`).

- **Where to Look First**: `README.md` (root) and `mivaa-pdf-extractor/README.md` contain operational commands and architecture overviews. Key code paths:
  - Frontend: `src/` (React + TypeScript + Vite)
  - Backend API: `mivaa-pdf-extractor/app/` (FastAPI routes in `app/api/`, business logic in `app/services/`)
  - Documentation: `docs/` (flow diagrams, models, and pipeline stages)

- **Important Patterns & Conventions**:
  - Multi-vector design: six embedding types (text, CLIP visual, multimodal, color, texture, application). See `docs/*` and embedding-generation code under `mivaa-pdf-extractor/app/services/`.
  - Two-stage classification: lightweight fast classifier (Claude Haiku) + deep enrich (Claude Sonnet) for product detection — referenced in `README.md` and docs.
  - Chunk quality thresholds: quality scoring used across pipeline (common threshold: 0.7; borderline: 0.6–0.7). Search for `quality`/`score` in `mivaa-pdf-extractor/app`.
  - Duplicate detection: exact hash (SHA-256) + semantic similarity; hashing implemented near the extraction pipeline.
  - Search indexes: small datasets use HNSW; large datasets use IVFFlat. See docs and DB migration scripts in `supabase/migrations`.

- **Build / Run / Test Commands (copyable)**:
  - Frontend development: `npm install` then `npm run dev` (root)
  - Frontend build: `npm run build`
  - Frontend lint: `npm run lint` (also see VS Code task `eslint: lint whole folder`)
  - Backend (development):
    - `cd mivaa-pdf-extractor`
    - Install: `uv pip install -r requirements.txt` (or `pip install -r requirements.txt`)
    - Run: `uvicorn app.main:app --reload --host 0.0.0.0 --port 8000`
  - Backend (docker): `docker build -t mivaa-pdf-extractor:1.0.0 .` then `docker run -p 8000:8000 mivaa-pdf-extractor:1.0.0`
  - Frontend tests: `npm test`; Backend tests: `pytest` (from `mivaa-pdf-extractor`)
  - E2E helpers: `node scripts/testing/*.js`

- **Environment / Secrets**:
  - Frontend env vars: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_MIVAA_API_URL`
  - Backend env vars: `SUPABASE_*`, `OPENAI_API_KEY`, `ANTHROPIC_API_KEY`, `TOGETHER_API_KEY`, `SERVICE_ROLE` keys
  - Backend entrypoint uses `app.main:app` — ensure `.env` contains correct `SUPABASE_*` and AI keys when running.

- **Integration & External Services**:
  - Supabase (Postgres + pgvector) is the primary DB; see `supabase/functions` and `supabase/migrations` for DB logic.
  - AI providers: OpenAI, Anthropic, Together AI (Llama 4 Scout Vision / LLaMA Vision). Embedding dimensionality and caching rules are in `docs/`.
  - CI/CD: `.github/workflows/` contains automated tests and deployments; follow those workflows for branching rules.

- **Code Style & Tooling**:
  - Frontend: ESLint + Prettier; TypeScript with Vite. Use `npm run lint` before PRs.
  - Backend: Black + isort + mypy. Tests use `pytest` and live metrics endpoints are under `mivaa-pdf-extractor/app`.
  - Commits: Conventional Commits format.

- **Where to Apply Changes**:
  - Add API routes: `mivaa-pdf-extractor/app/api/` (route modules and routers)
  - Add business logic/services: `mivaa-pdf-extractor/app/services/`
  - Add frontend pages/components: `src/pages/` and `src/components/`

- **Quick Navigation Examples**:
  - To find API endpoints: open `mivaa-pdf-extractor/app/api/` and search for `@router`/`APIRouter` usages.
  - To find embedding generation: search for `embedding` under `mivaa-pdf-extractor/app/services` or in `docs/embeddings*`.
  - To locate PDF processing stages: read `docs/pdf-processing-pipeline.md` and the `mivaa-pdf-extractor` extraction modules.

- **What NOT To Change Without Checking Docs / Owners**:
  - Vector index strategy tuning (HNSW vs IVFFlat) — affects production search latency/costs.
  - Embedding dimensionality or switching provider models — verify docs and tests.
  - Auth / RLS / Supabase schema changes — coordinate with migrations under `supabase/migrations`.

If anything is unclear or you want the file to include additional examples (code snippets, exact file paths, or CI hints), tell me what to add and I will update this file.
