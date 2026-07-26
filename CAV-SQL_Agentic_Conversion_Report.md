# CAV-SQL: Bug Fixes, Agentic Conversion, and Evaluation Roadmap

**Current state:** Single-LLM-call pipeline wrapped in a fixed 3-node state machine. Not an agent — control flow is hardcoded, not model-decided.
**Target state:** Tool-calling agent with memory, evaluation harness, and production-safe guardrails.

---

## Part 1 — Bugs to Fix (Tier 1: Correctness, Not Optional)

These are active defects, not missing features. They cost points/credibility regardless of whether the agentic conversion happens.

| # | Bug | Location | Impact | Fix |
|---|---|---|---|---|
| 1 | Global mutable state `active_system = {}` | `api.py` | Two concurrent users silently corrupt each other's DB session — User A's queries run against User B's database | Key sessions by `session_id`, store in a dict (single-process) or Redis (multi-process) |
| 2 | Conflicting import paths: `cav_engine.cav_workflow` vs `agent_workflow.cav_workflow` | `api.py` vs `main.py` | Repo doesn't run consistently; first thing a reviewer finds | Pick one package name, fix both entry points, verify both actually run |
| 3 | `async def run_query` blocks the event loop on synchronous `.invoke()` and `conn.execute()` | `api.py` | One slow query stalls every other concurrent request on that worker | Wrap in `asyncio.to_thread(...)`, or use `ChatOllama.ainvoke` + async SQLAlchemy |
| 4 | No statement-type guardrail — CAV never checks if SQL is `SELECT` vs `DELETE`/`DROP`/`UPDATE` | `cav_engine.py` | A "verification" system that doesn't block destructive statements | In `verify_query`, reject via `stmt.key` check before running column/join checks |

**Effort:** ~4-6 hours total. **Do these first, unconditionally** — every other improvement is undermined if a reviewer hits any of these.

---

## Part 2 — Evaluation Harness (Tier 2: Highest Leverage)

This is the single highest-value addition. It converts unfalsifiable claims ("I built a verification loop") into evidence ("40% reduction in invalid SQL, measured across 30 cases").

### What to build
1. **Test set:** 25-40 hand-written `(question, expected_sql_or_result)` pairs against a known public schema (Chinook or Northwind — verifiable by anyone).
2. **Metric:** execution-match, not string-match — compare result rows, since equivalent SQL can differ syntactically.
3. **Comparison run:** execute the full set twice —
   - CAV verification loop **enabled** (current system)
   - CAV verification loop **disabled** (single-shot, no retry)
   - Report the delta in pass rate and average iteration count.
4. **Persist results** to a committed file (`eval_results.json`) — not just console output.

### Minimal script shape
```python
def eval_dataset(workflow, cases: list[dict]):
    results = []
    for case in cases:
        state = workflow.run(case["question"])
        actual = json.loads(state.get("execution_result", "{}")) if state.get("execution_result") else {}
        results.append({
            "question": case["question"],
            "passed_cav": state["cav_feedback"] == "PASS",
            "iterations": state["iteration_count"],
            "result_match": actual.get("rows") == case.get("expected_rows"),
        })
    return results
```

**Effort:** ~2 days (writing good cases that exercise join errors, ambiguous columns, multi-table queries takes real thought — the code itself is simple).

**Why this matters beyond the score:** this is explicitly what production interview/application questions ask for — "what did it measure, how did you define success/failure, how was it used to improve the system." Without this artifact, there is no honest answer to that question.

---

## Part 3 — Logging & Observability (Tier 4)

Currently all diagnostic output is commented-out `print()` statements — nothing survives a request.

- Log every run: `question`, `draft_sql`, `final_sql`, `iteration_count`, `error_history`, latency, success/failure — to SQLite or JSONL.
- Replace `print()` with the `logging` module at appropriate levels (INFO for normal flow, WARNING for CAV failures, ERROR for execution failures).

**Effort:** ~2-3 hours. **Why it matters:** turns "how did it behave in production" from an unanswerable question into "here's a log of N real runs and their outcomes."

---

## Part 4 — Documentation (Tier 5)

- README with: architecture summary (even ASCII diagram), your eval numbers stated up front, explicit **limitations section** (concurrency status, no DML support, memory scope), setup instructions.
- Frame accurately: call this "a self-correcting SQL generation pipeline with schema verification," not "agentic" or "multi-agent" — until Part 5 below is actually built.
- An honest limitations section pre-empts the "gotcha" question in review rather than inviting it.

**Effort:** ~1-2 hours, disproportionate return — this is what gets read first and frames everything else.

---

## Part 5 — Making It Actually Agentic

The current system is not an agent: `_route_after_verifier` is a hardcoded `if/else`. **The defining change is that an LLM must decide what happens next, not your code.**

### 5.1 — Why sqlcoder-7b can't be the orchestrator
sqlcoder-7b is completion-tuned for one task (NL→SQL). It is not instruction/tool-calling-tuned. `bind_tools()` on it will not reliably produce tool-call JSON. **Keep sqlcoder as a specialist tool; add a separate tool-calling-capable model as the orchestrator** (e.g. `qwen2.5:14b-instruct`, `llama3.1:8b-instruct` locally, or Claude/GPT-4o-mini hosted).

