from apps.common import elastic


def fetch_articles_by_sentiment(
    sentiment: str,   # positive | neutral | negative
    date: str,
    page: int,
    size: int,
    orderby: str
):
    es = elastic.get_es()

    # 정렬
    if orderby == "score":
        sort = [
            {"sentiment.score": {"order": "desc", "missing": "_last"}},
            {"published_at": {"order": "desc"}}
        ]
    else:  # latest (기본)
        sort = [
            {"published_at": {"order": "desc"}}
        ]

    body = {
        "query": {
            "bool": {
                "filter": [
                    {
                        "range": {
                            "published_at": {
                                "gte": f"{date}T00:00:00+09:00",
                                "lt": f"{date}T23:59:59+09:00"
                            }
                        }
                    },
                    {
                        "term": {
                            "sentiment.label": sentiment
                        }
                    }
                ],
                "must": [
                    {"exists": {"field": "sentiment.label"}}
                ]
            }
        },
        "sort": sort,
        "from": (page - 1) * size,
        "size": size
    }

    return es.search(index="news_info", body=body)


def fetch_sentiment_sum(keyword: str, start: str, end: str):
    es = elastic.get_es()

    body = {
        "size": 0,
        "query": {
            "bool": {
                "must": [
                    {"term": {"keywords.label": keyword}},
                    {
                        "range": {
                            "published_at": {
                                "gte": f"{start}T00:00:00+09:00",
                                "lte": f"{end}T23:59:59+09:00"
                            }
                        }
                    }
                ],
                "filter": [
                    {"exists": {"field": "sentiment.label"}}
                ]
            }
        },
        "aggs": {
            "sentiment_count": {
                "terms": {
                    "field": "sentiment.label",
                    "size": 3
                }
            }
        }
    }

    return es.search(index="news_info", body=body)