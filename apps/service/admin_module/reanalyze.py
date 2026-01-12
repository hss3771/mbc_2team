from __future__ import annotations

import threading
import time
import uuid
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, Depends, HTTPException, Request
from apps.common import elastic
from .admin_deps import admin_required

router = APIRouter(prefix="/admin/reanalyze", tags=["admin"])

_job_lock = threading.Lock()
_running = False
_jobs: Dict[str, Dict[str, Any]] = {}

FIELD_MAP = {
    "keyword": "keywords.label",
    "sentiment": "sentiment.label",
    "trust": "trust.label",
    "summary": "summary.summary_text",
}


def _iso_dt(date_str: str, end: bool = False) -> str:
    if end:
        return f"{date_str}T23:59:59+09:00"
    return f"{date_str}T00:00:00+09:00"


def _now() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


@router.get("/errors")
def list_analysis_errors(
    request: Request,
    start: str,
    end: str,
    fields: str,
    size: int = 50,
    _: None = Depends(admin_required),
):
    wanted = [f.strip() for f in fields.split(",") if f.strip()]
    if not wanted:
        raise HTTPException(status_code=400, detail="fields required")

    must_not = []
    for f in wanted:
        path = FIELD_MAP.get(f)
        if not path:
            raise HTTPException(status_code=400, detail=f"unknown field: {f}")
        must_not.append({"exists": {"field": path}})

    body = {
        "query": {
            "bool": {
                "filter": [
                    {"range": {"published_at": {"gte": _iso_dt(start), "lte": _iso_dt(end, True)}}}
                ],
                "must_not": must_not,
            }
        },
        "_source": ["article_id", "published_at"] + [FIELD_MAP[f] for f in wanted if f in FIELD_MAP],
        "size": size,
        "sort": [{"published_at": {"order": "desc"}}],
    }

    es = elastic.get_es()
    resp = es.search(index="news_info", body=body)
    hits = resp.get("hits", {}).get("hits", [])

    items: List[Dict[str, Any]] = []
    for h in hits:
        src = h.get("_source", {})
        row = {
            "article_id": src.get("article_id") or h.get("_id"),
            "published_at": src.get("published_at"),
        }
        for f in wanted:
            row[f] = "OK" if src.get(FIELD_MAP[f].split(".")[0]) else None
        items.append(row)

    return {"items": items, "count": len(items)}


def _demo_fill_fields(article_ids: List[str], fields: List[str], job_id: str) -> None:
    es = elastic.get_es()
    total = len(article_ids)
    try:
        for i, aid in enumerate(article_ids, start=1):
            time.sleep(0.15)

            doc = {}
            if "keyword" in fields:
                doc["keywords"] = {"label": "AUTO", "model_version": "admin_rerun"}
            if "sentiment" in fields:
                doc["sentiment"] = {"label": "neutral", "score": 0.0, "model_version": "admin_rerun"}
            if "trust" in fields:
                doc["trust"] = {"label": "medium", "score": 50.0, "model_version": "admin_rerun"}
            if "summary" in fields:
                doc["summary"] = {"summary_text": "(재분석 결과) 요약", "model_version": "admin_rerun"}

            es.update_by_query(
                index="news_info",
                body={
                    "query": {"term": {"article_id": aid}},
                    "script": {
                        "source": "for (entry in params.doc.entrySet()) { ctx._source[entry.getKey()] = entry.getValue(); }",
                        "lang": "painless",
                        "params": {"doc": doc},
                    },
                },
                refresh=True,
                conflicts="proceed",
            )

            with _job_lock:
                _jobs[job_id]["processed"] = i
                _jobs[job_id]["progress"] = int(i * 100 / max(total, 1))

        with _job_lock:
            _jobs[job_id]["status"] = "done"
            _jobs[job_id]["ended_at"] = _now()
    except Exception as e:
        with _job_lock:
            _jobs[job_id]["status"] = "error"
            _jobs[job_id]["error"] = str(e)
            _jobs[job_id]["ended_at"] = _now()
    finally:
        global _running
        with _job_lock:
            _running = False


@router.post("/run")
def run_reanalyze(
    request: Request,
    payload: Dict[str, Any],
    _: None = Depends(admin_required),
):
    article_ids = payload.get("article_ids") or []
    fields = payload.get("fields") or []
    if not isinstance(article_ids, list) or not article_ids:
        raise HTTPException(status_code=400, detail="article_ids required")
    if not isinstance(fields, list) or not fields:
        raise HTTPException(status_code=400, detail="fields required")
    for f in fields:
        if f not in FIELD_MAP:
            raise HTTPException(status_code=400, detail=f"unknown field: {f}")

    global _running
    with _job_lock:
        if _running:
            raise HTTPException(status_code=409, detail="Already running")
        _running = True

        job_id = uuid.uuid4().hex
        _jobs[job_id] = {
            "job_id": job_id,
            "status": "running",
            "created_at": _now(),
            "ended_at": None,
            "total": len(article_ids),
            "processed": 0,
            "progress": 0,
            "fields": fields,
        }

    t = threading.Thread(target=_demo_fill_fields, args=(article_ids, fields, job_id), daemon=True)
    t.start()
    return {"ok": True, "job_id": job_id}


@router.get("/progress/{job_id}")
def job_progress(
    request: Request,
    job_id: str,
    _: None = Depends(admin_required),
):
    with _job_lock:
        job = _jobs.get(job_id)
        if not job:
            raise HTTPException(status_code=404, detail="job not found")
        return job
