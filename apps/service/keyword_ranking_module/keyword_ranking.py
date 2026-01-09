from __future__ import annotations

from datetime import datetime, date, timedelta
from calendar import monthrange
from typing import Literal, Dict, List

import apps.common.repositories.issue_keyword_repo as repo

Mode = Literal["day", "week", "month", "year", "range"]

# ============================================================
# [유틸] 날짜 파싱/기간 계산
# ============================================================
def _parse_date(s: str) -> date:
    """'YYYY-MM-DD' 문자열을 date로 바꿔서 비교/계산 가능하게 함"""
    return datetime.strptime(s, "%Y-%m-%d").date()


def _month_start_end(d: date) -> tuple[date, date]:
    """d가 속한 월의 1일~말일을 반환한다.
       예: 2025-11-28 → (2025-11-01, 2025-11-30)"""
    last = monthrange(d.year, d.month)[1]
    return date(d.year, d.month, 1), date(d.year, d.month, last)


def _prev_month_anchor(d: date) -> date:
    """d가 속한 월의 전월 1일을 반환한다. (월별 비교기간 계산용)
       예: 2025-01-xx → 2024-12-01"""
    if d.month == 1:
        return date(d.year - 1, 12, 1)
    return date(d.year, d.month - 1, 1)


def _year_start_end(d: date) -> tuple[date, date]:
    """d가 속한 연도의 1/1~12/31을 반환한다."""
    return date(d.year, 1, 1), date(d.year, 12, 31)


def _prev_same_length_range(start: date, end: date) -> tuple[date, date]:
    """
    start~end와 같은 일수 길이의 '직전 기간'을 반환한다. (주별 비교기간 계산용)
    예) 01/01~01/07 -> 12/25~12/31
    """
    length = (end - start).days + 1
    prev_end = start - timedelta(days=1)
    prev_start = prev_end - timedelta(days=length - 1)
    return prev_start, prev_end


# ============================================================
# [계산] 증감률 / 순위변동
# ============================================================
# 증감률 구하기 (current_count : 현재, prev_count : 이전)
def calc_change_rate(current_count: int, prev_count: int) -> int | None:
    """
    [기능] 증감률 계산 함수

    - 증감률(%) = (현재 - 이전) / 이전 * 100
    - 이전 == 0 이면 NEW 처리(분모 0) => None 반환
    """
    if prev_count == 0:
        return None
    return round(((current_count - prev_count) / prev_count) * 100)

# 변동 구하기 (current_rank : 현재 순위, prev_rank : 이전 순위)
def calc_rank_change(current_rank: int, prev_rank: int | None) -> int | None:
    """
    [기능] 순위 변동 계산 함수

    - 변동 = (이전순위 - 현재순위)
    - 이전순위가 없으면(비교기간 TopN에 없음) NEW => None 반환
    - 양수: 상승 / 음수: 하락 / 0: 변동없음
    """
    if prev_rank is None:
        return None
    return prev_rank - current_rank

# 뱃지 구하기
def _get_badge(rank_change: int | None, change_rate: int | None) -> str:
    """
    [기능] UI 배지(NEW/UP/DOWN/SAME) 결정

    - 비교기간에 없거나 이전 count=0이면 NEW (증감률 None 또는 변동 None)
    - 그 외에는 변동값으로 UP/DOWN/SAME 결정
    """
    if rank_change is None or change_rate is None:
        return "NEW"
    if rank_change > 0:
        return "UP"
    if rank_change < 0:
        return "DOWN"
    return "SAME"


