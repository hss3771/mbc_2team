# apps/service/issue_keyword_router.py

from fastapi import APIRouter, Query, HTTPException
from apps.common.elastic import get_es
from apps.common.logger import Logger

import apps.service.keyword_ranking_module.keyword_ranking as service

logger = Logger().get_logger(__name__)

router = APIRouter(prefix="/api/keywords", tags=["keywords"])


@router.get("/ranking")
def issue_keyword_ranking(
    mode: str = Query(..., pattern="^(day|week|month|year|range)$", description="day|week|month|year|range"),
    start: str = Query(..., description="YYYY-MM-DD"),
    end: str = Query(..., description="YYYY-MM-DD"),
    size: int = Query(10, ge=1, le=50, description="Top N (default 10)"),
):
    """
    이슈 키워드 랭킹 조회 API

    - day(일별): start==end (하루 TOP10) / 비교기간: D-1
    - week(주별): start~end 그대로 / 비교기간: 직전 동일 길이
    - month(월별): end가 속한 월 전체 / 비교기간: 전월 전체
    - year(연도별): end가 속한 연도 전체 / 비교기간: 전년도 전체
    """
    print(mode)
    print(start)
    print(end)
    print(size)
    es = get_es()
    try:
        result = service.get_keyword_ranking(es, mode=mode, start=start, end=end, size=size)

        # 서비스에서 규칙 위반/입력 오류를 {"error": "..."}로 반환
        if isinstance(result, dict) and "error" in result:
            raise HTTPException(status_code=400, detail=result["error"])

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.exception("[issue_keyword_ranking] failed")
        raise HTTPException(status_code=500, detail="랭킹 조회 중 오류가 발생했습니다.")
    finally:
        es.close()
