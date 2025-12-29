from apps.common.db import get_db
from apps.common.logger import Logger
from starlette.requests import Request
from starlette.responses import RedirectResponse
from fastapi import APIRouter
import hashlib
from sqlalchemy import text

router = APIRouter(prefix="/user")
logger = Logger().get_logger(__name__)

# 공통 함수
def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

# 로그인
@router.post("/login")
def login(info: dict, req: Request):
    user_id = info.get("user_id")
    pw = info.get("pw")

    db = get_db()

    user = db.execute(
        text("""
            SELECT password_hash
            FROM users
            WHERE user_id = :user_id
        """),
        {"user_id": user_id}
    ).fetchone()

    if not user:
        return {"success": False, "msg": "존재하지 않는 아이디입니다."}

    if user.password_hash != hash_pw(pw):
        db.execute(
            text("""
                INSERT INTO login_log (user_id, result)
                VALUES (:user_id, 'FAIL')
            """),
            {"user_id": user_id}
        )
        db.commit()
        return {"success": False, "msg": "비밀번호가 틀렸습니다."}

    db.execute(
        text("""
            INSERT INTO login_log (user_id, result)
            VALUES (:user_id, 'SUCCESS')
        """),
        {"user_id": user_id}
    )
    db.commit()

    req.session["login_id"] = user_id
    return {"success": True}

# 로그아웃
@router.get("/logout")
def logout(req: Request):
    req.session.clear()
    return RedirectResponse("/view/home.html")


# 아이디 찾기
@router.post("/find-id")
def find_id(info: dict):
    db = get_db()

    row = db.execute(
        text("""
            SELECT user_id
            FROM users
            WHERE email = :email
              AND name = :name
        """),
        {
            "email": info["email"],
            "name": info["name"]
        }
    ).fetchone()

    if not row:
        return {"found": False, "msg": "일치하는 계정이 없습니다."}

    return {"found": True, "user_id": row.user_id}

# 비밀번호 찾기 - 사용자 확인
@router.post("/find-pw/check")
def check_pw(info: dict):
    db = get_db()

    row = db.execute(
        text("""
            SELECT 1
            FROM users
            WHERE user_id = :user_id
              AND name = :name
              AND email = :email
        """),
        {
            "user_id": info["user_id"],
            "name": info["name"],
            "email": info["email"]
        }
    ).fetchone()

    return {"verified": bool(row)}

# 비밀번호 찾기 - 비밀번호 변경
@router.post("/find-pw/change")
def change_pw(info: dict):
    db = get_db()

    db.execute(
        text("""
            UPDATE users
            SET password_hash = :pw
            WHERE user_id = :user_id
        """),
        {
            "pw": hash_pw(info["new_pw"]),
            "user_id": info["user_id"]
        }
    )
    db.commit()
    return {"changed": True}
    
# 회원가입
@router.post("/signup")
def signup(info: dict):
    db = get_db()

    exists = db.execute(
        text("SELECT 1 FROM users WHERE user_id = :user_id"),
        {"user_id": info["user_id"]}
    ).fetchone()

    if exists:
        return {"success": False, "msg": "이미 사용 중인 아이디입니다."}

    try:
        db.execute(
            text("""
                INSERT INTO users
                (user_id, password_hash, email, name, birthday, phone, eco_state, gender)
                VALUES
                (:user_id, :pw, :email, :name, :birthday, :phone, :eco_state, :gender)
            """),
            {
                "user_id": info["user_id"],
                "pw": hash_pw(info["pw"]),
                "email": info["email"],
                "name": info["name"],
                "birthday": info["birthday"],
                "phone": info.get("phone"),
                "eco_state": info.get("eco_state"),
                "gender": info["gender"]
            }
        )

        db.execute(
            text("""
                INSERT INTO user_roles (user_id, role_id)
                SELECT :user_id, role_id
                FROM roles
                WHERE role_name = 'user'
            """),
            {"user_id": info["user_id"]}
        )

        db.commit()
        return {"success": True}

    except Exception as e:
        db.rollback()
        logger.error(e)
        return {"success": False, "msg": "회원가입 실패"}

# 회원정보 수정
@router.post("/info-edit")
def edit_info(info: dict, req: Request):
    user_id = req.session.get("login_id")
    if not user_id:
        return {"success": False, "msg": "로그인이 필요합니다."}

    db = get_db()

    db.execute(
        text("""
            UPDATE users
            SET email=:email,
                name=:name,
                birthday=:birthday,
                phone=:phone,
                eco_state=:eco_state,
                gender=:gender
            WHERE user_id=:user_id
        """),
        {
            "email": info["email"],
            "name": info["name"],
            "birthday": info["birthday"],
            "phone": info.get("phone"),
            "eco_state": info.get("eco_state"),
            "gender": info["gender"],
            "user_id": user_id
        }
    )
    db.commit()
    return {"success": True}

# 마이페이지 비밀번호 확인
@router.post("/my_page/pw-check")
def my_page_pw(info: dict, req: Request):
    user_id = req.session.get("login_id")
    if not user_id:
        return {"verified": False}

    db = get_db()

    row = db.execute(
        text("""
            SELECT password_hash
            FROM users
            WHERE user_id = :user_id
        """),
        {"user_id": user_id}
    ).fetchone()

    return {
        "verified": row and row.password_hash == hash_pw(info["pw"])}