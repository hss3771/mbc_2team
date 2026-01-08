from apps.service.article_module.article_repo import fetch_articles_by_sentiment


def get_articles_by_sentiment(
    sentiment: str,
    date: str,
    page: int,
    size: int,
    orderby: str
):
    res = fetch_articles_by_sentiment(sentiment, date, page, size, orderby)

    hits = res["hits"]["hits"]
    total = res["hits"]["total"]["value"]

    articles = []
    for h in hits:
        src = h["_source"]

        articles.append({
            "press": src["press_name"],
            "title": src["title"],
            "summary": src["body"][:120] + "...",
            "published_at": src["published_at"][:10],
            "sentiment": src["sentiment"]["label"],
            "sentiment_score": src["sentiment"]["score"],
            "url": src["url"]
        })

    return {
        "sentiment": sentiment,
        "total": total,
        "page": page,
        "size": size,
        "orderby": orderby,
        "articles": articles
    }

# ====== 그래프(도넛 차트) 전용 ======
from apps.service.article_module.article_repo import fetch_sentiment_stats


def get_sentiment_stats(keyword: str, date: str):
    res = fetch_sentiment_stats(keyword, date)

    buckets = res["aggregations"]["sentiment_count"]["buckets"]

    stats = {
        "positive": 0,
        "neutral": 0,
        "negative": 0
    }

    for b in buckets:
        stats[b["key"]] = b["doc_count"]

    return {
        "keyword": keyword,
        "date": date,
        "positive": stats["positive"],
        "neutral": stats["neutral"],
        "negative": stats["negative"],
        "total": sum(stats.values())
    }