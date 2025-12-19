# train_trust_model_electra.py

import os
import random
import numpy as np
import pandas as pd
from tqdm import tqdm

import torch
from torch.utils.data import Dataset, DataLoader
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score

from transformers import (
    ElectraTokenizerFast,
    ElectraForSequenceClassification,
    get_linear_schedule_with_warmup,
)
from torch.optim import AdamW

# ===== 설정 =====
DATA_PATH = "data/train_trust_1212.csv"          # preprocess_aihub_trust에서 만든 CSV
MODEL_NAME = "monologg/koelectra-base-v3-discriminator"
SAVE_DIR = "models/trust_electra20251212"
MAX_LEN = 512
BATCH_SIZE =  64# 0~128
EPOCHS = 4 # 5~50 다다익선 정확도 엄청오름 단지 과적합될수 있음
LR = 2e-5
SEED = 42


def set_seed(seed: int = 42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    torch.cuda.manual_seed_all(seed)


class NewsTrustDataset(Dataset):
    def __init__(self, texts, labels, tokenizer, max_len=256):
        self.texts = texts
        self.labels = labels
        self.tokenizer = tokenizer
        self.max_len = max_len

    def __len__(self):
        return len(self.texts)

    def __getitem__(self, idx):
        text = str(self.texts[idx])
        label = int(self.labels[idx])

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
            "labels": torch.tensor(label, dtype=torch.long),
        }


def load_data(path: str):
    df = pd.read_csv(path)

    df["title"] = df["title"].fillna("")
    df["content"] = df["content"].fillna("")
    df["text"] = df["title"] + " [SEP] " + df["content"]

    labels = df["label"].astype(int).values  # 0=낚시, 1=정상
    texts = df["text"].tolist()
    return texts, labels


def train_one_epoch(model, dataloader, optimizer, scheduler, device):
    model.train()
    total_loss = 0.0
    preds_all = []
    labels_all = []

    for batch in tqdm(dataloader, desc="Train"):
        input_ids = batch["input_ids"].to(device)
        attention_mask = batch["attention_mask"].to(device)
        labels = batch["labels"].to(device)

        optimizer.zero_grad()
        outputs = model(
            input_ids=input_ids,
            attention_mask=attention_mask,
            labels=labels,
        )
        loss = outputs.loss
        logits = outputs.logits

        loss.backward()
        optimizer.step()
        scheduler.step()

        total_loss += loss.item()

        preds = torch.argmax(logits, dim=-1).detach().cpu().numpy()
        labels_cpu = labels.detach().cpu().numpy()

        preds_all.extend(preds)
        labels_all.extend(labels_cpu)

    avg_loss = total_loss / len(dataloader)
    acc = accuracy_score(labels_all, preds_all)
    f1 = f1_score(labels_all, preds_all, average="weighted")
    return avg_loss, acc, f1


def eval_one_epoch(model, dataloader, device):
    model.eval()
    total_loss = 0.0
    preds_all = []
    labels_all = []

    with torch.no_grad():
        for batch in tqdm(dataloader, desc="Eval"):
            input_ids = batch["input_ids"].to(device)
            attention_mask = batch["attention_mask"].to(device)
            labels = batch["labels"].to(device)

            outputs = model(
                input_ids=input_ids,
                attention_mask=attention_mask,
                labels=labels,
            )
            loss = outputs.loss
            logits = outputs.logits

            total_loss += loss.item()

            preds = torch.argmax(logits, dim=-1).detach().cpu().numpy()
            labels_cpu = labels.detach().cpu().numpy()

            preds_all.extend(preds)
            labels_all.extend(labels_cpu)

    avg_loss = total_loss / len(dataloader)
    acc = accuracy_score(labels_all, preds_all)
    f1 = f1_score(labels_all, preds_all, average="weighted")
    return avg_loss, acc, f1


def main():
    set_seed(SEED)
    os.makedirs(SAVE_DIR, exist_ok=True)

    print("[INFO] 데이터 로딩...")
    texts, labels = load_data(DATA_PATH)
    print(f"[INFO] 샘플 수: {len(texts)}")

    X_train, X_valid, y_train, y_valid = train_test_split(
        texts, labels,
        test_size=0.2,
        random_state=SEED,
        stratify=labels,
    )

    tokenizer = ElectraTokenizerFast.from_pretrained(MODEL_NAME)
    model = ElectraForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=2,  # 0=낚시, 1=정상
    )

    device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
    model.to(device)

    train_dataset = NewsTrustDataset(X_train, y_train, tokenizer, MAX_LEN)
    valid_dataset = NewsTrustDataset(X_valid, y_valid, tokenizer, MAX_LEN)

    train_loader = DataLoader(train_dataset, batch_size=BATCH_SIZE, shuffle=True)
    valid_loader = DataLoader(valid_dataset, batch_size=BATCH_SIZE, shuffle=False)

    optimizer = AdamW(model.parameters(), lr=LR)
    total_steps = len(train_loader) * EPOCHS
    scheduler = get_linear_schedule_with_warmup(
        optimizer,
        num_warmup_steps=int(0.1 * total_steps),
        num_training_steps=total_steps,
    )

    best_f1 = 0.0

    for epoch in range(1, EPOCHS + 1):
        print(f"\n===== Epoch {epoch} / {EPOCHS} =====")
        train_loss, train_acc, train_f1 = train_one_epoch(
            model, train_loader, optimizer, scheduler, device
        )
        print(f"[TRAIN] loss={train_loss:.4f}, acc={train_acc:.4f}, f1={train_f1:.4f}")

        val_loss, val_acc, val_f1 = eval_one_epoch(model, valid_loader, device)
        print(f"[VALID] loss={val_loss:.4f}, acc={val_acc:.4f}, f1={val_f1:.4f}")

        if val_f1 > best_f1:
            best_f1 = val_f1
            print(f"[SAVE] 새로운 best F1={best_f1:.4f}, 모델 저장")
            model.save_pretrained(SAVE_DIR)
            tokenizer.save_pretrained(SAVE_DIR)

    print(f"\n[INFO] 학습 종료. best F1={best_f1:.4f}")


if __name__ == "__main__":
    main()
