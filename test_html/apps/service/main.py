from typing import Optional
from fastapi import FastAPI, Form
import apps.service.user as user
from fastapi.staticfiles import StaticFiles
from starlette.middleware.sessions import SessionMiddleware
from starlette.responses import RedirectResponse
from starlette.requests import Request
from apps.common.logger import Logger
from pathlib import Path
logger = Logger().get_logger(__name__)
BASE_DIR = Path(__file__).resolve().parent  # apps/service

app = FastAPI()
app.mount("/static", StaticFiles(directory=BASE_DIR / "static"), name="static")
app.mount("/view", StaticFiles(directory=BASE_DIR / "view"), name="view")
app.add_middleware(SessionMiddleware,secret_key='session_secret_key',max_age=1800)

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


# API Routes
# 로그인
"""
[프론트 처리 필요]
- 로그인 5회 이상 실패 시, lock상태는 javascript로 처리
- 로그인 성공 시, main page로 이동 처리
"""
@app.post("/login_check")
def login_check(
    request: Request,
    user_id: str = Form(...),
    pw: str = Form(...),
):
    # user.py의 로그인 로직 재사용 (세션 저장까지 user.py에서 처리됨)
    #from apps.service.user import login as user_login
    result = user.login(user_id, pw, request.session)
    # 로그인에 성공한 경우
    if result.get("success"):
        return {
            "success": True,
            "msg": "로그인 성공"
        }
    # 로그인에 실패한 경우
    return {
        "success": False,
        "msg": result.get("message"),
        "count": result.get("count")
    }


# 로그아웃
@app.get("/logout")
def logout(request: Request):
    # 1) 현재 요청(Request)에 포함된 세션 객체를 user.py의 로그아웃 로직으로 전달
    #from apps.service.user import logout as user_logout
    user.logout(request.session)
    # 2) 로그아웃 처리 후 홈 화면으로 리다이렉트
    return RedirectResponse("/view/home.html")


# 회원가입
@app.post("/register")
def register(
    user_id: str = Form(...),
    pw: str = Form(...),
    email: str = Form(...),
    name: str = Form(...),
    birthday: str = Form(...),
    phone: Optional[str] = Form(None),      # 선택
    eco_state: Optional[str] = Form(None),  # 선택
    gender: str = Form(...),
):
    # user.py 회원가입 로직 호출
    #from apps.service.user import signup as user_signup
    result = user.signup(
        user_id=user_id,
        pw=pw,
        email=email,
        name=name,
        birthday=birthday,
        phone=phone or "",
        eco_state=eco_state or "",
        gender=gender,
    )

    # db.register_user 반환: {"message": "등록 완료" 또는 "등록 실패"}
    return {
        "success": result.get("message") == "등록 완료", # True 반환
        "msg": result.get("message"),
    }


# 회원 가입 시 아이디 중복체크
@app.post("/id_check")
def id_check(
    user_id: str = Form(...),
):
    # user.py에서 입력값 검증 + 중복 체크까지 모두 처리
    result = user.check_user_id(user_id)
    return result


# 아이디 찾기
"""
[프론트]
- UI 팝업 처리 필요
"""
@app.post("/get_id")
def get_id(
    name: str = Form(...),
    email: str = Form(...),
):
    # 1) 입력값 검증 (UI 팝업용)
    if not name.strip():
        return {
            "success": False,
            "message": "이름을 입력해주세요."
        }

    if not email.strip():
        return {
            "success": False,
            "message": "이메일을 입력해주세요."
        }

    # 2) user.py 아이디 찾기 서비스 로직 호출
    #from apps.service.user import find_id as user_find_id
    result = user.find_id(name, email)
    return result


# 비밀번호 찾기(확인하기)
@app.post("/password_check")
def password_check(
    request: Request,
    user_id: str = Form(...),
    name: str = Form(...),
    email: str = Form(...),
):
    # 1) 입력값 검증
    if not user_id.strip():
        return {"success": False, "message": "아이디를 입력해주세요."}
    if not name.strip():
        return {"success": False, "message": "이름을 입력해주세요."}
    if not email.strip():
        return {"success": False, "message": "이메일을 입력해주세요."}

    # 2) user.py의 비밀번호 찾기(본인 확인) 로직 호출
    result = user.find_pw(user_id, name, email)

    # 3) 본인 확인 성공 시 → 세션에 비밀번호 변경 대상 아이디 저장
    if result.get("success"):
        request.session["pw_reset_user"] = user_id

    return result


