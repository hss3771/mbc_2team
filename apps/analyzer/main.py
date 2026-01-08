from apps.common.elastic import get_es
from apps.analyzer.build_clean_text import build_clean_text_range, build_clean_text_by_ids
# from apps.analyzer.predict_issue_keyword import predict_issue_keyword_range, predict_issue_keyword_ids
from apps.analyzer.predict_issue_keyword import find_missing_keywords
from apps.analyzer.ranking import run_issue_keyword_count_for_range
es = get_es()
# 1) clean_text 생성
# build_clean_text_range(
#     es,
#     start_dt="2026-01-04T00:00:00+09:00",
#     end_dt="2026-01-07T00:00:00+09:00",
# )

# 2) 예측 + news_info 업데이트
# predict_issue_keyword_range(
#     es,
#     start_dt="2026-01-04T00:00:00+09:00",
#     end_dt="2026-01-07T00:00:00+09:00",
# )

# null값인 keyword의 id가져오기
target_ids = find_missing_keywords(es, "2026-01-06")

# build_clean_text_by_ids(es, doc_ids=target_ids)
# 특정 id값들을 keyword예측하기
# predict_issue_keyword_ids(es, doc_ids=target_ids, batch_size=256)

# 날짜 범위로 keyword카운팅(랭킹)
run_issue_keyword_count_for_range(
    es,
    start_dt="2026-01-05T00:00:00+09:00",
    end_dt="2026-01-06T00:00:00+09:00",
)