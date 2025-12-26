from datetime import datetime, timedelta
import hashlib

# 로그인
# user_id              : 사용자 아이디
# pw                   : 입력한 비밀번호
# password_hash        : 저장된 비밀번호 (hash)
# login_error_count    : 로그인 실패 횟수
# is_locked            : 계정 잠김 여부
# lock_until           : 잠금 해제 시각
# is_logged_in         : 로그인 성공 여부

# 임시 사용자 데이터
USERS = {
    "testuser": {
        "user_id": "testuser",
        "password_hash": hashlib.sha256("1234".encode()).hexdigest(),
        "login_error_count": 0,
        "is_locked": False,
        "lock_until": None
    }
}

# 로그인 함수
def login(user_id, pw):
    """
    아이디 / 비밀번호 로그인
    - 5회 실패 시 24시간 잠금
    """

    # 1. 아이디 존재 여부 확인
    if user_id not in USERS:
        return {
            "is_logged_in": False,
            "message": "존재하지 않는 아이디입니다."
        }

    user = USERS[user_id]

    # 2. 계정 잠김 상태 확인
    if user["is_locked"]:
        # 잠금 시간이 지났는지 확인
        if datetime.now() >= user["lock_until"]:
            # 잠금 해제
            user["is_locked"] = False
            user["login_error_count"] = 0
            user["lock_until"] = None
        else:
            return {
                "is_logged_in": False,
                "message": "로그인 5회 실패로 계정이 잠겼습니다. 24시간 후 다시 시도해주세요.",
                "lock_until": user["lock_until"]
            }

    # 3. 비밀번호 확인
    input_password_hash = hashlib.sha256(pw.encode()).hexdigest()

    if input_password_hash == user["password_hash"]:
        # 로그인 성공
        user["login_error_count"] = 0
        user["is_locked"] = False
        user["lock_until"] = None

        return {
            "is_logged_in": True,
            "message": "로그인 성공",
            "user_id": user_id
        }

    # 4. 비밀번호 틀림 → 실패 횟수 증가
    user["login_error_count"] += 1

    # 5. 실패 5회 이상 → 계정 잠금
    if user["login_error_count"] >= 5:
        user["is_locked"] = True
        user["lock_until"] = datetime.now() + timedelta(hours=24)

        return {
            "is_logged_in": False,
            "message": "로그인 5회 실패로 계정이 잠겼습니다. 24시간 후 다시 시도해주세요.",
            "lock_until": user["lock_until"]
        }

    # 6. 일반 로그인 실패
    return {
        "is_logged_in": False,
        "message": f"비밀번호가 올바르지 않습니다. ({user['login_error_count']}/5)"
    }

""" test
    print(login("testuser", "1234"))     # 정상 로그인
    print(login("testuser", "1111"))     # 1회 실패
    print(login("testuser", "1111"))     # 2회 실패
    print(login("testuser", "1111"))     # 3회 실패
    print(login("testuser", "1111"))     # 4회 실패
    print(login("testuser", "1111"))     # 5회 실패 → lock
    print(login("testuser", "1234"))     # 잠김 상태

    {'is_logged_in': True, 'message': '로그인 성공', 'user_id': 'testuser'}
    {'is_logged_in': False, 'message': '비밀번호가 올바르지 않습니다. (1/5)'}
    {'is_logged_in': False, 'message': '비밀번호가 올바르지 않습니다. (2/5)'}
    {'is_logged_in': False, 'message': '비밀번호가 올바르지 않습니다. (3/5)'}
    {'is_logged_in': False, 'message': '비밀번호가 올바르지 않습니다. (4/5)'}
    {'is_logged_in': False, 'message': '로그인 5회 실패로 계정이 잠겼습니다. 24시간 후 다시 시도해주세요.', 'lock_until': datetime.datetime(2025, 12, 27, 14, 19, 17, 807801)}
    {'is_logged_in': False, 'message': '로그인 5회 실패로 계정이 잠겼습니다. 24시간 후 다시 시도해주세요.', 'lock_until': datetime.datetime(2025, 12, 27, 14, 19, 17, 807801)}
"""


# 아이디 찾기 - 확인
# name        : 사용자 이름
# email       : 사용자 이메일
# found       : 회원 조회 성공 여부
# found_id    : 조회된 사용자 아이디

