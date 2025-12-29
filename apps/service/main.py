from fastapi import FastAPI, UploadFile, Form, File
from apps.service.user import login as user_login
from fastapi.staticfiles import StaticFiles
from fastapi.responses import RedirectResponse
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse
from starlette.requests import Request
from apps.common.logger import Logger
from apps.common.db import get_db
from pathlib import Path
import apps.service.user as user
logger = Logger().get_logger(__name__)
BASE_DIR = Path(__file__).resolve().parent  # apps/service

app = FastAPI()

app.mount("/view", StaticFiles(directory=BASE_DIR / "view"), name="view")
app.add_middleware(SessionMiddleware,secret_key='session_secret_key',max_age=1800)

# Page Loading Routes
@app.get("/")
def read_root():
    return RedirectResponse('/view/home.html')

@app.get("/main")
def read_main():
    return RedirectResponse('/view/info_edit.html')

@app.get("/my_page")
def read_my_page():
    return RedirectResponse('/view/my_page.html')

@app.get("/login")
def read_login():
    return RedirectResponse('/view/login.html')

@app.get("/info_edit")
def read_info_edit():
    return RedirectResponse('/view/info_edit.html')

@app.get("/id_find")
def read_id_find():
    return RedirectResponse('/view/id_find.html')

@app.get("/pw_find")
def read_pw_find():
    return RedirectResponse('/view/pw_find.html')

# API Routes
# @app.post("/logout")
@app.post("/logout")
def logout(request: Request):
    # 세션 초기화 (로그아웃)
    request.session.clear()
    # 로그인 페이지로 이동
    return RedirectResponse("/service/view/login.html")

# @app.post("/password_check")

# @app.post("/login_check")
@app.post("/login_check")
def login_check(
    request: Request,
    user_id: str = Form(...),
    pw: str = Form(...),
    ):
    # user.py의 로그인 로직 재사용 (세션 저장까지 user.py에서 처리됨)
    #from apps.service.user import login as user_login
    result = user_login({"id": user_id, "pw": pw}, request)

    if result.get("success"):
        return {
            "success": True,
            "message": f"{user_id}님 로그인에 성공하셨습니다.",
            "try_count": result.get("try_count")
        }

    return {
        "success": False,
        "message": result.get("msg"),
        "try_count": result.get("try_count")
    }

# @app.post("get_id")

# @app.post("new_pw")

# @app.post("/register")

# @app.post("/info_update")

#session api
@app.get("/api/session")
def session_info(request: Request):
    return {"logged_in": bool(request.session.get("user"))}