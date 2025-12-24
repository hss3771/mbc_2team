# run_sentiment_inference.py
import os
import numpy as np
import pandas as pd
import torch
from transformers import AutoTokenizer, AutoModelForSequenceClassification

MODEL_DIR = "models/sentiment_electra"
DEVICE = torch.device("cuda" if torch.cuda.is_available() else "cpu")

# (선택) CSV 일괄 예측용
INPUT_CSV = "data/news_for_sentiment.csv"      # text 컬럼 있다고 가정
OUTPUT_CSV = "data/news_with_sentiment.csv"


def load_label_encoder(model_dir):
    path = os.path.join(model_dir, "label_encoder.npy")
    classes = np.load(path, allow_pickle=True)
    id2label = {i: c for i, c in enumerate(classes)}
    return id2label


def load_model():
    tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
    model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
    model.to(DEVICE)
    model.eval()
    id2label = load_label_encoder(MODEL_DIR)
    return tokenizer, model, id2label


def predict_texts(texts, tokenizer, model, id2label, max_len=128):
    encodings = tokenizer(
        texts,
        padding=True,
        truncation=True,
        max_length=max_len,
        return_tensors="pt",
    )
    encodings = {k: v.to(DEVICE) for k, v in encodings.items()}

    with torch.no_grad():
        outputs = model(**encodings)
        logits = outputs.logits
        probs = torch.softmax(logits, dim=-1)
        preds = torch.argmax(probs, dim=-1).cpu().numpy()
        probs = probs.cpu().numpy()

    labels = [id2label[int(i)] for i in preds]
    confidences = probs.max(axis=-1)
    return labels, confidences


def demo_single():
    tokenizer, model, id2label = load_model()
    examples = [
        "기준금리 인하 기대감에 증시가 일제히 상승했다.",
        "환율 급등과 경기 침체 우려로 투자 심리가 위축되고 있다.",
        "증시는 보합권에서 등락을 반복하며 뚜렷한 방향성을 보이지 않고 있다.",
    ]
    labels, confs = predict_texts(examples, tokenizer, model, id2label)
    print("=== 단일 문장 테스트 ===")
    for text, lab, c in zip(examples, labels, confs):
        print(f"[{lab} ({c:.2f})] {text}")


def demo_csv():
    tokenizer, model, id2label = load_model()

    df = pd.read_csv(INPUT_CSV)
    if "text" not in df.columns:
        raise ValueError("INPUT_CSV에 'text' 컬럼이 필요합니다.")

    texts = df["text"].fillna("").astype(str).tolist()
    labels, confs = predict_texts(texts, tokenizer, model, id2label)

    df["sentiment_label"] = labels
    df["sentiment_confidence"] = confs

    df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    print(f"[SAVE] 감성 라벨 추가 -> {OUTPUT_CSV}")


if __name__ == "__main__":
    # 1) 직접 문장 테스트
    demo_single()

    # 2) CSV 일괄 예측 (원하면 주석 해제)
    # demo_csv()
