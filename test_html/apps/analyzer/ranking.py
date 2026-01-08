import hashlib
from typing import Dict, List, Any, Tuple
from elasticsearch import helpers

NEWS_INDEX = "news_info"
OUT_INDEX = "issue_keyword_count"

DATE_FIELD = "published_at"
KEYWORD_FIELD = "keywords.label"   # 필요 시 여기만 바꾸면 됨


def _make_doc_id(start_date_strict: str, keyword: str) -> str:
    """
    _id = sha1("{date}|{keyword}") hex
    date: 'YYYY-MM-DD'
    """
    raw = f"{start_date_strict}|{keyword}".encode("utf-8")
    return hashlib.sha1(raw).hexdigest()


def aggregate_keywords_in_range(
    es,
    start_dt: str,  # "2026-01-04T00:00:00+09:00"
    end_dt: str,    # "2026-01-05T00:00:00+09:00"
    size: int = 10000,
) -> List[Tuple[str, int]]:
    """
    (start_dt ~ end_dt) 범위에서 KEYWORD_FIELD 기준 terms 집계
    반환: [(keyword, count), ...]
    """
    resp = es.search(
        index=NEWS_INDEX,
        size=0,
        query={
            "bool": {
                "filter": [
                    {"range": {DATE_FIELD: {"gte": start_dt, "lt": end_dt}}},
                    {"exists": {"field": KEYWORD_FIELD}},
                ]
            }
        },
        aggs={
            "by_keyword": {
                "terms": {
                    "field": KEYWORD_FIELD,
                    "size": size
                }
            }
        },
    )

    buckets = resp.get("aggregations", {}).get("by_keyword", {}).get("buckets", [])
    return [(b["key"], int(b["doc_count"])) for b in buckets]


def write_issue_keyword_count(
    es,
    start_date_strict: str,  # "2026-01-04"  (strict_date)
    keyword_counts: List[Tuple[str, int]],
    refresh: bool = True,
    chunk_size: int = 1000,
) -> Dict[str, int]:
    """
    issue_keyword_count에 bulk index.
    - _id: sha1("{start_date}|{keyword}")
    - fields: date, keyword, count
    """
    actions = []
    for keyword, count in keyword_counts:
        doc_id = _make_doc_id(start_date_strict, keyword)
        actions.append({
            "_op_type": "index",   # 같은 _id면 덮어씀(일별 재집계에 안전)
            "_index": OUT_INDEX,
            "_id": doc_id,
            "_source": {
                "date": start_date_strict,  # strict_date
                "keyword": keyword,
                "count": int(count),
            }
        })

    ok = 0
    fail = 0

    # helpers.bulk는 성공/실패를 item 단위로 반환받기 어렵기 때문에 streaming_bulk로 집계
    for success, item in helpers.streaming_bulk(
        es,
        actions,
        chunk_size=chunk_size,
        raise_on_error=False,
        raise_on_exception=False,
    ):
        op = item.get("index") or item.get("create") or item.get("update")
        status = op.get("status") if op else None
        if status in (200, 201):  # index는 200(업데이트), 201(생성)
            ok += 1
        else:
            fail += 1
            # strict 매핑 오류/파싱 오류 등 원인 확인용 (샘플로 몇 개만 찍고 싶으면 조건 추가)
            # print("[ISSUE_KEYWORD_COUNT FAIL]", item)

    if refresh:
        es.indices.refresh(index=OUT_INDEX)

    return {"ok": ok, "fail": fail, "total": len(actions)}


def run_issue_keyword_count_for_range(
    es,
    start_dt: str,  # "2026-01-04T00:00:00+09:00"
    end_dt: str,    # "2026-01-05T00:00:00+09:00"
):
    """
    전체 파이프라인:
    1) 범위 집계
    2) issue_keyword_count에 저장
    """
    # start_dt에서 strict_date 뽑기 (YYYY-MM-DD)
    start_date_strict = start_dt[:10]

    pairs = aggregate_keywords_in_range(es, start_dt, end_dt)
    result = write_issue_keyword_count(es, start_date_strict, pairs)

    print("[ISSUE_KEYWORD_COUNT DONE]")
    print(f"- date: {start_date_strict}")
    print(f"- keywords: {len(pairs)}")
    print(f"- bulk_ok: {result['ok']}, bulk_fail: {result['fail']}")