from elasticsearch import Elasticsearch

es = Elasticsearch(
    hosts=["http://192.168.0.34:9200"],
    request_timeout=30,
    #http_auth=("elastic","elastic")
)

def get_es():
    return es

def delete_indices():
    es = get_es()
    try:
        for index in ["news_info", "clean_text", "issue_keyword_count"]:
            if es.indices.exists(index=index):
                es.indices.delete(index=index)
                print(f"Deleted index: {index}")
            else:
                print(f"Index not found (skip): {index}")
    finally:
        print("삭제완")
        es.close()

def create_indices():
    es = get_es()
    try:
        # 1) news_info (datetime 필요)
        es.indices.create(
            index="news_info",
            mappings={
                "properties": {
                    "article_id": { "type": "keyword" },

                    "published_at": {
                        "type": "date",
                        "format": "strict_date_time"
                    },

                    "press_name": { "type": "keyword" },
                    "reporter": { "type": "keyword" },
                    "title": { "type": "text" },
                    "body": { "type": "text" },
                    "url": { "type": "keyword" },

                    "keywords": {
                        "type": "object",
                        "properties": {
                            "label": { "type": "keyword" },
                            "model_version": { "type": "keyword" }
                        }
                    },

                    "trust": {
                        "type": "object",
                        "properties": {
                            "score": { "type": "float" },
                            "label": { "type": "keyword" },
                            "model_version": { "type": "keyword" }
                        }
                    },

                    "sentiment": {
                        "type": "object",
                        "properties": {
                            "score": { "type": "float" },
                            "label": { "type": "keyword" },
                            "model_version": { "type": "keyword" }
                        }
                    },

                    "summary": {
                        "type": "object",
                        "properties": {
                            "summary_text": { "type": "text" },
                            "model_version": { "type": "keyword" }
                        }
                    }
                }
            }
        )
        print("Created index: news_info")

        # 2) clean_text (기사 기준이면 datetime 권장)
        es.indices.create(
            index="clean_text",
            mappings={
                "properties": {
                    "article_id": { "type": "keyword" },
                    "date": {
                        "type": "date",
                        "format": "strict_date_time"
                    },
                    "clean_text": { "type": "text" }
                }
            }
        )
        print("Created index: clean_text")

        # 3) issue_keyword_count (date-only 집계)
        es.indices.create(
            index="issue_keyword_count",
            mappings={
                "dynamic": "strict",
                "properties": {
                    "ranking_id": { "type": "integer" },

                    "date": {
                        "type": "date",
                        "format": "strict_date"
                    },

                    "keyword": { "type": "keyword" },
                    "count": { "type": "integer" },

                    "sub_keywords": {
                        "type": "nested",
                        "properties": {
                            "keyword": { "type": "keyword" },
                            "count": { "type": "float" }
                        }
                    },

                    "summary": {
                        "properties": {
                            "summary": { "type": "text" },
                            "computed_at": {
                                "type": "date",
                                "format": "strict_date_time"
                            }
                        }
                    }
                }
            }
        )
        print("Created index: issue_keyword_count")

    finally:
        es.close()
        print("INDEX RESET COMPLETE")
