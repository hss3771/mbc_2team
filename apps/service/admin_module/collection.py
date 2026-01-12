from __future__ import annotations

import threading
import time
from datetime import datetime
from typing import Any, Dict, Optional

from fastapi import APIRouter, Depends, HTTPException, Request

from apps.common.db import get_db
from apps.common.repositories import batch_run_repo
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


def _simulate_rerun(db_run_id: int) -> None:
    """Demo rerun worker.

    UI 설계서는 '수동 재실행' 버튼이 배치를 다시 돌리는 의미이므로,
    실제 환경에서는 여기에서 크롤러/배치 실행 트리거를 호출하면 됩니다.
    """
    db = get_db()
    try:
        with _lock:
            _state.update(
                running=True,
                active_run_id=db_run_id,
                progress=0,
                status="running",
                message="재실행 중",
            )

        for p in range(0, 101, 5):
            time.sleep(0.3)
            with _lock:
                _state["progress"] = p

        batch_run_repo.update_run_state(
            db,
            run_id=db_run_id,
            state_code=200,
            message="재실행 완료",
            end_at=_now_str(),
        )
        db.commit()

        with _lock:
            _state.update(running=False, status="done", message="완료")

    except Exception as e:
        db.rollback()
        with _lock:
            _state.update(running=False, status="error", message=str(e))
        try:
            batch_run_repo.update_run_state(
                db,
                run_id=db_run_id,
                state_code=500,
                message=f"재실행 실패: {e}",
                end_at=_now_str(),
            )
            db.commit()
        except Exception:
            pass
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
    db = get_db()
    try:
        rows = batch_run_repo.list_error_runs(db, start=start, end=end, cursor=cursor, limit=limit)
        next_cursor = rows[-1]["run_id"] if rows else None
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
        row = batch_run_repo.get_run(db, run_id)
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

        new_run_id = batch_run_repo.insert_run(
            db,
            job_name="크롤링",
            work_at=now,
            state_code=102,
            message=f"재실행 요청 (origin_run_id={run_id})",
            start_at=now,
            end_at=now,  # ⭐ 임시값
        )
        db.commit()
    finally:
        db.close()

    t = threading.Thread(target=_simulate_rerun, args=(new_run_id,), daemon=True)
    t.start()

    with _lock:
        _state["active_run_id"] = new_run_id
        _state["message"] = "재실행 중"

    return {"ok": True, "run_id": new_run_id}


@router.get("/progress")
def progress(
    request: Request,
    _: None = Depends(admin_required),
):
    with _lock:
        return dict(_state)

import time

def simulate_rerun(run_id: int):
    global _state

    try:
        time.sleep(2)
        with _lock:
            _state.update(progress=30, message="수집 중")

        time.sleep(2)
        with _lock:
            _state.update(progress=70, message="처리 중")

        time.sleep(2)
        with _lock:
            _state.update(
                progress=100,
                status="done",
                message="완료",
                running=False
            )

    except Exception as e:
        with _lock:
            _state.update(
                status="fail",
                message=f"실행 실패: {e}",
                running=False
            )