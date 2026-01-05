ISSUE_KEYWORD_INDEX = "issue_keyword_count"

def upsert_issue_keyword_count(
    es,
    news_id: str,
    ranking_id: int,
    date: str,          # strict_date: YYYY-MM-DD
    keyword: str,
    count: int,
    sub_keywords: list[dict],
    summary_text: str,
    computed_at: str,   # strict_date_time
):
    es.update(
        index=ISSUE_KEYWORD_INDEX,
        id=news_id,
        doc={
            "ranking_id": ranking_id,
            "date": date,
            "keyword": keyword,
            "count": count,
            "sub_keywords": sub_keywords,
            "summary": {"summary": summary_text, "computed_at": computed_at},
        },
        doc_as_upsert=True,
    )
