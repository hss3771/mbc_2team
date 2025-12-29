from datetime import datetime, timedelta
import hashlib

from fastapi import APIRouter, Request
from fastapi.responses import RedirectResponse

from apps.common.logger import Logger
from apps.service.database import USERS

logger = Logger().get_logger(__name__)
router = APIRouter(prefix="/user")

# 공통 함수
def make_hash(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

# 로그인
@router.post("/login")
def login(info: dict, req: Request):
    user_id = info.get("id")
    pw = info.get("pw")

    if not user_id or not pw:
        return {"success": False, "msg": "아이디와 비밀번호를 입력해주세요."}

    if user_id not in USERS:
        return {"success": False, "msg": "존재하지 않는 아이디입니다."}

    user = USERS[user_id]

    # 계정 잠김 확인
    if user["is_locked"]:
        if datetime.now() < user["lock_until"]:
            return {"success": False, "msg": "계정이 잠겨 있습니다."}
        user["is_locked"] = False
        user["login_error_count"] = 0
        user["lock_until"] = None

    if user["password_hash"] == make_hash(pw):
        user["login_error_count"] = 0
        req.session["login_id"] = user_id
        logger.info(f"login success: {user_id}")
        return {"success": True}

    # 로그인 실패
    user["login_error_count"] += 1
    if user["login_error_count"] >= 5:
        user["is_locked"] = True
        user["lock_until"] = datetime.now() + timedelta(hours=24)

    return {"success": False, "msg": "비밀번호가 올바르지 않습니다."}

# 로그아웃
@router.get("/logout")
def logout(req: Request):
    req.session.clear()
    return RedirectResponse("/service/view/login.html")


# 아이디 찾기
@router.post("/find-id")
def find_id(info: dict):
    name = info.get("name")
    email = info.get("email")

    if not name or not email:
        return {"found": False, "msg": "이름과 이메일을 입력해주세요."}

    for user in USERS.values():
        if user.get("name") == name and user.get("email") == email:
            return {
                "found": True,
                "user_id": user["user_id"]
            }

    return {"found": False, "msg": "일치하는 회원이 없습니다."}

# 비밀번호 찾기 - 사용자 확인
@router.post("/find-pw/check")
def find_pw_check(info: dict):
    user_id = info.get("user_id")
    name = info.get("name")
    email = info.get("email")

    if not user_id or not name or not email:
        return {"verified": False, "msg": "모든 정보를 입력해주세요."}

    user = USERS.get(user_id)
    if not user:
        return {"verified": False, "msg": "존재하지 않는 아이디입니다."}

    if user.get("name") == name and user.get("email") == email:
        return {"verified": True}

    return {"verified": False, "msg": "정보가 일치하지 않습니다."}

# 비밀번호 찾기 - 새 비밀번호 등록
@router.post("/find-pw/change")
def find_pw_change(info: dict):
    user_id = info.get("user_id")
    new_pw = info.get("new_pw")
    new_pw_confirm = info.get("new_pw_confirm")

    if not user_id or not new_pw or not new_pw_confirm:
        return {"changed": False, "msg": "모든 값을 입력해주세요."}

    if new_pw != new_pw_confirm:
        return {"changed": False, "msg": "비밀번호가 일치하지 않습니다."}

    user = USERS.get(user_id)
    if not user:
        return {"changed": False, "msg": "존재하지 않는 사용자입니다."}

    user["password_hash"] = make_hash(new_pw)
    user["login_error_count"] = 0
    user["is_locked"] = False
    user["lock_until"] = None

    return {"changed": True}
    
# 회원가입
@router.post("/signup")
def signup(info: dict):
    user_id = info.get("user_id")

    if not user_id or not info.get("pw"):
        return {"success": False, "msg": "필수값이 누락되었습니다."}

    if user_id in USERS:
        return {"success": False, "msg": "이미 사용 중인 아이디입니다."}

    if info.get("pw") != info.get("pw_confirm"):
        return {"success": False, "msg": "비밀번호가 일치하지 않습니다."}

    USERS[user_id] = {
        "user_id": user_id,
        "password_hash": make_hash(info["pw"]),
        "login_error_count": 0,
        "is_locked": False,
        "lock_until": None,
        "name": info.get("name"),
        "email": info.get("email"),
        "gender": info.get("gender"),
        "bday": info.get("bday")
    }

    logger.info(f"signup success: {user_id}")
    return {"success": True}

# 회원정보 수정
@router.post("/info-edit")
def info_edit(info: dict, req: Request):
    login_id = req.session.get("login_id")

    if not login_id:
        return {"success": False, "msg": "로그인이 필요합니다."}

    user = USERS[login_id]
    user["name"] = info.get("name")
    user["email"] = info.get("email")
    user["gender"] = info.get("gender")
    user["bday"] = info.get("bday")

    return {"success": True}


# 마이페이지 비밀번호 확인
@router.post("/my_page/pw-check")
def my_page_pw_check(info: dict, req: Request):
    login_id = req.session.get("login_id")

    if not login_id:
        return {"verified": False, "msg": "로그인이 필요합니다."}

    user = USERS.get(login_id)
    if user["password_hash"] == make_hash(info.get("pw")):
        return {"verified": True}

    return {"verified": False, "msg": "비밀번호가 올바르지 않습니다."}