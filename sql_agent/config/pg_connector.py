from os import  environ
from sqlalchemy import create_engine,URL
from langchain_community.utilities import SQLDatabase
import config.load_env

# 2. Database Connection
# Let SQLAlchemy handle the string creation safely
connection_url = URL.create(
    drivername="postgresql",
    username=environ.get("POSTGRES_USER", "postgres"), # Added fallback to postgres
    password=environ.get("POSTGRES_PASSWORD",1234),
    host=environ.get("POSTGRES_HOST", "localhost"), # Added fallback to localhost
    port=environ.get("POSTGRES_PORT", 5432),        # Added fallback to 5432    database=environ.get("POSTGRES_DB")
)

# print("Connecting to database...")
engine = create_engine(connection_url)
# Create the LangChain SQLDatabase object
db_Object = SQLDatabase(engine=engine)