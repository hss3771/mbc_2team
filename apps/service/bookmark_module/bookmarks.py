from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Literal
from sqlalchemy.orm import Session

from apps.common.db import get_db
from apps.service.bookmark_module.db import BookmarkRepository

# API 라우터 생성 (이름 : bookmark)
router = APIRouter(prefix="/bookmarks", tags=["bookmark"])


# 로그인 체크 공통 함수
def require_login(request: Request) -> str:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return user_id


# ③ 내 북마크 목록 (ADD만)
@router.get("/me")
def my_bookmarks(request: Request, db: Session = Depends(get_db)):
    user_id = require_login(request)
    repo = BookmarkRepository(db)
    data = repo.get_my_term_bookmarks(user_id)
    return {"status": "success", "data": data}


# 요청 body 모델
# 요청 body(JSON)를 BookmarkToggleReq 모델로 파싱
class BookmarkToggleReq(BaseModel):
    term_id: str
    state: Literal["ADD", "CANCEL"]


# ④ 북마크 토글 (ADD / CANCEL)
@router.post("/toggle")
def toggle_bookmark(request: Request, data: BookmarkToggleReq, db: Session = Depends(get_db)):
    user_id = require_login(request)

    # 2. 리포지토리 생성
    repo = BookmarkRepository(db)
    success = repo.toggle_term_bookmark(
        user_id=user_id,
        term_id=data.term_id,
        state=data.state
    )

    if success:
        return {"status": "success"}
    return JSONResponse(status_code=500, content={"message": "fail"})


# ⑤ 북마크 전체 삭제(= 전체 해제)
@router.post("/clear")
def clear_bookmarks(request: Request, db: Session = Depends(get_db)):
    user_id = require_login(request)
    repo = BookmarkRepository(db)
    result = repo.clear_all_bookmarks(user_id)
    return result
