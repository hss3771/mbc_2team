from fastapi import APIRouter, Query
from collections import defaultdict
from apps.common.elastic import get_es
from apps.common.repositories.issue_keyword_repo import get_sub_key, get_keyword_trend_by_date
from fastapi.responses import JSONResponse

router = APIRouter(prefix="/api")
es = get_es()

ISSUE_INDEX = "issue_keyword_count"

# 워드클라우드
@router.get("/issue_wordcloud")
def issue_wordcloud(
    start: str = Query(...),   # 예: 2026-01-05
    keyword: str = Query(...), # 예: 스테이블코인
):
    es = get_es()

    try:
        result = get_sub_key(es, start, keyword)
        sub_keywords = result.get("sub_keywords", [])
        doc_id = result.get("doc_id")
    except Exception as e:
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "message": f"document not found",
                "error": str(e),
                "doc_id": None,
                "sub_keywords": []
            }
        )

    if not sub_keywords:
        return JSONResponse(
            status_code=404,
            content={
                "success": False,
                "message": "sub_keywords empty",
                "doc_id": doc_id,
                "sub_keywords": []
            }
        )

    return {
        "success": True,
        "doc_id": doc_id,
        "start": start,
        "keyword": keyword,
        "sub_keywords": sub_keywords
    }

# 키워드 트렌드 데이터 API
@router.get("/keyword_trend")
def keyword_trend(
    start: str = Query(...),
    end: str = Query(...),
    keywords: list[str] = Query(...),
):
    es = get_es()
    hits = get_keyword_trend_by_date(es, start, end, keywords)

    if not hits:
        return {
            "success": True,
            "dates": [],
            "series": {},
            "empty": True
        }

    data_by_date = defaultdict(dict)
    for hit in hits:
        src = hit["_source"]
        data_by_date[src["date"]][src["keyword"]] = src["count"]

    dates = sorted(data_by_date.keys())

    series = {}
    for kw in keywords:
        series[kw] = [
            data_by_date[d].get(kw, 0) for d in dates
        ]

    return {
        "success": True,
        "dates": dates,
        "series": series
    }