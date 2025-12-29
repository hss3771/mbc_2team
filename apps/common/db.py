# 예시 데이터
import hashlib
information = {
    "user_id":" gkstmdtn",
    "password_hash": hashlib.sha256("gkstmdtn".encode()).hexdigest(),
    "email": "gkstmdtn@gmail.com",
    "name": "한승수",
    "birthday": "2000-04-11",
    "phone": "010-1234-5678",
    "eco_state": "하",
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
        if result['is_valid']:
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
            if exist['is_valid']:
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
# 아이디찾기
# 비밀번호찾기
# 비밀번호 변경
# 메인페이지
# 회원가입
def register_user(info):
    db = get_db()
    sql = text("""INSERT INTO users (user_id, password_hash, email, name, birthday, phone, eco_state, gender)
                   VALUES (:user_id, :password_hash, :email, :name, :birthday, :phone, :eco_state, :gender)""")
    result = None
    try:
        db.execute(sql, info)
        db.commit()
        result = "등록 완료"
    except Exception as e:
        print(f'Registration error: {e}')
        db.rollback()
        result = "등록 실패"
    finally:
        db.close()
        return {"message": result}

# 중복 확인
# 회원정보 수정

if __name__ == "__main__":
    #임시 유저 등록
    #print(register_user(information))
    #임시 로그인 확인
    #print(login_check(information))
    #임시 로그인 카운팅
    #print(login_count(" gkstmdtn"))
