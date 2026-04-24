from os import  environ
from sqlalchemy import create_engine,URL
from langchain_community.utilities import SQLDatabase

# 2. Database Connection
# Let SQLAlchemy handle the string creation safely
connection_url = URL.create(
    drivername="postgresql",
    username=environ.get("POSTGRES_USER"),
    password=environ.get("POSTGRES_PASSWORD"),
    host=environ.get("POSTGRES_HOST"),
    port=environ.get("POSTGRES_PORT"),
    database=environ.get("POSTGRES_DB")
)

print("Connecting to database...")
engine = create_engine(connection_url)
# Create the LangChain SQLDatabase object
db_Object = SQLDatabase(engine=engine)