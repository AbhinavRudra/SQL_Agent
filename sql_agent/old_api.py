import os
from os import environ
import sys
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from schema.schema import SchemaExtractor
from cav_engine.cav_workflow import CAVWorkflow

app = FastAPI(
    title="CAV-SQL API", description="Agentic Text-to-SQL Verification Engine"
)

origins = [
    "http://localhost:3000",
    # Add more origins here
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_URL = environ.get("DATABASE_URL")
SCHEMA_PATH = environ.get("SCHEMA_PATH", "schema_extracted_fixed.json")
OLLAMA_MODEL = environ.get("OLLAMA_MODEL", "hf.co/defog/sqlcoder-7b-2:Q5_K_M")

# Global state to hold the active workflow engine
active_system = {}


class ConnectRequest(BaseModel):
    db_url: str


class QueryRequest(BaseModel):
    text: Optional[str] = None
    question: Optional[str] = None


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
            {
                "name": table_name,
                "columns": columns,
                "foreignKeys": foreign_keys,
            }
        )

    return tables


@app.post("/connect-db")
async def connect_database(req: ConnectRequest) -> dict:
    global active_system
    """Dynamically connects to a database, extracts schema, and spins up CAV-SQL."""
    try:
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
        # Initialize the workflow and store it in global state
        # active_system["workflow"] = CAVWorkflow(engine=engine, schema_path=schema_path)
        active_system["workflow"] = CAVWorkflow(
            engine=engine,
            schema_path=schema_path,
            ollama_model=OLLAMA_MODEL,
        )

        return {
            "status": "success",
            "message": "Database connected and CAV rules initialized.",
            "schema_path": schema_path,
            "schema": schema_dict_to_tables(extractor.schema_dict),
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))


@app.post("/query")
async def run_query(req: QueryRequest) -> dict:
    """Runs the natural language query through the CAV-SQL verification loop."""
    if "workflow" not in active_system:
        raise HTTPException(status_code=400, detail="No active database connection.")

    question = req.text or req.question
    if not question:
        raise HTTPException(status_code=400, detail="Missing query text.")

    state = active_system["workflow"].run(question)

    return {
        "draft_sql": state.get("draft_sql", ""),
        "final_sql": state.get("final_sql", ""),
        "errors_prevented": len(state.get("error_history", [])),
        "execution_result": state.get("execution_result", "{}"),
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000)