# 테스트
USERS = {
    "testuser": {
        "user_id": "testuser",
        "password_hash": hashlib.sha256("1234".encode()).hexdigest(),
        "login_error_count": 0,
        "is_locked": False,
        "lock_until": None,
        "name": "이시우",
        "email": "test@test.com"
    }
}


def find_id(name, email):
    try:
        # 1. 입력값 검증
        if not name:
            return {
                "found": False,
                "message": "이름을 입력해주세요."
            }

        if not email:
            return {
                "found": False,
                "message": "이메일을 입력해주세요."
            }

        # 2. 사용자 목록 순회
        for user in USERS.values():
            if user.get("name") == name and user.get("email") == email:
                return {
                    "found": True,
                    "found_id": user["user_id"],
                    "message": "아이디를 찾았습니다."
                }

        # 3. 일치하는 회원 없음
        return {
            "found": False,
            "message": "입력한 정보와 일치하는 회원이 없습니다."
        }

    except Exception as e:
        # 예외 발생 시 (데이터 구조 오류 등)
        return {
            "found": False,
            "message": "아이디 찾기 처리 중 오류가 발생했습니다."
        }

    finally:
        # 실제 서비스에서는 로그 남기는 위치
        pass

"""test
if __name__ == "__main__":

    print("=== 아이디 찾기 테스트 ===")

    # 1. 정상 케이스
    print(find_id("이시우", "test@test.com"))

    # 2. 이메일 틀림
    print(find_id("이시우", "wrong@test.com"))

    # 3. 이름 없음
    print(find_id("", "test@test.com"))

    # 4. 이메일 없음
    print(find_id("이시우", ""))

    # 5. 존재하지 않는 사용자
    print(find_id("홍길동", "hong@test.com"))
"""

# 비번찾기 -확인
# user_id     : 사용자 아이디
# name        : 사용자 이름
# email       : 사용자 이메일
# verified    : 사용자 검증 성공 여부


def find_pw(user_id, name, email):
    try:
        # 1. 입력값 검증
        if not user_id:
            return {
                "verified": False,
                "message": "아이디를 입력해주세요."
            }

        if not name:
            return {
                "verified": False,
                "message": "이름을 입력해주세요."
            }

        if not email:
            return {
                "verified": False,
                "message": "이메일을 입력해주세요."
            }

        # 2. 아이디 존재 여부 확인
        if user_id not in USERS:
            return {
                "verified": False,
                "message": "존재하지 않는 아이디입니다."
            }

        user = USERS[user_id]

        # 3. 사용자 정보 일치 여부 확인
        if user.get("name") == name and user.get("email") == email:
            return {
                "verified": True,
                "message": "사용자 확인이 완료되었습니다."
            }

        # 4. 정보 불일치
        return {
            "verified": False,
            "message": "입력한 정보와 일치하는 회원이 없습니다."
        }

    except Exception as e:
        return {
            "verified": False,
            "message": "비밀번호 찾기 처리 중 오류가 발생했습니다."
        }

    finally:
        # 실제 서비스에서는 비밀번호 찾기 시도 로그 기록
        pass

"""test
if __name__ == "__main__":

    print("=== 비밀번호 찾기 테스트 ===")

    # 1. 정상 케이스
    print(find_pw("testuser", "이시우", "test@test.com"))

    # 2. 이름 틀림
    print(find_pw("testuser", "홍길동", "test@test.com"))

    # 3. 이메일 틀림
    print(find_pw("testuser", "이시우", "wrong@test.com"))

    # 4. 아이디 없음
    print(find_pw("", "이시우", "test@test.com"))

    # 5. 존재하지 않는 아이디
    print(find_pw("nouser", "이시우", "test@test.com"))
"""

# 비번찾기 - 비번 변경
# user_id         : 사용자 아이디
# new_pw          : 새 비밀번호
# new_pw_confirm  : 새 비밀번호 확인
# password_hash   : 새 비밀번호 해시값
# changed         : 비밀번호 변경 성공 여부


