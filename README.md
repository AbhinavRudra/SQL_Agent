# CAV-SQL: Constraint-Aware Verification for Reliable Agentic Text-to-SQL

CAV-SQL is an advanced Text-to-SQL architecture designed to solve the "silent failure" and semantic hallucination problems inherent in standard Large Language Model (LLM) Text-to-SQL agents.

Unlike standard agents that blindly execute generated SQL against a live database and rely on post-execution database tracebacks for error correction, CAV-SQL introduces a **pre-execution deterministic guardrail**. By parsing generated queries into an Abstract Syntax Tree (AST) and mathematically verifying joins and schema constraints against a pre-extracted rulebook, CAV-SQL guarantees that logically invalid queries never touch the live database.

---

## 🗂️ Project Structure

The project uses a modular, enterprise-grade architecture, separating database connections, semantic parsing, agentic workflows, and evaluation pipelines.

```text
CAV-SQL_Project/
├── .env                              # Environment variables (DB credentials, model selection)
├── requirements.txt                  # Python dependencies (langchain, sqlglot, sqlalchemy)
│
├── Config/
│   ├── load_env.py                   # Securely loads .env variables
│   ├── pg_connector.py               # Centralized SQLAlchemy engine and database connection
│   └── cav-sql.md                    # Externalized system prompt enforcing strict LLM behavior
│
├── schema/
│   ├── schema.py                     # Introspects DB to map relationships and types
│   └── schema_extracted_fixed.json   # The generated JSON rulebook (The "Source of Truth")
│
├── cav_engine/
│   └── cav_engine.py                 # AST-based SQL constraint verifier (The Core Novelty)
│
├── workflow/
│   ├── cav_workflow.py               # LangGraph state machine (Generator → Verifier → Executor)
│   ├── agent.py                      # (Alternative) LangChain ReAct Agent implementation
│   ├── agent_toolkit.py              # (Alternative) Toolkit configuring schema-reading tools
│   └── cav_tools.py                  # (Alternative) Custom @tool intercepting standard execution
│
├── eval/
│   ├── benchmark.py                  # Automated EX evaluation pipeline
│   └── benchmark_results.csv         # Results tracking Execution Accuracy and Interventions
│
└── main.py                           # End-to-end interactive terminal application
```

---

## ⚙️ Setup & Installation

### 1. Install dependencies:

```bash
pip install -r requirements.txt
```

### 2. Configure your Environment:

Create a `.env` file in the root directory with your PostgreSQL database credentials and preferred local model:

```env
POSTGRES_USER=your_user
POSTGRES_PASSWORD=your_password
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=your_database
DATABASE_URL=postgresql://your_user:your_password@localhost:5432/your_database
OLLAMA_MODEL=hf.co/defog/sqlcoder-7b-2:Q5_K_M
```

---

## 🚀 Usage

### 1. Generate the Schema Rulebook:

Run this script any time your database schema changes. It dynamically extracts all tables, columns, Primary Keys, and Foreign Key relationships.

```bash
python3 schema/schema.py
```

### 2. Run the Interactive Application (LangGraph):

Start the interactive terminal session to ask questions in natural language and watch the CAV Engine intercept LLM hallucinations in real-time.

```bash
python3 main.py
```

### 3. Run the Evaluation Benchmark:

Run the automated benchmarking suite to evaluate the baseline system against the CAV-SQL pipeline.

```bash
python3 eval/benchmark.py
```

---

## 🧠 How It Works (The CAV-SQL Loop)

When a user submits a question, the state machine dictates the flow, physically preventing database execution until the AST verifier mathematically proves the query is sound.

```text
User NL Query
     │
     ▼
┌─────────────┐
│  Generator  │ ← LLM drafts SQL (via Ollama) using `cav-sql.md` instructions
│    Node     │ ← On retry: Receives targeted CAV constraint error
└──────┬──────┘
       │ draft_sql
       ▼
┌─────────────┐
│ CAV Verifier│ ← sqlglot AST parse → Deterministic check for column existence 
│    Node     │   and valid FK/PK JOINs against `schema_extracted_fixed.json`
└──────┬──────┘
       │
  ┌────┴────────────────┐
  │ PASS                │ Error (Max 3 Retries)
  ▼                     ▼
┌──────────┐     Back to Generator
│ Executor │     with specific SQL logic error 
│   Node   │     injected before the next generation.
└──────────┘
```

---

## 🔬 Key Innovations

* **Deterministic Guardrails**: Replaces standard LLM probabilistic critics with programmatic AST parsing using sqlglot.
* **Zero-Execution Validation**: Catches JOIN and column hallucinations without ever querying the live database, eliminating the risk of destructive or runaway queries.
* **Agentic Self-Correction**: Seamlessly integrates with LangGraph and LangChain tool-calling APIs to automatically repair failed queries using targeted error feedback.
