from pathlib import Path
from dotenv import load_dotenv

# 1. Load Environment Variables

env_path = Path(__file__).resolve().parent / ".env"
load_dotenv(dotenv_path=env_path)
