# keyword_insights.py
# 특정 (year, month, keyword)에 대한 워드클라우드용 키워드 + 대표 기사 추출

import pandas as pd
from keybert import KeyBERT
from sentence_transformers import SentenceTransformer

# 앞서 news_raw.csv에 issue_keyword 예측까지 붙어 있다고 가정
NEWS_WITH_LABEL_PATH = "data/news_with_issue1212.csv"  # build_trend_ranking에서 저장하게 해도 됨


def load_news_with_labels(path: str) -> pd.DataFrame:
    df = pd.read_csv(path, encoding="utf-8")
    #df["date"] = pd.to_datetime(df["date"])
    #df["year"] = df["date"].dt.year
    #df["month"] = df["date"].dt.month
    return df


def get_keyword_insights(df: pd.DataFrame, year: int, month: int, keyword: str, top_n_keywords: int = 30, top_n_articles: int = 5):
    # 조건에 맞는 기사 필터링
    # sub = df[(df["year"] == year) & (df["month"] == month) & (df["issue_keyword"] == keyword)].copy()
    sub = df[(df["issue_keyword"] == keyword)].copy()
    if sub.empty:
        print("[INFO] 해당 조건의 기사가 없습니다.")
        return [], pd.DataFrame()

    # 워드클라우드용 텍스트 생성 (본문 위주)
    texts = (sub["title"].fillna("") + " " + sub["content"].fillna("")).tolist()
    joined_text = " ".join(texts)

    # KeyBERT 초기화
    kw_model = KeyBERT(model="sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2")

    # 키워드 추출
    keywords = kw_model.extract_keywords(
        joined_text,
        keyphrase_ngram_range=(1, 2),
        use_maxsum=True,
        nr_candidates=30,
        top_n=20
    )

    # 대표 기사: 여기서는 단순히 최신 순으로 N개
    #sub = sub.sort_values("date", ascending=False).head(top_n_articles)

    return keywords, sub[["title", "content", "issue_confidence"]]


def main():
    df = load_news_with_labels(NEWS_WITH_LABEL_PATH)

    # 예시: 2025년 11월 '금리인하' 이슈
    year = 2025
    month = 12
    keyword = "개인정보"

    keywords, articles = get_keyword_insights(df, year, month, keyword)

    print(f"=== {year}-{month} [{keyword}] 워드클라우드 키워드 ===")
    for kw, score in keywords:
        print(f"  • {kw} ({score:.4f})")

    print("\n=== 대표 기사 ===")
    for _, row in articles.iterrows():
        print(f"[{row['date']}] (score={row['issue_confidence']:.3f}) {row['title']}")


if __name__ == "__main__":
    main()
