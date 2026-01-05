# 코드 설명 주석 없는 버전
# 스케줄러 + batch_runs 추가

import re
import time
import hashlib
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo
from urllib.parse import urlencode, urljoin

from fastapi import FastAPI
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chromium.options import ChromiumOptions
from selenium.webdriver.chrome.service import Service
from webdriver_manager.chrome import ChromeDriverManager

from elasticsearch import Elasticsearch
from elasticsearch.helpers import bulk

from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from logger import Logger
# db.py에서 구현
# 시작 시 1번 insert + 끝날 때 1번 update
from db import create_batch_run, finish_batch_run


app = FastAPI()
logger = Logger().get_logger(__name__)

ES_HOST = "http://http://192.168.0.34:9200"
ES_INDEX = "news_info"

KST = ZoneInfo("Asia/Seoul")


def get_es() -> Elasticsearch:
    return Elasticsearch(ES_HOST)


options = ChromiumOptions()
options.add_argument("--remote-allow-origins=*")
options.add_argument("--headless=new")
options.add_argument("--window-size=1400,1000")
options.add_argument("--disable-blink-features=AutomationControlled")
options.add_argument(
    "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


def normalize_published_at(dt: str | None) -> str | None:
    if not dt:
        return None
    dt = dt.strip()
    if not dt:
        return None
    return dt if "T" in dt else dt.replace(" ", "T")


def clean_doc_for_es(doc: dict) -> dict:
    return {k: v for k, v in doc.items() if v not in (None, "")}


def build_list_url(date_yyyymmdd: str, page: int, sid1: int = 101) -> str:
    return (
        "https://news.naver.com/main/list.naver?"
        + urlencode(
            {
                "mode": "LS2D",
                "mid": "shm",
                "sid1": str(sid1),
                "date": date_yyyymmdd,
                "page": str(page),
            }
        )
    )


def make_article_id(url: str) -> str:
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


def collect_article_links(driver) -> list[str]:
    wait = WebDriverWait(driver, 15)
    wait.until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, "ul.type06_headline li a[href], ul.type06 li a[href]")
        )
    )

    a_tags = driver.find_elements(
        By.CSS_SELECTOR, "ul.type06_headline li a[href], ul.type06 li a[href]"
    )

    links = []
    for a in a_tags:
        href = a.get_attribute("href")
        if not href:
            continue

        abs_url = urljoin(driver.current_url, href)

        if (
            "news.naver.com/main/read.naver" in abs_url
            or "n.news.naver.com/article/" in abs_url
            or "n.news.naver.com/mnews/article/" in abs_url
        ):
            links.append(abs_url)

    return list(dict.fromkeys(links))


def collect_all_links_for_date(driver, date: str, max_pages: int = 1000) -> list[str]:
    all_links = []
    seen = set()

    for page in range(1, max_pages + 1):
        driver.get(build_list_url(date, page))
        links = collect_article_links(driver)

        logger.info(f"[list page {page}] links={len(links)}")

        if not links:
            break

        added = 0
        for u in links:
            if u not in seen:
                seen.add(u)
                all_links.append(u)
                added += 1

        if added == 0:
            break

        time.sleep(0.2)

    logger.info(f"[date {date}] total_links={len(all_links)}")
    return all_links


def extract_published_at(driver):
    try:
        el = driver.find_element(By.CSS_SELECTOR, "span.media_end_head_info_datestamp_time")
        return normalize_published_at(el.get_attribute("data-date-time"))
    except Exception:
        return None


def extract_press_name(driver):
    try:
        img = driver.find_element(By.CSS_SELECTOR, "a.media_end_head_top_logo img")
        return img.get_attribute("alt")
    except Exception:
        return None


def extract_title(driver):
    for sel in ["h2#title_area", "h3#articleTitle"]:
        try:
            t = driver.find_element(By.CSS_SELECTOR, sel).text.strip()
            if t:
                return t
        except Exception:
            pass
    return None


def extract_body(driver):
    wait = WebDriverWait(driver, 15)
    el = wait.until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, "#dic_area, #articleBodyContents, #articeBody")
        )
    )
    return el.text.strip()


def extract_reporter(driver):
    selectors = [
        "span.byline_s",
        "span.media_end_head_journalist_name",
        "p.byline_p",
    ]
    for sel in selectors:
        try:
            el = driver.find_element(By.CSS_SELECTOR, sel)
            txt = (el.text or el.get_attribute("textContent") or "").strip()
            txt = re.sub(r"\S+@\S+", "", txt)
            txt = re.sub(r"\([^)]*\)", "", txt)
            txt = txt.replace("기자", "").strip()
            names = re.findall(r"\b[가-힣]{2,4}\b", txt)
            if names:
                return names[0]
        except Exception:
            pass
    return None


