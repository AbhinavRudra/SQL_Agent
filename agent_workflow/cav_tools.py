from langchain_core.tools import tool
from sqlalchemy import text as sa_text
from Config.pg_connector import engine  # Import your existing database engine
from cav_engine import CAVEngine


# Initialize your engine using the extracted schema
cav_engine = CAVEngine("schema_extracted_fixed.json")

@tool
def execute_cav_sql(sql_query: str) -> str:
    """
    Executes a SQL query against the database.
    You MUST pass your final generated SQL query to this tool.
    If it returns a CAV_ERROR, read the error carefully, fix your SQL, and try again.
    """
    print(f"\n[Tool Intercept] Verifying: {sql_query}")
    
    # 1. The Pre-Execution Novelty Check
    verification_result = cav_engine.verify_query(sql_query)
    
    if verification_result != "PASS":
        # 2. The Correction Trigger
        print(f"[Tool Intercept] Blocked by CAV: {verification_result}")
        return f"CAV_ERROR: Logical Verification Failed. {verification_result}."
    
    # 3. Safe Execution
    print("[Tool Intercept] CAV Passed. Executing against database...")
    try:
        with engine.connect() as conn:
            result = conn.execute(sa_text(sql_query))
            rows = [tuple(r) for r in result.fetchall()]
            return f"SUCCESS. Rows returned: {rows[:50]}"
    except Exception as e:
        return f"DATABASE_ERROR: {e}"