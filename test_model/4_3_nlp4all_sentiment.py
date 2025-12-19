import pandas as pd
import torch
import torch.nn.functional as F
from transformers import AutoTokenizer, AutoModelForSequenceClassification

CSV_PATH = "data/predict_trust_score2.csv"
OUTPUT_PATH = "predict_trust_score2_with_sentiment.csv"
MODEL_NAME = "snunlp/KR-FinBERT-SC"
MAX_LEN = 256

ID2LABEL = {
    0: "NEGATIVE",
    1: "NEUTRAL",
    2: "POSITIVE"
}

tokenizer = AutoTokenizer.from_pretrained(MODEL_NAME)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_NAME)
model.eval()

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)

def predict_sentiment(title, content):
    inputs = tokenizer(
        title if isinstance(title, str) else "",
        content if isinstance(content, str) else "",
        truncation=True,
        padding="max_length",
        max_length=MAX_LEN,
        return_tensors="pt"
    )
    inputs = {k: v.to(device) for k, v in inputs.items()}

    with torch.no_grad():
        logits = model(**inputs).logits
        probs = F.softmax(logits, dim=-1)[0]

    idx = torch.argmax(probs).item()
    return ID2LABEL[idx]

df = pd.read_csv(CSV_PATH)
df["sen_label"] = df.apply(
    lambda row: predict_sentiment(row["title"], row["content"]),
    axis=1
)

df.to_csv(OUTPUT_PATH, index=False, encoding="utf-8-sig")
print("완료:", OUTPUT_PATH)
