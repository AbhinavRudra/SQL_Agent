# CAV-SQL — Constraint-Aware Verified SQL Agent

**A self-correcting Text-to-SQL pipeline that verifies generated SQL against your database schema *before* it ever touches the database.**

CAV-SQL takes a natural-language question, drafts a SQL query with a specialized SQL-generation LLM, and runs it through a deterministic, constraint-aware AST verifier that checks table names, column names, and join paths against the real schema. If the draft fails, the system feeds the specific error back to the model and retries — catching hallucinated tables/columns/joins before they ever reach the database, rather than relying on a runtime SQL error.

> **Framing note:** the current system is a self-correcting generation-and-verification pipeline with a fixed retry loop, not a fully autonomous multi-tool agent. An LLM-orchestrated, tool-calling version (where the model itself decides whether to inspect the schema, retry, or ask for clarification) is on the roadmap — see [Roadmap](#roadmap) below.

---

## How it works

```
 ┌─────────────┐      ┌────────────────┐      ┌──────────────────────┐
 │  Question   │ ───► │  Generate SQL   │ ───► │   CAV Verifier        │
 │ (natural    │      │  (sqlcoder-7b)  │      │  (schema-aware AST    │
 │  language)  │      │                │      │   check: tables,      │
 └─────────────┘      └────────────────┘      │   columns, joins)     │
                              ▲                └──────────┬────────────┘
                              │                            │
                              │   error feedback            │ PASS
                              │   (retry, bounded)           ▼
                              └──────────────────  ┌──────────────────┐
                                                    │  Execute SELECT   │
                                                    │  against database │
                                                    └──────────────────┘
```

1. **Generate** — a SQL-specialized LLM (e.g. `sqlcoder-7b` via Ollama) drafts a query from the user's question and a schema summary.
2. **Verify (CAV)** — before execution, the draft is parsed and checked against the actual database schema: do the referenced tables and columns exist, are the joins valid? This step is deterministic code, not another model call — it can't hallucinate a "pass."
3. **Retry loop** — if verification fails, the specific error is fed back to the generator for another attempt, up to a bounded number of iterations.
4. **Execute** — once verified, the query runs against the database and results are returned to the UI.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | Next.js (`app/` router), React, Tailwind |
| UI components | shadcn/ui-style components (`components/`, `components.json`) |
| Agent / orchestration | Python, LangGraph (fixed state-machine graph) |
| SQL generation | `sqlcoder-7b` (or similar) via Ollama |
| Verification | Custom AST-based schema verifier (`cav_engine`) |
| Backend API | Python (FastAPI-style `api.py`) |
| Logging | `run_logging.py` |

---

## Project structure

```
.
├── app/                  # Next.js app router pages
├── components/           # React UI components
├── hooks/                # React hooks
├── lib/                  # Frontend utility code
├── public/                # Static assets
├── styles/                # Global styles
├── sql_agent/             # Python backend: SQL generation, CAV verifier, LangGraph workflow
├── reports/               # Generated run / eval reports
├── run_logging.py         # Logging entry point for backend runs
├── middleware.ts           # Next.js middleware
├── components.json         # shadcn/ui component config
└── CAV-SQL_Agentic_Conversion_Report.md   # Engineering roadmap / design notes
```

---

## Getting started

### Prerequisites

- Node.js 18+ and `pnpm` (a `pnpm-lock.yaml` is committed)
- Python 3.10+
- [Ollama](https://ollama.com) running locally with a SQL-generation model pulled (e.g. `sqlcoder`) and an instruction-tuned model if using clarification/orchestration features
- A target SQL database (schema-configured) to query against

### 1. Clone the repo

```bash
git clone https://github.com/AbhinavRudra/SQL_Agent.git
cd SQL_Agent
```

### 2. Install frontend dependencies

```bash
pnpm install
```

### 3. Set up the Python backend

```bash
cd sql_agent
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
```

### 4. Configure your database & model

Point the backend at your target database connection string and configure the local model endpoint (Ollama, etc.) via environment variables / config file in `sql_agent/`.

### 5. Run the backend

```bash
uvicorn api:app
```

### 6. Run the frontend

```bash
pnpm dev
```

Visit `http://localhost:3000` and start asking questions in natural language.

---

## Known limitations

This project is under active iteration. As of now:

- **Single-session assumption** — concurrent multi-user sessions are not yet fully isolated; avoid running multiple simultaneous sessions against different databases until this is hardened.
- **No DML support** — only `SELECT` queries are intended to be executed; destructive statements (`DELETE`, `UPDATE`, `DROP`) should be rejected, and this guardrail should be treated as a hard requirement, not a soft one.
- **No persistent conversational memory yet** — each query is currently handled independently; follow-up questions like "and only for the west region" are not yet resolved against prior context.
- **Evaluation is a work in progress** — a repeatable eval harness (execution-match accuracy against a known schema, CAV-enabled vs. disabled) is being built out to replace anecdotal claims with measured numbers.

---

## Contributing

Issues and pull requests are welcome. If you're picking up an item from the roadmap above, feel free to open an issue first to coordinate.

## License

No license file is currently present in this repository. Until one is added, please contact the repository owner before reusing this code.
