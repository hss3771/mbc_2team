import hashlib
import apps.common.db as db


def hash_pw(pw: str) -> str:
    return hashlib.sha256(pw.encode()).hexdigest()

# 로그인
def login(user_id: str, pw: str, session) -> dict:
    # 실패 횟수 확인
    count_result = db.login_count(user_id)

    # login_count는 dict 형태
    fail_count = count_result["fail_cnt"] # type: ignore

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

    if result["is_valid"]: # type: ignore
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

# 로그아웃
def logout(session) -> dict:
    # 로그인 상태가 아닌 경우
    if not session.get("user_id"):
        return {
            "success": False,
            "message": "로그인 상태가 아닙니다."
        }

    # 세션 초기화
    session.clear()
    return {
        "success": True,
        "message": "로그아웃 되었습니다."
    }

# 회원가입
def signup(
    user_id: str,
    pw: str,
    email: str,
    name: str,
    birthday: str,
    phone: str,
    eco_state: str,
    gender: str,
) -> dict:

    # db.register_user()가 요구하는 형태로 dict 구성
    info = {
        "user_id": user_id,
        "password_hash": hash_pw(pw),
        "email": email,
        "name": name,
        "birthday": birthday,
        "phone": phone,
        "eco_state": eco_state,
        "gender": gender,
    }
    # db.py의 회원가입 함수 호출
    return db.register_user(info)

# 회원가입 시 아이디 중복 확인
def check_user_id(user_id: str) -> dict:
    # 기본 검증
    if not user_id or not user_id.strip():
        return {
            "success": False,
            "message": "아이디를 입력해주세요."
        }

    # DB 중복 확인
    state = db.check_duplicate_user_id(user_id)

    # 사용 가능
    if state == 0:
        return {
            "success": False,
            "message": "이미 사용 중인 아이디입니다."
        }

    # 중복 아이디
    if state == 1:
        return {
            "success": True,
            "message": "사용 가능한 아이디입니다."
        }

    # 시스템 에러
    return {
        "success": False,
        "message": "아이디 중복 확인 중 오류가 발생했습니다."
    }

# 아이디 찾기
def find_id(name: str, email: str) -> dict:
    result = db.find_user_id(name, email)

    if result["state"] == 1:  # type: ignore
        return {
            "success": True,
            "user_id": result["user_id"] # type: ignore
        }

    return {
        "success": False,
        "message": result["user_id"] # type: ignore
    }

# 비밀번호 찾기
def find_pw(user_id: str, name: str, email: str) -> dict:
    result = db.find_user_pw(user_id, name, email)
    state = result.get("state")

    if state == 1:
        return {
            "success": True,
            "message": "본인 확인이 완료되었습니다."
        }

    if state == 0:
        return {
            "success": False,
            "message": "입력한 정보와 일치하는 회원이 없습니다."
        }

    return {
        "success": False,
        "message": "비밀번호 찾기 중 오류가 발생했습니다."
    }

# 비밀번호 변경
def change_pw(user_id: str, new_pw: str) -> dict:
    # 비밀번호 길이 (8자 이상 조건)
    if not new_pw or len(new_pw) < 8:
        return {
            "success": False,
            "message": "비밀번호는 8자 이상이어야 합니다."
        }

    # db.py 비밀번호 변경 함수 호출
    result = db.change_user_pw(
        user_id=user_id,
        new_pw=new_pw
    )

    state = result.get("state")

    # 변경 성공
    if state == 1:
        return {
            "success": True,
            "message": "비밀번호가 변경되었습니다."
        }

    # 변경 실패 (대상 사용자 없음 등)
    if state == 0:
        return {
            "success": False,
            "message": "비밀번호 변경에 실패했습니다."
        }

    # 시스템 에러
    return {
        "success": False,
        "message": "비밀번호 변경 중 오류가 발생했습니다."
    }

# 마이 페이지 비밀번호 확인
def check_my_page_pw(user_id: str, pw: str) -> dict:
    # 비밀번호 해시
    password_hash = hash_pw(pw)

    # DB 비밀번호 확인
    state = db.check_user_pw(user_id, password_hash)

    # 비밀번호 불일치
    if state == 0:
        return {
            "success": False,
            "message": "비밀번호가 올바르지 않습니다."
        }

    # 비밀번호 일치
    if state == 1:
        return {
            "success": True,
            "message": "비밀번호 확인이 완료되었습니다."
        }

    # 시스템 에러
    return {
        "success": False,
        "message": "비밀번호 확인 중 오류가 발생했습니다."
    }

# 마이 페이지 정보 불러오기
def get_my_page(user_id: str) -> dict:
    result = db.get_user_info(user_id)

    # DB 에러
    if result == "error":
        return {
            "success": False,
            "message": "회원 정보 조회 중 오류가 발생했습니다."
        }

    # 회원 정보 없음
    if result is None:
        return {
            "success": False,
            "message": "회원 정보를 찾을 수 없습니다."
        }

    # 조회 성공
    return {
        "success": True,
        "data": {
            "name": result.get("name"),
            "gender": result.get("gender"),
            "birthday": result.get("birthday"),
            "phone": result.get("phone"),
            "email": result.get("email"),
            "eco_state": result.get("eco_state"),
        }
    }

# 마이페이지 회원정보 수정
def update_my_page_info(user_id: str, info: dict) -> dict:
    # 필수 값 검증 (이중 보안)
    required_fields = [
        "email",
        "name",
        "birthday",
        "gender",
    ]

    for field in required_fields:
        if not info.get(field) or not str(info.get(field)).strip():
            return {
                "success": False,
                "message": "필수 항목을 모두 입력해주세요."
            }

    # 비밀번호 / 비밀번호 확인 일치 여부
    if info["pw"] != info["pw_confirm"]:
        return {
            "success": False,
            "message": "비밀번호가 일치하지 않습니다."
        }

    # 비밀번호 해시 처리
    password_hash = hash_pw(info["pw"])

    # DB에 전달할 데이터 구성(선택값은 없어도 그대로 전달)
    update_info = {
        "user_id": user_id,
        "password_hash": password_hash,
        "email": info["email"],
        "name": info["name"],
        "birthday": info["birthday"],
        "gender": info["gender"],
        "phone": info.get("phone"),
        "eco_state": info.get("eco_state")
    }

    try:
        # DB 회원정보 수정 요청
        result = db.update_user_info(update_info)

        # db.py는 {"state": 0|1|2} 반환한다고 가정
        state = result.get("state")

        # 수정 성공
        if state == 1:
            return {
                "success": True,
                "message": "회원정보가 수정되었습니다."
            }

        # 수정 실패
        if state == 0:
            return {
                "success": False,
                "message": "회원정보 수정에 실패했습니다."
            }

        # 시스템 에러
        return {
            "success": False,
            "message": "회원정보 수정 중 오류가 발생했습니다."
        }

    except Exception as e:
        print(f"회원정보 수정 오류: {e}")
        return {
            "success": False,
            "message": "회원정보 수정 중 오류가 발생했습니다."
        }