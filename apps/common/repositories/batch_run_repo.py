from __future__ import annotations

from typing import Any, Dict, List, Optional
from sqlalchemy import text


def list_error_runs(
    db,
    start: str,
    end: str,
    cursor: Optional[int] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """Return batch_runs rows with error codes (>=300) between [start, end).

    UI 설계서(manager1) 기준:
      - 기간 규칙: [start, end) (종료일 미포함)
      - 정상(200번대) 제외, 비정상만 표시
      - 무한스크롤: cursor(run_id) 기반
    """
    sql = """
    SELECT run_id, job_name, start_at, end_at, work_at, state_code, message
    FROM batch_runs
    WHERE work_at >= :start
      AND work_at < :end
      AND state_code >= 300
      {cursor_clause}
    ORDER BY run_id DESC
    LIMIT :limit
    """
    cursor_clause = "" if cursor is None else "AND run_id < :cursor"
    sql = sql.format(cursor_clause=cursor_clause)

    params = {"start": start, "end": end, "limit": limit}
    if cursor is not None:
        params["cursor"] = cursor

    rows = db.execute(text(sql), params).mappings().all()
    return [dict(r) for r in rows]


def get_run(db, run_id: int) -> Optional[Dict[str, Any]]:
    sql = text(
        """
        SELECT run_id, job_name, start_at, end_at, work_at, state_code, message
        FROM batch_runs
        WHERE run_id = :run_id
        """
    )
    row = db.execute(sql, {"run_id": run_id}).mappings().fetchone()
    return dict(row) if row else None


def insert_run(
    db,
    job_name: str,
    work_at: str,
    state_code: int,
    message: str,
    start_at: Optional[str] = None,
    end_at: Optional[str] = None,
) -> int:
    """Insert a new batch_runs row and return run_id."""
    sql = text(
        """
        INSERT INTO batch_runs (job_name, work_at, state_code, message, start_at, end_at)
        VALUES (:job_name, :work_at, :state_code, :message, :start_at, :end_at)
        """
    )
    r = db.execute(
        sql,
        {
            "job_name": job_name,
            "work_at": work_at,
            "state_code": state_code,
            "message": message,
            "start_at": start_at,
            "end_at": end_at,
        },
    )
    run_id = getattr(r, "lastrowid", None)
    if run_id is None:
        row = db.execute(text("SELECT LAST_INSERT_ID() AS id")).mappings().fetchone()
        run_id = int(row["id"]) if row else 0
    return int(run_id)


def update_run_state(
    db,
    run_id: int,
    state_code: int,
    message: str,
    end_at: Optional[str] = None,
) -> None:
    sql = text(
        """
        UPDATE batch_runs
        SET state_code = :state_code,
            message = :message,
            end_at = COALESCE(:end_at, end_at)
        WHERE run_id = :run_id
        """
    )
    db.execute(
        sql,
        {"run_id": run_id, "state_code": state_code, "message": message, "end_at": end_at},
    )