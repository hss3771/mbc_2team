NEWS_INDEX = "news_info"

def upsert_article(
    es,
    news_id: str,
    published_at: str,   # strict_date_time
    press_name: str,
    title: str,
    body: str,
    url: str,
    reporter: str | None = None,
):
    es.update(
        index=NEWS_INDEX,
        id=news_id,
        doc={
            "published_at": published_at,
            "press_name": press_name,
            "reporter": reporter,
            "title": title,
            "body": body,
            "url": url,
        },
        doc_as_upsert=True,
    )


def update_trust(
    es,
    news_id: str,
    score: float,
    label: str,
    model_version: str,
):
    es.update(
        index=NEWS_INDEX,
        id=news_id,
        doc={"trust": {"score": score, "label": label, "model_version": model_version}},
        doc_as_upsert=True,
    )


def update_sentiment(
    es,
    news_id: str,
    score: float,
    label: str,
    model_version: str,
):
    es.update(
        index=NEWS_INDEX,
        id=news_id,
        doc={"sentiment": {"score": score, "label": label, "model_version": model_version}},
        doc_as_upsert=True,
    )


def update_summary(
    es,
    news_id: str,
    summary_text: str,
    model_version: str,
):
    es.update(
        index=NEWS_INDEX,
        id=news_id,
        doc={"summary": {"summary_text": summary_text, "model_version": model_version}},
        doc_as_upsert=True,
    )