# 비밀번호 찾기 - 비밀번호 변경
@app.post("/new_pw")
def new_pw(
    request: Request,
    new_pw: str = Form(...),
    new_pw_confirm: str = Form(...),
):
    # 1) 세션에서 비밀번호 변경 대상 user_id 가져오기
    user_id = request.session.get("pw_reset_user")
    if not user_id:
        return {
            "success": False,
            "message": "비밀번호 변경 권한이 없습니다. 비밀번호 찾기를 다시 진행해주세요."
        }

    # 2) 입력값 검증
    if not new_pw.strip():
        return {"success": False, "message": "새 비밀번호를 입력해주세요."}

    if not new_pw_confirm.strip():
        return {"success": False, "message": "비밀번호 확인을 입력해주세요."}

    # 3) 비밀번호/확인 값 일치 검증
    if new_pw != new_pw_confirm:
        return {"success": False, "message": "비밀번호가 일치하지 않습니다."}

    # 4) user.py 비밀번호 변경 로직 호출
    result = user.change_pw(user_id, new_pw)

    # 5) 변경 성공 시 세션 제거 (pw_reset_user 폐기)
    if result.get("success"):
        request.session.pop("pw_reset_user", None)

    return result


# 마이페이지 - 비밀번호 확인
@app.post("/mypage/password_check")
def mypage_password_check(
    request: Request,
    pw: str = Form(...),
):
    # 1) 로그인 여부 확인 (세션에서 user_id)
    user_id = request.session.get("user_id")
    if not user_id:
        return RedirectResponse("/view/login.html")

    # 2) 입력값 검증
    if not pw or not pw.strip():
        return {"success": False, "message": "비밀번호를 입력해주세요."}

    # 3) user.py 로직 호출
    result = user.check_my_page_pw(user_id, pw)

    # 4) 성공 시 세션 플래그 저장 (회원정보 수정 페이지 접근 허용)
    if result.get("success"):
        request.session["my_page_verified"] = True
        # 성공 즉시 회원정보 수정 화면으로 이동
        return RedirectResponse("/view/info_edit.html")

    return {"success": False, "message": result.get("message")}


# 마이페이지 - 회원정보 불러오기
"""
1. 브라우저가 info_edit.html 로드
2. 페이지가 열림 (빈 input 상태)
3. JS가 /info_edit/data 로 요청 보냄
4. 서버가 JSON 응답 반환
5. JS가 그 JSON을 받아서 input에 채움
"""
# 회원정보 수정 화면에서 기존 정보 풀러오기 (폼 채우기용)
# info_edit.html 로드 후, 프론트가 AJAX로 호출해서 입력칸 채우는 용도
@app.get("/my_page_load/data")
def my_page_load_data(request: Request):
    user_id = request.session.get("user_id") # 지금 요청한 사람이 누구인지 확인
    if not user_id: # 세션에 user_id 가 없으면? -> 프론트: 로그인페이지로 이동 처리
        return {"success": False, "message": "로그인이 필요합니다."}

    # 마이페이지 비밀번호 확인 통과 체크
    if not request.session.get("my_page_verified"):
        return {"success": False, "message": "비밀번호 확인이 필요합니다."}

    # user.py 의 로직 호출 : DB에서 회원정보 조회/ state 해석/ {success, data} 형태로 반환
    # 해당 반환값이 그대로 JSON 응답으로 프론트에 전달됨
    result = user.get_my_page(user_id)
    return result


# 회원정보 수정
@app.post("/info_update")
def info_update(
    request: Request,
    pw: str = Form(...),
    pw_confirm: str = Form(...),
    email: str = Form(...),
    name: str = Form(...),
    birthday: str = Form(...),
    phone: str = Form(...),
    eco_state: str = Form(...),
    gender: str = Form(...),
):
    user_id = request.session.get("user_id")
    if not user_id:
        return {"success": False, "message": "로그인이 필요합니다."}

    if not request.session.get("my_page_verified"):
        return {"success": False, "message": "비밀번호 확인이 필요합니다."}

    info = {
        "pw": pw,
        "pw_confirm": pw_confirm,
        "email": email,
        "name": name,
        "birthday": birthday,
        "phone": phone,
        "eco_state": eco_state,
        "gender": gender,
    }

    result = user.update_my_page_info(user_id, info)

    if result.get("success"):
        request.session.pop("my_page_verified", None)

    return result


# session api : 로그인 정보 확인 (bool)
# 모든 페이지에서 로그인 정보를 확인하여 상단에 로그인/로그아웃 표시하기 위함
# apps/static/base.js 와 연동
@app.get("/api/session")
def session_info(request: Request):
    return {"logged_in": bool(request.session.get("user_id"))}
