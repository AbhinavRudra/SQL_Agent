"""
main.py — Interactive single-question interface for CAV-SQL.

Run:
    python main.py
"""

from os import environ
import json

import sqlalchemy

from sql_agent.agent_workflow.cav_workflow import CAVWorkflow

# ============================================================
# Config
# ============================================================

from pathlib import Path
from dotenv import load_dotenv

# 1. Load Environment Variables

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)


DATABASE_URL = environ.get("DATABASE_URL")
SCHEMA_PATH  = environ.get("SCHEMA_PATH", "schema_extracted_fixed.json")
OLLAMA_MODEL = environ.get("OLLAMA_MODEL", "hf.co/defog/sqlcoder-7b-2:Q5_K_M")

engine = sqlalchemy.create_engine(DATABASE_URL)


# ============================================================
# Result printer
# ============================================================

def print_result(state: dict):
    sql = state.get("final_sql") or state.get("draft_sql", "")
    print(f"\n{'='*60}")
    print(f"SQL Generated ({state['iteration_count']} iteration(s)):")
    print(f"  {sql}")

    if state.get("error_history"):
        print("\nCAV Errors caught:")
        for i, e in enumerate(state["error_history"], 1):
            print(f"  {i}. {e}")

    exec_result = state.get("execution_result", "")
    if exec_result:
        try:
            parsed = json.loads(exec_result)
            cols = parsed.get("columns", [])
            rows = parsed.get("rows", [])
            print(f"\nResult — {len(rows)} row(s):")
            if cols:
                header = "  " + " | ".join(str(c).ljust(20) for c in cols)
                print(header)
                print("  " + "-" * (len(header) - 2))
            for row in rows:
                print("  " + " | ".join(str(cell).ljust(20) for cell in row))
        except Exception:
            print(f"\nResult:\n  {exec_result}")
    else:
        print("\nNo result — max retries reached without passing CAV verification.")
    print(f"{'='*60}\n")


# ============================================================
# Main
# ============================================================

def main():
    if not DATABASE_URL:
        raise EnvironmentError("Set DATABASE_URL before running.")

    workflow = CAVWorkflow(
        engine=engine,
        schema_path=SCHEMA_PATH,
        ollama_model=OLLAMA_MODEL,
    )

    print("\nCAV-SQL — Ask a question about your database.")
    print("Type 'exit' or 'quit' to stop.\n")

    while True:
        try:
            question = input("Question: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nExiting.")
            break

        if not question:
            continue
        if question.lower() in ("exit", "quit"):
            print("Exiting.")
            break

        state = workflow.run(question)
        print_result(state)


if __name__ == "__main__":
    main()