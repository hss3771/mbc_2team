# 실행 경로
#cd D:\훈련생폴더\copy_project
#python -m apps.service.image_crawler_module.image_crawler_batch

from __future__ import annotations

import time
import requests

from apps.service.image_crawler_module.image_crawler_repo import (
    iter_targets_missing_image,
    bulk_update_image_urls,
)
from apps.service.image_crawler_module.image_crawler import (
    fetch_image_url,
)

def run_image_backfill_batch(
    page_size: int = 1000,
    chunk_size: int = 200,
    sleep_sec: float = 0.1,
    http_timeout: int = 10,
):
    """
    HTTP / FastAPI 없이
    터미널에서 직접 실행하는 image_url 전체 백필 배치
    """

    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Referer": "https://news.naver.com/",
    })

    total_checked = 0
    image_found = 0
    updated = 0
    buffer = []

    print("=== IMAGE BACKFILL BATCH START ===")

    for doc_id, url in iter_targets_missing_image(page_size=page_size):
        total_checked += 1

        try:
            image_url = fetch_image_url(
                session,
                url,
                timeout=http_timeout
            )
        except Exception:
            image_url = None

        if not image_url:
            continue

        image_found += 1
        buffer.append((doc_id, image_url))

        if len(buffer) >= chunk_size:
            success_count, _ = bulk_update_image_urls(buffer)
            updated += success_count
            buffer.clear()

        time.sleep(sleep_sec)

        # 진행 로그 (1000건 단위)
        if total_checked % 1000 == 0:
            print(
                f"[PROGRESS] checked={total_checked} "
                f"found={image_found} updated={updated}"
            )

    # 남은 버퍼 처리
    if buffer:
        success_count, _ = bulk_update_image_urls(buffer)
        updated += success_count

    print("=== IMAGE BACKFILL BATCH DONE ===")
    print(f"total_checked={total_checked}")
    print(f"image_found={image_found}")
    print(f"updated={updated}")


if __name__ == "__main__":
    run_image_backfill_batch()
