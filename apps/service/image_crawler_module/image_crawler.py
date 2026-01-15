from __future__ import annotations

import re
import time
from typing import Optional, List, Tuple, Dict, Any

import requests
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from apps.service.image_crawler_module.image_crawler_repo import (
    iter_targets_missing_image,
    bulk_update_image_urls
)

router = APIRouter(prefix="/image_crawler", tags=["image_crawler"])

# =========================
# 1) HTTP + HTML 파싱
# =========================

def _pick_first(*vals: Optional[str]) -> Optional[str]:
    for v in vals:
        if v and v.strip():
            return v.strip()
    return None


def _attr(tag_html: str, attr: str) -> Optional[str]:
    m = re.search(
        rf'{re.escape(attr)}\s*=\s*["\']([^"\']+)["\']',
        tag_html,
        re.IGNORECASE,
    )
    return m.group(1) if m else None


def extract_image_url_from_html(html: str) -> Optional[str]:
    if not html:
        return None

    # 1) og:image
    m = re.search(
        r'<meta[^>]+property=["\']og:image["\'][^>]+content=["\']([^"\']+)["\']',
        html,
        re.IGNORECASE,
    )
    if m:
        return m.group(1).strip()

    # 2) img#img1
    m = re.search(r'<img[^>]+id=["\']img1["\'][^>]*>', html, re.IGNORECASE)
    if m:
        tag = m.group(0)
        src = _pick_first(
            _attr(tag, "src"),
            _attr(tag, "data-src"),
            _attr(tag, "data-lazy-src"),
            _attr(tag, "data-original"),
        )
        if src:
            return src

    # 3) end_photo_org 내부 img
    m = re.search(
        r'(<span[^>]+class=["\']end_photo_org["\'][\s\S]*?</span>)',
        html,
        re.IGNORECASE,
    )
    if m:
        block = m.group(1)
        m2 = re.search(r"<img[^>]*>", block, re.IGNORECASE)
        if m2:
            tag = m2.group(0)
            src = _pick_first(
                _attr(tag, "src"),
                _attr(tag, "data-src"),
                _attr(tag, "data-lazy-src"),
                _attr(tag, "data-original"),
            )
            if src:
                return src

    # 4) fallback
    m = re.search(r'https?://imgnews\.pstatic\.net/[^"\'>\s]+', html, re.IGNORECASE)
    if m:
        return m.group(0).strip()

    return None


# 기사 URL을 받아서 기사 HTML을 가져오고 대표 이미지 URL 문자열을 반환하는 함수
def fetch_image_url(
    session: requests.Session,
    article_url: str,
    timeout: int = 10
) -> Optional[str]:
    r = session.get(article_url, timeout=timeout)
    if r.status_code != 200:
        return None
    return extract_image_url_from_html(r.text or "")


# =========================
# 2) API + 실행 오케스트레이션
# =========================

class BackfillReq(BaseModel):
    page_size: int = 500
    chunk_size: int = 200
    sleep_sec: float = 0.05
    http_timeout: int = 10
    limit: Optional[int] = None  # 테스트용


@router.post("/backfill")
def image_backfill(req: BackfillReq) -> Dict[str, Any]:
    try:
        # Session 생성 (요청마다 새 연결 만들지 않게)
        session = requests.Session()
        session.headers.update({
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/120.0.0.0 Safari/537.36"
            ),
            "Referer": "https://news.naver.com/",
        })

        total_targets = 0
        img_found = 0
        img_missing = 0
        updated = 0
        update_errors: List[str] = []

        buffer: List[Tuple[str, str]] = []

        for doc_id, url in iter_targets_missing_image(page_size=req.page_size):
            total_targets += 1
            if req.limit is not None and total_targets > req.limit:
                break

            try:
                # ✅ session을 넘겨야 함
                image_url = fetch_image_url(session, url, timeout=req.http_timeout)
            except Exception:
                image_url = None

            if not image_url:
                img_missing += 1
                continue

            img_found += 1
            buffer.append((doc_id, image_url))

            if len(buffer) >= req.chunk_size:
                success_count, reasons = bulk_update_image_urls(buffer)
                if reasons:
                    update_errors.extend(reasons)
                updated += success_count
                buffer = []

            time.sleep(req.sleep_sec)

        if buffer:
            success_count, reasons = bulk_update_image_urls(buffer)
            if reasons:
                update_errors.extend(reasons)
            updated += success_count

        return {
            "success": True,
            "result": {
                "total_targets": total_targets,
                "img_found": img_found,
                "img_missing": img_missing,
                "updated": updated,
                "update_error_count": len(update_errors),
                "update_error_sample": update_errors[:5],
                "params": req.model_dump(),
            },
        }

    except Exception as e:
        raise HTTPException(status_code=400, detail=f"image backfill failed: {str(e)}")