from __future__ import annotations

import threading
from datetime import datetime
from typing import Any, Dict, List
from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy import text
from apps.common import elastic
from apps.common.logger import Logger
from apps.common.repositories import issue_keyword_repo, news_repo
from .admin_deps import admin_required
from apps.analyzer.predict_issue_keyword import predict_issue_keyword_ids
from apps.analyzer.sentiment import update_sentiment_by_ids
from apps.analyzer.summary_gemini import summarize_news_by_ids
from apps.analyzer.trust import trust_analyze_by_ids

from apps.analyzer.build_clean_text import build_clean_text_by_ids
from apps.common.db import get_db
from multiprocessing import Process

from pydantic import BaseModel
class ReanalyzeRequest(BaseModel):
    article_ids: List[str]
    fields: List[str]
    job_id: str

router = APIRouter(prefix="/admin/reanalyze", tags=["admin"])
logger = Logger().get_logger(__name__)

# 메모리 캐시 (진행률 실시간 조회용)
_jobs: Dict[str, Dict[str, Any]] = {}
_job_lock = threading.Lock()

FIELD_MAP = {
    "keyword": "keywords.label",
    "sentiment": "sentiment.label",
    "trust": "trust.label",
    "summary": "summary.summary_text",
}

# ===============================
# 유틸리티 함수
# ===============================
def _iso_dt(date_str, is_end=False):
    # 1. 값이 아예 없거나 None이면 오늘 날짜 기준으로 설정 (안전장치)
    if not date_str or date_str == "undefined":
        date_str = datetime.now().strftime("%Y-%m-%d")
        
    # 2. 시작일은 00시, 종료일은 23시 59분으로 설정하여 범위 극대화
    if is_end:
        return f"{date_str}T23:59:59+09:00"
    else:
        return f"{date_str}T00:00:00+09:00"

def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")

def check_global_lock(db):
    """DB에서 최신 작업이 실행 중인지 확인 (전역 락)"""
    try:
        # 반드시 text() 함수로 감싸야 하며, 세미콜론(;)은 생략하는 것이 좋습니다.
        stmt = text("SELECT status FROM analysis_task ORDER BY work_at DESC LIMIT 1")
        
        # db.execute(stmt) 형태로 호출
        result = db.execute(stmt)
        row = result.fetchone()
        
        if row and row[0] == "running":
            return True
    except Exception as e:
        # 에러 로그를 상세히 남겨서 어디서 터지는지 확인
        logger.error(f"Global lock check error: {str(e)}")
    return False

# ===============================
# 결측 기사 조회
# ===============================
@router.get("/errors")
def list_analysis_errors(
    start: str = None,
    end: str = None,
    fields: str = None,
    size: int = 10000,
    _: None = Depends(admin_required),
):
    # 1. 날짜 및 필드 기본 검사
    if not start or start == "undefined": start = (datetime.now() - timedelta(days=3)).strftime("%Y-%m-%d")
    if not end or end == "undefined": end = datetime.now().strftime("%Y-%m-%d")

    wanted = [f.strip() for f in fields.split(",") if f.strip()] if fields else []
    if not wanted:
        return {"items": [], "count": 0}

    all_fields = ["keyword", "sentiment", "trust", "summary"]

    # 2. 쿼리 조립: 선택한 필드(wanted) 목록 중에서 '하나라도' Null인 것 조회
    # should를 사용하되, 선택된 필드들에 대해서만 조건을 겁니다.
    should_conditions = []
    for f in wanted:
        path = FIELD_MAP.get(f)
        if path:
            # 해당 필드가 존재하지 않거나 Null인 경우
            should_conditions.append({"bool": {"must_not": {"exists": {"field": path}}}})

    # 3. _source에 모든 필드 포함 (상태 표시용)
    fetch_fields = ["article_id", "published_at"]
    for f in all_fields:
        field_path = FIELD_MAP.get(f).split('.')[0]
        if field_path not in fetch_fields:
            fetch_fields.append(field_path)

    body = {
        "query": {
            "bool": {
                "filter": [
                    {
                        "range": {
                            "published_at": {
                                "gte": _iso_dt(start), 
                                "lte": _iso_dt(end, True)
                            }
                        }
                    }
                ],
                "should": should_conditions,
                "minimum_should_match": 1, # 선택된 조건 중 최소 하나 만족
            }
        },
        "_source": fetch_fields,
        "size": size,
        "sort": [{"published_at": {"order": "desc"}}],
    }

    try:
        es = elastic.get_es()
        resp = es.search(index="news_info", body=body)
        hits = resp.get("hits", {}).get("hits", [])

        items = []
        for h in hits:
            src = h.get("_source", {})
            row = {
                "article_id": src.get("article_id") or h.get("_id"),
                "published_at": src.get("published_at"),
            }
            
            # DB의 실제 상태를 매핑
            for f in all_fields:
                field_key = FIELD_MAP.get(f).split(".")[0]
                # DB에 값이 있으면 "OK", 없으면 None(Null)
                row[f] = "OK" if src.get(field_key) else None
                
            items.append(row)

        return {"items": items, "count": len(items)}

    except Exception as e:
        logger.error(f"Error searching ES: {str(e)}")
        raise HTTPException(status_code=500, detail="데이터베이스 조회 중 오류 발생")

