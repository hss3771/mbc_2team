import pandas as pd
import torch
from torch.utils.data import Dataset
from transformers import (
    AutoTokenizer,
    AutoModelForSequenceClassification,
    Trainer,
    TrainingArguments
)
from sklearn.model_selection import train_test_split

MODEL_NAME = "klue/roberta-base"
CSV_PATH = "data/predict_trust_score2_with_sentiment.csv"
OUTPUT_DIR = "./sentiment_model"

LABEL_MAP = {
    "NEGATIVE": 0,
    "NEUTRAL": 1,
    "POSITIVE": 2
}

MAX_LEN = 256
BATCH_SIZE = 16
EPOCHS = 3
LR = 2e-5


# ---------------------------
# Dataset
# ---------------------------
class NewsSentimentDataset(Dataset):
    def __init__(self, df, tokenizer):
        self.titles = df["title"].fillna("").tolist()
        self.contents = df["content"].fillna("").tolist()
        self.labels = df["sen_label"].map(LABEL_MAP).tolist()
        self.tokenizer = tokenizer

    def __len__(self):
        return len(self.labels)

    def __getitem__(self, idx):
        encoding = self.tokenizer(
            self.titles[idx],
            self.contents[idx],
            padding="max_length",
            truncation=True,
            max_length=MAX_LEN,
            return_tensors="pt"
        )

        return {
            "input_ids": encoding["input_ids"].squeeze(0),
            "attention_mask": encoding["attention_mask"].squeeze(0),
            "labels": torch.tensor(self.labels[idx], dtype=torch.long)
        }


# ---------------------------
# Load data
# ---------------------------
df = pd.read_csv(CSV_PATH)

train_df, val_df = train_test_split(
    df,
    test_size=0.2,
    stratify=df["sen_label"],
    random_state=42
)

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)

train_dataset = NewsSentimentDataset(train_df, tokenizer)
val_dataset = NewsSentimentDataset(val_df, tokenizer)

# ---------------------------
# Model
# ---------------------------
model = AutoModelForSequenceClassification.from_pretrained(
    MODEL_NAME,
    num_labels=3
)
# ---------------------------
# Training config
# ---------------------------
training_args = TrainingArguments(
    output_dir=OUTPUT_DIR,
    eval_strategy="epoch",
    save_strategy="epoch",
    learning_rate=LR,
    per_device_train_batch_size=BATCH_SIZE,
    per_device_eval_batch_size=BATCH_SIZE,
    num_train_epochs=EPOCHS,
    weight_decay=0.01,
    logging_steps=100,
    load_best_model_at_end=True,
    metric_for_best_model="eval_loss",
    fp16=torch.cuda.is_available()
)

trainer = Trainer(
    model=model,
    args=training_args,
    train_dataset=train_dataset,
    eval_dataset=val_dataset,
    tokenizer=tokenizer
)

# ---------------------------
# Train
# ---------------------------
trainer.train()

trainer.save_model(OUTPUT_DIR)
tokenizer.save_pretrained(OUTPUT_DIR)

print("Training finished. Model saved to:", OUTPUT_DIR)