# ============================================================
# [조합] 랭킹 결과 생성(서비스 메인)
# ============================================================
# 랭킹 정보 주기
def get_keyword_ranking(
    es,
    mode: Mode,
    start: str,
    end: str,
    size: int = 10,
) -> dict:
    """
    [기능] 랭킹 정보 종합 생성 함수 (UI에 그대로 응답할 dict 생성)

    입력(프론트가 보내는 값 전제)
    - mode: "day" | "week" | "month" | "year"
    - start: "YYYY-MM-DD"
    - end  : "YYYY-MM-DD"
    - size : Top N (기본 10)

    처리 흐름
    1) base 기간 / prev 기간 계산
    2) repo에서 base TopN / prev TopN 조회 (언급량 집계는 repo 담당)
    3) 기준기간 TopN을 기준으로 증감률/변동/배지 계산
    4) 응답 dict 반환
    """
    s = _parse_date(start)
    e = _parse_date(end)

    if s > e:
        return {"error": "start는 end보다 클 수 없습니다."}

    # -----------------------------
    # 1) mode별 base/prev 기간 확정
    # -----------------------------
    if mode == "day":
        # 일별은 start==end 강제
        if s != e:
            return {"error": "일별(day)은 start와 end가 같아야 합니다."}
        base_start = base_end = s
        prev_start = prev_end = s - timedelta(days=1)

        # day는 "하루 문서들"을 정렬해서 TopN 뽑는 repo 함수 사용
        base_raw = repo.get_issue_ranking_by_date(es, base_start.isoformat(), size=size)
        prev_raw = repo.get_issue_ranking_by_date(es, prev_start.isoformat(), size=size)

        # ES raw -> [{keyword,count}]로 정규화
        base = _hits_to_items(base_raw)
        prev = _hits_to_items(prev_raw)

    elif mode == "week":
        # 주별은 입력 start~end 그대로, 비교기간은 직전 동일 길이
        base_start, base_end = s, e
        prev_start, prev_end = _prev_same_length_range(base_start, base_end)

        # week는 "기간 합산 TopN" repo 함수 사용
        base = repo.get_top_keywords_sum_by_range(es, base_start.isoformat(), base_end.isoformat(), size=size)
        prev = repo.get_top_keywords_sum_by_range(es, prev_start.isoformat(), prev_end.isoformat(), size=size)

    elif mode == "range":
        # ✅ 자유기간: 입력 start~end 그대로 사용, 비교기간 없음
        base_start, base_end = s, e

        base = repo.get_top_keywords_sum_by_range(
            es, base_start.isoformat(), base_end.isoformat(), size=size
        )

        # prev는 비우고(비교 계산 안 함)
        prev = []
        prev_start = prev_end = None

    elif mode == "month":
        # 월별은 종료일(end)이 속한 월 전체가 기준, 비교는 전월 전체
        base_start, base_end = _month_start_end(e)
        prev_anchor = _prev_month_anchor(e)
        prev_start, prev_end = _month_start_end(prev_anchor)

        base = repo.get_top_keywords_sum_by_range(es, base_start.isoformat(), base_end.isoformat(), size=size)
        prev = repo.get_top_keywords_sum_by_range(es, prev_start.isoformat(), prev_end.isoformat(), size=size)

    elif mode == "year":
        # 연도별은 종료일(end)이 속한 연도 전체가 기준, 비교는 전년도 전체
        base_start, base_end = _year_start_end(e)
        prev_start, prev_end = _year_start_end(date(e.year - 1, 1, 1))

        base = repo.get_top_keywords_sum_by_range(es, base_start.isoformat(), base_end.isoformat(), size=size)
        prev = repo.get_top_keywords_sum_by_range(es, prev_start.isoformat(), prev_end.isoformat(), size=size)

    else:
        return {"error": "mode는 day|week|month|year 중 하나여야 합니다."}

    # -----------------------------
    # 2) 비교기간 맵 구성 (키워드 -> 이전순위/이전카운트)
    # -----------------------------
    prev_rank_map: Dict[str, int] = {x["keyword"]: i + 1 for i, x in enumerate(prev)}
    prev_count_map: Dict[str, int] = {x["keyword"]: int(x["count"]) for x in prev}

    # -----------------------------
    # 3) 기준기간 TopN 기준으로 계산/조합
    # -----------------------------
    items: List[dict] = []

    for i, cur in enumerate(base):
        current_rank = i + 1
        kw = cur["keyword"]
        current_count = int(cur["count"])

        if mode == "range":
            chg = None
            mov = None
            badge = None
        else:
            prev_rank = prev_rank_map.get(kw)
            prev_count = prev_count_map.get(kw, 0)
            chg = calc_change_rate(current_count, prev_count)
            mov = calc_rank_change(current_rank, prev_rank)
            badge = _get_badge(mov, chg)

        items.append({
            "rank": current_rank,     # 기준 기간(base)에서의 현재 순위 (UI에서 랭킹 번호 표시)
            "keyword": kw,        # 이슈 키워드 텍스트
            "count": current_count,   # 기준 기간(base) 동안의 언급량 (UI에서 언급량 컬럼)
            "change_rate": chg,   # 비교 기간(prev) 대비 증감률 (NEW면 None)
            "rank_change": mov,   # 순위 변동 값 (NEW면 None)
            "badge": badge,       # 랭킹 상태를 한 단어로 요약한 UI 전용 플래그( NEW/UP/DOWN/SAME)
        })

    return {
        "mode": mode, # "day" | "week" | "month" | "year" 중 하나
        "base": {"start": base_start.isoformat(), "end": base_end.isoformat()}, # 기준 기간 (현재 랭킹을 계산한 기간)
        "prev": None if prev_start is None else {
        "start": prev_start.isoformat(), "end": prev_end.isoformat()
        }, # 비교 기간 (계산의 기준이 되는 기간)
        # prev 와 base 를 비교해서 증감률, 순위변동 계산했음
        "items": items, # 랭킹 리스트
    }


# ============================================================
# [내부] day 모드 raw 응답 정규화
# ============================================================
def _hits_to_items(es_resp: dict) -> list[dict]:
    """
    [내부 함수] repo.get_issue_ranking_by_date()의 ES raw 응답을
    [{keyword, count}, ...] 형태로 변환한다.
    """
    hits = es_resp.get("hits", {}).get("hits", [])
    out = []
    for h in hits:
        src = h.get("_source", {})
        out.append({
            "keyword": src.get("keyword"),
            "count": int(src.get("count", 0) or 0),
        })
    return out