# ===============================
# 실행 API (Run)
# ===============================
@router.post("/run", dependencies=[Depends(admin_required)])
def _reanalyze_articles(req: ReanalyzeRequest):
    # 1. DB 세션 생성 (작성하신 get_db 호출)
    db = get_db()
    
    try:
        # 2. 전역 락 체크 (새로고침/다중사용자 대응)
        if check_global_lock(db):
            raise HTTPException(status_code=400, detail="이미 서버에서 다른 분석이 진행 중입니다.")
        sql = text("""
            INSERT INTO analysis_task (job_id, status, progress, update_at) 
            VALUES (:id, 'running', 0, NOW())
            """)
        # 3. DB에 작업 시작 기록 (Lock 생성)
        db.execute(sql,{"id": req.job_id})
        db.commit()

        # 4. 메모리 캐시 초기화 (실시간 프로그레스 바 대응)
        with _job_lock:
            _jobs[req.job_id] = {
                "status": "running",
                "total": len(req.article_ids),
                "processed": 0,
                "progress": 0,
                "started_at": _now()
            }

        # 5. 백그라운드 태스크 등록
        p = Process(
            target=_run_task,
            args=(req.article_ids, req.fields, req.job_id),
            daemon=True
        )
        p.start()

        return {"status": "ok", "job_id": req.job_id}

    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.exception(f"[reanalyze] Start failed: {str(e)}")
        raise HTTPException(status_code=500, detail=f"작업 시작 실패: {str(e)}")
    finally:
        # 6. 반드시 닫아서 풀에 반환
        db.close()

# ===============================
# 백그라운드 태스크 (Worker)
# ===============================
def _run_task(article_ids: List[str], fields: List[str], job_id: str):
    es = elastic.get_es()
    total = len(article_ids)
    total_safe = max(total, 1)
    
    # 별도의 DB 세션 생성 (메인 함수와 분리)
    db = get_db()
    
    try:
        for idx, article_id in enumerate(article_ids, start=1):
            try:
                src = es.get(index="news_info", id=article_id)["_source"]

                need_clean = all(src.get(f) is None for f in ["keywords", "sentiment", "trust", "summary"])

                if need_clean:
                    build_clean_text_by_ids(es, [article_id])

                if "keyword" in fields and src.get("keywords") is None:
                    predict_issue_keyword_ids(es, [article_id])

                if "sentiment" in fields and src.get("sentiment") is None:
                    update_sentiment_by_ids(es, [article_id])

                if "trust" in fields and src.get("trust") is None:
                    trust_analyze_by_ids(es, [article_id])

                if "summary" in fields and src.get("summary") is None:
                    summarize_news_by_ids(es, [article_id])
                
            except Exception:
                logger.exception(f"[reanalyze] failed article_id={article_id}")

            # 🔁 진행률 업데이트 (DB & 메모리)
            current_progress = int(idx * 100 / total_safe)
            
            # DB 업데이트
            db.execute(text(
                "UPDATE analysis_task SET progress=:p, update_at=NOW() WHERE job_id=:id"),
                {"p": current_progress, "id": job_id}
            )
            db.commit()

            # 메모리 캐시 업데이트
            with _job_lock:
                if job_id in _jobs:
                    _jobs[job_id]["processed"] = idx
                    _jobs[job_id]["progress"] = current_progress

        # 최종 완료 처리
        db.execute(text(
            "UPDATE analysis_task SET status='done', update_at=NOW() WHERE job_id=:id"),
            {"id": job_id}
        )
        db.commit()

    except Exception as e:
        logger.exception(f"[reanalyze] Task error: {str(e)}")
        db.execute(text(
            "UPDATE analysis_task SET status='error', update_at=NOW() WHERE job_id=:id"),
            {"id": job_id}
        )
        db.commit()
    finally:
        db.close()

# ===============================
# 진행률 조회 (Status)
# ===============================
@router.get("/progress/{job_id}", dependencies=[Depends(admin_required)])
def reanalyze_status(job_id: str):
    db = get_db()
    try:
        # job_id 앞뒤 공백 제거 및 문자열 확인
        target_id = job_id.strip()
        
        row = db.execute(text(
            "SELECT status, progress FROM analysis_task WHERE job_id = :id"),
            {"id": target_id}
        ).fetchone()
        
        if row:
            return {
                "status": row[0],
                "progress": row[1]
            }
        
        # 404를 내기 전에 서버 로그에 현재 어떤 ID들이 있는지 찍어보세요 (디버깅용)
        logger.warning(f"Job ID {target_id} not found in DB. Checking last 1 record...")
        last_job = db.execute(text("SELECT job_id FROM analysis_task ORDER BY work_at DESC LIMIT 1")).fetchone()
        logger.warning(f"Latest job_id in DB: {last_job[0] if last_job else 'None'}")
        
        raise HTTPException(status_code=404, detail=f"Job {target_id} 를 찾을 수 없습니다.")
        
    finally:
        db.close()

@router.get("/status/latest", dependencies=[Depends(admin_required)])
def get_latest_status():
    db = get_db()
    try:
        # 가장 최근에 생성된 작업 1개를 가져옴
        row = db.execute(
            text("SELECT job_id, status, progress FROM analysis_task ORDER BY work_at DESC LIMIT 1")
        ).fetchone()
        if row:
            return {"job_id": row[0], "status": row[1], "progress": row[2]}
        return {"status": "none"}
    finally:
        db.close()