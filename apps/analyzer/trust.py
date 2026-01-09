# add_trust_score_es.py

import torch
from torch.utils.data import Dataset, DataLoader
from transformers import ElectraTokenizerFast, ElectraForSequenceClassification
from tqdm import tqdm
from elasticsearch import Elasticsearch

# =====================
# CONFIG
# =====================
ES_HOST = "http://192.168.0.34:9200"
NEWS_INDEX = "news_info"
CLEAN_INDEX = "clean_text"

TARGET_DATE = "2026-01-05T09:01:10+09:00"

MODEL_DIR = "apps/analyzer/model/trust_electra20251209"
MAX_LEN = 256
BATCH_SIZE = 32
MODEL_VERSION = "trust_electra20251212"


# =====================
# Dataset
# =====================
class InferenceDataset(Dataset):
    def __init__(self, texts, tokenizer, max_len=256):
        self.texts = texts
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        encoding = self.tokenizer(
            self.texts[idx],
            add_special_tokens=True,
            padding="max_length",
            truncation=True,
            max_length=self.max_len,
            return_tensors="pt",
        )

        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
        }

def fetch_news_by_date_range(es):
    query = {
        "query": {
            "bool": {
                "filter": [
                    {
                        "range": {
                            "published_at": {
                                "gte": "2026-01-04T00:00:00+09:00",
                                "lt": "2026-01-07T00:00:00+09:00"
                            }
                        }
                    }
                ]
            }
        }
    }

    page_size = 500
    scroll_time = "2m"

    resp = es.search(
        index=NEWS_INDEX,
        body=query,
        size=page_size,
        scroll=scroll_time
    )

    scroll_id = resp["_scroll_id"]
    hits = resp["hits"]["hits"]

    all_docs = hits.copy()

    while hits:
        resp = es.scroll(
            scroll_id=scroll_id,
            scroll=scroll_time
        )
        scroll_id = resp["_scroll_id"]
        hits = resp["hits"]["hits"]
        all_docs.extend(hits)

    es.clear_scroll(scroll_id=scroll_id)
    return all_docs


# =====================
# Main
# =====================
def main():
    # ES client
    es = Elasticsearch(ES_HOST)

    # ---------------------
    # 1. news_info 날짜 검색
    # ---------------------
    news_docs = fetch_news_by_date_range(es)

    if not news_docs:
        print("[INFO] 해당 기간 뉴스 없음")
        return

    article_ids = []
    titles = []

    for doc in news_docs:
        source = doc["_source"]
        article_ids.append(source["article_id"])
        titles.append(source.get("title", ""))

    # ---------------------
    # 2. clean_text 조회
    # ---------------------
    clean_resp = es.mget(
        index=CLEAN_INDEX,
        ids=article_ids
    )

    texts = []
    valid_article_ids = []

    for i, doc in enumerate(clean_resp["docs"]):
        if not doc["found"]:
            continue

        clean_text = doc["_source"]["clean_text"]
        text = f"{titles[i]} [SEP] {clean_text}"

        texts.append(text)
        valid_article_ids.append(article_ids[i])

    if not texts:
        print("[INFO] clean_text 매칭 실패")
        return

    # ---------------------
    # 3. 모델 로딩
    # ---------------------
    tokenizer = ElectraTokenizerFast.from_pretrained(MODEL_DIR)
    model = ElectraForSequenceClassification.from_pretrained(MODEL_DIR)
    model.eval()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device) # type: ignore

    dataset = InferenceDataset(texts, tokenizer, MAX_LEN)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=False)

    trust_scores = []

    with torch.no_grad():
        for batch in tqdm(loader, desc="Infer Trust"):
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
            )

            probs = torch.softmax(outputs.logits, dim=-1)
            scores = probs[:, 1].detach().cpu().numpy()
            trust_scores.extend(scores.tolist())

    # ---------------------
    # 4. news_info 업데이트
    # ---------------------
    for article_id, score in zip(valid_article_ids, trust_scores):
        es.update(
            index=NEWS_INDEX,
            id=article_id,
            doc={
                "trust": {
                    "label": "reliable" if score >= 0.5 else "unreliable",
                    "score": float(score),
                    "model_version": MODEL_VERSION
                }
            }
        )

    print(f"[DONE] trust 업데이트 완료 ({len(valid_article_ids)}건)")


if __name__ == "__main__":
    main()
