from fastapi import FastAPI, UploadFile, Form, File
from fastapi.staticfiles import StaticFiles
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

# @app.post("/password_check")

@app.post("/login_check")
def login_check(
    request: Request,
    user_id: str = Form(...), 
    pw: str = Form(...),
    ):
    #req.session['loginId'] = param['id']
    #session = req.session.get('loginId','')
    #rusult = user.login({"id": user_id,"pw": pw}, request.session)
    return  # type: ignore
    #return {"success": True, "message": f"사용자 : {user_id}, 비번 : {pw} 로그인 성공", "try_count": 0}

# @app.post("get_id")

# @app.post("new_pw")

# @app.post("/register")

# @app.post("/info_update")

#session api
@app.get("/api/session")
def session_info(request: Request):
    return {"logged_in": bool(request.session.get("user"))}