from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from apps.common.db import get_db
from .word_dict_repo import WordSowRepository

router = APIRouter(prefix="/economic", tags=["Economic Terms"])


# 1. 왼쪽 리스트용: 전체 용어 목록 가져오기
@router.get("/terms")
def get_terms_list(request: Request, db: Session = Depends(get_db)):
    user_id = request.session.get("user_id")
    repo = WordSowRepository(db)

    # 1. 데이터 가져오기
    terms = repo.get_terms_with_bookmark_status(user_id)
    if terms is None:
        terms = []

    return {"status": "success", "data": terms}


# 2. 오른쪽 상세 용어 설명용: 특정 용어의 상세 정보 가져오기
@router.get("/terms/{term_id}")
def get_term_detail(term_id: str, db: Session = Depends(get_db)):
    repo = WordSowRepository(db)
    detail = repo.get_term_detail(term_id)
    if not detail:
        raise HTTPException(status_code=404, detail="용어를 찾을 수 없습니다.")
    return {"status": "success", "data": detail}


# 3. 상단 필터용: ㄱ, ㄴ, ㄷ 등 초성별 필터링
@router.get("/terms/filter/{initial}")
def get_terms_by_filter(initial: str, db: Session = Depends(get_db)):
    repo = WordSowRepository(db)

    # 초성별 범위 설정 (간단한 예시)
    initial_map = {
        "ㄱ": ("가", "나"),
        "ㄴ": ("나", "다"),
        "ㄷ": ("다", "라"),
        # ... 필요에 따라 추가
    }

    if initial not in initial_map:
        return {"status": "error", "message": "지원하지 않는 필터입니다."}

    start, end = initial_map[initial]
    filtered_data = repo.get_terms_by_initial(start, end)

    return {"status": "success", "data": filtered_data}