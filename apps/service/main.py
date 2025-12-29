from fastapi import FastAPI, UploadFile, Form, File
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse
from starlette.requests import Request
from apps.common.logger import Logger
from apps.common.db import get_db
from pathlib import Path
from apps.service.user import router as user_router

BASE_DIR = Path(__file__).resolve().parent  # apps/service

app = FastAPI()

app.mount("/view", StaticFiles(directory=BASE_DIR / "view"), name="view")
app.add_middleware(SessionMiddleware,secret_key='session_secret_key',max_age=1800)

app.include_router(user_router)

@app.get("/")
def read_root():
    return RedirectResponse('/view/home.html')