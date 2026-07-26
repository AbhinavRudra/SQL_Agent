import os
from os import environ
import asyncio
import logging
import sys
import time
from pathlib import Path
from typing import Optional
from uuid import uuid4
from threading import Lock

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine

from langchain_core.messages import HumanMessage, AIMessage

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from schema.schema import SchemaExtractor
from agent_workflow.sql_agent_cav import build_cav_sql_agent
from run_logging import append_run_record

logger = logging.getLogger(__name__)

app = FastAPI(
    title="CAV-SQL API", description="Agentic Text-to-SQL Verification Engine"
)

origins = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

ORCHESTRATOR_MODEL = environ.get("OLLAMA_ORCHESTRATOR_MODEL", "qwen3:latest")
GENERATOR_MODEL = environ.get(
    "OLLAMA_GENERATOR_MODEL", "hf.co/defog/sqlcoder-7b-2:Q5_K_M"
)

active_system: dict[str, dict] = {}
active_system_lock = Lock()


class ConnectRequest(BaseModel):
    db_url: str


class QueryRequest(BaseModel):
    text: Optional[str] = None
    question: Optional[str] = None
    session_id: Optional[str] = None


def schema_dict_to_tables(schema_dict: dict) -> list[dict]:
    tables: list[dict] = []
    for table_name, table_data in schema_dict.get("tables", {}).items():
        primary_keys = set(table_data.get("primary_keys", []))
        columns = []
        for column_name, column_data in table_data.get("columns", {}).items():
            columns.append(
                {
                    "name": column_name,
                    "type": column_data.get("type", ""),
                    "nullable": not column_data.get("not_null", False),
                    "primaryKey": column_name in primary_keys,
                }
            )
        foreign_keys = []
        for foreign_key in table_data.get("foreign_keys", []):
            foreign_keys.append(
                {
                    "column": foreign_key.get("column", ""),
                    "references": {
                        "table": foreign_key.get("references_table", ""),
                        "column": foreign_key.get("references_column", ""),
                    },
                }
            )
        tables.append(
            {"name": table_name, "columns": columns, "foreignKeys": foreign_keys}
        )
    return tables


@app.post("/connect-db")
async def connect_database(req: ConnectRequest) -> dict:
    global active_system
    try:
        logger.info("Connecting database for new session.")
        engine = create_engine(req.db_url)
        extractor = SchemaExtractor(engine)
        extractor.extract_base_columns()
        extractor.extract_primary_keys()
        extractor.extract_foreign_keys()

        os.makedirs("_schema", exist_ok=True)
        schema_path = os.path.join(
            os.getcwd(), "_schema", "schema_extracted_fixed.json"
        )
        extractor.export_to_json(schema_path)
        session_id = str(uuid4())

        with active_system_lock:
            active_system[session_id] = {
                "agent": build_cav_sql_agent(
                    db_url=req.db_url,
                    schema_path=schema_path,
                    orchestrator_model=ORCHESTRATOR_MODEL,
                    generator_model=GENERATOR_MODEL,
                ),
                "schema_path": schema_path,
                "chat_history": [],
            }

        logger.info("Database connected and session initialized: %s", session_id)
        return {
            "status": "success",
            "message": "Database connected and CAV rules initialized.",
            "session_id": session_id,
            "schema_path": schema_path,
            "schema": schema_dict_to_tables(extractor.schema_dict),
        }
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/query")
async def run_query(req: QueryRequest) -> dict:
    session_id = req.session_id
    question = req.text or req.question

    if not session_id:
        logger.warning("Query rejected: missing session_id.")
        raise HTTPException(status_code=400, detail="Missing session_id.")

    with active_system_lock:
        session_state = active_system.get(session_id)
        session_state["chat_history"] = (
            session_state["chat_history"]
            + [
                HumanMessage(content=question),
                AIMessage(content=session_state.get("output", "")),
            ]
        )[-10:]  # keep last 5 turns — unbounded history blows up prompt size

    if not session_state or "agent" not in session_state:
        logger.warning("Query rejected: no agent for session %s.", session_id)
        raise HTTPException(
            status_code=400, detail="No active database connection for this session."
        )

    if not question:
        raise HTTPException(status_code=400, detail="Missing query text.")

    logger.info("Query started for session %s.", session_id)
    start_time = time.perf_counter()

    try:
        state = await asyncio.to_thread(
            session_state["agent"].run,
            question,
            chat_history=session_state.get("chat_history", []),
        )
    except Exception as exc:
        latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
        logger.error("Query failed for session %s: %s", session_id, exc)
        append_run_record(
            {
                "session_id": session_id,
                "question": question,
                "draft_sql": "",
                "final_sql": "",
                "iteration_count": 0,
                "error_history": [str(exc)],
                "latency_ms": latency_ms,
                "success": False,
                "failure": True,
                "status": "error",
                "source": "api.query",
            }
        )
        raise HTTPException(status_code=500, detail=str(exc))

    latency_ms = round((time.perf_counter() - start_time) * 1000, 2)
    execution_result = state.get("execution_result", "")
    draft_sql = state.get("draft_sql", "")
    final_sql = state.get("final_sql", "")
    error_history = state.get("error_history", [])
    success = bool(execution_result) and not execution_result.startswith(
        ("CAV_ERROR:", "Error")
    )

    logger.info("Query completed for session %s. Success=%s", session_id, success)

    append_run_record(
        {
            "session_id": session_id,
            "question": question,
            "draft_sql": draft_sql,
            "final_sql": final_sql,
            "iteration_count": state.get("iteration_count", 0),
            "error_history": error_history,
            "latency_ms": latency_ms,
            "success": success,
            "failure": not success,
            "status": "success" if success else "failure",
            "source": "api.query",
        }
    )

    return {
        "draft_sql": draft_sql,
        "final_sql": final_sql,
        "errors_prevented": len(error_history),
        "execution_result": execution_result or "{}",
        "session_id": session_id,
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
