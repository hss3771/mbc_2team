from fastapi import APIRouter, Request, HTTPException
from typing import Literal
from apps.service.article_module.article_service import (
    get_articles_by_keyword,          # (legacy) 단일 date
    get_articles_by_keyword_range,    # (new) start~end 리스트
    get_sentiment_summary,            # (new) start~end 도넛
    get_article_summary_by_doc_id
)

router = APIRouter(
    prefix="/articles",
    tags=["Articles"]
)

# 로그인 세션 확인
def require_login(request: Request) -> str:
    user_id = request.session.get("user_id")
    if not user_id:
        raise HTTPException(status_code=401, detail="LOGIN_REQUIRED")
    return user_id

# -----------------------------
# 단일 날짜 기반
# -----------------------------
@router.get("/by-keyword")
def articles_by_keyword(
    keyword: str,
    date: str,
    sentiment: str = "all",
    page: int = 1,
    size: int = 10,
    orderby: Literal["latest", "old", "trust_high", "trust_low"] = "latest",
):
    return get_articles_by_keyword(keyword, date, sentiment, page, size, orderby)


# -----------------------------
# 도넛용: 기간 감성 집계
# -----------------------------
@router.get("/sentiment-sum")
def sentiment_sum(
    keyword: str,
    start: str,
    end: str,
):
    return get_sentiment_summary(keyword=keyword, start=start, end=end)


# -----------------------------
# 기사 리스트용: 기간 + sentiment
# -----------------------------
@router.get("/list")
def list_articles(
    keyword: str,
    start: str,
    end: str,
    sentiment: str = "all",  # positive|neutral|negative|all
    page: int = 1,
    size: int = 5,
    orderby: Literal["latest", "old", "trust_high", "trust_low"] = "latest",  # latest|old|popular|trust_high|trust_low
):
    return get_articles_by_keyword_range(
        keyword=keyword,
        start=start,
        end=end,
        sentiment=sentiment,
        page=page,
        size=size,
        orderby=orderby,
    )


# 기사 요약은 로그인 한 회원만 제공
@router.get("/{doc_id}/summary")
def get_article_summary(doc_id: str, request: Request):
    require_login(request)  # 로그인 아니면 401
    summary = get_article_summary_by_doc_id(doc_id)
    return {"success": True, "summary": summary}

