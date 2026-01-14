from __future__ import annotations

import json
import threading
from datetime import datetime, timedelta
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from apps.common.db import get_db
from apps.common.repositories import batch_runs_repo
from apps.crawler.main import crawl_one_date  # ✅ 실제 크롤러
from .admin_deps import admin_required

router = APIRouter(prefix="/admin/collection", tags=["admin"])

_lock = threading.Lock()
_state: Dict[str, Any] = {
    "running": False,
    "active_run_id": None,
    "progress": 0,
    "status": "idle",  # idle|running|done|error
    "message": "",
}


def _now_str() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


def _parse_date_like(s: str) -> datetime:
    """
    입력 형태:
      - "YYYY-MM-DD"
      - "YYYYMMDD"
      - "YYYY-MM-DD HH:MM:SS"
      - "YYYY-MM-DDTHH:MM:SS"
    """
    s = (s or "").strip()
    if not s:
        return datetime.now()

    digits = "".join(ch for ch in s if ch.isdigit())

    # digits only -> YYYYMMDD
    if len(digits) >= 8 and (("-" not in s) and (":" not in s)):
        return datetime.strptime(digits[:8], "%Y%m%d")

    # datetime with time
    if len(s) >= 19 and s[4] == "-" and s[7] == "-" and (s[10] == " " or s[10] == "T"):
        fmt = "%Y-%m-%d %H:%M:%S" if s[10] == " " else "%Y-%m-%dT%H:%M:%S"
        try:
            return datetime.strptime(s[:19], fmt)
        except Exception:
            return datetime.strptime(s[:10], "%Y-%m-%d")

    # date only "YYYY-MM-DD"
    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return datetime.strptime(s[:10], "%Y-%m-%d")

    # 마지막 fallback: 숫자 8자리라도 있으면 date로
    if len(digits) >= 8:
        return datetime.strptime(digits[:8], "%Y%m%d")

    return datetime.now()


def _is_date_only(s: str) -> bool:
    s = (s or "").strip()
    if not s:
        return True

    # "YYYY-MM-DD"
    if len(s) == 10 and s[4] == "-" and s[7] == "-":
        return True

    # "YYYYMMDD"
    digits = "".join(ch for ch in s if ch.isdigit())
    if len(digits) == 8 and (":" not in s) and ("-" not in s):
        return True

    return False


def _range_to_sql_bounds(start: str, end: str) -> tuple[str, str]:
    """
    DB 조회는 [start, end) 기준인데,
    UI는 보통 종료일을 '포함' 기대하므로:
      - end가 날짜만 들어오면 end+1일 00:00:00으로 만들어서 [start, end+1day) 형태로 조회
    """
    s_dt = _parse_date_like(start)
    e_dt = _parse_date_like(end)

    # start가 date-only면 시작은 00:00:00 고정
    if _is_date_only(start):
        s_dt = datetime(s_dt.year, s_dt.month, s_dt.day, 0, 0, 0)

    # end가 date-only면 종료일 포함을 위해 +1일 00:00:00
    if _is_date_only(end):
        e_dt = datetime(e_dt.year, e_dt.month, e_dt.day, 0, 0, 0) + timedelta(days=1)

    # start > end면 swap
    if s_dt > e_dt:
        s_dt, e_dt = e_dt, s_dt

    return (
        s_dt.strftime("%Y-%m-%d %H:%M:%S"),
        e_dt.strftime("%Y-%m-%d %H:%M:%S"),
    )


def _date_from_runrow(row: dict) -> str:
    """
    origin run row에서 재수집 대상 날짜(YYYYMMDD) 뽑기
    - start_at 우선, 없으면 work_at
    - datetime이면 strftime
    - 문자열이면 YYYY-MM-DD 또는 숫자만 추출
    """
    v = row.get("start_at") or row.get("work_at")
    if v is None:
        return datetime.now().strftime("%Y%m%d")

    if hasattr(v, "strftime"):
        return v.strftime("%Y%m%d")

    s = str(v).strip()

    if len(s) >= 10 and s[4] == "-" and s[7] == "-":
        return s[:10].replace("-", "")

    digits = "".join(ch for ch in s if ch.isdigit())
    return digits[:8] if len(digits) >= 8 else datetime.now().strftime("%Y%m%d")


