# from sqlalchemy import create_engine
# from sqlalchemy.orm import sessionmaker
#
# # 접속정보
# id = 'web_user'
# pw = 'pass'
# host = 'localhost'
# port = 3306
# db = 'mydb'
# url = f'mysql+pymysql://{id}:{pw}@{host}:{port}/{db}'
#
# # 엔진생성
# engine = create_engine(
#     url,
#     echo=True,
#     # pool_size=5,           # 유지할 최대 커넥션 수
#     # max_overflow=10,    # 초과 요청시 만들 임시 커넥션 수
#     # pool_timeout=30,      #커넥션 최대 대기 시간(초)
#     # pool_recycle=3600    # 커넥션 재사용 시간(초)
# ) #echo 쿼리 로그 출력 여부
#
# print(f'connection pool size : {engine.pool.size()}') # 커넥션 풀 기본 갯수
#
#
#
#
# # 세션 생성
# session = sessionmaker(bind=engine)
#
# def get_db():
#     return session()

USERS = {
    "testuser": {
        "user_id": "testuser",
        "password_hash": "",
        "login_error_count": 0,
        "is_locked": False,
        "lock_until": None,
        "name": "테스트",
        "email": "test@test.com",
        "gender": "F",
        "bday": "2000-01-01"
    }
}