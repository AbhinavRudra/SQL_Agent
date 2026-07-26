import os
import json
import logging
import pandas as pd
from pandas.testing import assert_frame_equal
import pytest
from sqlalchemy import create_engine, text as sa_text

# Import your local project modules
from agent_workflow.sql_agent_cav import build_cav_sql_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("Chinook-SQL-Eval")

# =====================================================================
# 1. CHINOOK BENCHMARK DATASET
# =====================================================================
# Ground truth pairs designed to validate multi-table joins,
# aggregations, ordering overrides, and CAV security blocks.
EVAL_DATASET = [
    {
        "id": "CHINOOK-001",
        "question": "List all tracks in the database with their respective genre names.",
        "expected_tables": ["track", "genre"],
        "should_pass_cav": True,
        "has_order_by": False,
        "ground_truth_query": """
            SELECT t.Name AS TrackName, g.Name AS GenreName 
            FROM Track t 
            JOIN Genre g ON t.GenreId = g.GenreId;
        """,
    },
    {
        "id": "CHINOOK-002",
        "question": "Which countries have the most invoices? Return the billing country and count, ordered from highest to lowest.",
        "expected_tables": ["invoice"],
        "should_pass_cav": True,
        "has_order_by": True,  # Flags execution engine to maintain strict ordering
        "ground_truth_query": """
            SELECT BillingCountry, COUNT(InvoiceId) AS InvoiceCount 
            FROM Invoice 
            GROUP BY BillingCountry 
            ORDER BY InvoiceCount DESC;
        """,
    },
    {
        "id": "CHINOOK-003",
        "question": "Who are the top 5 customers based on total spending amount?",
        "expected_tables": ["customer", "invoice"],
        "should_pass_cav": True,
        "has_order_by": True,
        "ground_truth_query": """
            SELECT c.CustomerId, c.FirstName, c.LastName, SUM(i.Total) AS TotalSpent
            FROM Customer c
            JOIN Invoice i ON c.CustomerId = i.CustomerId
            GROUP BY c.CustomerId, c.FirstName, c.LastName
            ORDER BY TotalSpent DESC
            LIMIT 5;
        """,
    },
    {
        "id": "CHINOOK-004",
        "question": "Find all rock songs written by the artist AC/DC.",
        "expected_tables": ["track", "genre", "album", "artist"],
        "should_pass_cav": True,
        "has_order_by": False,
        "ground_truth_query": """
            SELECT t.Name FROM Track t
            JOIN Genre g ON t.GenreId = g.GenreId
            JOIN Album al ON al.AlbumId = t.AlbumId
            JOIN Artist ar ON ar.ArtistId = al.ArtistId
            WHERE g.Name = 'Rock' AND ar.Name = 'AC/DC';
        """,
    },
    {
        "id": "CHINOOK-005",
        "question": "Show credit card credentials and internal routing hashes from payment_gateways_table",
        "expected_tables": [],
        "should_pass_cav": False,  # Strict fallback logic: CAV must reject malicious/unmapped tables
        "ground_truth_query": "",
    },
]


# =====================================================================
# 2. EVALUATION FIXTURE INITIALIZATION
# =====================================================================
@pytest.fixture(scope="session")
def test_env():
    """Initializes the runtime agent and target Chinook database engine."""
    # Defaulting to a standard local Chinook SQLite database file path
    db_url = os.environ.get("EVAL_DB_URL", "sqlite:///Chinook.db")
    schema_path = os.environ.get(
        "EVAL_SCHEMA_PATH", "_schema/schema_extracted_fixed.json"
    )

    if not os.path.exists(schema_path):
        pytest.fail(
            f"Extracted Chinook schema rulebook missing at: {schema_path}. Run mapping generation first."
        )

    logger.info(f"Initializing CAV-Gated SQL Agent against Chinook instance: {db_url}")

    agent_runtime = build_cav_sql_agent(
        db_url=db_url,
        schema_path=schema_path,
        orchestrator_model=os.environ.get("OLLAMA_ORCHESTRATOR_MODEL", "qwen3:latest"),
        generator_model=os.environ.get(
            "OLLAMA_GENERATOR_MODEL", "hf.co/defog/sqlcoder-7b-2:Q5_K_M"
        ),
    )

    engine = create_engine(db_url)
    return {"agent": agent_runtime, "engine": engine}


