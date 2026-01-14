from apps.common.elastic import get_es
from apps.common.db import get_db
from apps.common.repositories.batch_runs_repo import sensing
from apps.analyzer.build_clean_text import build_clean_text_range, build_clean_text_by_ids # 뉴스 clean_text 생성
from apps.analyzer.predict_issue_keyword import predict_issue_keyword_range, predict_issue_keyword_ids # 뉴스 키워드 분석
from apps.analyzer.trust import trust_analyze # 뉴스 신뢰도 분석
from apps.analyzer.sentiment import update_sentiment # 뉴스 감성 분석
from apps.analyzer.summary_gemini import summarize_news # 뉴스 요약 분석
from apps.analyzer.predict_issue_keyword import find_missing_keywords # keyword_null값 찾기
from apps.analyzer.ranking import run_issue_keyword_count_for_range # 랭킹 집계 분석
from apps.analyzer.ranking_subkey import run_pipeline # 랭킹 하위키워드 분석

es = get_es()
db = get_db()

import time
import pandas as pd

def run_analysis_task(run_id, start_at, end_at, message):
    # Timestamp 객체는 .strftime()을 사용하여 원하는 형식의 문자열로 바꿀 수 있습니다.
    # 만약 이미 문자열인 경우를 대비해 str()로 감싸거나 타입을 체크하는 것이 안전합니다.
    
    start_str = start_at.strftime('%Y-%m-%d') if hasattr(start_at, 'strftime') else str(start_at)[:10]
    end_str = end_at.strftime('%Y-%m-%d') if hasattr(end_at, 'strftime') else str(end_at)[:10]
    start_time = f"{start_str}T00:00:00+09:00"
    end_time = f"{end_str}T00:00:00+09:00"
    print(f"[분석 시작] run_id: {run_id} | 기간: {start_time} ~ {end_time}")
    
    # 메세지 출력 부분 (메세지가 너무 길면 잘라서 출력)
    display_msg = str(message)[:50].replace('\n', ' ')
    print(f"원본 메시지 요약: {display_msg}...")
    
    # 1) clean_text 생성
    print(f"[clean_text 생성] run_id: {run_id}")
    build_clean_text_range(
        es,
        start_dt=start_time,
        end_dt=end_time,
    )
    time.sleep(1)
    # 2) 예측 + news_info 업데이트
    print(f"[keyword 생성] run_id: {run_id}")
    predict_issue_keyword_range(
        es,
        start_dt=start_time,
        end_dt=end_time,
    )
    time.sleep(1)
    # 날짜 범위로 news요약생성
    print(f"[뉴스 요약 생성] run_id: {run_id}")
    summarize_news(
        es,
        start_date=start_time,
        end_date=end_time
    )
    time.sleep(1)
    # 날짜 범위로 news_trust생성
    print(f"[뉴스 신뢰도 생성] run_id: {run_id}")
    trust_analyze(
        es, 
        start_at=start_time, 
        end_at=end_time
    )
    time.sleep(1)
    print(f"[뉴스  생성] run_id: {run_id}")
    # 날짜 범위로 news_sentiment생성
    update_sentiment(
        es, 
        start_dt = start_time, 
        end_dt = end_time
    )
    time.sleep(1)
    # 날짜 범위로 keyword카운팅(랭킹)
    print(f"[ranking 집계 생성] run_id: {run_id}")
    run_issue_keyword_count_for_range(
        es,
        start_dt=start_time,
        end_dt=end_time,
    )
    time.sleep(1)
    # 날짜 범위로 랭킹 하위키워드
    print(f"[ranking 하위키워드 생성] run_id: {run_id}")
    run_issue_keyword_count_for_range(
        es,
        start_dt=start_time,
        end_dt=end_time,
    )

    time.sleep(1)
    print(f"[분석 완료] run_id: {run_id}")

    # 실패한 요청 재실행해보기
    print(f"[재실행] run_id: {run_id}")
    # null값인 keyword의 id가져오기
    print(f"[keyword null값 가져오기] run_id: {run_id}")
    target_ids = find_missing_keywords(es, start_str)
    # null값인 id의 clean_text재생성요청
    print(f"[clean_text null값 재등록] run_id: {run_id}")
    build_clean_text_by_ids(es, doc_ids=target_ids)
    time.sleep(1)
    # 특정 id값들을 keyword예측하기
    print(f"[keyword null값 재등록] run_id: {run_id}")
    predict_issue_keyword_ids(es, doc_ids=target_ids, batch_size=256)

def watch_batch_runs():
    processed_run_ids = set()
    while True:
        try:
            with db as conn:
                rows = sensing(conn)
                # rows는 리스트 형태여야 함
                print(f"DEBUG: 가져온 데이터 개수: {len(rows)}")
                if not rows:
                    time.sleep(10)
                    continue
                # 1. 명시적으로 딕셔너리 리스트를 데이터프레임으로 변환
                df = pd.DataFrame([dict(r) for r in rows])
                for _, row in df.iterrows():
                    # 2. 타입을 확실하게 int나 str로 고정 (DB 타입에 맞춰)
                    run_id = row['run_id']
                    if run_id not in processed_run_ids:
                        print(f"ID {run_id} 분석 시퀀스 진입")
                        run_analysis_task(
                            run_id=run_id,
                            start_at=row['start_at'],
                            end_at=row['end_at'],
                            message=row['message']
                        )
                        processed_run_ids.add(run_id)
                    else:
                        print(f"ID {run_id}는 이미 처리된 목록에 있습니다.")
            time.sleep(10)
        except Exception as e:
            time.sleep(30)

if __name__ == "__main__":
    watch_batch_runs()
