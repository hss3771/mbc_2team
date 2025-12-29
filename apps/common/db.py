from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

user_id = 'web_user'
pw = 'pass'
host = '192.168.0.34'
port = 3306
db = 'trendscope'

url = f'mysql+pymysql://{user_id}:{pw}@{host}:{port}/{db}'
engine = create_engine(url,echo=False,pool_size=1)
session = sessionmaker(bind=engine)

def get_db():
    return session()
