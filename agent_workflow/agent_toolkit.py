from langchain_community.agent_toolkits import SQLDatabaseToolkit
from Config.pg_connector import db_Object
import os
from cav_tools import execute_cav_sql
from cav_workflow import CAVWorkflow

ollama_model = os.getenv("OLLAMA_MODEL", "hf.co/defog/sqlcoder-7b-2:Q5_K_M")
print(f"OLLAMA_MODEL loaded: {ollama_model}")

toolkit = SQLDatabaseToolkit(db=db_Object, llm=CAVWorkflow.llm)


#tools
tools = toolkit.get_tools()
tools.append(execute_cav_sql)
for tool in tools:
    print(f"Tool Name: {tool.name}")
    print(f"Tool Description: {tool.description}\n")