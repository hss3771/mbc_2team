from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from datetime import datetime

id = "web_user"
pw = "pass"
host = "localhost"
port = "3306"
db = "mydb"
url = f"mysql+pymysql://{id}:{pw}@{host}:{port}/{db}"

engine = create_engine(
    url,
    pool_size=1,
    future=True
)

session = sessionmaker(
    bind=engine,
    autoflush=False,
    autocommit=False,
    future=True
)

def get_conn():
    return session()

def _work_at_to_sql_date(work_at: str) -> str:
    w = (work_at or "").strip()
    if not w:
        raise ValueError("work_at is required")

    if len(w) == 8 and w.isdigit():
        return f"{w[:4]}-{w[4:6]}-{w[6:8]}"
    return w

def _naive_datetime(dt: datetime) -> datetime:
    if dt is None:
        return None
    return dt.replace(tzinfo=None) if getattr(dt, "tzinfo", None) else dt

def create_batch_run(job_name: str, work_at: str, start_at: datetime) -> int:
    work_at_sql = _work_at_to_sql_date(work_at)
    start_at_sql = _naive_datetime(start_at)

    sql = text(
        """
        INSERT INTO batch_runs
          (job_name, work_at, start_at, end_at, state_code, message, created_at, updated_at)
        VALUES
          (:job_name, :work_at, :start_at, NULL, :state_code, :message, NOW(), NOW())
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
    end_at_sql = _naive_datetime(end_at)

    sql = text(
        """
        UPDATE batch_runs
           SET end_at = :end_at,
               state_code = :state_code,
               message = :message,
               updated_at = NOW()
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