def pw_change(user_id, new_pw, new_pw_confirm):
    try:
        # 1. 입력값 검증
        if not user_id:
            return {
                "changed": False,
                "message": "아이디 정보가 없습니다."
            }

        if not new_pw:
            return {
                "changed": False,
                "message": "새 비밀번호를 입력해주세요."
            }

        if not new_pw_confirm:
            return {
                "changed": False,
                "message": "비밀번호 확인을 입력해주세요."
            }

        # 2. 비밀번호 일치 여부 확인
        if new_pw != new_pw_confirm:
            return {
                "changed": False,
                "message": "비밀번호가 서로 일치하지 않습니다."
            }

        # 3. 사용자 존재 여부 확인
        if user_id not in USERS:
            return {
                "changed": False,
                "message": "존재하지 않는 사용자입니다."
            }

        user = USERS[user_id]

        # 4. 새 비밀번호 해시 생성
        new_password_hash = hashlib.sha256(new_pw.encode()).hexdigest()

        # 5. 비밀번호 갱신
        user["password_hash"] = new_password_hash

        return {
            "changed": True,
            "message": "비밀번호가 성공적으로 변경되었습니다."
        }

    except Exception as e:
        return {
            "changed": False,
            "message": "비밀번호 변경 처리 중 오류가 발생했습니다."
        }

    finally:
        # 실제 서비스에서는 비밀번호 변경 로그 기록 위치
        pass

"""test
if __name__ == "__main__":

    print("=== 비밀번호 변경 테스트 ===")

    # 1. 정상 변경
    print(pw_change("testuser", "new1234", "new1234"))

    # 2. 비밀번호 불일치
    print(pw_change("testuser", "new1234", "wrong"))

    # 3. 비밀번호 미입력
    print(pw_change("testuser", "", "new1234"))

    # 4. 존재하지 않는 사용자
    print(pw_change("nouser", "1234", "1234"))

    # 5. 변경 후 로그인 테스트
    print(login("testuser", "1234"))      # 실패
    print(login("testuser", "new1234"))   # 성공
"""
    
# 회원가입
# user_id        : 사용자 아이디
# pw             : 비밀번호
# pw_confirm     : 비밀번호 확인
# name           : 이름
# email          : 이메일
# gender         : 성별
# bday           : 생년월일
# created        : 회원가입 성공 여부


def signup(user_id, pw, pw_confirm, name, email, gender, bday):
    try:
        # 1. 필수 입력값 검증
        if not user_id:
            return {"created": False, "message": "아이디를 입력해주세요."}

        if not pw:
            return {"created": False, "message": "비밀번호를 입력해주세요."}

        if not pw_confirm:
            return {"created": False, "message": "비밀번호 확인을 입력해주세요."}

        if not name:
            return {"created": False, "message": "이름을 입력해주세요."}

        if not email:
            return {"created": False, "message": "이메일을 입력해주세요."}

        if not gender:
            return {"created": False, "message": "성별을 선택해주세요."}

        if not bday:
            return {"created": False, "message": "생년월일을 입력해주세요."}

        # 2. 아이디 중복 확인
        if user_id in USERS:
            return {
                "created": False,
                "message": "이미 사용 중인 아이디입니다."
            }

        # 3. 비밀번호 일치 여부 확인
        if pw != pw_confirm:
            return {
                "created": False,
                "message": "비밀번호가 서로 일치하지 않습니다."
            }

        # 4. 비밀번호 해시 생성
        password_hash = hashlib.sha256(pw.encode()).hexdigest()

        # 5. 회원 정보 저장 (DB 대신 USERS)
        USERS[user_id] = {
            "user_id": user_id,
            "password_hash": password_hash,
            "login_error_count": 0,
            "is_locked": False,
            "lock_until": None,
            "name": name,
            "email": email,
            "gender": gender,
            "bday": bday
        }

        return {
            "created": True,
            "message": "회원가입이 완료되었습니다."
        }

    except Exception as e:
        return {
            "created": False,
            "message": "회원가입 처리 중 오류가 발생했습니다."
        }

    finally:
        # 실제 서비스에서는 회원가입 로그 기록 위치
        pass

"""test
if __name__ == "__main__":

    print("=== 회원가입 테스트 ===")

    # 1. 정상 회원가입
    print(signup(
        user_id="newuser",
        pw="1234",
        pw_confirm="1234",
        name="김민서",
        email="minseo@test.com",
        gender="F",
        bday="2001-05-10"
    ))

    # 2. 아이디 중복
    print(signup(
        user_id="newuser",
        pw="1234",
        pw_confirm="1234",
        name="김민서",
        email="minseo@test.com",
        gender="F",
        bday="2001-05-10"
    ))

    # 3. 비밀번호 불일치
    print(signup(
        user_id="anotheruser",
        pw="1234",
        pw_confirm="0000",
        name="홍길동",
        email="hong@test.com",
        gender="M",
        bday="1999-01-01"
    ))

    # 4. 회원가입 후 로그인 테스트
    print(login("newuser", "1234"))
"""

