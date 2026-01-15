from fastapi import APIRouter, Query
from fastapi.responses import JSONResponse
from collections import defaultdict

from apps.common.elastic import get_es
from apps.common.repositories.issue_keyword_repo import (
    get_sub_keywords_sum_by_range,
    get_top_keywords_sum_by_range,
    get_keyword_trend_by_date,
)

router = APIRouter(prefix="/api")

ISSUE_INDEX = "issue_keyword_count"


@router.get("/issue_wordcloud")
def issue_wordcloud(
    start: str = Query(...),        # 예: 2026-01-05
    keyword: str = Query(...),      # 예: 스테이블코인
    end: str | None = Query(None),  # ✅ 추가: 월/연도 범위용
    size: int = Query(80),
    min_score: float = Query(0.0),
):
    es = get_es()
    end = end or start

    try:
        sub_keywords = get_sub_keywords_sum_by_range(
            es=es,
            start_date=start,
            end_date=end,
            keyword=keyword,
            size=size,
            min_score=min_score,
        )
    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "issue_wordcloud aggregation failed",
                "error": str(e),
                "start": start,
                "end": end,
                "keyword": keyword,
                "sub_keywords": [],
            },
        )

    return {
        "success": True,
        "start": start,
        "end": end,
        "keyword": keyword,
        "sub_keywords": sub_keywords,  # [{"text":..,"value":..}]
    }


@router.get("/keyword_trend")
def keyword_trend(
    start: str = Query(...),
    end: str = Query(...),
    keywords: list[str] | None = Query(None),
):
    es = get_es()

    # keywords 없으면: 기간 합산 Top 키워드 자동 추출
    if not keywords:
        top = get_top_keywords_sum_by_range(es, start, end, size=5)
        keywords = [x["keyword"] for x in top]

    hits = get_keyword_trend_by_date(es, start, end, keywords)
    if not hits:
        return {"success": True, "dates": [], "series": {}, "keywords": keywords}

    data_by_date = defaultdict(dict)
    for hit in hits:
        src = hit.get("_source") or {}
        d = src.get("date")
        k = src.get("keyword")
        c = src.get("count", 0)
        if d and k:
            data_by_date[d][k] = c

    dates = sorted(data_by_date.keys())
    series = {kw: [data_by_date[d].get(kw, 0) for d in dates] for kw in keywords}

    return {"success": True, "dates": dates, "series": series, "keywords": keywords}
