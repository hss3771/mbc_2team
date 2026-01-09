ISSUE_KEYWORD_INDEX = "issue_keyword_count"
from apps.common.elastic import get_es
import hashlib

# region 기타
############################ 기타 ############################
# 랭킹_id생성
def make_issue_ranking_id(date: str, keyword: str):

    """
    issue_keyword_ranking 문서 ID 생성

    - 동일 날짜 + 동일 키워드는 하나의 문서
    - ranking_id는 저장하지 않고 조회 시 계산

    :param date: YYYY-MM-DD
    :param keyword: 이슈 키워드
    """
    id = f"{date}|{keyword.strip()}"
    return hashlib.sha256(id.encode()).hexdigest()

# endregion

# region 추가
############################ 추가(업데이트) ############################
# 랭킹정보 추가(날짜, 키워드, 카운트)
def upsert_issue_ranking(
    es,
    date: str,        # strict_date: YYYY-MM-DD
    keyword: str,
    count: int,
):
    ranking_id = make_issue_ranking_id(date, keyword)
    print(ranking_id)
    es.update(
        index=ISSUE_KEYWORD_INDEX,
        id=ranking_id,
        doc={
            "date": date,
            "keyword": keyword,
            "count": count,
        },
        op_type="create",
    )

# 랭킹 하위키워드 추가(하위키워드 배열)
def update_issue_sub_keywords(
    es,
    date: str,        # strict_date: YYYY-MM-DD
    keyword: str,
    sub_keywords: list[dict],  # [{"keyword": str, "score": float}]
):
    """
    이슈 키워드의 sub_keywords(TF-IDF) 업데이트

    :param sub_keywords:
        [
            {"keyword": "금리", "score": 0.187},
            {"keyword": "환율", "score": 0.142},
        ]
    """
    ranking_id = make_issue_ranking_id(date, keyword)
    es.update(
        index=ISSUE_KEYWORD_INDEX,
        id=ranking_id,
        doc={
            "sub_keywords": sub_keywords,
        },
    )

# 랭킹 요약정보 추가(summary, 연산날짜)
def update_issue_summary(
    es,
    ranking_id: str,
    summary_text: str,
    computed_at: str,   # strict_date_time
):
    """
    이슈 키워드 요약 정보 업데이트
    """
    es.update(
        index=ISSUE_KEYWORD_INDEX,
        id=ranking_id,
        doc={
            "summary": {
                "summary": summary_text,
                "computed_at": computed_at,
            }
        },
    )

# endregion

# region 삭제
############################ 삭제 ############################
# 키워드 랭킹 삭제하기(키워드 랭킹)
def delete_by_ranking_id(es, ranking_id: int):
    es.delete_by_query(
        index=ISSUE_KEYWORD_INDEX,
        query={
            "term": {
                "ranking_id": ranking_id
            }
        }
    )

# 키워드 랭킹 삭제하기(날짜, 키워드)
def delete_by_date_keyword(es, date: str, keyword: str):
    es.delete_by_query(
        index=ISSUE_KEYWORD_INDEX,
        query={
            "bool": {
                "filter": [
                    {"term": {"date": date}},
                    {"term": {"keyword": keyword}}
                ]
            }
        }
    )

# endregion

# region 검색
############################ 검색 ############################
# 키워드 랭킹 불러오기(날짜, 키워드)
def get_sub_keywords_by_query(es, date: str, keyword: str):
    """
    date + keyword로 문서를 검색해 sub_keywords를 반환한다.\n
    결과 {'score': 0.0301910489296558, 'keyword': '디스플레이'}를 여러개 갖는 2중배열

    :param date: str
    :param keyword: str
    """
    resp = es.search(
        index=ISSUE_KEYWORD_INDEX,
        query={
            "bool": {
                "filter": [
                    {"term": {"date": date}},
                    {"term": {"keyword": keyword}},
                ]
            }
        },
        source=["sub_keywords"],
        size=1,
    )

    hits = resp["hits"]["hits"]
    if not hits:
        return []

    return hits[0]["_source"].get("sub_keywords", [])

def get_issue_ranking_by_date(es, date: str, size: int = 10):
    """
    해당 날을 검색하면 날짜, 키워드, 합계, 요약문을 반환한다.\n
    결과 {'score': 0.0301910489296558, 'keyword': '디스플레이'}를 여러개 갖는 2중배열

    :param date: str
    :param keyword: str
    """
    return es.search(
        index="issue_keyword_count",
        query={
            "term": {"date": date}
        },
        _source=["date", "keyword", "count", "summary.summary"],
        sort=[{"count": {"order": "desc"}}],
        size=size,
    )

def get_issue_ranking_by_date_range(
    es,
    start_date: str,  # YYYY-MM-DD
    end_date: str,    # YYYY-MM-DD
    size: int = 100,
):
    return es.search(
        index=ISSUE_KEYWORD_INDEX,
        query={
            "range": {
                "date": {
                    "gte": start_date,
                    "lte": end_date,
                }
            }
        },
        _source=["date", "keyword", "count"],
        sort=[{"count": {"order": "desc"}}],
        size=size,
    )

def get_sub_key(es, start: str, keyword: str):
    doc_id = make_issue_ranking_id(start, keyword)
    res = es.get(
            index="issue_keyword_count",
            id=doc_id
        )
    src = res.get("_source", {})
    return {"sub_keywords":src.get("sub_keywords", []),"doc_id":doc_id}
# endregion

def get_keyword_trend_by_date(
    es,
    start_date: str,
    end_date: str,
    keywords: list[str],
):
    return es.search(
        index=ISSUE_KEYWORD_INDEX,
        query={
            "bool": {
                "filter": [
                    {"range": {"date": {"gte": start_date, "lte": end_date}}},
                    {"terms": {"keyword": keywords}},
                ]
            }
        },
        _source=["date", "keyword", "count"],
        size=5000,
    )["hits"]["hits"]

if __name__ =="__main__":
    es = get_es()
    try:
        print(get_issue_ranking_by_date(es,"2026-01-05"))
        print("get_issue_ranking_by_date완")
        # print(get_issue_ranking_by_date_range(es, "2026-01-01","2026-01-05"))
        # print("get_issue_ranking_by_date_rangee완")
    except Exception as e:
        print(f'error ###\n{e}\n###')
    finally:
        es.close()
        print("es닫음")