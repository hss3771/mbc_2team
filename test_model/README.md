본 코드는 해당 프로젝트에 필요한 모델을 CSV파일 데이터로 테스트해본 코드입니다.
    * 실제 프로젝트에서는 Elastic Search와, DataBase를 사용할 예정입니다.

1. 뉴스 기사 라벨링 모델
    * 모델 : LogisticRegression
    * 입력 데이터 : 기사 제목, 기사 본문
    * 전처리 : 기사 제목+기사 본문 텍스트 합체
    * 토큰화 : 입력 값(X); sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2/ 결과 값(y); label_encoder
    * 결과 : 라벨링(str); 학습했던 라벨링 키워드
    * 속도 : 빠른편

* 모델 학습 옵션
```
    clf = LogisticRegression(
        max_iter=200,
        n_jobs=-1,
        multi_class="auto"
    )
```

2. 뉴스 기사 하위키워드 모델
    * 모델 : KeyBERT
    * 입력 데이터 : 기사 제목, 기사 본문, 날짜, 키워드
    * 전처리 : 기사 제목+기사 본문 텍스트 합체
    * 토큰화 : sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
    * 결과 : 하위키워드 여러개, 스코어(-1~1); 연관도
    * 속도 : 느린편
    * 추가학습 : X

* 모델 실행 옵션
```
    keywords = kw_model.extract_keywords(
        joined_text,
        keyphrase_ngram_range=(1, 2),
        use_maxsum=True,
        nr_candidates=30,
        top_n=20
    )
```
* 수정 필요

3. 뉴스 신뢰도 분석 모델
    * 모델 : koelectra
    * 입력 데이터 : 기사 제목, 기사 본문
    * 전처리 : 기사 제목+기사 본문 텍스트 합체
    * 토큰화 : ElectraTokenizer(256토큰 제한)
    * 결과 : 라벨링(0 = 낚시성기사, 1 = 정상기사), trust_score(0~1) 0에가까울수록 낚시성, 1에 가까울 수록 정상
    * 속도 : 빠른편

4. 뉴스 감성 분석 모델
    * 모델 : RobertaForSequenceClassification
    * 입력 데이터 : 기사 제목, 기사 본문
    * 전처리 : 기사 제목+기사 본문 텍스트 합체
    * 토큰화 : BertTokenizer(256토큰 제한)
    * 결과 : 라벨링(0 = 긍정, 1 = 중립, 2 = 부정), sen_score(0~1) softmax
    * 속도 : 빠른편

* sen_score 예시
```
긍정 : 0.0423
중립 : 0.9232
부정 : 0.0345

긍정 : 0.0423
중립 : 0.1900
부정 : 0.7677
```
5. 뉴스 기사 요약 모델
    * 모델 : Qwen2.5-3B
    * 입력 데이터 : role및 user 프롬프트 명령어, 기사 제목, 기사 본문 텍스트
    * 결과 :  생성문장
    * 속도 : 보통

* 모델 입력 예시
```
messages = [
    {
        "role": "system",
        "content": (
            "너는 한국어 경제 뉴스 분석 모델이다."
            "기사에서 핵심 주장 1개와 근거를 추출하라."
            "핵심주장은 기사 제목과 연관성이 있게 찾아라."
        )
    },
    {
        "role": "user",
        "content": (
            "기사 제목 : "
            + "LG전자, 중기부와 상생결제시스템 확산 방안 간담회"
            + "기사 본문 : "
            + text
        )
    }
]
```

6. 뉴스 전체 기사 요약모델
    * 모델 : Qwen2.5-3B
    * 입력 데이터 : role및 user 프롬프트 명령어, 기사 제목, 기사 본문 텍스트, 날짜, 키워드
    * 결과 :  생성문장
    * 속도 : 많이 느림

* 수정필요
