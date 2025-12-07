# build_trend_ranking.py
# 새 기사들에 대해 이슈 키워드 예측 -> 월별 트렌드 랭킹 + up/down/new/same 계산

import os
import pandas as pd
import numpy as np
from sentence_transformers import SentenceTransformer
import joblib
from datetime import datetime


MODEL_DIR = "models/issue_classifier"
NEWS_PATH = "data/news_raw.csv"
PER_ARTICLE_SAVE_PATH = "data/news_with_issue.csv"
TREND_SAVE_PATH = "data/keyword_trend.csv"


def load_models():
    clf = joblib.load(os.path.join(MODEL_DIR, "classifier.joblib"))
    label_encoder = joblib.load(os.path.join(MODEL_DIR, "label_encoder.joblib"))
    with open(os.path.join(MODEL_DIR, "embedding_model_name.txt"), "r", encoding="utf-8") as f:
        embed_model_name = f.read().strip()
    embed_model = SentenceTransformer(embed_model_name)
    return clf, label_encoder, embed_model


def load_and_prepare_news(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8")

    # 날짜 컬럼 파싱 (YYYY-MM-DD 가정)
    df["date"] = pd.to_datetime(df["date"])
    df["year"] = df["date"].dt.year
    df["month"] = df["date"].dt.month

    df["title"] = df["title"].fillna("")
    df["body"] = df["body"].fillna("")
    df["text"] = (df["title"] + " " + df["body"]).str.strip()

    # 너무 짧은 텍스트 제거
    df = df[df["text"].str.len() > 10].reset_index(drop=True)

    return df


def predict_issue_labels(df: pd.DataFrame, clf, label_encoder, embed_model) -> pd.DataFrame:
    texts = df["text"].tolist()
    X = embed_model.encode(texts, batch_size=32, show_progress_bar=True)
    probs = clf.predict_proba(X)
    pred_ids = np.argmax(probs, axis=1)
    pred_labels = label_encoder.inverse_transform(pred_ids)

    df["issue_keyword"] = pred_labels
    df["issue_confidence"] = probs.max(axis=1)

    return df


def build_monthly_ranking(df: pd.DataFrame) -> pd.DataFrame:
    # 월별/키워드별 기사 수 집계
    grouped = (
        df.groupby(["year", "month", "issue_keyword"])
          .size()
          .reset_index(name="count")
    )

    # 월별 ranking 계산
    rankings = []
    for (year, month), sub in grouped.groupby(["year", "month"]):
        sub = sub.sort_values("count", ascending=False).reset_index(drop=True)
        sub["rank"] = sub.index + 1
        rankings.append(sub)

    rank_df = pd.concat(rankings, ignore_index=True)

    # 이전 달과의 rank 비교를 위한 move_type/move_value 계산
    rank_df = rank_df.sort_values(["year", "month", "rank"]).reset_index(drop=True)

    # year-month를 하나로 합친 키
    rank_df["ym"] = rank_df["year"] * 100 + rank_df["month"]

    move_types = []
    move_values = []

    # 키워드 기준으로 월별 rank 추적
    for keyword, sub in rank_df.groupby("issue_keyword"):
        sub = sub.sort_values("ym")
        prev_rank = None
        prev_ym = None

        for idx, row in sub.iterrows():
            cur_rank = row["rank"]
            cur_ym = row["ym"]

            if prev_rank is None:
                # 이전 달에 없었음 -> 신규
                move_types.append("new")
                move_values.append(np.nan)
            else:
                if cur_ym - prev_ym in [1, 89, 88, 87]:  
                    # 단순히 year*100+month 차이를 이용해서 "연속된 달" 가정 (간단 버전)
                    if cur_rank < prev_rank:
                        move_types.append("up")
                        move_values.append(prev_rank - cur_rank)
                    elif cur_rank > prev_rank:
                        move_types.append("down")
                        move_values.append(cur_rank - prev_rank)
                    else:
                        move_types.append("same")
                        move_values.append(np.nan)
                else:
                    # 중간 달이 비어있다거나 하면 그냥 new 취급
                    move_types.append("new")
                    move_values.append(np.nan)

            prev_rank = cur_rank
            prev_ym = cur_ym

    rank_df["move_type"] = move_types
    rank_df["move_value"] = move_values

    # 최종 컬럼 정리 (네가 준 포맷에 맞추기)
    out = rank_df[["year", "month", "rank", "issue_keyword", "move_type", "move_value"]].copy()
    out = out.rename(columns={"issue_keyword": "keyword"})

    return out


def main():
    clf, label_encoder, embed_model = load_models()
    news_df = load_and_prepare_news(NEWS_PATH)

    # 1) 기사별 이슈 예측
    news_df = predict_issue_labels(news_df, clf, label_encoder, embed_model)

    # ▶ 기사별 예측 결과 저장 (date, title, body, issue_keyword, issue_confidence, year, month ...)
    news_df.to_csv(PER_ARTICLE_SAVE_PATH, index=False, encoding="utf-8-sig")
    print(f"[SAVE] 기사별 예측 결과 저장 -> {PER_ARTICLE_SAVE_PATH}")

    # 2) 월별 랭킹 계산
    trend_df = build_monthly_ranking(news_df)
    trend_df.to_csv(TREND_SAVE_PATH, index=False, encoding="utf-8-sig")
    print(f"[SAVE] 트렌드 랭킹 저장 -> {TREND_SAVE_PATH}")

    print(trend_df.head(20))



if __name__ == "__main__":
    main()
