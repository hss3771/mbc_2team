# predict_issue_keywords.py
# clean_text(date 범위) -> 임베딩 -> 로지스틱 예측 -> news_info.keywords 업데이트
# doc_id = clean_text._id = news_info._id

from typing import Dict, List, Any, Iterable, Tuple
import os
import joblib
from elasticsearch import helpers
from sentence_transformers import SentenceTransformer


NEWS_INDEX = "news_info"
CLEAN_INDEX = "clean_text"

MODEL_DIR = "models/issue_classifier"  # 네 학습 코드 SAVE_DIR와 동일하게 맞추기
CLASSIFIER_PATH = os.path.join(MODEL_DIR, "classifier.joblib")
ENCODER_PATH = os.path.join(MODEL_DIR, "label_encoder.joblib")
EMB_NAME_PATH = os.path.join(MODEL_DIR, "embedding_model_name.txt")

MODEL_VERSION = "issue_classifier_v1"  # 너가 관리하는 버전 문자열로 변경 가능


def load_models():
    clf = joblib.load(CLASSIFIER_PATH)
    le = joblib.load(ENCODER_PATH)
    with open(EMB_NAME_PATH, "r", encoding="utf-8") as f:
        emb_name = f.read().strip()
    embed_model = SentenceTransformer(emb_name)
    return clf, le, embed_model, emb_name


def iter_clean_docs_by_date_range(
    es,
    start_dt: str,  # "YYYY-MM-DDTHH:MM:SS+09:00"
    end_dt: str,    # "YYYY-MM-DDTHH:MM:SS+09:00"
    page_size: int = 500,
) -> Iterable[Tuple[str, Dict[str, Any]]]:
    """
    clean_text에서 date 범위로 검색해 (doc_id, _source)를 순회
    search_after 방식 (정렬: date asc, _id asc)
    """
    search_after = None

    while True:
        body: Dict[str, Any] = {
            "size": page_size,
            "_source": ["date", "clean_text"],
            "query": {
                "range": {
                    "date": {
                        "gte": start_dt,
                        "lt": end_dt
                    }
                }
            },
            "sort": [
                {"date": "asc"},
                {"_id": "asc"}
            ],
        }
        if search_after is not None:
            body["search_after"] = search_after

        resp = es.search(index=CLEAN_INDEX, body=body)
        hits = resp["hits"]["hits"]
        if not hits:
            break

        for h in hits:
            yield h["_id"], h["_source"]

        search_after = hits[-1]["sort"]


def bulk_update_news_keywords(
    es,
    items: List[Dict[str, Any]],
) -> Dict[str, int]:
    """
    news_info 문서의 keywords 업데이트 bulk
    """
    actions = []
    for it in items:
        doc_id = it["id"]
        actions.append({
            "_op_type": "update",
            "_index": NEWS_INDEX,
            "_id": doc_id,
            "doc": {
                "keywords": {
                    "label": it["label"],
                    "model_version": it["model_version"],
                    "score": it["score"],  # 매핑에 없으면 strict에서 에러. 필요없으면 제거.
                }
            }
        })

    success = 0
    other_error = 0

    for ok, item in helpers.streaming_bulk(es, actions, raise_on_error=False, raise_on_exception=False):
        op = item.get("update") or item.get("index") or item.get("create") or item.get("delete")
        status = op.get("status") if op else None

        if ok and status in (200, 201):
            success += 1
        else:
            other_error += 1

    return {"updated": success, "other_error": other_error}


def predict_and_update_keywords(
    es,
    start_dt: str,
    end_dt: str,
    batch_size: int = 500,
) -> None:
    """
    clean_text -> 임베딩 -> 예측 -> news_info.keywords 업데이트
    정확도(accuracy)는 정답 라벨이 없으면 계산 불가하므로,
    평균 신뢰도(예측 max probability 평균)를 출력한다.
    """
    clf, le, embed_model, emb_name = load_models()

    total_read = 0
    total_updated = 0
    total_other_error = 0
    total_empty = 0

    # “정확도” 대체 지표(정답 라벨 없음 가정)
    sum_conf = 0.0
    conf_n = 0

    buf_ids: List[str] = []
    buf_dates: List[str] = []
    buf_texts: List[str] = []

    for doc_id, src in iter_clean_docs_by_date_range(es, start_dt, end_dt, page_size=batch_size):
        total_read += 1

        text = (src.get("clean_text") or "").strip()
        if not text:
            total_empty += 1
            continue

        buf_ids.append(doc_id)
        buf_dates.append(src.get("date")) # type: ignore
        buf_texts.append(text)

        if len(buf_texts) >= batch_size:
            total_updated += _flush_predict_update(
                es, clf, le, embed_model, buf_ids, buf_texts,
                model_version=f"{MODEL_VERSION}::{emb_name}",
                sum_conf_holder=[sum_conf], conf_n_holder=[conf_n],
                other_error_holder=[total_other_error],
            )
            # holders 반영
            sum_conf, conf_n, total_other_error = _holders_pop(sum_conf, conf_n, total_other_error)
            buf_ids.clear(); buf_dates.clear(); buf_texts.clear()

    if buf_texts:
        total_updated += _flush_predict_update(
            es, clf, le, embed_model, buf_ids, buf_texts,
            model_version=f"{MODEL_VERSION}::{emb_name}",
            sum_conf_holder=[sum_conf], conf_n_holder=[conf_n],
            other_error_holder=[total_other_error],
        )
        sum_conf, conf_n, total_other_error = _holders_pop(sum_conf, conf_n, total_other_error)

    avg_conf = (sum_conf / conf_n) if conf_n > 0 else 0.0

    print("[PREDICT DONE]")
    print(f"- read(clean_text): {total_read}")
    print(f"- empty_clean_text: {total_empty}")
    print(f"- updated(news_info.keywords): {total_updated}")
    print(f"- other_error: {total_other_error}")
    print(f"- avg_confidence (proxy metric): {avg_conf:.4f}")


def _holders_pop(sum_conf: float, conf_n: int, other_err: int):
    # 단순히 현재값을 그대로 반환(placeholder)
    return sum_conf, conf_n, other_err


def _flush_predict_update(
    es,
    clf,
    le,
    embed_model,
    ids: List[str],
    texts: List[str],
    model_version: str,
    sum_conf_holder: List[float],
    conf_n_holder: List[int],
    other_error_holder: List[int],
) -> int:
    # 1) 임베딩
    X = embed_model.encode(texts, batch_size=32, show_progress_bar=False)

    # 2) 예측
    y_pred = clf.predict(X)
    labels = le.inverse_transform(y_pred)

    # 3) 신뢰도(확률) 계산 (로지스틱이면 predict_proba 지원)
    scores = None
    if hasattr(clf, "predict_proba"):
        proba = clf.predict_proba(X)
        scores = proba.max(axis=1).tolist()
    else:
        scores = [0.0] * len(labels)

    # 4) 업데이트 bulk
    items = []
    for doc_id, label, score in zip(ids, labels, scores):
        items.append({
            "id": doc_id,
            "label": str(label),
            "score": float(score),
            "model_version": model_version
        })

    r = bulk_update_news_keywords(es, items)
    other_error_holder[0] += r["other_error"]

    # 5) proxy metric 누적
    sum_conf_holder[0] += sum(scores)
    conf_n_holder[0] += len(scores)

    return r["updated"]
