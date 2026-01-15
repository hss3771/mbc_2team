from __future__ import annotations

from typing import Iterator, Tuple, List, Dict, Any

from elasticsearch.helpers import bulk
from apps.common.elastic import get_es

INDEX = "news_info"


def build_missing_image_query() -> Dict[str, Any]:
    """
    image_url이 없거나 OR "" 인 문서 타겟
    """
    return {
        "bool": {
            "should": [
                {"bool": {"must_not": [{"exists": {"field": "image_url"}}]}},
                {"term": {"image_url": ""}},
            ],
            "minimum_should_match": 1,
        }
    }


def iter_targets_missing_image(page_size: int = 500) -> Iterator[Tuple[str, str]]:
    """
    ES에서 image_url 없는 문서들을 search_after로 순회.
    반환: (doc_id(_id), url)
    """
    es = get_es()

    body = {
        "size": page_size,
        "_source": ["url", "article_id"],  # 디버깅용(선택)
        "sort": [{"url": "asc"}],  # ✅ _id 정렬 금지 → url keyword 정렬
        "query": {
            "bool": {
                "should": [
                    {"bool": {"must_not": [{"exists": {"field": "image_url"}}]}},
                    {"term": {"image_url": ""}},
                ],
                "minimum_should_match": 1,
            }
        },
    }

    search_after = None
    while True:
        if search_after is not None:
            body["search_after"] = search_after
            print("[DEBUG] image crawler sort =", body["sort"])

        resp = es.search(index=INDEX, body=body)
        hits = (resp.get("hits") or {}).get("hits") or []
        if not hits:
            break

        for h in hits:
            doc_id = h.get("_id")
            url = (h.get("_source") or {}).get("url")
            if doc_id and url:
                yield doc_id, url

        search_after = hits[-1].get("sort")
        if not search_after:
            break


def bulk_update_image_urls(
    updates: List[Tuple[str, str]]) -> Tuple[int, List[str]]:
    """
    updates: [(doc_id, image_url), ...]
    doc_as_upsert=False: 없는 문서는 생성하지 않음
    """
    if not updates:
        return []

    es = get_es()

    actions = [
        {
            "_op_type": "update",
            "_index": INDEX,
            "_id": doc_id,
            "doc": {"image_url": image_url},
            "doc_as_upsert": False,
        }
        for (doc_id, image_url) in updates
    ]

    success_count, errors = bulk(es, actions, raise_on_error=False)

    reasons: List[str] = []
    if errors:
        for e in errors:
            try:
                op = next(iter(e.keys()))
                detail = e.get(op, {})
                status = detail.get("status")

                if status == 404:
                    continue

                err = detail.get("error") or {}
                reasons.append(
                    err.get("reason") or err.get("type") or f"status_{status}"
                )
            except Exception:
                reasons.append("unknown_error")

    return success_count, reasons
