from langchain.agents import create_tool_calling_agent, AgentExecutor
from langchain_core.prompts import ChatPromptTemplate
import agent_toolkit

# 1. Define the strict prompt
prompt = ChatPromptTemplate.from_messages([
    ("system", """You are an expert SQL assistant. 
    You have access to tools to interact with a database.
    WARNING: You are strictly forbidden from using the default `sql_db_query` tool.
    You MUST ONLY use the `execute_cav_sql` tool to run your queries.
    If `execute_cav_sql` returns a CAV_ERROR, you must read the constraint violation, fix your SQL, and call the tool again."""),
    ("human", "{input}"),
    ("placeholder", "{agent_scratchpad}"),
])

# 2. Create the Agent (passing the LLM, the updated tools list, and the prompt)
agent = create_tool_calling_agent(
    llm=agent_toolkit.llm,
    tools=agent_toolkit.tools,
    prompt=prompt
)

# 3. Create the Executor (This is what actually manages the looping logic)
agent_executor = AgentExecutor(
    agent=agent, 
    tools=agent_toolkit.tools, 
    verbose=True,
    max_iterations=5 # Stops infinite loops
)

if __name__ == "__main__":
    question = "Which customers bought tracks from the Jazz genre?"
    print(f"Testing Question: {question}")
    
    response = agent_executor.invoke({"input": question})
    print("\nFinal Output:")
    print(response["output"])