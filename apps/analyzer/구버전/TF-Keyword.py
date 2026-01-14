from sklearn.feature_extraction.text import TfidfVectorizer
import numpy as np

def extract_keywords_tfidf(texts: List[str], top_n: int = 10) -> List[str]:
    """
    텍스트 리스트에서 TF-IDF 기반 상위 N개의 키워드 추출
    """
    vectorizer = TfidfVectorizer(stop_words="english", ngram_range=(1, 2), max_df=0.95)
    X = vectorizer.fit_transform(texts)
    feature_names = np.array(vectorizer.get_feature_names_out())
    
    # 각 텍스트에서 가장 높은 TF-IDF 값 가진 키워드 추출
    tfidf_scores = X.toarray()
    top_keywords = []
    
    for i in range(tfidf_scores.shape[0]):
        sorted_idx = tfidf_scores[i].argsort()[-top_n:][::-1]
        top_keywords.append(feature_names[sorted_idx].tolist())
    
    return top_keywords

from sklearn.metrics.pairwise import cosine_similarity

def compress_keywords_with_cosine(keywords: List[str], threshold: float = 0.8) -> List[str]:
    """
    Cosine 유사도 기반으로 유사한 키워드를 하나로 압축
    """
    # TF-IDF 벡터화
    vectorizer = TfidfVectorizer()
    tfidf_matrix = vectorizer.fit_transform(keywords)
    
    # Cosine 유사도 계산
    cosine_sim = cosine_similarity(tfidf_matrix)
    
    # 유사도 임계값을 기준으로 묶기
    clustered_keywords = []
    seen = set()

    for i, row in enumerate(cosine_sim):
        if i in seen:
            continue
        cluster = [keywords[i]]
        seen.add(i)
        for j, score in enumerate(row):
            if i != j and score >= threshold and j not in seen:
                cluster.append(keywords[j])
                seen.add(j)
        clustered_keywords.append(" ".join(cluster))  # 유사한 키워드는 하나로 합침

    return clustered_keywords

def update_news_keywords_with_compressed_labels(
    es,
    doc_ids: List[str],
    buf_texts: List[str],
    clf,
    label_encoder,
    embed_model,
    batch_size: int = 256
):
    # TF-IDF 기반으로 키워드 추출
    keywords_per_text = extract_keywords_tfidf(buf_texts)
    
    # Cosine 유사도 기반으로 키워드 압축
    compressed_keywords_per_text = []
    for keywords in keywords_per_text:
        compressed_keywords = compress_keywords_with_cosine(keywords)
        compressed_keywords_per_text.append(compressed_keywords)
    
    # 예측값 얻기
    X = embed_model.encode(buf_texts, batch_size=32, show_progress_bar=False)
    pred_idx = clf.predict(X)
    labels = label_encoder.inverse_transform(pred_idx)
    
    # 결과를 news_info에 업데이트
    rows = []
    for doc_id, compressed_keywords, label in zip(doc_ids, compressed_keywords_per_text, labels):
        rows.append({
            "_op_type": "update",
            "_index": "news_info",
            "_id": doc_id,
            "doc": {
                "keywords": [{
                    "label": label,
                    "model_version": MODEL_VERSION,
                    "keywords": compressed_keywords
                }]
            }
        })
    
    return bulk_update_news_keywords(es, rows)

def predict_issue_keyword_range_with_compressed_keywords(
    es,
    start_dt: str,
    end_dt: str,
    batch_size: int = 256
):
    clf, label_encoder, embed_model = load_predict_models()

    buf_ids = []
    buf_texts = []

    total_read = 0
    total_empty = 0
    total_updated = 0
    total_failed = 0

    for doc_id, clean_text in scan_clean_text_by_date_range(es, start_dt, end_dt):
        total_read += 1

        text = normalize_for_predict(clean_text)
        if not text:
            total_empty += 1
            continue

        buf_ids.append(doc_id)
        buf_texts.append(text)

        if len(buf_texts) >= batch_size:
            u, f = update_news_keywords_with_compressed_labels(
                es, buf_ids, buf_texts, clf, label_encoder, embed_model
            )
            total_updated += u
            total_failed += f
            buf_ids.clear()
            buf_texts.clear()

    if buf_texts:
        u, f = update_news_keywords_with_compressed_labels(
            es, buf_ids, buf_texts, clf, label_encoder, embed_model
        )
        total_updated += u
        total_failed += f

    print("[PREDICT DONE]") 
    print(f"- read(clean_text): {total_read}")
    print(f"- empty(skip): {total_empty}")
    print(f"- updated(news_info): {total_updated}")
    print(f"- failed: {total_failed}")