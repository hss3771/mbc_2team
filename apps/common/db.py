# 예시 데이터
import hashlib
information = {
    "user_id":"gkstmdtn",
    "password_hash": hashlib.sha256("gkstmdtn".encode()).hexdigest(),
    "email": "gkstmdtn2@gmail.com",
    "name": "한승수",
    "birthday": "2000-04-11",
    "phone": "010-1234-5678",
    "eco_state": "상",
    "gender": "남"
}

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

user_id = 'web_user'
pw = 'pass'
host = '192.168.0.34'
port = 3306
db = 'trendscope'

url = f'mysql+pymysql://{user_id}:{pw}@{host}:{port}/{db}'
engine = create_engine(url,echo=True,
                       pool_size=10,
                       max_overflow=20,
                       pool_timeout=30,
                       pool_pre_ping=True,)
session = sessionmaker(bind=engine)

def get_db():
    return session()

# 로그인 확인
def login_check(info):
    db = get_db()
    #input = {"user_id": info['id'], "password_hash": info['pw']}
    input = {"user_id": info['user_id'], "password_hash": info['password_hash']}
    sql = text("""SELECT EXISTS (
            SELECT 1
            FROM users
            WHERE user_id = :user_id
            AND password_hash = :password_hash
            ) AS is_valid"""
        )
    result = None
    try:
        result = db.execute(sql,input).mappings().fetchone()
        if result['is_valid']: # type: ignore
            sql_log = text("INSERT INTO login_log (user_id, result) VALUES (:user_id, 'SUCCESS')")
            db.execute(sql_log, {'user_id': input['user_id']})
            db.commit()
        else:        
            sql = text("""SELECT EXISTS (
                    SELECT 1
                    FROM users
                    WHERE user_id = :user_id
                    ) AS is_valid"""
                )
            exist = db.execute(sql,{'user_id': input['user_id']}).mappings().fetchone()
            if exist['is_valid']: # type: ignore
                sql_log = text("INSERT INTO login_log (user_id, result) VALUES (:user_id, 'FAIL')")
                db.execute(sql_log, {'user_id': input['user_id']})
                db.commit()
    except Exception as e:
        print(f'Login error: {e}')
        db.rollback()
    finally:
        print(input['user_id'] + " login attempt")
        db.close()
        return result

# 로그인 카운팅
def login_count(user_id):
    db = get_db()
    result = None
    sql = text("""
        SELECT COUNT(*) AS fail_cnt
        FROM login_log
        WHERE user_id = :user_id
        AND result = 'FAIL'
        AND create_at >= GREATEST(
                NOW() - INTERVAL 24 HOUR,
                COALESCE(
                (SELECT MAX(create_at)
                FROM login_log
                WHERE user_id = :user_id
                    AND result = 'SUCCESS'),
                '1970-01-01'
                )
            );
        """)
    try:
        result = db.execute(sql, {'user_id': user_id}).mappings().fetchone()
    except Exception as e:
        print(f'Login count error: {e}')
        result = "error"
    finally:
        db.close()
        return result
    
# 유저 역할 찾기
def get_user_role(user_id):
    db = get_db()
    result = None
    sql = text("""
        SELECT ur.role_id, role_name
        FROM roles r join user_roles ur join users u on r.role_id = ur.role_id and ur.user_id = u.user_id 
        WHERE ur.user_id = :user_id;
        """)
    try:
        result = db.execute(sql, {'user_id': user_id}).mappings().fetchone()
        result = result['role_name'] # type: ignore
    except Exception as e:
        print(f'Get user role error: {e}')
        result = "error"
    finally:
        db.close()
        return result

# 아이디찾기
def find_user_id(name, email):
    db = get_db()
    info = {"name": name, "email": email}
    sql = text("""SELECT user_id
                   FROM users
                   WHERE name = :name AND email = :email""")
    result = None
    try:
        result = db.execute(sql, info).mappings().fetchone()
        if result:
            result = result['user_id']
            result = {"state": 1, "user_id": result}
        else:
            result = {"state": 0, "user_id": "일치하는 정보가 없습니다."}
    except Exception as e:
        print(f'Find user ID error: {e}')
        result = {"state": 2, "user_id": "에러 발생"}
    finally:
        db.close()
        return result
    
# 비밀번호찾기
def find_user_pw(user_id, name, email):
    db = get_db()
    info = {"user_id": user_id, "name": name, "email": email}
    sql = text("""SELECT EXISTS (
                   SELECT 1
                   FROM users
                   WHERE user_id = :user_id AND name = :name AND email = :email
                   ) AS is_valid""")
    result = None
    try:
        result = db.execute(sql, info).mappings().fetchone()
        if result['is_valid']: # type: ignore
            result = 1 # 성공
        else:
            result = 0 # 일치하는 정보 없음
    except Exception as e:
        print(f'Find user password error: {e}')
        result = 2 # 에러 발생
    finally:
        db.close()
        return {"state": result}

# 비밀번호 변경
def change_user_pw(user_id, new_pw):
    db = get_db()
    info = {"user_id": user_id, "password_hash": hashlib.sha256(new_pw.encode()).hexdigest()}
    sql = text("""UPDATE users
                   SET password_hash = :password_hash
                   WHERE user_id = :user_id""")
    result = None
    try:
        r = db.execute(sql, info)
        if r.rowcount: # type: ignore
            result = 1 #"비밀번호 변경 완료"
        else:
            result = 0 #"비밀번호 변경 실패"
    except Exception as e:
        print(f'Change user password error: {e}')
        db.rollback()
        result = 2 #"비밀번호 변경 실패"
    finally:
        db.commit()
        db.close()
        return {"state": result}

