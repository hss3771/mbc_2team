from elasticsearch import Elasticsearch
from elasticsearch.helpers import scan
from datetime import datetime
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForSequenceClassification


MODEL_DIR = "apps/analyzer/model/sentiment_model"      # ★ 현재 사용 중 모델 경로
MODEL_VERSION = "sentiment_v1"       # ★ 원하면 변경
MAX_LEN = 256


# ---------------------------
# Load model
# ---------------------------
tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
model.eval()

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

LABEL_MAP = {
    0: "negative",
    1: "neutral",
    2: "positive"
}


def predict_sentiment(text: str):
    if not isinstance(text, str):
        text = ""

    enc = tokenizer(
        text,
        padding="max_length",
        truncation=True,
        max_length=MAX_LEN,
        return_tensors="pt"
    )

    enc = {k: v.to(device) for k, v in enc.items()}

    with torch.no_grad():
        logits = model(**enc).logits
        probs = F.softmax(logits, dim=-1)[0]

    idx = torch.argmax(probs).item()

    return {
        "label": LABEL_MAP[idx],
        "score": float(round(probs[idx].item(), 6))  # 정밀도 보존
    }


# ------------------------------------------------
# MAIN PIPELINE
# ------------------------------------------------
def update_sentiment(es: Elasticsearch, start_dt: str, end_dt: str):
    """
    start_dt / end_dt 예시:
    "2026-01-06T00:00:00+09:00"
    """

    # -------------------------------
    # 1) 기간으로 news_info 검색
    # -------------------------------
    query = {
        "query": {
            "range": {
                "published_at": {
                    "gte": start_dt,
                    "lte": end_dt
                }
            }
        },
        "_source": False
    }

    hits = scan(
        es,
        index="news_info",
        query=query
    )

    count = 0

    for hit in hits:
        doc_id = hit["_id"]

        # -----------------------------
        # 2) clean_text 인덱스 조회
        # -----------------------------
        try:
            ct = es.get(index="clean_text", id=doc_id)
            clean_text = ct["_source"].get("clean_text", "")
        except Exception:
            print(f"[WARN] clean_text 없음 → skip: {doc_id}")
            continue

        # -----------------------------
        # 3) 감성 분석
        # -----------------------------
        result = predict_sentiment(clean_text)

        # -----------------------------
        # 4) news_info 업데이트
        # -----------------------------
        body = {
            "doc": {
                "sentiment": {
                    "label": result["label"],
                    "score": result["score"],
                    "model_version": MODEL_VERSION
                }
            }
        }

        es.update(index="news_info", id=doc_id, body=body)

        count += 1
        if count % 50 == 0:
            print(f"processed: {count}")

    print(f"완료. 총 업데이트: {count}")


# -------------------------------
# Example
# -------------------------------
if __name__ == "__main__":
    es = Elasticsearch("http://192.168.0.34:9200")

    update_sentiment(
        es,
        "2026-01-04T00:00:00+09:00",
        "2026-01-06T00:00:00+09:00"
    )
