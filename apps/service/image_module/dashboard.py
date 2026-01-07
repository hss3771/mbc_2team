import io
import matplotlib.pyplot as plt
from collections import defaultdict
from fastapi import APIRouter, Query
from fastapi.responses import Response
from matplotlib import font_manager, rc

from apps.common.elastic import get_es
from apps.common.repositories.issue_keyword_repo import get_sub_keywords_by_query
from apps.service.image_module.generator_wordcloud import generate_issue_wordcloud

FONT_PATH = "C:/Windows/Fonts/malgun.ttf"
font = font_manager.FontProperties(fname=FONT_PATH)
rc("font", family=font.get_name())
plt.rcParams["axes.unicode_minus"] = False


router = APIRouter(prefix="/image")
es = get_es()

ISSUE_INDEX = "issue_keyword_count"


# =====================================================
# 1️⃣ 워드클라우드
# =====================================================

@router.get("/wordcloud")
def issue_wordcloud(
    start: str | None = Query(None, description="YYYY-MM-DD"),
    end: str | None = Query(None, description="YYYY-MM-DD"),
    date: str | None = Query(None, description="YYYY-MM-DD"),
    keyword: str | None = Query(None, description="이슈 키워드"),
):
    """
    우선순위:
    1) start/end가 있으면 → start 날짜 기준 대표 keyword 자동 선택
    2) date/keyword가 있으면 → 해당 키워드로 워드클라우드
    """

    es = get_es()

    # ✅ CASE 1: start/end로 호출한 경우
    if start and end:
        resp = es.search(
            index="issue_keyword_count",
            size=1,
            query={"term": {"date": start}},
            sort=[{"count": {"order": "desc"}}],
        )

        hits = resp.get("hits", {}).get("hits", [])
        if not hits:
            return Response("no issue keyword", status_code=404)

        keyword = hits[0]["_source"]["keyword"]
        date = start

    # ✅ CASE 2: date/keyword로 호출한 경우
    if not date or not keyword:
        return Response("date and keyword required", status_code=400)

    # 🔍 sub keywords 조회
    sub_keywords = get_sub_keywords_by_query(
        es=es,
        date=date,
        keyword=keyword,
    )

    # ✅ 여기서 드디어 네가 말한 상황 발생
    if not sub_keywords:
        return Response("no sub keywords", status_code=404)

    # ☁️ 워드클라우드 생성
    img_bytes = generate_issue_wordcloud(sub_keywords)
    return Response(content=img_bytes, media_type="image/png")


# =====================================================
# 2️⃣ 키워드 트렌드 차트
# =====================================================
@router.get("/chart")
def chart(
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
):
    query = {
        "query": {
            "range": {
                "date": {
                    "gte": start,
                    "lte": end,
                }
            }
        },
        "_source": ["date", "keyword", "count"],
        "size": 5000
    }

    res = es.search(index=ISSUE_INDEX, body=query)

    data_by_date = defaultdict(dict)
    for hit in res["hits"]["hits"]:
        src = hit["_source"]
        data_by_date[src["date"]][src["keyword"]] = src["count"]

    if not data_by_date:
        return Response("No chart data", status_code=404)

    dates = sorted(data_by_date.keys())

    # start 날짜에 데이터가 없으면 첫 날짜로 대체
    if start not in data_by_date:
        start = dates[0]

    # 기준일 TOP 10 키워드
    base_keywords = sorted(
        data_by_date[start].items(),
        key=lambda x: x[1],
        reverse=True
    )[:10]

    keywords = [k for k, _ in base_keywords]

    # 선 그래프
    plt.figure(figsize=(10, 5))

    for keyword in keywords:
        counts = [data_by_date[d].get(keyword, 0) for d in dates]
        plt.plot(dates, counts, marker="o", label=keyword)

    plt.title("주요 이슈 키워드 언급량 변화")
    plt.xlabel("날짜")
    plt.ylabel("언급량")
    plt.legend()
    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format="png")
    plt.close()
    buf.seek(0)

    return Response(buf.read(), media_type="image/png")