def parse_article(driver, url: str) -> dict:
    driver.get(url)
    doc = {
        "article_id": make_article_id(url),
        "published_at": extract_published_at(driver),
        "press_name": extract_press_name(driver),
        "reporter": extract_reporter(driver),
        "title": extract_title(driver),
        "body": extract_body(driver),
        "url": url,
    }
    return clean_doc_for_es(doc)


def es_exists(es: Elasticsearch, article_id: str) -> bool:
    return es.exists(index=ES_INDEX, id=article_id)


def bulk_index_news(es: Elasticsearch, docs: list[dict]) -> int:
    actions = [
        {
            "_op_type": "index",
            "_index": ES_INDEX,
            "_id": d["article_id"],
            "_source": d,
        }
        for d in docs
    ]
    success, errors = bulk(es, actions, raise_on_error=False)
    if errors:
        logger.error(f"[ES bulk errors] {errors[:2]}")
    return success


def crawl_one_date(date: str) -> dict:
    es = get_es()
    if not es.ping():
        return {"error": "Elasticsearch is not available"}

    # ✅ 크롤링 기준 시작 시각
    work_date = date # YYYYMMDD
    start_at = datetime.strptime(work_date, "%Y%m%d").replace(tzinfo=KST)
    end_at = start_at + timedelta(days=1)

    work_at = datetime.now(KST)

    run_id = create_batch_run(
        job_name="naver_news_daily",
        work_at=work_at,
        start_at=start_at
    )

    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=options)

    crawled_ok = 0
    skipped = 0
    failed = 0
    buffer = []

    try:
        logger.info(f"=== NAVER NEWS CRAWL START / date={date} ===")

        links = collect_all_links_for_date(driver, date)
        total_links = len(links)
        logger.info(f"total_links={total_links}")

        target_prefix = f"{date[:4]}-{date[4:6]}-{date[6:8]}"

        for url in links:
            article_id = make_article_id(url)

            if es_exists(es, article_id):
                skipped += 1
                continue

            try:
                doc = parse_article(driver, url)

                if doc.get("published_at") and not doc["published_at"].startswith(target_prefix):
                    continue

                buffer.append(doc)
                crawled_ok += 1

                if len(buffer) >= 200:
                    bulk_index_news(es, buffer)
                    buffer = []

                time.sleep(0.25)

            except Exception:
                failed += 1

        if buffer:
            bulk_index_news(es, buffer)

        logger.info("=== NAVER NEWS CRAWL DONE ===")

        # ✅ 크롤링 기준 종료 시각
        if failed == 0:
            state_code = 200
            message = f"SUCCESS | total_links={total_links}, crawled={crawled_ok}, skipped={skipped}"
        else:
            state_code = 300
            message = f"PARTIAL | total_links={total_links}, crawled={crawled_ok}, failed={failed}, skipped={skipped}"

        if run_id is not None:
            try:
                finish_batch_run(
                    run_id=run_id,
                    end_at=end_at,
                    state_code=state_code,
                    message=message,
                )
            except Exception as ee:
                logger.error(f"[batch_runs] finish_batch_run failed: {ee}")

        return {
            "date": date,
            "total_links": total_links,
            "crawled_ok": crawled_ok,
            "skipped_existing": skipped,
            "failed": failed,
            "saved": True,
        }

    except Exception as e:
        state_code = 400
        message = f"FAILED | error={str(e)[:200]}"

        if run_id is not None:
            try:
                finish_batch_run(
                    run_id=run_id,
                    end_at=end_at,
                    state_code=state_code,
                    message=message,
                )
            except Exception as ee:
                logger.error(f"[batch_runs] finish_batch_run failed: {ee}")

        raise

    finally:
        driver.quit()


@app.get("/naver/news")
def crawl_naver_news(date: str):
    return crawl_one_date(date)


def scheduled_crawl_job():
    yesterday = (datetime.now(KST) - timedelta(days=1)).strftime("%Y%m%d")
    logger.info(f"[SCHEDULER] start scheduled crawl for date={yesterday}")
    result = crawl_one_date(yesterday)
    logger.info(f"[SCHEDULER] done scheduled crawl result={result}")


scheduler = AsyncIOScheduler(timezone=KST)


@app.on_event("startup")
def start_scheduler():
    scheduler.add_job(
        scheduled_crawl_job,
        CronTrigger(hour=16, minute=0),
        id="naver_news_daily_midnight",
        replace_existing=True,
        max_instances=1,
        coalesce=True,
        misfire_grace_time=60 * 30,
    )
    scheduler.start()
    logger.info("[SCHEDULER] started (daily 00:00 Asia/Seoul)")


@app.on_event("shutdown")
def stop_scheduler():
    scheduler.shutdown(wait=False)
    logger.info("[SCHEDULER] stopped")

