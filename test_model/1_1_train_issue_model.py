# train_issue_model.py
# data 폴더 안의 *_data_with_article.csv 파일들을 모두 합쳐서
# 기사(제목+본문) -> 이슈 키워드(label) 분류 모델 학습

import os
import glob
import pandas as pd
from sentence_transformers import SentenceTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report
import joblib


DATA_DIR = "data/test"  # CSV들이 들어 있는 폴더
EMBEDDING_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
SAVE_DIR = "models/issue_classifier2"


def load_and_preprocess_one(csv_path: str) -> pd.DataFrame:
    """
    01_irh_data_with_article.csv 처럼
    *_data_with_article.csv 하나를 읽어서
    title/body/label을 정제한 DataFrame으로 반환.
    """
    df = pd.read_csv(csv_path, encoding="utf-8")

    # 제목: title_html > title
    if "title_html" in df.columns:
        df["title_clean"] = df["title_html"].fillna(df["title"].fillna(""))
    else:
        df["title_clean"] = df["title"].fillna("")

    # 본문: body_html > body
    if "body_html" in df.columns:
        df["body_clean"] = df["body_html"].fillna(df["body"].fillna(""))
    else:
        df["body_clean"] = df["body"].fillna("")

    # 공백/개행 정리
    for col in ["title_clean", "body_clean"]:
        df[col] = (
            df[col]
            .astype(str)
            .str.replace("\r", " ", regex=False)
            .str.replace("\n", " ", regex=False)
            .str.replace("\t", " ", regex=False)
            .str.replace(r"\s+", " ", regex=True)
            .str.strip()
        )

    # 제목+본문 합치기
    df["text"] = (df["title_clean"] + " " + df["body_clean"]).str.strip()

    # label 컬럼 정리
    if "label" not in df.columns:
        raise ValueError(f"{csv_path} 에 'label' 컬럼이 없습니다.")

    df["label"] = df["label"].astype(str).str.strip()

    # 너무 짧은 문서/빈 라벨 제거
    df = df[(df["text"].str.len() > 10) & (df["label"].str.len() > 0)].reset_index(drop=True)

    return df[["text", "label"]]


def load_all_datasets(data_dir: str) -> pd.DataFrame:
    """
    data_dir 안의 *_data_with_article.csv 파일들을 모두 읽어서 합친다.
    issue_trend_monthly_top10.csv 같은 다른 파일은 무시.
    """
    pattern = os.path.join(data_dir, "*_data_with_article.csv")
    csv_files = sorted(glob.glob(pattern))

    if not csv_files:
        raise FileNotFoundError(f"{pattern} 패턴에 맞는 CSV 파일을 찾을 수 없습니다.")

    print("[INFO] 다음 파일들을 학습에 사용합니다:")
    for f in csv_files:
        print("  -", os.path.basename(f))

    dfs = []
    for path in csv_files:
        df_one = load_and_preprocess_one(path)
        dfs.append(df_one)

    all_df = pd.concat(dfs, ignore_index=True)
    print(f"\n[INFO] 전체 샘플 수: {len(all_df)}")
    print(f"[INFO] 고유 이슈 수: {all_df['label'].nunique()}")
    print("[INFO] 라벨 분포:")
    print(all_df["label"].value_counts())

    return all_df


def main():
    os.makedirs(SAVE_DIR, exist_ok=True)

    # 1) 여러 CSV 합치기
    df = load_all_datasets(DATA_DIR)
    texts = df["text"].tolist()
    labels = df["label"].tolist()

    # 2) 라벨 인코딩
    label_encoder = LabelEncoder()
    y = label_encoder.fit_transform(labels)
    num_classes = len(label_encoder.classes_)

    if num_classes < 2:
        print("\n[ERROR] 라벨이 1개뿐이라 분류 모델을 학습할 수 없습니다.")
        return

    print(f"\n[INFO] 최종 고유 이슈 수: {num_classes}")

    # 3) 임베딩 모델 로딩
    embed_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    print("[INFO] 문서 임베딩 생성 중...")
    X = embed_model.encode(texts, batch_size=32, show_progress_bar=True)

    # 4) train/valid 분리
    X_train, X_valid, y_train, y_valid = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )

    # 5) 분류기 학습
    clf = LogisticRegression(
        max_iter=200,
        n_jobs=-1,
        multi_class="auto"
    )
    clf.fit(X_train, y_train)

    # 6) 검증
    y_pred = clf.predict(X_valid)
    acc = accuracy_score(y_valid, y_pred)
    f1 = f1_score(y_valid, y_pred, average="weighted")

    print(f"\n[RESULT] Accuracy: {acc:.4f}, F1(weighted): {f1:.4f}")
    print("\n[Classification Report]")
    print(classification_report(y_valid, y_pred, target_names=label_encoder.classes_))

    # 7) 모델 저장
    joblib.dump(clf, os.path.join(SAVE_DIR, "classifier.joblib"))
    joblib.dump(label_encoder, os.path.join(SAVE_DIR, "label_encoder.joblib"))
    with open(os.path.join(SAVE_DIR, "embedding_model_name.txt"), "w", encoding="utf-8") as f:
        f.write(EMBEDDING_MODEL_NAME)

    print(f"\n[SAVE] 모델 저장 완료 -> {SAVE_DIR}")


if __name__ == "__main__":
    main()
