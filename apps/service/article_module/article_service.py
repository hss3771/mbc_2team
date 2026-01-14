from apps.service.article_module.article_repo import (
    fetch_articles_by_keyword,            # legacy(date)
    fetch_articles_by_keyword_range,      # new(range)
    fetch_sentiment_summary,             # new(agg)
)

# -----------------------------
# date 단일 기반
# -----------------------------
def get_articles_by_keyword(
    keyword: str,
    date: str,
    sentiment: str,
    page: int,
    size: int,
    orderby: str
):
    res = fetch_articles_by_keyword(keyword, date, sentiment, page, size, orderby)

    hits = (res.get("hits") or {}).get("hits") or []
    total = ((res.get("hits") or {}).get("total") or {}).get("value", 0)

    articles = []
    for h in hits:
        src = h["_source"]

        trust = src.get("trust") or {}
        sentiment_obj = src.get("sentiment") or {}

        body = src.get("body", "")
        published_at = (src.get("published_at") or "")[:10]

        articles.append({
            "press": src.get("press_name"),
            "title": src.get("title"),
            "summary": (body[:120] + "...") if body else "",
            "published_at": published_at,
            "sentiment": sentiment_obj.get("label"),
            "sentiment_score": sentiment_obj.get("score"),
            "trust_label": trust.get("label"),
            "trust_score": trust.get("score"),
            "url": src.get("url"),
        })

    return {
        "success": True,
        "keyword": keyword,
        "sentiment": sentiment,
        "total": total,
        "page": page,
        "size": size,
        "orderby": orderby,
        "articles": articles,
        "items": articles,      # 프론트(TS2)에서도 재사용 가능하게 같이 제공
    }

# -----------------------------
# range(start~end) 기반 기사 리스트
# -----------------------------
def get_articles_by_keyword_range(keyword, start, end, sentiment, page, size, orderby):
    res = fetch_articles_by_keyword_range(keyword, start, end, sentiment, page, size, orderby)

    hits = (res.get("hits") or {}).get("hits") or []
    total = ((res.get("hits") or {}).get("total") or {}).get("value", 0)

    items = []
    for h in hits:
        src = h.get("_source") or {}

        sent = src.get("sentiment") or {}
        trust = src.get("trust") or {}
        published_at = src.get("published_at") or ""

        body = src.get("body") or ""
        summary_obj = src.get("summary") or {}
        summary_text = summary_obj.get("summary_text") or ""   # ✅ 요약은 여기서

        items.append({
            "press": src.get("press_name"),
            "title": src.get("title"),
            "summary": summary_text,                             # ✅ 요약
            "body": body,                                        # ✅ 본문 추가 (이게 핵심)
            "published_at": published_at[:10] if published_at else "",
            "sentiment": sent.get("label"),
            "sentiment_score": sent.get("score"),
            "trust_score": trust.get("score"),
            "trust_label": trust.get("label"),
            "url": src.get("url"),
        })

    return {
        "success": True,
        "keyword": keyword,
        "start": start,
        "end": end,
        "sentiment": sentiment,
        "total": total,
        "page": page,
        "size": size,
        "orderby": orderby,
        "items": items,
        "articles": items,
    }


# -----------------------------
# 도넛: 기간 감성 합계
# -----------------------------
def get_sentiment_summary(keyword: str, start: str, end: str):
    res = fetch_sentiment_summary(keyword, start, end)

    # terms agg 결과 파싱
    aggs = res.get("aggregations") or {}
    buckets = (aggs.get("sentiment_counts") or {}).get("buckets") or []

    counts = {"positive": 0, "neutral": 0, "negative": 0}

    for b in buckets:
        label = b.get("key")
        doc_count = int(b.get("doc_count", 0))

        # ES에 저장된 라벨이 "positive|neutral|negative" 라고 repo가 가정 중
        if label in counts:
            counts[label] = doc_count

    return {
        "success": True,
        "keyword": keyword,
        "start": start,
        "end": end,
        "positive": counts["positive"],
        "neutral": counts["neutral"],
        "negative": counts["negative"],
    }