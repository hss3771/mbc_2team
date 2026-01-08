from __future__ import annotations

from typing import Dict, List
from collections import defaultdict

from elasticsearch import Elasticsearch
from sklearn.feature_extraction.text import TfidfVectorizer
from datetime import datetime, timedelta
from apps.common.repositories.issue_keyword_repo import make_issue_ranking_id
import re
# =====================================================
# 기본 설정
# =====================================================

ES_HOST = "http://192.168.0.34:9200"
# doc_id = f"{DATE}_{keyword}"
SOURCE_INDEX = "news_info"
TARGET_INDEX = "issue_keyword_count"

DATE = "2026-01-06"

START_AT = f"{DATE}T00:00:00+09:00"
END_AT   = f'{(datetime.fromisoformat(DATE) + timedelta(days=1)).strftime("%Y-%m-%dT00:00:00")}+09:00'

MAX_TERMS = 10000
TOP_N_SUB_KEYWORDS = 30

STOPWORDS = {
    # 서술 / 기능어
    "있다", "있는", "한다", "했다", "말했다", "밝혔다", "강조했다",
    "통해", "위해", "위한", "함께", "대한", "것으로", "이라고",

    # 기사 관용어
    "기자", "뉴스1", "연합뉴스",

    # 시점/날짜
    "이번", "이날", "지난", "지난해", "올해",
    "5일", "6일", "7일",

    # 위치/일반
    "서울", "국내", "현지시간",
}

def extract_sub_keywords(texts: list[str], top_n: int = 30) -> list[dict]:
    if not texts:
        return []

    vectorizer = TfidfVectorizer(
        max_features=2000,
        ngram_range=(1, 2),
        token_pattern=r"(?u)\b\w+\b",
    )

    tfidf = vectorizer.fit_transform(texts)
    scores = tfidf.mean(axis=0).A1
    features = vectorizer.get_feature_names_out()

    pairs = sorted(
        zip(features, scores),
        key=lambda x: x[1],
        reverse=True,
    )

    result = []
    for word, score in pairs:
        if len(word) <= 1:
            continue
        if word in STOPWORDS:
            continue
        if word.isdigit():
            continue
        result.append({"keyword": word, "score": float(score)})
        if len(result) >= top_n:
            break

    return result

def is_valid_token(token: str) -> bool:
    if len(token) < 2:
        return False

    if token in STOPWORDS:
        return False

    # 숫자만 있는 경우 제거
    if token.isdigit():
        return False

    # 숫자 포함 비율 높은 경우 제거 (ex: 4457, 5일)
    if re.fullmatch(r"[0-9]+", token):
        return False

    return True

# =====================================================
# ES Client
# =====================================================

def get_es() -> Elasticsearch:
    return Elasticsearch(ES_HOST)


# =====================================================
# 1️⃣ 상위 키워드별 count 집계
# =====================================================

def compute_issue_ranking(es: Elasticsearch) -> Dict[str, int]:
    query = {
        "size": 0,
        "query": {
            "range": {
                "published_at": {
                    "gte": START_AT,
                    "lt": END_AT,
                }
            }
        },
        "aggs": {
            "by_issue": {
                "terms": {
                    "field": "keywords.label",
                    "size": MAX_TERMS,
                }
            }
        },
    }
    resp = es.search(index=SOURCE_INDEX, body=query)
    return {
        bucket["key"]: bucket["doc_count"]
        for bucket in resp["aggregations"]["by_issue"]["buckets"]
    }


# =====================================================
# 2️⃣ 특정 이슈 키워드의 원문 수집
# =====================================================

def fetch_texts_by_issue(es, issue_keyword: str) -> list[str]:
    texts = []
    search_after = None

    while True:
        body = {
            "size": 10000,
            "query": {
                "bool": {
                    "must": [
                        {"term": {"keywords.label": issue_keyword}},
                        {
                            "range": {
                                "published_at": {
                                    "gte": START_AT,
                                    "lt": END_AT,
                                }
                            }
                        },
                    ]
                }
            },
            "_source": ["title", "body"],
        }

        if search_after:
            body["search_after"] = search_after

        resp = es.search(index="news_info", body=body)
        hits = resp["hits"]["hits"]

        if not hits:
            break

        for h in hits:
            src = h["_source"]
            text = f"{src.get('title', '')} {src.get('body', '')}".strip()
            if text:
                texts.append(text)

        # ❗ _id 정렬 제거 → search_after도 제거
        search_after = None
        break

    return texts





# =====================================================
# 3️⃣ sub_keywords (TF-IDF)
# =====================================================

def compute_sub_keywords(
    texts: List[str],
    top_n: int = TOP_N_SUB_KEYWORDS,
) -> List[dict]:

    if not texts:
        return []

    vectorizer = TfidfVectorizer(
        max_features=3000,
        ngram_range=(1, 2),
        stop_words="english",  # ASSUME: 한국어면 교체 필요
    )

    tfidf = vectorizer.fit_transform(texts)

    scores = tfidf.mean(axis=0).A1
    terms = vectorizer.get_feature_names_out()

    ranked = sorted(
        zip(terms, scores),
        key=lambda x: x[1],
        reverse=True,
    )[:top_n]

    return [
        {"keyword": term, "score": float(score)}
        for term, score in ranked
        if score > 0
    ]


# =====================================================
# 4️⃣ issue_keyword_count upsert
# =====================================================

def upsert_issue_keyword(
    es: Elasticsearch,
    keyword: str,
    count: int,
    sub_keywords: List[dict],
) -> None:
    doc_id = make_issue_ranking_id(DATE, keyword)
    print(doc_id)

    body = {
        "date": DATE,
        "keyword": keyword,
        "count": count,
        "sub_keywords": sub_keywords,
    }

    es.index(
        index=TARGET_INDEX,
        id=doc_id,
        document=body,
    )


# =====================================================
# 5️⃣ 전체 파이프라인
# =====================================================

def run_pipeline() -> None:
    es = get_es()

    try:
        ranking = compute_issue_ranking(es)
        for issue_keyword, count in ranking.items():
            texts = fetch_texts_by_issue(es, issue_keyword)
            sub_keywords = extract_sub_keywords(texts)
            print(f'issu_keyword = {issue_keyword}')
            print(f'count = {count}')
            print(f'sub_keywords = {sub_keywords}')
            print(f'texts = {texts}')
            upsert_issue_keyword(
                es=es,
                keyword=issue_keyword,
                count=count,
                sub_keywords=sub_keywords,
            )

        es.indices.refresh(index=TARGET_INDEX)
        print(f"[DONE] {DATE} issue_keyword_count 적재 완료")
    except Exception as e:
        print(e)
    finally:
        es.close()


# =====================================================
# Entry Point
# =====================================================

if __name__ == "__main__":
    print("1_2_build_trend_ranking시작")
    run_pipeline()
