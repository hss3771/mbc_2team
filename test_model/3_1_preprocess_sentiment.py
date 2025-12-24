# preprocess_sentiment.py
import pandas as pd

# 1) GitHub에서 받은 원본 CSV 경로
RAW_PATH = "data/finance_sentiment_corpus.csv"
# 2) 우리가 쓸 정제된 CSV 경로
OUT_PATH = "data/train_sentiment.csv"

def main():
    df = pd.read_csv(RAW_PATH)

    # [!!] 실제 컬럼명을 확인해서 맞게 수정해야 함
    # 예시: sentence, sentiment
    text_col = "sentence"
    label_col = "sentiment"

    df = df[[text_col, label_col]].rename(columns={
        text_col: "text",
        label_col: "label"
    })

    # label을 문자열 그대로 쓰거나, 숫자로 매핑해도 됨
    # 여기서는 문자열 라벨("positive"/"neutral"/"negative") 유지
    df = df.dropna(subset=["text", "label"])
    df["text"] = df["text"].astype(str).str.strip()
    df["label"] = df["label"].astype(str).str.strip()

    print(df["label"].value_counts())

    df.to_csv(OUT_PATH, index=False, encoding="utf-8-sig")
    print(f"[SAVE] 전처리 완료 -> {OUT_PATH}")

if __name__ == "__main__":
    main()
