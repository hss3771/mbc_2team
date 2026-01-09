from fastapi import APIRouter, Request, HTTPException
from pydantic import BaseModel
from typing import List, Literal

router = APIRouter(tags=["aggregation"])


# ① 내 북마크 목록 (ADD만)
@router.get("/ranking", response_model=List[str], start_at = str, end_at = str)
    es,search("index")
    KEYWORDS = [
        { rank: 1, keyword: "주식", count: 223, rate: +94, move: "NEW" },
        { rank: 2, keyword: "부동산", count: 201, rate: -22, move: "▼2" },
        { rank: 3, keyword: "고용", count: 189, rate: +10, move: "▲1" },
        { rank: 4, keyword: "경기침체", count: 173, rate: -7, move: "▼1" },
        { rank: 5, keyword: "유가", count: 162, rate: +18, move: "▲1" },
        { rank: 6, keyword: "반도체", count: 155, rate: +50, move: "▲3" },
        { rank: 7, keyword: "수출", count: 149, rate: -12, move: "▼2" },
        { rank: 8, keyword: "노동", count: 130, rate: -42, move: "▼3" },
        { rank: 9, keyword: "경제", count: 121, rate: +8, move: "▲1" },
        { rank: 10, keyword: "현금", count: 108, rate: -13, move: "▼1" },
    ];
    return KEYWORDS

@router.get("/keyword_news")
keyword, start_at, end_at
