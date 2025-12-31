import hashlib
import apps.common.db as db
import re

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

# 비밀번호 규칙: 영문 소문자 + 숫자, 4~16자
def is_valid_password(pw: str) -> bool:
    pattern = r"^(?=.*[a-z])(?=.*\d)[a-z\d]{4,16}$"
    return bool(re.match(pattern, pw))


# 이메일 형식 검사
def is_valid_email(email: str) -> bool:
    pattern = r"^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$"
    return bool(re.match(pattern, email))

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
    # 필수값 검증 (phone, eco_state 제외)
    required_fields = {
        "아이디": user_id,
        "비밀번호": pw,
        "이메일": email,
        "이름": name,
        "생년월일": birthday,
        "성별": gender,
    }

    for field_name, value in required_fields.items():
        if not value or not str(value).strip():
            return {
                "success": False,
                "message": f"{field_name}은(는) 필수 입력 항목입니다."
            }

    # 비밀번호 규칙 검증
    if not is_valid_password(pw):
        return {
            "success": False,
            "message": "비밀번호는 영문 소문자와 숫자를 포함한 4~16자여야 합니다."
        }

    # 이메일 형식 검증
    if not is_valid_email(email):
        return {
            "success": False,
            "message": "이메일 형식이 올바르지 않습니다."
        }

    # 아이디 중복 체크 (서버 2차 방어)
    state = db.check_duplicate_user_id(user_id)
    if state == 0:
        return {
            "success": False,
            "message": "이미 사용 중인 아이디입니다."
        }

    # DB 저장
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
        "pw",
        "pw_confirm",
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