import json
from typing import TypedDict, Literal

import sqlalchemy
from sqlalchemy import text as sa_text

from langgraph.graph import StateGraph, END
from langchain_ollama import ChatOllama
from langchain_core.messages import HumanMessage

from cav_engine.cav_engine import CAVEngine
# from schema_utils import normalize_schema_rules


class CAVState(TypedDict):
    user_intent: str  # Original natural language query
    schema_summary: str  # Plain-text schema context for the LLM
    draft_sql: str  # Current SQL candidate
    cav_feedback: str  # "PASS" or error string from CAV Engine
    execution_result: str  # Result rows or execution error
    iteration_count: int  # Number of correction attempts so far
    final_sql: str  # The accepted SQL after PASS
    error_history: list[str]  # Track all CAV errors across iterations


# ============================================================
# Helper: Build schema summary string for LLM context
# ============================================================


def build_ddl_summary(schema_rules: dict) -> str:
    statements = []
    for table, info in schema_rules["tables"].items():
        cols = []
        for col, meta in info["columns"].items():
            pk_marker = " PRIMARY KEY" if col in info["primary_keys"] else ""
            null_marker = " NOT NULL" if meta["not_null"] else ""
            cols.append(f"    {col} {meta['type'].upper()}{pk_marker}{null_marker}")
        for fk in info.get("foreign_keys", []):
            cols.append(
                f"    FOREIGN KEY ({fk['column']}) "
                f"REFERENCES {fk['references_table']}({fk['references_column']})"
            )
        block = f"CREATE TABLE {table} (\n" + ",\n".join(cols) + "\n);"
        statements.append(block)
    return "\n\n".join(statements)


# CAVWorkflow class
MAX_ITERATIONS = 3


def _message_text(content) -> str:
    if isinstance(content, str):
        return content.strip()
    if isinstance(content, list):
        parts = []
        for part in content:
            if isinstance(part, str):
                parts.append(part)
                continue
            text = getattr(part, "text", None)
            if text:
                parts.append(text)
                continue
            if isinstance(part, dict):
                parts.append(part.get("text", ""))
                continue
            parts.append(str(part))
        return "".join(parts).strip()
    return str(content).strip()


def _sanitize_sql(sql: str) -> str:
    sql = sql.strip().strip("'\"")
    # Remove any [SQL] prefix the model might echo
    if sql.upper().startswith("[SQL]"):
        sql = sql[5:]
    # Remove [/SQL] closing tag
    if "[/SQL]" in sql:
        sql = sql.split("[/SQL]")[0]
    # Remove markdown fences
    if sql.startswith("```"):
        sql = sql.split("```", 1)[1]
        if sql.lower().startswith("sql"):
            sql = sql[3:]
    return sql.strip()


def _make_prompt(question: str, schema_summary: str, error_feedback: str = "") -> str:
    from pathlib import Path

    prompt_path = Path(__file__).resolve().parent.parent / "config" / "cav-sql.md"
    with open(prompt_path, "r") as f:
        template = f.read()

    prompt = template.format(question=question, schema=schema_summary)
    if error_feedback:
        prompt = prompt.replace(
            "```sql",
            f"-- Previous attempt failed:\n-- {error_feedback}\n```sql",
            1,
        )
    return prompt


