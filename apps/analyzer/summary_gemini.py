import datetime
import time
import random
from google import genai
from google.genai import types
from elasticsearch import Elasticsearch
from elasticsearch.helpers import scan

# 1. 설정
GEMINI_API_KEY = "AIzaSyCTycYKEGAqdCDa1dJ00RNzq08lUd3Jy-0" 
client = genai.Client(api_key=GEMINI_API_KEY)

def summarize_news(es: Elasticsearch, start_date: str, end_date: str):
    model_name = "gemini-2.0-flash" 
    current_version = f"{model_name}-{datetime.datetime.now().strftime('%Y%m%d')}-formal"

    # 사용자님의 코드 중 해당 부분
    query_news = {
        "query": {
            "range": {
                "published_at": {
                    "gte": start_date,  # 시작일 (예: 2026-01-10)
                    "lte": end_date     # 종료일 (예: 2026-01-12)
                }
            }
        }
    }
    # (쿼리 및 scan 로직 동일)
    docs = scan(es, index="news_info", query=query_news)

    for hit in docs:
        doc_id = hit['_id']
        time.sleep(0.5) 

        for attempt in range(3):
            try:
                clean_resp = es.get(index="clean_text", id=doc_id)
                text = clean_resp['_source'].get('clean_text', '')

                if not text or len(text.strip()) < 50:
                    break

                # [최적화] 입력 1,500자로 상향 (격식 있는 문장을 위해 정보량 확보)
                truncated_text = text[:1500]
                
                # [프롬프트 수정] '~함' 제거, 보고서형 명사구 종결 지시
                response = client.models.generate_content(
                    model=model_name,
                    contents=f"기사 내용:\n{truncated_text}",
                    config=types.GenerateContentConfig(
                        system_instruction=(
                            "너는 전문적인 경제 뉴스 분석가야. "
                            "격식 있는 비즈니스 보고서 문체를 사용하되, 문장은 명사형 핵심 키워드로 종결해라. "
                            "예시: '주가 반등 전망', '실적 개선 기대', '리스크 확대 우려' "
                            "다른 설명 없이 반드시 다음 형식을 지켜라.\n\n"
                            "핵심 주장: [격식 있는 한 문장 요약]\n"
                            "근거:\n"
                            "- [전문 용어를 사용한 핵심 지표 및 근거]\n"
                            "- [전문 용어를 사용한 핵심 지표 및 근거]"
                        ),
                        temperature=0.1,
                        max_output_tokens=500, # 격식 있는 문장을 위해 약간 상향
                        safety_settings=[
                            types.SafetySetting(category='HARM_CATEGORY_HARASSMENT', threshold='OFF'),
                            types.SafetySetting(category='HARM_CATEGORY_HATE_SPEECH', threshold='OFF'),
                            types.SafetySetting(category='HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold='OFF'),
                            types.SafetySetting(category='HARM_CATEGORY_DANGEROUS_CONTENT', threshold='OFF'),
                        ]
                    )
                )

                if response.candidates:
                    finish_reason = response.candidates[0].finish_reason
                    summary_text = response.text.strip()

                    es.update(
                        index="news_info",
                        id=doc_id,
                        body={
                            "doc": {
                                "summary": {
                                    "summary_text": summary_text,
                                    "model_version": current_version
                                }
                            }
                        }
                    )
                    print(f"[완료] doc_id: {doc_id} ({finish_reason})")
                    break

            except Exception as e:
                if "503" in str(e) or "overloaded" in str(e):
                    wait = (attempt + 1) * 2 + random.random()
                    print(f"⚠️ 서버 과부하(503). {wait:.1f}초 후 재시도... ({doc_id})")
                    time.sleep(wait)
                else:
                    print(f"[실패] doc_id: {doc_id} | 이유: {str(e)}")
                    break # 치명적 에러는 재시도 없이 중단