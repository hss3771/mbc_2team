from collections import defaultdict, Counter
from fastapi import APIRouter, Query
from fastapi.responses import Response
from elasticsearch import Elasticsearch

from apps.service.image_module.generator_graph import generate_keyword_trend_graph
from apps.service.image_module.generator_wordcloud import generate_keyword_wordcloud
from apps.service.image_module.press_logo import get_press_logo

router = APIRouter()

# Elasticsearch 설정
ES_URL = "http://localhost:9200"
es = Elasticsearch(ES_URL)

KEYWORD_INDEX = "issue_keyword_count"
NEWS_INDEX = "news_info"

FONT_PATH = "C:/Windows/Fonts/malgun.ttf"


# 내부 데이터 처리 함수
def _get_keyword_data(start: str, end: str) -> dict:
    body = {
        "query": {
            "range": {
                "date": {"gte": start, "lte": end}
            }
        },
        "_source": ["date", "keyword", "count"],
        "size": 5000,
    }

    res = es.search(index=KEYWORD_INDEX, body=body)

    data = defaultdict(dict)
    for hit in res["hits"]["hits"]:
        src = hit["_source"]
        data[src["date"]][src["keyword"]] = src["count"]

    return dict(data)


def _get_keyword_freq(start: str, end: str) -> dict:
    by_date = _get_keyword_data(start, end)
    total = Counter()
    for day in by_date.values():
        total.update(day)
    return dict(total)


# 엔드포인트
@router.get("/chart")
def chart(
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
):
    """
    키워드 트렌드 그래프 (PNG)
    """
    data = _get_keyword_data(start, end)
    img = generate_keyword_trend_graph(data)
    return Response(img, media_type="image/png")


@router.get("/wordcloud")
def wordcloud(
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
):
    """
    워드클라우드 (PNG)
    """
    freq = _get_keyword_freq(start, end)
    img = generate_keyword_wordcloud(freq, font_path=FONT_PATH)
    return Response(img, media_type="image/png")


@router.get("/news")
def news(limit: int = 20):
    """
    뉴스 리스트 (JSON)
    """
    body = {
        "query": {"match_all": {}},
        "_source": ["title", "press", "date", "published_at", "url"],
        "size": limit,
    }

    res = es.search(index=NEWS_INDEX, body=body)

    items = []
    for hit in res["hits"]["hits"]:
        src = hit["_source"]
        press = src.get("press")

        items.append({
            "title": src.get("title"),
            "press": press,
            "logo": get_press_logo(press),
            "date": src.get("published_at") or src.get("date"),
            "url": src.get("url"),
        })

    return items