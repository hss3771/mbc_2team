from sqlalchemy import text
# 로그인 시도횟수
# {'fail_cnt' : 0~5}
def login_count(db, user_id):
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
    return db.execute(sql, {'user_id': user_id}).mappings().fetchone()

# 로그인
# {'is_valid' : 0(실패), 1(성공)}
def login_check(db, info):
    #input = {"user_id": info['id'], "password_hash": info['pw']}
    input = {"user_id": info['user_id'], "password_hash": info['password_hash']}
    sql = text("""SELECT EXISTS (
            SELECT 1
            FROM users
            WHERE user_id = :user_id
            AND password_hash = :password_hash
            ) AS is_valid"""
        )
    return db.execute(sql,input).mappings().fetchone()

# 로그인 로그 삽입
def insert_login_log(db, user_id, result):
    sql = text("INSERT INTO login_log (user_id, result) VALUES (:user_id, :result)")
    db.execute(sql, {'user_id': user_id, 'result': result})

# 사용자 역할이름 받기
# 'user', 'admin'
def get_user_role(db, user_id):
    sql = text("""
        SELECT ur.role_id, role_name
        FROM roles r join user_roles ur join users u on r.role_id = ur.role_id and ur.user_id = u.user_id 
        WHERE ur.user_id = :user_id;
        """)
    result = db.execute(sql, {'user_id': user_id}).mappings().fetchone()
    return result["role_name"]

# 사용자 id중복확인
#0(없음), 1(중복아이디 있음)
def user_exists(db, user_id):
    sql = text("""SELECT EXISTS (
                   SELECT 1
                   FROM users
                   WHERE user_id = :user_id
                   ) AS is_exist""")
    result = db.execute(sql, {'user_id': user_id}).mappings().fetchone()
    return result['is_exist']

# 유저 등록
def register_user(db, info):
    sql = text("""INSERT INTO users (user_id, password_hash, email, name, birthday, phone, eco_state, gender)
                VALUES (:user_id, :password_hash, :email, :name, :birthday, :phone, :eco_state, :gender)""")
    r = db.execute(sql, info)
    if r.rowcount: # type: ignore
            sql = text("INSERT INTO user_roles (user_id, role_id) VALUES (:user_id, '1')")
            db.execute(sql, {'user_id': info['user_id']})

# 유저 아이디 찾기
# {'user_id':'아이디'} or None
def find_user_id(db, name, email):
    info = {"name": name, "email": email}
    sql = text("""SELECT user_id
                   FROM users
                   WHERE name = :name AND email = :email""")
    result = db.execute(sql, info).mappings().fetchone()
    return result

# 유저 비밀번호 찾기
# 0(실패), 1(성공)
def find_user_pw(db, user_id, name, email):
    info = {"user_id": user_id, "name": name, "email": email}
    sql = text("""SELECT EXISTS (
                   SELECT 1
                   FROM users
                   WHERE user_id = :user_id AND name = :name AND email = :email
                   ) AS is_valid""")
    return db.execute(sql, info).mappings().fetchone()['is_valid']
    
# 유저 비밀번호 변경
# 0(실패), 1(성공)
def change_user_pw(db, user_id, new_pw):
    info = {"user_id": user_id, "password_hash": new_pw}
    sql = text("""UPDATE users
                SET password_hash = :password_hash
                WHERE user_id = :user_id""")
    result = db.execute(sql, info)
    return result.rowcount

# 비밀번호 확인
# 0(실패), 1(성공)
def check_user_pw(db, user_id, pw):
    sql = text("""SELECT EXISTS (
            SELECT 1
            FROM users
            WHERE user_id = :user_id
            AND password_hash = :password_hash
            ) AS is_valid"""
        )
    info = {"user_id": user_id, "password_hash": pw}
    result = db.execute(sql, info).mappings().fetchone()
    return result['is_valid']

# 회원정보 불러오기
# ('name':'정성훈', 'genger:'남')
def get_user_info(db, user_id):
    info = {"user_id" : user_id}
    sql = text("""
                SELECT name, gender, birthday, phone, email, eco_state
               FROM users
               where user_id = :user_id
                """)
    return db.execute(sql, info).mappings().fetchone()

# 회원정보 수정
def update_user_info(db, info):
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
    result = db.execute(sql, info)
    return result.rowcount

# if __name__ == "__main__":
#     from sqlalchemy import create_engine, text
#     from sqlalchemy.orm import sessionmaker
#     import hashlib
#     user_id = 'web_user'
#     pw = 'pass'
#     host = '192.168.0.34'
#     port = 3306
#     db = 'trendscope'

#     url = f'mysql+pymysql://{user_id}:{pw}@{host}:{port}/{db}'
#     engine = create_engine(url,echo=False,
#                         pool_size=10,
#                         max_overflow=20,
#                         pool_timeout=30,
#                         pool_pre_ping=True,)
#     session = sessionmaker(bind=engine)

#     def get_db():
#         return session()
#     db = get_db()

    
#     information = {
#     "user_id":"wjdtjdgns",
#     "password_hash": hashlib.sha256("wjdtjdgns".encode()).hexdigest(),
#     "email": "gkstmdtn2@gmail.com",
#     "name": "정성훈",
#     "birthday": "2000-04-11",
#     "phone": "010-1234-5678",
#     "eco_state": "상",
#     "gender": "남"
# }
#     print(login_count(db, "gkstmdtn"))
#     print(login_check(db,{"user_id":"gkstmdtn", "password_hash":"gkstmdtn"}))
#     print(get_user_role(db, "gkstmdtn"))
#     print(user_exists(db, "gkstmdtn"))
#     # try:
#     #     register_user(db, information)
#     #     db.commit()
#     # except Exception as e:
#     #     print(f'Registration error: {e.orig}')
#     #     db.rollback()
#     #     contain = {e.orig.args[1].split("for key '")[-1].rstrip("'")}
#     #     print("11111111111")
#     #     print(contain)
#     #     if "uq_users_email" in contain:
#     #         result = "중복된 이메일입니다."
#     #     else:
#     #         result = "등록 실패"
#     # finally:
#     #     db.close()
#     print(find_user_id(db, information["name"], information["email"]))
#     print(find_user_pw(db, email=information["email"], name= information["name"], user_id=information["user_id"]))
#     print(change_user_pw(db, information["user_id"], information["password_hash"]))
#     print(get_user_info(db, information['user_id']+'d'))
#     print(update_user_info(db, information))