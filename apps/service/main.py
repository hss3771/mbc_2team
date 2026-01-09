from typing import Optional
from fastapi import FastAPI, Form
from pathlib import Path
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse
from starlette.requests import Request


from apps.common.logger import Logger
import apps.service.image_module.dashboard as dashboard


logger = Logger().get_logger(__name__)
BASE_DIR = Path(__file__).resolve().parent  # apps/service

app = FastAPI()

################################ API Router import ################################
from apps.service.bookmark_module.bookmarks import router as bookmarks_router
from apps.service.user_module.user_router import router as user_router
from apps.service.image_module.dashboard import router as image_router
from apps.service.keyword_ranking_module.keyword_ranking_router import router as ranking_router
from apps.service.article_module.article import router as article_router

app.include_router(bookmarks_router)
app.include_router(user_router)
app.include_router(image_router)
app.include_router(ranking_router)
app.include_router(article_router)
################################ 경로 설정 ################################
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
app.mount("/view", StaticFiles(directory=BASE_DIR / "view"), name="view")

################################ 정책 정의 ################################
app.add_middleware(SessionMiddleware,secret_key='session_secret_key',max_age=1800)

################################ 페이지 라우팅 ################################
# region 
# Page Loading Routes
@app.get("/")
def read_root():
    return RedirectResponse('/view/home.html')

@app.get("/main")
def read_main():
    return RedirectResponse('/view/main.html')

@app.get("/main2")
def read_main2():
    return RedirectResponse('/view/main.html#main2')

@app.get("/main3")
def read_main3():
    return RedirectResponse('/view/main.html#main3')

@app.get("/my_page")
def read_my_page():
    return RedirectResponse('/view/my_page.html')

@app.get("/login")
def read_login():
    return RedirectResponse('/view/login.html')

@app.get("/info_edit")
def read_info_edit():
    return RedirectResponse('/view/info_edit.html')

@app.get("/find_id")
def read_find_id():
    return RedirectResponse('/view/find_id.html')

@app.get("/find_pw")
def read_find_pw():
    return RedirectResponse('/view/find_pw.html')

@app.get("/pw_change")
def read_pw_change():
    return RedirectResponse('/view/pw_change.html')

@app.get("/signup")
def read_signup():
    return RedirectResponse('/view/signup.html')

@app.get("/word")
def read_word():
    return RedirectResponse('/view/word.html')

# endregion
