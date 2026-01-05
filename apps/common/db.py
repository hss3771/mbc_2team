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

from sqlalchemy.exc import IntegrityError
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