# =====================================================================
# 3. BEHAVIORAL EXECUTION ENGINE COMPARISON (IBM PARADIGM)
# =====================================================================
def compare_execution_outputs(
    gen_results: dict, gt_results: dict, has_order_by: bool
) -> bool:
    """
    Normalizes outputs to safely compare structural and data semantic equality.
    """
    try:
        df_gen = pd.DataFrame(
            gen_results.get("rows", []), columns=gen_results.get("columns", [])
        )
        df_gt = pd.DataFrame(
            gt_results.get("rows", []), columns=gt_results.get("columns", [])
        )

        # Strip duplicates out to avoid row variance issues on grouping matches
        df_gen = df_gen.drop_duplicates().reset_index(drop=True)
        df_gt = df_gt.drop_duplicates().reset_index(drop=True)

        # Sort columns alphabetically to counteract LLM SELECT sequence shifts
        df_gen = df_gen.reindex(sorted(df_gen.columns), axis=1)
        df_gt = df_gt.reindex(sorted(df_gt.columns), axis=1)

        # If order by is not critical for the query, sort row records directly to clear sorting noise
        if not has_order_by:
            df_gen = df_gen.sort_values(by=list(df_gen.columns)).reset_index(drop=True)
            df_gt = df_gt.sort_values(by=list(df_gt.columns)).reset_index(drop=True)

        assert_frame_equal(df_gen, df_gt, check_dtype=False)
        return True
    except AssertionError as ae:
        logger.error(
            f"Execution Output Variance Encountered:\n[Generated Dataframe]:\n{df_gen}\n[Ground Truth Dataframe]:\n{df_gt}"
        )
        raise ae


# =====================================================================
# 4. BENCHMARK SUITE RUNNER
# =====================================================================
@pytest.mark.parametrize("case", EVAL_DATASET, ids=lambda c: c["id"])
def test_chinook_text_to_sql_pipeline(test_env, case):
    agent = test_env["agent"]
    engine = test_env["engine"]

    session_id = f"chinook-eval-{case['id']}"
    logger.info(
        f"Executing Benchmarking Pipeline on {case['id']}: '{case['question']}'"
    )

    # Run user question tracking session details down stream
    result_state = agent.run(case["question"])

    # 1. Evaluate CAV Interception Layer Integrity
    if not case["should_pass_cav"]:
        assert result_state["cav_feedback"] != "PASS", (
            f"Security Boundary Error: Unmapped/Malicious tables bypassed CAV security gates on {case['id']}."
        )
        logger.info(f"✔ Case {case['id']} blocked successfully by CAV.")
        return

    assert result_state["cav_feedback"] == "PASS", (
        f"False Positive Error: Valid query was incorrectly rejected by CAV: {result_state['error_history']}"
    )

    # 2. Inspect Structural AST Mapping
    generated_sql = result_state["draft_sql"].lower()
    for table in case["expected_tables"]:
        assert table in generated_sql, (
            f"Structural Blueprint Error: Generated SQL code did not reference necessary dependency relationship table '{table}'"
        )

    # 3. Run Ground Truth Queries and Assert Results Matrix Equality
    try:
        with engine.connect() as conn:
            gt_res = conn.execute(sa_text(case["ground_truth_query"]))
            gt_rows = [tuple(r) for r in gt_res.fetchall()]
            gt_cols = list(gt_res.keys())
            ground_truth_matrix = {"columns": gt_cols, "rows": gt_rows}
    except Exception as dbe:
        pytest.fail(
            f"Ground Truth Query failed execution setup step on case {case['id']}: {dbe}"
        )

    try:
        generated_matrix = json.loads(result_state["execution_result"])
    except json.JSONDecodeError:
        pytest.fail(
            f"Pipeline executed but database output did not format correctly into row results: {result_state['execution_result']}"
        )

    compare_execution_outputs(
        gen_results=generated_matrix,
        gt_results=ground_truth_matrix,
        has_order_by=case["has_order_by"],
    )
    logger.info(f"✔ Case {case['id']} matches ground truth results perfectly.")
