import hashlib
import apps.common.db as db


def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

# 로그인
def login(user_id: str, pw: str, session) -> dict:
    # 실패 횟수 확인
    count_result = db.login_count(user_id)

    # login_count는 dict 형태
    fail_count = count_result["fail_cnt"]

    if fail_count >= 5:
        return {
            "success": False,
            "message": "로그인 5회 실패로 계정이 잠겼습니다.",
            "count": fail_count,
        }

    # 로그인 검증
    result = db.login_check({
        "user_id": user_id,
        "password_hash": hash_pw(pw)
    })

    if result["is_valid"]:
        session["user_id"] = user_id
        session["user_role"] = db.get_user_role(user_id)
        return {
            "success": True
        }

    # 실패
    return {
        "success": False,
        "message": "아이디 또는 비밀번호가 올바르지 않습니다.",
        "count": fail_count + 1
    }