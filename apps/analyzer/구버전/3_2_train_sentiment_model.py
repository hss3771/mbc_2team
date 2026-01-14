# train_sentiment_model.py
# 베이스 모델: monologg/koelectra-base-v3-discriminator
import os
import random
import numpy as np
import pandas as pd
from sklearn.model_selection import train_test_split
from sklearn.preprocessing import LabelEncoder

import torch
from datasets import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    TrainingArguments,
    Trainer,
)

DATA_PATH = "data/train_sentiment.csv"
MODEL_NAME = "monologg/koelectra-base-v3-discriminator"
SAVE_DIR = "models/sentiment_electra"
MAX_LEN = 128
BATCH_SIZE = 16
EPOCHS = 3
LR = 2e-5
SEED = 42

def set_seed(seed=42):
    random.seed(seed)
    np.random.seed(seed)
    torch.manual_seed(seed)
    if torch.cuda.is_available():
        torch.cuda.manual_seed_all(seed)

def load_data(path):
    df = pd.read_csv(path)
    df = df.dropna(subset=["text", "label"])
    df["text"] = df["text"].astype(str).str.strip()
    df["label"] = df["label"].astype(str).str.strip()
    return df

def main():
    set_seed(SEED)

    print("[INFO] 데이터 로딩...")
    df = load_data(DATA_PATH)

    # 문자열 라벨 → 숫자 라벨로 인코딩
    le = LabelEncoder()
    df["label_id"] = le.fit_transform(df["label"])
    num_labels = len(le.classes_)
    print("[INFO] 라벨 매핑:", dict(zip(le.classes_, range(num_labels))))

    # 학습/검증 나누기
    train_df, val_df = train_test_split(
        df, test_size=0.1, random_state=SEED, stratify=df["label_id"]
    )

    tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

    def tokenize_fn(batch):
        return tokenizer(
            batch["text"],
            padding="max_length",
            truncation=True,
            max_length=MAX_LEN,
        )

    # HuggingFace datasets로 변환
    train_ds = Dataset.from_pandas(train_df[["text", "label_id"]])
    val_ds = Dataset.from_pandas(val_df[["text", "label_id"]])

    train_ds = train_ds.map(tokenize_fn, batched=True)
    val_ds = val_ds.map(tokenize_fn, batched=True)

    train_ds = train_ds.rename_column("label_id", "labels")
    val_ds = val_ds.rename_column("label_id", "labels")

    train_ds.set_format(
        type="torch",
        columns=["input_ids", "attention_mask", "labels"]
    )
    val_ds.set_format(
        type="torch",
        columns=["input_ids", "attention_mask", "labels"]
    )

    print("[INFO] 모델 로딩...")
    model = AutoModelForSequenceClassification.from_pretrained(
        MODEL_NAME,
        num_labels=num_labels
    )

    training_args = TrainingArguments(
        output_dir="outputs/sentiment",
        num_train_epochs=EPOCHS,
        per_device_train_batch_size=BATCH_SIZE,
        per_device_eval_batch_size=BATCH_SIZE,
        learning_rate=LR,
        evaluation_strategy="epoch",
        save_strategy="epoch",
        logging_steps=50,
        load_best_model_at_end=True,
        metric_for_best_model="accuracy",
        greater_is_better=True,
        save_total_limit=2,
        seed=SEED,
    )

    from sklearn.metrics import accuracy_score, f1_score, precision_score, recall_score

    def compute_metrics(eval_pred):
        logits, labels = eval_pred
        preds = np.argmax(logits, axis=-1)
        acc = accuracy_score(labels, preds)
        f1 = f1_score(labels, preds, average="macro")
        prec = precision_score(labels, preds, average="macro", zero_division=0)
        rec = recall_score(labels, preds, average="macro", zero_division=0)
        return {
            "accuracy": acc,
            "f1": f1,
            "precision": prec,
            "recall": rec,
        }

    trainer = Trainer(
        model=model,
        args=training_args,
        train_dataset=train_ds,
        eval_dataset=val_ds,
        tokenizer=tokenizer,
        compute_metrics=compute_metrics,
    )

    print("[INFO] 학습 시작...")
    trainer.train()

    os.makedirs(SAVE_DIR, exist_ok=True)
    trainer.save_model(SAVE_DIR)
    tokenizer.save_pretrained(SAVE_DIR)

    # 라벨 인코더도 같이 저장 (라벨 이름 복원용)
    le_path = os.path.join(SAVE_DIR, "label_encoder.npy")
    np.save(le_path, le.classes_)
    print(f"[SAVE] 모델 저장 -> {SAVE_DIR}")
    print(f"[SAVE] 라벨 인코더 저장 -> {le_path}")

if __name__ == "__main__":
    main()
