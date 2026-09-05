import os
from pathlib import Path
import json
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

# Load the .env file from the root directory
# __file__ is backend/app/main.py -> parents[2] is the project root
env_path = Path(__file__).resolve().parents[2] / '.env'
load_dotenv(dotenv_path=env_path)

app_name = os.getenv("APP_NAME", "Scanity API")

app = FastAPI(
    title=app_name,
    description="Backend API for AI-Powered Document Q&A System",
    version="1.0.0"
)

# Configure CORS for the frontend
cors_origins_str = os.getenv("CORS_ORIGINS", '["*"]')
try:
    origins = json.loads(cors_origins_str)
except json.JSONDecodeError:
    origins = ["*"]

cors_regex = os.getenv("CORS_ORIGINS_REGEX", None)

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_origin_regex=cors_regex,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/health")
async def health_check():
    """
    Basic health check endpoint to verify the API is running 
    and environment variables are loaded.
    """
    db_user = os.getenv("DB_USER")
    return {
        "status": "ok", 
        "message": "Scanity API is running!",
        "env_loaded": db_user is not None
    }
