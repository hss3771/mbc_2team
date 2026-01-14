from sqlalchemy.exc import IntegrityError
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

user_id = 'web_user'
pw = 'pass'
host = '192.168.0.34'
port = 3306
db = 'trendscope'

url = f'mysql+pymysql://{user_id}:{pw}@{host}:{port}/{db}'

def get_db():
    engine = create_engine(url,echo=True,
                       pool_size=10,
                       max_overflow=20,
                       pool_timeout=30,
                       pool_pre_ping=True,)
    session = sessionmaker(bind=engine)
    return session()
