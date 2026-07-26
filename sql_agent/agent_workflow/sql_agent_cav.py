import json
import logging
from dataclasses import dataclass

# from sqlalchemy import text as sa_text
from cav_engine.cav_engine import CAVEngine
from cav_engine.cav_workflow import CAVWorkflow
from langchain_classic.agents import AgentExecutor, create_tool_calling_agent
from langchain_community.agent_toolkits import SQLDatabaseToolkit
from langchain_community.utilities import SQLDatabase
from langchain_core.prompts import ChatPromptTemplate, MessagesPlaceholder
from langchain_core.tools import tool
from langchain_ollama import ChatOllama

logger = logging.getLogger(__name__)


@dataclass
class CAVSQLAgentRuntime:
    """Session-scoped agent runtime: LangChain SQL agent + CAV-gated execution tool."""

    executor: object  # AgentExecutor
    cav_engine: CAVEngine

    def run(self, question: str, chat_history: list = None) -> dict:
        result = self.executor.invoke(
            {
                "input": question,
                "chat_history": chat_history or [],
            }
        )
        print("RAW AGENT RESULT:", result)  # ← temporary
        return self._extract_state(result)

    def _extract_state(self, result: dict) -> dict:
        """Reconstruct structured state (draft_sql, cav_feedback, execution_result,
        error_history) from AgentExecutor's intermediate_steps, since AgentExecutor
        only natively returns the final text output."""
        steps = result.get("intermediate_steps", [])

        draft_sql = ""
        cav_feedback = ""
        execution_result = ""
        error_history = []
        iteration_count = 0

        for action, observation in steps:
            tool_name = getattr(action, "tool", "")
            tool_input = getattr(action, "tool_input", "")
            obs_str = str(observation)

            if tool_name == "sql_db_query":
                iteration_count += 1
                # tool_input may be a dict {"query": "..."} or a raw string
                query = (
                    tool_input.get("query")
                    if isinstance(tool_input, dict)
                    else tool_input
                )
                draft_sql = query

                if obs_str.startswith("CAV_ERROR:"):
                    cav_feedback = obs_str
                    error_history.append(obs_str)
                else:
                    cav_feedback = "PASS"
                    execution_result = obs_str

        final_sql = draft_sql if cav_feedback == "PASS" else ""

        return {
            "output": result.get("output", ""),
            "draft_sql": draft_sql,
            "final_sql": final_sql,
            "cav_feedback": cav_feedback,
            "execution_result": execution_result,
            "error_history": error_history,
            "iteration_count": iteration_count,
        }


def _load_schema_rules(schema_path: str) -> dict:
    with open(schema_path, "r") as f:
        return json.load(f)


def build_cav_sql_agent(
    db_url: str,
    schema_path: str,
    orchestrator_model: str = "qwen3:latest",
    generator_model: str = "hf.co/defog/sqlcoder-7b-2:Q5_K_M",
    max_iterations: int = 5,
) -> CAVSQLAgentRuntime:

    llm = ChatOllama(model=orchestrator_model, temperature=0)
    db = SQLDatabase.from_uri(db_url)
    engine = db._engine
    toolkit = SQLDatabaseToolkit(db=db, llm=llm)

    cav_workflow = CAVWorkflow(
        engine=engine,
        schema_path=schema_path,
        ollama_model=generator_model,
    )

    base_tools = [
        t
        for t in toolkit.get_tools()
        if t.name in ("sql_db_list_tables", "sql_db_schema")
    ]

    @tool
    def sql_db_query(query: str) -> str:
        """Execute a SQL query against the database and return the result as JSON."""
        state = cav_workflow.run(query)

        if state["cav_feedback"] != "PASS":
            feedback = f"""
            CAV_ERROR: Could not produce a verified query after\n
            {state["iteration_count"]} attempts.\n
            Last error: {state["error_history"][-1] if state["error_history"] else "unknown"}"""

            logger.warning(f"CAV REJECTED query: {feedback}")
            return feedback

        logger.info("CAV PASSED — executing query.")

        try:
            result_obj = json.loads(state["execution_result"])
        except json.JSONDecodeError:
            result_obj = {
                "error": state["execution_result"]
            }  # e.g. "Execution Error: ..."

        return json.dumps(
            {
                "sql": state["final_sql"],
                "columns": result_obj.get("columns", []),
                "rows": result_obj.get("rows", []),
            },
            default=str,
        )

    all_tools = base_tools + [sql_db_query]  # only ONE sql_db_query, the CAV-gated one

    prompt = ChatPromptTemplate.from_messages(
        [
            (
                "system",
                "You are an expert SQL assistant. "
                "If you are asked to explain the db, you may use the tools sql_db_list_tables and sql_db_schema. and explain what the db is DONT RETURN ANY DATA"
                "If you are asked to generate a query, you must always call sql_db_query "
                "with the user's question verbatim — it handles SQL generation, verification, and execution internally. "
                "Never state a final answer without having called sql_db_query. "
                "If it returns CAV_ERROR, revise the query and call it again."
                "Never write raw SQL yourself.",
            ),
            MessagesPlaceholder("chat_history"),
            ("human", "{input}"),
            ("placeholder", "{agent_scratchpad}"),
        ]
    )

    agent = create_tool_calling_agent(llm=llm, tools=all_tools, prompt=prompt)
    executor = AgentExecutor(
        agent=agent,
        tools=all_tools,
        verbose=True,
        max_iterations=max_iterations,
        return_intermediate_steps=True,  # this actually works on AgentExecutor directly
    )

    return CAVSQLAgentRuntime(executor=executor, cav_engine=cav_workflow.cav)
