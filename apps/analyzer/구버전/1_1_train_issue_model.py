# train_issue_model.py
# data 폴더 안의 *_with_article.csv 파일들을 모두 합쳐서
# 기사(제목+본문) -> 이슈 키워드(label) 분류 모델 학습
# - SentenceTransformer 임베딩 (토큰 최대치 500)
# - LogisticRegression 하이퍼파라미터 탐색 후(best F1) 모델만 저장

import os
import glob
from datetime import datetime
import pandas as pd

from sentence_transformers import SentenceTransformer
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import LabelEncoder
from sklearn.model_selection import train_test_split
from sklearn.metrics import accuracy_score, f1_score, classification_report
import joblib


DATA_DIR = "apps/analyzer/data"  # CSV들이 들어 있는 폴더
CSV_PATTERN = "*_with_article.csv"  # 요구사항: data폴더 안의 "*_with_article.csv" 전부
EMBEDDING_MODEL_NAME = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
SAVE_DIR = "apps/analyzer/model/issue_classifier0106"

MAX_SEQ_LEN = 500          # 토큰 최대치(실제로는 모델 tokenizer max_length에 해당)
EMBED_BATCH_SIZE = 32      # 임베딩 배치 크기
TEST_SIZE = 0.2
RANDOM_STATE = 42

# 하이퍼파라미터 탐색(“epoch처럼 여러 번 돌려 best 저장”)
C_LIST = [0.2, 1.0, 5.0]
SOLVERS = ["lbfgs", "saga"]
CLASS_WEIGHTS = [None, "balanced"]
MAX_ITERS = [200, 400, 800]

# 출력 폭주 방지
MAX_LABEL_DIST_PRINT = 50


def load_and_preprocess_one(csv_path: str) -> pd.DataFrame:
    """
    *_with_article.csv 하나를 읽어서 title/body/label을 정제한 DataFrame으로 반환.
    title: title_html > title
    body : body_html  > body
    """
    df = pd.read_csv(csv_path, encoding="utf-8")

    # 제목: title_html > title
    if "title_html" in df.columns:
        df["title_clean"] = df["title_html"].fillna(df.get("title", "")).fillna("")
    else:
        df["title_clean"] = df.get("title", "").fillna("")

    # 본문: body_html > body
    if "body_html" in df.columns:
        df["body_clean"] = df["body_html"].fillna(df.get("body", "")).fillna("")
    else:
        df["body_clean"] = df.get("body", "").fillna("")

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

    # label 컬럼 확인/정리
    if "label" not in df.columns:
        raise ValueError(f"{csv_path} 에 'label' 컬럼이 없습니다.")

    df["label"] = df["label"].astype(str).str.strip()

    # 너무 짧은 문서/빈 라벨 제거
    df = df[(df["text"].str.len() > 10) & (df["label"].str.len() > 0)].reset_index(drop=True)

    return df[["text", "label"]]


