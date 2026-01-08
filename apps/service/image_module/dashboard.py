# apps/service/image_module/dashboard.py

from fastapi import APIRouter, Query
from collections import defaultdict
from apps.common.elastic import get_es
from apps.common.repositories.issue_keyword_repo import get_sub_key

router = APIRouter(prefix="/api", tags=["image"])
es = get_es()

ISSUE_INDEX = "issue_keyword_count"

# 워드클라우드 데이터 API
from fastapi import Query
from fastapi.responses import JSONResponse
from apps.common.elastic import get_es

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
ISSUE_INDEX = "issue_keyword_count"

@router.get("/keyword_trend")
def keyword_trend(
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
):
    es = get_es()

    try:
        query = {
            "query": {
                "range": {
                    "date": {
                        "gte": start,
                        "lte": end
                    }
                }
            },
            "_source": ["date", "keyword", "count"],
            "size": 5000
        }

        res = es.search(index=ISSUE_INDEX, body=query)

    except Exception as e:
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "message": "elasticsearch query failed",
                "error": str(e)
            }
        )

    if not res["hits"]["hits"]:
        return {
            "success": False,
            "message": "no data in given range",
            "start": start,
            "end": end,
            "dates": [],
            "series": {}
        }

    # 날짜별 키워드 집계
    data_by_date = defaultdict(dict)
    for hit in res["hits"]["hits"]:
        src = hit["_source"]
        data_by_date[src["date"]][src["keyword"]] = src["count"]

    dates = sorted(data_by_date.keys())

    # 등장한 모든 키워드 수집
    keywords = sorted({
        k for daily in data_by_date.values() for k in daily.keys()
    })

    # chart.js / d3 에 바로 쓰기 좋은 구조
    series = {}
    for keyword in keywords:
        series[keyword] = [
            data_by_date[d].get(keyword, 0) for d in dates
        ]

    return {
        "success": True,
        "start": start,
        "end": end,
        "dates": dates,
        "series": series
    }
