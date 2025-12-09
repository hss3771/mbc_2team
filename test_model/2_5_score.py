import pandas as pd

INPUT_PATH = "data/predict_trust2.csv"      # trust_score 이미 들어있는 CSV
OUTPUT_PATH = "data/predict_trust_score2.csv"

# threshold: trust_score가 이 값보다 크면 1로 예측
THRESHOLD = 0.6   # 60%


def main():
    print("[INFO] 데이터 로딩...")
    df = pd.read_csv(INPUT_PATH)

    # 결측치 처리
    df["title"] = df["title"].fillna("")
    df["label"] = df["label"].fillna(0)         # 실제 정답 (0/1이라고 가정)
    df["trust_score"] = df["trust_score"].fillna(0.0)

    # 숫자형으로 캐스팅(혹시 문자열로 들어와 있을 경우 대비)
    df["trust_score"] = df["trust_score"].astype(float)
    df["label"] = df["label"].astype(int)

    # trust_score > THRESHOLD 이면 1, 아니면 0
    df["predict"] = (df["trust_score"] > THRESHOLD).astype(int)

    # 정확도 계산
    correct = (df["predict"] == df["label"]).sum()
    total = len(df)
    accuracy = correct / total if total > 0 else 0.0

    print(f"[INFO] Threshold = {THRESHOLD:.2f}")
    print(f"[INFO] Accuracy  = {accuracy:.4f} ({accuracy*100:.2f}%)")
    print(f"[INFO] Correct   = {correct} / {total}")

    # 필요 없다면 text 같은 컬럼은 여기서 제거
    if "text" in df.columns:
        df.drop(columns=["text"], inplace=True)

    # 결과 저장
    df.to_csv(OUTPUT_PATH, index=False, encoding="utf-8-sig")
    print(f"[SAVE] predict 컬럼 포함 파일 저장 -> {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
