from __future__ import annotations

from typing import Any, Dict, List, Optional, Union
from sqlalchemy import text


DateLike = Union[str]  # 서버에서 "YYYY-MM-DD HH:MM:SS" 문자열로 넘김

def sensing(db):
    sql = text("""
                        SELECT run_id, start_at, end_at, message 
                        FROM batch_runs 
                        WHERE LENGTH(TRIM(message)) > 0
                        ORDER BY run_id DESC LIMIT 1
                    """)
    result = db.execute(sql)
    return result.mappings().all()

def list_error_runs(
    db,
    start: DateLike,
    end: DateLike,
    cursor: Optional[int] = None,
    limit: int = 20,
) -> List[Dict[str, Any]]:
    """
    Return batch_runs rows with error codes (>=300) between [start, end).

    ✅ 서버(collection.py)에서 start/end를 아래 형태로 정규화해서 넘김:
      - start: "YYYY-MM-DD 00:00:00"
      - end  : "YYYY-MM-DD 00:00:00" (종료일 포함을 위해 end+1day 적용)

    ✅ B 방식 추가:
      - 성공한 admin_rerun이 존재하는 origin_run_id(원본 에러 run_id)는 조회에서 제외
      - DB 스키마 변경 없이 message(JSON)에 origin_run_id를 넣어둔 것을 활용

    UI 설계서(manager1) 기준:
      - 기간 규칙: [start, end) (종료 boundary 미포함)
      - 정상(200번대) 제외, 비정상만 표시
      - 무한스크롤: cursor(run_id) 기반
    """

    # ✅ 해결된 원본 에러 숨김 로직
    # - admin_rerun 성공(state_code=200) row의 message에 {"origin_run_id": <id>} 형태가 들어감
    # - MySQL/MariaDB JSON 함수(JSON_EXTRACT)를 이용해 origin_run_id를 꺼내 비교
    #
    # ⚠️ message가 JSON이 아닐 수도 있으므로 JSON_VALID로 방어
    # ⚠️ JSON_EXTRACT 결과는 JSON 타입이라 숫자 비교 위해 CAST/UNQUOTE 처리
    resolved_filter = """
      AND NOT EXISTS (
        SELECT 1
        FROM batch_runs rr
        WHERE rr.job_name = 'admin_rerun'
          AND rr.state_code = 200
          AND rr.message IS NOT NULL
          AND JSON_VALID(rr.message)
          AND CAST(JSON_UNQUOTE(JSON_EXTRACT(rr.message, '$.origin_run_id')) AS UNSIGNED) = batch_runs.run_id
      )
    """

    sql = f"""
    SELECT run_id, job_name, start_at, end_at, work_at, state_code, message
    FROM batch_runs
    WHERE work_at >= :start
      AND work_at < :end
      AND state_code >= 300
      {resolved_filter}
      {{cursor_clause}}
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