### 5.2 — Convert existing nodes into tools
```python
from langchain_core.tools import tool

@tool
def generate_sql(question: str, error_feedback: str = "") -> str:
    """Draft SQL for a natural language question. Pass error_feedback on retry."""
    prompt = build_prompt(question, schema_summary, error_feedback)
    return _sanitize_sql(sqlcoder_llm.invoke(prompt).content)

@tool
def verify_sql(sql: str) -> str:
    """Check SQL against schema for invalid tables/columns/joins. Returns PASS or error."""
    return cav_engine.verify_query(sql)

@tool
def execute_sql(sql: str) -> str:
    """Execute a verified SELECT query. Refuses non-SELECT statements."""
    if not _is_select_only(sql):
        return "Error: only SELECT statements may be executed."
    return run_query_safely(sql)

@tool
def inspect_schema(table_name: str) -> str:
    """Get columns, types, and foreign keys for a specific table."""
    return json.dumps(schema_rules["tables"].get(table_name, "Table not found"))

@tool
def ask_user_clarification(question: str) -> str:
    """Use when the request is ambiguous and cannot be resolved from schema alone."""
    return f"CLARIFICATION_NEEDED: {question}"
```

Note: `inspect_schema` and `ask_user_clarification` are **new capabilities**, not refactors of existing code — they're what actually enables agentic behavior, since the model can now choose to look something up or stop and ask instead of blindly retrying the same fixed correction.

### 5.3 — Let the orchestrator drive
```python
from langgraph.prebuilt import create_react_agent

orchestrator = ChatOllama(model="qwen2.5:14b-instruct", temperature=0)
agent = create_react_agent(
    model=orchestrator,
    tools=[generate_sql, verify_sql, execute_sql, inspect_schema, ask_user_clarification],
)
result = agent.invoke({"messages": [("system", ORCHESTRATOR_SYSTEM_PROMPT), ("user", question)]})
```

System prompt should specify the **strategy space**, not fixed steps — e.g. "if verification fails due to a missing join table, inspect_schema before retrying rather than guessing blind; if the question is genuinely ambiguous, ask_user_clarification instead of guessing; cap total attempts at 4."

### 5.4 — Guardrails matter *more* here, not less
More autonomy = more surface area for something to go wrong. Keep every guardrail from the deterministic version in code, not just in the prompt:
- Hard-reject non-SELECT in `execute_sql` at the code level (prompt instructions are not a security boundary)
- Cap total tool calls per run (e.g. 8) to bound latency/cost
- Log every tool call the orchestrator makes — the execution path is no longer predictable from reading code alone, so this becomes essential rather than optional

### 5.5 — Behavioral difference to be able to articulate
| Old (deterministic) | New (agentic) |
|---|---|
| Fixed 3-retry loop regardless of error type | Model chooses strategy per error type |
| Never asks the user anything | Can recognize ambiguity and stop to clarify |
| Verify/execute are hardcoded graph edges | Tools the model elects to call, in any order |
| New capability requires touching graph control flow | New tool = new capability, no control-flow changes |

**Risk note:** this is a bigger, riskier change than Parts 1-4 — new model, new failure modes (small local models can be flaky at reliable tool-call formatting), harder to eval. **Do not attempt this half-finished under time pressure** — a working deterministic pipeline with honest framing outperforms a broken "agentic" one every time it's tested.

---

## Part 6 — Memory

### Short-term (conversational) — do this even under time pressure
Enables follow-ups like "and only for the west region" resolving against the prior query. Use LangGraph's built-in checkpointer rather than threading history manually:

```python
from langgraph.checkpoint.sqlite import SqliteSaver

self.graph = builder.compile(checkpointer=SqliteSaver.from_conn_string("cav_memory.db"))
self.graph.invoke(initial_state, config={"configurable": {"thread_id": session_id}})
```

**Effort:** ~half a day. This is the one memory feature worth having even in a compressed timeline — it's a real, demoable capability and directly answers "how did you handle memory/state for long-running tasks?" with working code rather than a plan.

### Long-term (few-shot retrieval) — do this only if time allows
Store every `(question, verified_sql)` pair that passes CAV in a vector store; retrieve top-k similar past questions as few-shot examples in future prompts.

```python
# on successful verification:
vectorstore.add_texts([state["user_intent"]], metadatas=[{"sql": state["draft_sql"]}])
# in prompt construction:
examples = vectorstore.similarity_search(question, k=3)
```

**Why it matters beyond memory:** sqlcoder-7b is highly sensitive to good few-shot examples — this is also your biggest lever for *reducing retry count*, which is your primary latency bottleneck. Two birds.

---

## Priority Order (If Time Is Constrained)

1. **Part 1 — Bug fixes** (unconditional; ~4-6 hrs)
2. **Part 2 — Eval harness** (highest leverage; ~2 days)
3. **Part 4 — README / honest framing** (cheap, high return; ~1-2 hrs)
4. **Part 3 — Logging** (~2-3 hrs)
5. **Part 6.1 — Short-term memory only** (~half day)
6. **Part 5 — Full agentic conversion** — only attempt if 1-4 are solid and time remains; otherwise document as a clearly-labeled "Future Work" section with the tool list and orchestrator-model reasoning above, rather than shipping a partial, unreliable build

Items 1-4 alone move this from "unverified prototype" to "evidence-backed system with known, documented limitations" — which is the more defensible position under scrutiny than an incomplete agentic rebuild.

---

## Known Ceiling

Some improvements can't be compressed into any short timeline regardless of effort: statistically meaningful evaluation (100+ cases across multiple schemas), real concurrent-load testing, and hardening that only surfaces after other people — not you — have tried to break the system. Don't simulate these; state them as explicit future work. An honest account of what hasn't been tested yet is more credible than an inflated claim that collapses under one good follow-up question.