# 회원정보수정
# user_id        : 사용자 아이디
# name           : 수정할 이름
# email          : 수정할 이메일
# gender         : 수정할 성별
# bday           : 수정할 생년월일
# updated        : 회원 정보 수정 성공 여부


def info_edit(user_id, name, email, gender, bday):
    try:
        # 1. 사용자 확인
        if not user_id:
            return {
                "updated": False,
                "message": "사용자 정보가 없습니다."
            }

        if user_id not in USERS:
            return {
                "updated": False,
                "message": "존재하지 않는 사용자입니다."
            }

        # 2. 필수 입력값 검증
        if not name:
            return {"updated": False, "message": "이름을 입력해주세요."}

        if not email:
            return {"updated": False, "message": "이메일을 입력해주세요."}

        if not gender:
            return {"updated": False, "message": "성별을 선택해주세요."}

        if not bday:
            return {"updated": False, "message": "생년월일을 입력해주세요."}

        user = USERS[user_id]

        # 3. 회원 정보 수정
        user["name"] = name
        user["email"] = email
        user["gender"] = gender
        user["bday"] = bday

        return {
            "updated": True,
            "message": "회원 정보가 성공적으로 수정되었습니다."
        }

    except Exception as e:
        return {
            "updated": False,
            "message": "회원 정보 수정 중 오류가 발생했습니다."
        }

    finally:
        # 실제 서비스에서는 회원정보 수정 로그 기록 위치
        pass
"""test
if __name__ == "__main__":

    print("=== 회원 정보 수정 테스트 ===")

    # 기존 사용자 정보 확인
    print(USERS["testuser"])

    # 1. 정상 수정
    print(info_edit(
        user_id="testuser",
        name="이시우",
        email="new_email@test.com",
        gender="F",
        bday="2000-12-16"
    ))

    # 수정 후 정보 확인
    print(USERS["testuser"])

    # 2. 사용자 없음
    print(info_edit(
        user_id="nouser",
        name="홍길동",
        email="hong@test.com",
        gender="M",
        bday="1999-01-01"
    ))
"""

# 마이페이지 비밀번호 확인
# user_id      : 로그인한 사용자 아이디
# pw           : 입력한 비밀번호
# verified     : 비밀번호 확인 성공 여부


def mypage_pw_check(user_id, pw):
    try:
        # 1. 사용자 확인
        if not user_id:
            return {
                "verified": False,
                "message": "사용자 정보가 없습니다."
            }

        if user_id not in USERS:
            return {
                "verified": False,
                "message": "존재하지 않는 사용자입니다."
            }

        # 2. 비밀번호 입력 확인
        if not pw:
            return {
                "verified": False,
                "message": "비밀번호를 입력해주세요."
            }

        user = USERS[user_id]

        # 3. 비밀번호 해시 비교
        input_password_hash = hashlib.sha256(pw.encode()).hexdigest()

        if input_password_hash == user["password_hash"]:
            return {
                "verified": True,
                "message": "비밀번호 확인이 완료되었습니다."
            }

        # 4. 비밀번호 불일치
        return {
            "verified": False,
            "message": "비밀번호가 올바르지 않습니다."
        }

    except Exception as e:
        return {
            "verified": False,
            "message": "비밀번호 확인 중 오류가 발생했습니다."
        }

    finally:
        # 실제 서비스에서는 마이페이지 접근 로그 기록 위치
        pass

"""test
if __name__ == "__main__":

    print("=== 마이페이지 비밀번호 확인 테스트 ===")

    # 1. 정상 비밀번호
    print(mypage_pw_check("testuser", "1234"))

    # 2. 비밀번호 틀림
    print(mypage_pw_check("testuser", "0000"))

    # 3. 비밀번호 미입력
    print(mypage_pw_check("testuser", ""))

    # 4. 사용자 없음
    print(mypage_pw_check("nouser", "1234"))
"""