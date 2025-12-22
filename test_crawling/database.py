# pip install pymysql sqlalchemy 설치

# 접속 정보
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

id = 'web_user'
pw = 'pass'
host = 'localhost'
port = '3306'
db = 'mydb'
url = f'mysql+pymysql://{id}:{pw}@{host}:{port}/{db}'

# 엔진 생성
engine = create_engine(
    url,
    #echo=True, # 쿼리 로그 출력 여부 (판다스 사용하면 쿼리문이 복잡해지기 때문에 사용X)
    pool_size=1 # 유지할 최대 커넥션 수 - connection pool size: 5
    #max_overflow=10, # 초과요청시 만들 임시 커넥션 수
    #pool_timeout=30, # 커넥션 최대 대시 시간(초)
    #pool_recycle=3600, # 커넥션 재사용 시간(초)
)

# 세션 생성
session = sessionmaker(bind=engine)

def get_conn():
    return session()

# DB 사용시 안쓰는 건데, PANDAS 와 DB 연동에서는 사용됨
def get_engine():
    return engine
