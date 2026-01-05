CLEAN_TEXT_INDEX = "clean_text"

def upsert_clean_text(
    es,
    news_id: str,
    date: str,          # strict_date_time
    clean_text: str,
):
    es.update(
        index=CLEAN_TEXT_INDEX,
        id=news_id,
        doc={
            "article_id": news_id,
            "date": date,
            "clean_text": clean_text,
        },
        doc_as_upsert=True,
    )
