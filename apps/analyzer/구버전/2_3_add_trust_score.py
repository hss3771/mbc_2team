# add_trust_score.py

import pandas as pd
import torch
from torch.utils.data import Dataset, DataLoader
from transformers import ElectraTokenizerFast, ElectraForSequenceClassification
from tqdm import tqdm

#MODEL_DIR = "models/trust_electra"
MODEL_DIR = "models/trust_electra20251209"
# INPUT_PATH = "data/news_with_issue.csv"          # issue 모델까지 끝난 파일
INPUT_PATH = "data/predict_trust2.csv"          # issue 모델까지 끝난 파일
# OUTPUT_PATH = "data/news_with_issue_trust.csv"   # trust_score 붙여 저장
OUTPUT_PATH = "data/predict_trust2.csv"   # trust_score 붙여 저장
MAX_LEN = 256
BATCH_SIZE = 32


class InferenceDataset(Dataset):
    def __init__(self, texts, tokenizer, max_len=256):
        self.texts = texts
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        text = str(self.texts[idx])
        encoding = self.tokenizer(
            text,
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


def main():
    print("[INFO] 신뢰도 모델 로딩...")
    tokenizer = ElectraTokenizerFast.from_pretrained(MODEL_DIR)
    model = ElectraForSequenceClassification.from_pretrained(MODEL_DIR)
    model.eval()

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    print("[INFO] 뉴스 데이터 로딩...")
    df = pd.read_csv(INPUT_PATH)
    df["title"] = df["title"].fillna("")
    # df["body"] = df["body"].fillna("")
    # df["text"] = df["title"] + " [SEP] " + df["body"]
    df["content"] = df["content"].fillna("")
    df["text"] = df["title"] + " [SEP] " + df["content"]

    texts = df["text"].tolist()
    dataset = InferenceDataset(texts, tokenizer, MAX_LEN)
    loader = DataLoader(dataset, batch_size=BATCH_SIZE, shuffle=False)

    trust_scores = []

    with torch.no_grad():
        for batch in tqdm(loader, desc="Infer"):
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
            )
            logits = outputs.logits
            print(logits)
            probs = torch.softmax(logits, dim=-1)

            # class 1 = "정상 기사" → 신뢰도
            scores = probs[:, 1].detach().cpu().numpy()
            trust_scores.extend(scores.tolist())

    df["trust_score"] = trust_scores
    df.drop(columns=["text"], inplace=True)

    df.to_csv(OUTPUT_PATH, index=False, encoding="utf-8-sig")
    print(f"[SAVE] trust_score 추가된 파일 저장 -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
