import torch
import pandas as pd
from transformers import AutoTokenizer, AutoModelForSequenceClassification
import torch.nn.functional as F

MODEL_DIR = "./sentiment_model"
CSV_PATH = "data/predict_trust_score2.csv"

LABEL_MAP_REV = {
    0: "negative",
    1: "neutral",
    2: "positive"
}

MAX_LEN = 256

tokenizer = AutoTokenizer.from_pretrained(MODEL_DIR)
model = AutoModelForSequenceClassification.from_pretrained(MODEL_DIR)
model.eval()

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
model.to(device)


def predict_sentiment(title, content):
    encoding = tokenizer(
        title,
        content,
        padding="max_length",
        truncation=True,
        max_length=MAX_LEN,
        return_tensors="pt"
    )

    encoding = {k: v.to(device) for k, v in encoding.items()}

    with torch.no_grad():
        outputs = model(**encoding)
        probs = F.softmax(outputs.logits, dim=-1)[0]

    label_idx = torch.argmax(probs).item()

    return {
        "label": LABEL_MAP_REV[label_idx],
        "score": round(probs[label_idx].item(), 4),
        "distribution": {
            LABEL_MAP_REV[i]: round(probs[i].item(), 4) for i in range(3)
        }
    }


# ---------------------------
# Example batch inference
# ---------------------------
df = pd.read_csv(CSV_PATH)

results = []

for _, row in df.iterrows():
    result = predict_sentiment(row["title"], row["content"])
    results.append(result)

df["sentiment_label"] = [r["label"] for r in results]
df["sentiment_score"] = [r["score"] for r in results]

df.to_csv("predict_sentiment_result.csv", index=False, encoding="utf-8-sig")

print("Prediction finished. Saved to predict_sentiment_result.csv")