class CAVWorkflow:
    def __init__(
        self,
        engine: sqlalchemy.engine.Engine,
        schema_path: str,
        ollama_model: str = "qwen3:latest",
    ):
        self.engine = engine
        with open(schema_path) as f:
            self.schema_rules = json.load(f)
        # self.schema_summary = normalize_schema_rules(self.schema_rules)
        self.schema_summary = build_ddl_summary(self.schema_rules)
        self.cav = CAVEngine(self.schema_rules)
        self.llm = ChatOllama(
            model=ollama_model,
            temperature=0,
        )
        self.graph = self._build_graph()

    # ------------------------------------------------------------------ #
    # Node: Generator
    # ------------------------------------------------------------------ #
    def _make_prompt(
        self, question: str, error_msg: str = "", previous_sql: str = ""
    ) -> str:
        # 1. Read the external prompt file
        from pathlib import Path

        prompt_path = Path(__file__).resolve().parent.parent / "config" / "cav-sql.md"
        with open(prompt_path, "r") as f:
            template = f.read()

        # 2. Inject the dynamic question and the schema rulebook
        prompt = template.format(question=question, schema=self.schema_summary)

        # 3. THE CORRECTION NOTE INJECTION
        # If this is a retry loop, error_msg will not be empty.
        if error_msg:
            correction_block = (
                f"-- THE PREVIOUS ATTEMPT FAILED WITH THIS ERROR:\n"
                f"-- {error_msg}\n"
                f"-- Previous broken SQL: {previous_sql}\n"
                f"-- To fix a JOIN error, look closely at the schema summary. "
                f"You likely skipped a required intermediate table. Add the missing table to bridge the relationship correctly.\n"
            )
            # We slip the correction block right above the final ```sql trigger
            # so the model reads the error right before it starts typing code.
            prompt = prompt.replace("```sql", f"{correction_block}```sql")

        return prompt

    def _generator_node(self, state: CAVState) -> CAVState:
        iteration = state["iteration_count"]
        error_history = state.get("error_history", [])

        # Get the latest error if we are in a retry loop
        last_error = error_history[-1] if error_history else ""
        prev_sql = state.get("draft_sql", "")

        # Generate the master prompt
        prompt = self._make_prompt(
            question=state["user_intent"], error_msg=last_error, previous_sql=prev_sql
        )

        messages = [HumanMessage(content=prompt)]

        # Invoke the LLM
        response = self.llm.invoke(messages)
        raw = _sanitize_sql(_message_text(response.content))

        # print(f"\n[Generator] Iteration {iteration + 1} — Draft SQL:{raw}")

        return {**state, "draft_sql": raw, "iteration_count": iteration + 1}

    # ------------------------------------------------------------------ #
    # Node: CAV Verifier
    # ------------------------------------------------------------------ #

    def _verifier_node(self, state: CAVState) -> CAVState:
        # print(f"[CAV Verifier] Verifying SQL:{state['draft_sql']}")
        feedback = self.cav.verify_query(state["draft_sql"])
        # print(f"[CAV Verifier] Result: {feedback}")
        history = state.get("error_history", [])
        if feedback != "PASS":
            history = history + [feedback]
        return {**state, "cav_feedback": feedback, "error_history": history}

    # ------------------------------------------------------------------ #
    # Node: Executor
    # ------------------------------------------------------------------ #

    def _executor_node(self, state: CAVState) -> CAVState:
        sql = state["draft_sql"]
        try:
            # print(f"[Executor] Executing SQL:{sql}")
            with self.engine.connect() as conn:
                result = conn.execute(sa_text(sql))
                rows = [tuple(r) for r in result.fetchall()]
                cols = list(result.keys())
            result_json = json.dumps(
                {"columns": cols, "rows": rows}, indent=2, default=str
            )
            # print(f"[Executor] Success — {len(rows)} row(s) returned.")
        except Exception as e:
            result_json = f"Execution Error: {e}"
            # print(f"[Executor] {result_json}")
        return {**state, "execution_result": result_json, "final_sql": sql}

    # ------------------------------------------------------------------ #
    # Routing logic
    # ------------------------------------------------------------------ #

    def _route_after_verifier(
        self, state: CAVState
    ) -> Literal["executor", "generator", "end_max_retries"]:
        if state["cav_feedback"] == "PASS":
            return "executor"
        if state["iteration_count"] >= MAX_ITERATIONS:
            # print(f"[Router] Max iterations ({MAX_ITERATIONS}) reached. Stopping.")
            return "end_max_retries"
        return "generator"

    # ------------------------------------------------------------------ #
    # Graph assembly
    # ------------------------------------------------------------------ #

    def _build_graph(self):
        builder = StateGraph(CAVState)

        builder.add_node("generator", self._generator_node)
        builder.add_node("verifier", self._verifier_node)
        builder.add_node("executor", self._executor_node)

        builder.set_entry_point("generator")
        builder.add_edge("generator", "verifier")
        builder.add_conditional_edges(
            "verifier",
            self._route_after_verifier,
            {
                "executor": "executor",
                "generator": "generator",
                "end_max_retries": END,
            },
        )
        builder.add_edge("executor", END)

        return builder.compile()

    # ------------------------------------------------------------------ #
    # Public run method
    # ------------------------------------------------------------------ #

    def run(self, user_intent: str) -> CAVState:
        initial_state: CAVState = {
            "user_intent": user_intent,
            "schema_summary": self.schema_summary,
            "draft_sql": "",
            "cav_feedback": "",
            "execution_result": "",
            "iteration_count": 0,
            "final_sql": "",
            "error_history": [],
        }
        result = self.graph.invoke(initial_state)
        return result