def _real_rerun(db_run_id: int, origin_run_id: int) -> None:
    """
    ✅ 더미 진행률이 아니라 실제 crawl_one_date(셀레니움/ES)를 호출하는 워커
    - db_run_id: 관리자 rerun 요청을 기록한 batch_runs row (insert_run으로 만든 것)
    - origin_run_id: 사용자가 클릭한 원본 오류 run_id
    """
    db = get_db()
    try:
        with _lock:
            _state.update(
                running=True,
                active_run_id=db_run_id,
                progress=5,
                status="running",
                message="원본 작업 조회 중...",
            )

        origin = batch_runs_repo.get_run(db, origin_run_id)
        if not origin:
            raise RuntimeError("origin run not found")

        target_yyyymmdd = _date_from_runrow(origin)

        with _lock:
            _state.update(progress=15, message=f"재수집 준비 ({target_yyyymmdd})")

        with _lock:
            _state.update(progress=25, message="크롤러 실행 중... (시간이 걸릴 수 있음)")

        result = crawl_one_date(target_yyyymmdd)

        if isinstance(result, dict) and result.get("error"):
            raise RuntimeError(result["error"])

        with _lock:
            _state.update(progress=90, message="정리/기록 중...")

        # ✅ admin_rerun 성공 row message에 origin_run_id를 JSON으로 기록(이미 하고 있음)
        msg_obj = {
            "origin_run_id": origin_run_id,
            "target_date": target_yyyymmdd,
            "crawler_result": result,
        }
        batch_runs_repo.update_run_state(
            db,
            run_id=db_run_id,
            state_code=200,
            message=json.dumps(msg_obj, ensure_ascii=False),
            end_at=_now_str(),
        )
        db.commit()

        with _lock:
            _state.update(
                running=False,
                status="done",
                progress=100,
                message=f"완료 ({target_yyyymmdd})",
            )

    except Exception as e:
        db.rollback()

        try:
            msg_obj = {"origin_run_id": origin_run_id, "error": str(e)}
            batch_runs_repo.update_run_state(
                db,
                run_id=db_run_id,
                state_code=500,
                message=json.dumps(msg_obj, ensure_ascii=False),
                end_at=_now_str(),
            )
            db.commit()
        except Exception:
            pass

        with _lock:
            _state.update(
                running=False,
                status="error",
                progress=100,
                message=f"실패: {e}",
            )
    finally:
        db.close()


@router.get("/runs")
def list_runs(
    request: Request,
    start: str,
    end: str,
    cursor: Optional[int] = None,
    limit: int = 20,
    _: None = Depends(admin_required),
):
    # ✅ start/end 정규화 (종료일 포함되도록 end+1일 처리)
    start_bound, end_bound = _range_to_sql_bounds(start, end)

    db = get_db()
    try:
        rows = batch_runs_repo.list_error_runs(
            db,
            start=start_bound,
            end=end_bound,
            cursor=cursor,
            limit=limit,
        )

        # ✅ limit 만큼 꽉 찼을 때만 next_cursor를 내려준다(무한로딩/중복 방지)
        next_cursor = rows[-1]["run_id"] if rows and len(rows) == limit else None
        return {"items": rows, "next_cursor": next_cursor}
    finally:
        db.close()


@router.get("/runs/{run_id}")
def run_detail(
    request: Request,
    run_id: int,
    _: None = Depends(admin_required),
):
    db = get_db()
    try:
        row = batch_runs_repo.get_run(db, run_id)
        if not row:
            raise HTTPException(status_code=404, detail="run not found")
        return row
    finally:
        db.close()


@router.post("/runs/{run_id}/rerun")
def rerun(
    request: Request,
    run_id: int,
    _: None = Depends(admin_required),
):
    with _lock:
        if _state.get("running"):
            raise HTTPException(status_code=409, detail="Already running")
        _state.update(running=True, status="running", progress=0, active_run_id=None, message="시작")

    db = get_db()
    try:
        now = _now_str()
        db_run_id = batch_runs_repo.insert_run(
            db,
            job_name="admin_rerun",
            work_at=now,
            state_code=102,
            message=f"재실행 요청 (origin_run_id={run_id})",
            start_at=now,
            end_at=now,
        )
        db.commit()
    finally:
        db.close()

    t = threading.Thread(target=_real_rerun, args=(db_run_id, run_id), daemon=True)
    t.start()

    with _lock:
        _state["active_run_id"] = db_run_id
        _state["message"] = "재수집 실행 중"

    return {"ok": True, "run_id": db_run_id}


@router.get("/progress")
def progress(
    request: Request,
    _: None = Depends(admin_required),
):
    with _lock:
        return dict(_state)
