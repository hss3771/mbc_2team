from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import datetime

user_id = 'web_user'
pw = 'pass'
host = '192.168.0.34'
port = 3306
db = 'trendscope'
url = f'mysql+pymysql://{user_id}:{pw}@{host}:{port}/{db}'

engine = create_engine(
    url,
    pool_size=1,
    future=True
)

SessionLocal = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    future=True
)

def get_conn():
    return SessionLocal()

def _naive_datetime(dt: datetime) -> datetime:
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if getattr(dt, "tzinfo", None) else dt


def create_batch_run(job_name: str, work_at: datetime, start_at: datetime) -> int:
    work_at_sql = _naive_datetime(work_at)   # 실행시각
    start_at_sql = _naive_datetime(start_at) # 기준시작시각

    sql = text(
        """
        INSERT INTO batch_runs
          (job_name, work_at, start_at, end_at, state_code, message)
        VALUES
          (:job_name, :work_at, :start_at, NULL, :state_code, :message)
        """
    )

    db_session = get_conn()
    try:
        result = db_session.execute(
            sql,
            {
                "job_name": job_name,
                "work_at": work_at_sql,
                "start_at": start_at_sql,
                "state_code": 300,
                "message": None,
            },
        )
        db_session.commit()

        run_id = result.lastrowid
        return int(run_id)

    except Exception:
        db_session.rollback()
        raise
    finally:
        db_session.close()

def finish_batch_run(run_id: int, end_at: datetime, state_code: int, message: str) -> None:
    end_at_sql = _naive_datetime(end_at)  # 기준종료시각

    sql = text(
        """
        UPDATE batch_runs
           SET end_at = :end_at,
               state_code = :state_code,
               message = :message
         WHERE run_id = :run_id
        """
    )

    db_session = get_conn()
    try:
        db_session.execute(
            sql,
            {
                "end_at": end_at_sql,
                "state_code": int(state_code),
                "message": message,
                "run_id": int(run_id),
            },
        )
        db_session.commit()
    except Exception:
        db_session.rollback()
        raise
    finally:
        db_session.close()
