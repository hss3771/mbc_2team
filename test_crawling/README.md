본 코드는 네이버 뉴스에서 특정 날짜의 기사 전체를 수집하여 제목 · 본문 · 기자명 · 언론사 · 발행일 · url을 추출하고 Elasticsearch 에 저장하는 것을 목표로 한다.

① 주요 기능
- 특정 날짜(YYYYMMDD) 기준 기사 목록 끝까지 수집
- 기사 상세 페이지에 직접 진입하여 다음 정보 추출
```
제목 (title)/ 본문 (body)/ 기자명 (reporter)/ 언론사 (press_name)/ 발행일 (published_at)/ 원문URL (url)
```
- URL 기반 SHA1 해시를 사용한 중복 방시 article_id
- Elasticsearch bulk insert 로 대량 저장 최적화
- 이미 저장된 기사는 자동 스킵

② 기술 스택
- Python 3.10+
- FastAPI
- Selenium (Chrome, Headless)
- Elasticsearch (Local)
- webdriver-manager

③ 프로젝트 구조
```
.
├── main5.py               # 크롤러 + FastAPI 엔드포인트
├── logger.py              # 로깅 설정
├── requirements.txt       # 패키지 목록
├── README.md
```

④ 사전 준비
-  requirements.txt 설치
 - pip install -r requirements.txt
- requirements.txt
```
 fastapi
 uvicorn
 selenium
 webdriver-manager
 elasticsearch
 Elasticsearch 실행 (로컬)
```

⑤ Elasticsearch 인덱스 생성
```
PUT news_info
{
  "mappings": {
    "properties": {
      "article_id": { "type": "keyword" },
      "published_at": { "type": "date" },
      "press_name": { "type": "keyword" },
      "reporter": { "type": "keyword" },
      "title": { "type": "text" },
      "body": { "type": "text" },
      "url": { "type": "keyword" },
      "keywords": {
        "type": "object",
        "properties": {
          "label": { "type": "keyword" },
          "model_version": { "type": "keyword" }
        }
      },
      "trust": {
        "type": "object",
        "properties": {
          "score": { "type": "float" },
          "label": { "type": "keyword" },
          "model_version": { "type": "keyword" }
        }
      },
      "sentiment": {
        "type": "object",
        "properties": {
          "score": { "type": "float" },
          "label": { "type": "keyword" },
          "model_version": { "type": "keyword" }
        }
      },
      "summary": {
        "type": "object",
        "properties": {
          "summary_text": { "type": "text" },
          "model_version": { "type": "keyword" }
        }
      }
    }
  }
}
```

⑥ 실행 방법
- FastAPI 서버 실행
```
uvicorn main5:app --reload
```
- 서버 실행 후
```
http://127.0.0.1:8000
```
- 크롤링 실행
```
 http://127.0.0.1:8000/naver/news?date=20251217
 date 형식 : YYYYMMDD
```

⑦ 크롤링 동작 흐름
- 네이버 뉴스 목록 페이지(page=1부터 끝까지) 순회
- 기사 URL 전체 수집 (중복 제거)
- 각 기사 URL에 직접 접속
- 기사 상세 정보 추출
- URL -> SHA1 해시 -> article_id 생성
- Elasticsearch 에 200개 단위 bulk 저장
- 이미 저장된 기사(_id 기준)는 자동 스킵

⑧ 중복 방지 전략
article_id = sha1(article_url)
- URL 이 같으면 항상 같은 ID
- Elasticsearch 에 _id 로 사용
- 재실행해도 중복 저장 안 됨
- 기존 문서 덮어쓰기

⑨ Elasticsearch 결과 확인
- 전체 기사 수
```
GET news_info/_count
```
- 최신 기사 10개
```
GET news_info/_search
{
  "size": 10,
  "sort": [
    { "published_at": { "order": "desc" } }
  ]
}
```
- 특정 날짜 기사 조회
```
GET news_info/_search
{
  "query": {
    "range": {
      "published_at": {
        "gte": "2025-12-17T00:00:00",
        "lt": "2025-12-18T00:00:00"
      }
    }
  }
}
```

⑩ 주의 사항
- Selenium 기반이므로 수집 속도는 빠르지 않음
- time.sleep()을 너무 줄이면 네이버 차단 가능성 있음
- 장시간 실행 시 ChromeDriver 정상 종료 필수