# 회원가입
def register_user(info):
    db = get_db()
    sql = text("""INSERT INTO users (user_id, password_hash, email, name, birthday, phone, eco_state, gender)
                   VALUES (:user_id, :password_hash, :email, :name, :birthday, :phone, :eco_state, :gender)""")
    result = None
    try:
        r = db.execute(sql, info)
        if r.rowcount: # type: ignore
            sql = text("INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, '1')")
            db.execute(sql, {'user_id': info['user_id']})
        result = "등록 완료"
    except Exception as e:
        print(f'Registration error: {e}')
        db.rollback()
        result = "등록 실패"
    finally:
        db.commit()
        db.close()
        return {"message": result}
    
# 중복 확인
def check_duplicate_user_id(user_id):
    db = get_db()
    sql = text("""SELECT EXISTS (
                   SELECT 1
                   FROM users
                   WHERE user_id = :user_id
                   ) AS is_exist""")
    result = None
    try:
        result = db.execute(sql, {'user_id': user_id}).mappings().fetchone()
        if result['is_exist']: # type: ignore
            result = 0
        else:
            result = 1
    except Exception as e:
        print(f'Check duplicate user ID error: {e}')
        result = 2
    finally:
        db.close()
        return result

# 비밀번호 확인
def check_user_pw(user_id, pw):
    db = get_db()
    sql = text("""SELECT EXISTS (
            SELECT 1
            FROM users
            WHERE user_id = :user_id
            AND password_hash = :password_hash
            ) AS is_valid"""
        )
    info = {"user_id": user_id, "password_hash": pw}
    result = None
    try:
        result = db.execute(sql, info).mappings().fetchone()
        if result['is_valid']: # type: ignore
            result = 1 # 성공
        else:
            result = 0 # 실패
    except Exception as e:
        print(f'Check duplicate user ID error: {e}')
        result = 2 # 에러
    finally:
        db.close()
        return result

# 회원정보 불러오기
def get_user_info(user_id):
    db = get_db()
    result = None
    info = {"user_id" : user_id}
    sql = text("""
                SELECT name, gender, birthday, phone, email, eco_state
               FROM users
               where user_id = :user_id
                """)
    try:
        result = db.execute(sql, info).mappings().fetchone()
    except Exception as e:
        print(e)
        result = "error"
    finally:
        db.close()
        return result

# 회원정보 수정
def update_user_info(info):
    db = get_db()
    result = None
    sql = text("""
               UPDATE users
                SET password_hash = :password_hash,
                email = :email,
                name = :name,
                birthday = :birthday,
                phone = :phone,
                eco_state = :eco_state,
                gender = :gender
                WHERE user_id = :user_id
               """)
    try:
        result = db.execute(sql, info)
        result = result.rowcount # type: ignore
    except Exception as e:
        print(e)
        result = 2
    finally:
        db.commit()
        db.close()
        return {"state":result}
    
if __name__ == "__main__":
    #임시 유저 등록
    # db.py확인용
    # print(register_user(information))
    # 실사용 코드
    # db.register_user(information)
    # 결과 => {"message": "등록 완료"}/{"message": "등록 실패"}
    ##########################################################################
    #임시 로그인 확인
    # db.py확인용
    # print(login_check(information))
    # 실사용 코드
    # db.login_check(" gkstmdtn","gkstmdtn")
    # 결과 => {"login": True}/{"login": False}
    ###########################################################################
    #임시 로그인 카운팅
    # db.py확인용
    #print(login_count(" gkstmdtn"))
    # 실사용 코드
    # db.login_count(" gkstmdtn")
    # 결과 => {"fail_cnt": 0}
    ###########################################################################
    #임시 유저 역할 찾기
    # db.py확인용
    # print(get_user_role("siwoo"))
    # 실사용 코드
    # db.get_user_role("siwoo")
    # 결과 => user/admin
    ###########################################################################
    # 임시 중복 확인
    # db.py확인용
    # print(check_duplicate_user_id("gkstmdtn"))
    # print(check_duplicate_user_id("gks"))
    #실사용 코드
    # db.check_duplicate_user_id(user_id)
    # 결과 => 0(중복), 1(중복아님), 2(에러)
    ###########################################################################
    # 임시 비밀번호 확인
    # db.py확인용
    # print(check_user_pw(information["user_id"],information["password_hash"])) => 1
    # print(check_user_pw("gkstmdtn", "gkstmdtn")) => 0
    # 실사용 코드
    # db.check_user_pw(user_id)
    # 결과 => 0(실패), 1(통과), 2(에러)
    ###########################################################################
    # 임시 회원정보 불러오기
    # db.py확인용
    # print(get_user_info("gkstmdtn"))
    # 실사용 코드
    # db.get_user_info(user_id)
    # 결과 => {'name': '한승수', 'gender': '남', 'birthday': datetime.date(2000, 4, 11), 'phone': '010-1234-5678', 'email': 'gkstmdtn@gmail.com', 'eco_state': '하'}
    ###########################################################################
    # 임시 회원정보 수정
    # db.py확인용
    # print(update_user_info(information))
    # 실사용 코드
    # db.update_user_info(info)
    # 결과 => {"state" : 0(실패)/1(성공)/2(에러)}
    pass