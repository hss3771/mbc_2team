from transformers import AutoTokenizer, AutoModelForCausalLM
from elasticsearch import Elasticsearch
from elasticsearch.helpers import scan
import torch


MODEL_NAME = "Qwen/Qwen2.5-3B-Instruct"
MODEL_VERSION = "qwen2.5-3b-instruct"


def load_qwen_model():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
    model = AutoModelForCausalLM.from_pretrained(
        MODEL_NAME,
        torch_dtype=torch.float16,
        device_map="auto"
    )
    return tokenizer, model


def summarize_text(tokenizer, model, clean_text: str) -> str:
    messages = [
        {
            "role": "system",
            "content": (
                "너는 한국어 뉴스 요약 전문 모델이다. "
                "아래 기사를 3문장 이내로 요약하라. "
                "핵심 사실만 포함하고 객관적인 뉴스체로 작성하라."
            )
        },
        {
            "role": "user",
            "content": clean_text
        }
    ]

    inputs = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_dict=True,
        return_tensors="pt"
    ).to(model.device)

    outputs = model.generate(
        **inputs,
        max_new_tokens=300,
        do_sample=False
    )

    summary = tokenizer.decode(
        outputs[0][inputs["input_ids"].shape[-1]:],
        skip_special_tokens=True
    ).strip()

    return summary


def run_news_summary(es: Elasticsearch, start_dt: str, end_dt: str):
    """
    start_dt, end_dt 예시:
    2026-01-10T00:00:00+09:00
    """

    tokenizer, model = load_qwen_model()

    query = {
        "query": {
            "range": {
                "published_at": {
                    "gte": start_dt,
                    "lte": end_dt
                }
            }
        }
    }

    docs = scan(
        es,
        index="news_info",
        query=query,
        size=100
    )

    for doc in docs:
        doc_id = doc["_id"]

        try:
            # 1️⃣ clean_text 조회 (doc_id 동일)
            clean_doc = es.get(index="clean_text", id=doc_id)
            clean_text = clean_doc["_source"].get("clean_text")

            if not clean_text or len(clean_text.strip()) < 50:
                print(f"[SKIP] clean_text 없음 또는 너무 짧음: {doc_id}")
                continue

            # 2️⃣ 요약 생성
            summary_text = summarize_text(tokenizer, model, clean_text)

            if not summary_text:
                print(f"[FAIL] 요약 결과 비어있음: {doc_id}")
                continue

            # 3️⃣ news_info 업데이트
            es.update(
                index="news_info",
                id=doc_id,
                doc={
                    "summary": {
                        "summary_text": summary_text,
                        "model_version": MODEL_VERSION
                    }
                }
            )

            print(f"[OK] 요약 완료: {doc_id}")

        except Exception as e:
            print(f"[ERROR] doc_id={doc_id} | {str(e)}")
