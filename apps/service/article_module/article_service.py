from fastapi import HTTPException
import re
from apps.service.article_module.article_repo import (
    fetch_articles_by_keyword,            # legacy(date)
    fetch_articles_by_keyword_range,      # new(range)
    fetch_sentiment_summary,             # new(agg)
    fetch_article_by_id,
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


def make_summary_preview(summary_text: str, max_len: int = 80) -> str:
    """
    - 기본: '핵심 주장:' 라인이 있으면 그 줄만
    - 없으면: 첫 문단/첫 줄
    - 최종: max_len로 컷
    """
    s = (summary_text or "").strip()
    if not s:
        return ""

    # 1) '핵심 주장:' 라인 우선
    m = re.search(r"핵심\s*주장\s*:\s*(.+)", s)
    if m:
        line = m.group(1).strip()
        return (line[:max_len] + "…") if len(line) > max_len else line

    # 2) 첫 줄/첫 문단 우선
    first = s.splitlines()[0].strip()

    # 3) 너무 길면 컷
    return (first[:max_len] + "…") if len(first) > max_len else first

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
        summary_obj = src.get("summary") or {}
        summary_text = summary_obj.get("summary_text") or ""
        summary_preview = make_summary_preview(summary_text, max_len=80)

        items.append({
            "doc_id": h.get("_id"),  # 요약 호출에 필요!
            "press": src.get("press_name"),
            "title": src.get("title"),
            "published_at": published_at[:10] if published_at else "",
            "sentiment": sent.get("label"),
            "sentiment_score": sent.get("score"),
            "trust_score": trust.get("score"),
            "trust_label": trust.get("label"),
            "url": src.get("url"),
            "image_url": src.get("image_url") or "", # 수정
            "body" : src.get("body") or "",
            "summary_preview": summary_preview,
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


# 기사 요약 함수
def get_article_summary_by_doc_id(doc_id: str) -> str:
    doc = fetch_article_by_id(doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="NOT_FOUND")

    src = doc.get("_source") or {}
    summary_obj = src.get("summary") or {}
    summary_text = summary_obj.get("summary_text") or ""

    return summary_text