from elasticsearch import Elasticsearch

es = Elasticsearch(
    hosts=["http://192.168.0.34:9200"],
    request_timeout=30,
    #http_auth=("elastic","elastic")
)

def get_es():
    return es

def set_index():
    es = get_es()
    try:
        # news_info index 생성
        es.indices.create(
            index="news_info",
            mappings={
                "properties": {
                    "article_id": { "type": "keyword" },
                    "published_at": { "type": "date" },
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
        # clean_text index 생성
        es.indices.create(
            index="clean_text",
            mappings= {
                "properties": {
                    "article_id": { "type": "keyword" },
                    "date": { "type": "date" },
                    "clean_text": { "type": "text" }
                }
            }
        )
        # issue_keyword_count index 생성
        es.indices.create(
            index="issue_keyword_count",
            mappings={
                "dynamic": "strict",
                "properties": {
                    "ranking": {"type": "integer"},
                    "date": {"type": "date"},
                    "keyword_count": {"type": "keyword"},

                    "sub_keywords": {
                        "type": "nested",
                        "properties": {
                            "keyword": {"type": "keyword"},
                            "count": {"type": "integer"}
                        }
                    },
                    "summary": {
                        "properties": {
                            "summary": {"type": "text"},
                            "computed_at": {"type": "date"}
                        }
                    }
                }
            }
        )
    except Exception as e:
        print(f'Index creation error: {e}')
    finally:
        es.close()
        print("SET INDEX COMPLETE")