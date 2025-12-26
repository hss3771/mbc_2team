from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

user_id = 'web_user'
pw = 'pass'
host = 'localhost'
port = 3306
db = 'mydb'

url = f'mysql+pymysql://{user_id}:{pw}@{host}:{port}/{db}'
engine = create_engine(url,echo=False,pool_size=1)
session = sessionmaker(bind=engine)

def get_db():
    return session()
