from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import List, Literal

from apps.common.db import get_db
from apps.bookmark.db import (
    get_my_term_bookmarks,
    toggle_term_bookmark,
    clear_term_bookmarks
)

# API 라우터 생성 (이름 : bookmark)
router = APIRouter(tags=["bookmark"])

# 로그인 체크
def require_login(request: Request) -> str:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="로그인 안 됨")
    return user_id


# ① 내 북마크 목록 (ADD만)
@router.get("/me", response_model=List[str])
def my_bookmarks(request: Request):
    user_id = require_login(request)
    db = get_db()
    try:
        return get_my_term_bookmarks(db, user_id)
    finally:
        db.close()


# 요청 body 모델
# 요청 body(JSON)를 BookmarkToggleReq 모델로 파싱
class BookmarkToggleReq(BaseModel):
    term_id: str
    state: Literal["ADD", "CANCEL"]


# ② 북마크 토글 (ADD / CANCEL)
@router.post("/toggle")
def toggle_bookmark(request: Request, body: BookmarkToggleReq):
    user_id = require_login(request)
    db = get_db()
    try:
        return toggle_term_bookmark(
            db,
            user_id=user_id,
            term_id=body.term_id,
            state=body.state
        )
    finally:
        db.close()


# ③ 북마크 전체 삭제(= 전체 해제)
@router.post("/clear")
def clear_bookmarks(request: Request):
    user_id = require_login(request)
    db = get_db()
    try:
        return clear_term_bookmarks(db, user_id)
    finally:
        db.close()