def load_all_datasets(data_dir: str) -> pd.DataFrame:
    """
    data_dir 안의 *_with_article.csv 파일들을 모두 읽어서 합친다.
    """
    pattern = os.path.join(data_dir, CSV_PATTERN)
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

    vc = all_df["label"].value_counts()
    print("[INFO] 라벨 분포(상위 일부):")
    print(vc.head(min(len(vc), MAX_LABEL_DIST_PRINT)))

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

    # 3) 임베딩 모델 로딩 + 토큰 최대치 설정
    embed_model = SentenceTransformer(EMBEDDING_MODEL_NAME)
    # SentenceTransformer는 내부 tokenizer max_length에 해당하는 max_seq_length를 제공
    embed_model.max_seq_length = MAX_SEQ_LEN

    print(f"[INFO] 문서 임베딩 생성 중... (max_seq_length={MAX_SEQ_LEN}, batch_size={EMBED_BATCH_SIZE})")
    X = embed_model.encode(texts, batch_size=EMBED_BATCH_SIZE, show_progress_bar=True)

    # 4) train/valid 분리
    X_train, X_valid, y_train, y_valid = train_test_split(
        X, y, test_size=TEST_SIZE, random_state=RANDOM_STATE, stratify=y
    )

    # 5) 분류기 탐색: “epoch처럼 여러 번 돌려 best 저장” (best F1)
    best = {
        "f1": -1.0,
        "acc": -1.0,
        "params": None,
        "clf": None,
    }

    print("\n[INFO] 하이퍼파라미터 탐색 시작 (best F1(weighted) 저장)")
    trial = 0

    for C in C_LIST:
        for solver in SOLVERS:
            for cw in CLASS_WEIGHTS:
                for mi in MAX_ITERS:
                    trial += 1

                    clf = LogisticRegression(
                        C=C,
                        solver=solver,
                        class_weight=cw,
                        max_iter=mi,
                        n_jobs=-1,          # solver에 따라 무시될 수 있음
                        multi_class="auto"
                    )

                    clf.fit(X_train, y_train)
                    y_pred = clf.predict(X_valid)

                    acc = accuracy_score(y_valid, y_pred)
                    f1 = f1_score(y_valid, y_pred, average="weighted")

                    print(
                        f"[TRIAL {trial}] C={C} solver={solver} class_weight={cw} max_iter={mi} "
                        f"=> acc={acc:.4f} f1(weighted)={f1:.4f}"
                    )

                    # best 기준: F1(weighted)
                    if f1 > best["f1"]:
                        best.update({"f1": f1, "acc": acc, "params": (C, solver, cw, mi), "clf": clf})

    # best 모델 확정
    C, solver, cw, mi = best["params"]
    clf = best["clf"]

    print("\n[BEST MODEL]")
    print(f"- params: C={C}, solver={solver}, class_weight={cw}, max_iter={mi}")
    print(f"- best acc={best['acc']:.4f}, best f1(weighted)={best['f1']:.4f}")

    # 6) best 모델로 리포트 출력
    y_pred = clf.predict(X_valid)
    print("\n[Classification Report] (best model)")
    print(classification_report(y_valid, y_pred, target_names=label_encoder.classes_))

    # 7) 모델 저장 (best만 저장)
    joblib.dump(clf, os.path.join(SAVE_DIR, "classifier.joblib"))
    joblib.dump(label_encoder, os.path.join(SAVE_DIR, "label_encoder.joblib"))
    with open(os.path.join(SAVE_DIR, "embedding_model_name.txt"), "w", encoding="utf-8") as f:
        f.write(EMBEDDING_MODEL_NAME)

    # 학습 메타(재현용)도 같이 저장
    meta_path = os.path.join(SAVE_DIR, "train_meta.txt")
    with open(meta_path, "w", encoding="utf-8") as f:
        f.write(f"trained_at: {datetime.now().isoformat()}\n")
        f.write(f"data_dir: {DATA_DIR}\n")
        f.write(f"csv_pattern: {CSV_PATTERN}\n")
        f.write(f"embedding_model: {EMBEDDING_MODEL_NAME}\n")
        f.write(f"max_seq_length: {MAX_SEQ_LEN}\n")
        f.write(f"embed_batch_size: {EMBED_BATCH_SIZE}\n")
        f.write(f"test_size: {TEST_SIZE}\n")
        f.write(f"random_state: {RANDOM_STATE}\n")
        f.write(f"best_metric: f1(weighted)\n")
        f.write(f"best_params: C={C}, solver={solver}, class_weight={cw}, max_iter={mi}\n")
        f.write(f"best_acc: {best['acc']:.6f}\n")
        f.write(f"best_f1_weighted: {best['f1']:.6f}\n")

    print(f"\n[SAVE] best 모델 저장 완료 -> {SAVE_DIR}")
    print(f"[SAVE] 메타 저장 완료 -> {meta_path}")


if __name__ == "__main__":
    main()
