# 코드 설명 주석 있는 버전

import re                 # 정규식 처리: 기자명에서 이메일/괄호 제거, 이름 패턴 추출
import time               # 과속 방지(sleep), 페이지 넘김 텀 주기
import hashlib            # URL을 해시로 바꿔 고정 article_id 만들 때 사용
from urllib.parse import urlencode, urljoin  # URL 파라미터 생성 / 상대 URL을 절대 URL로 합치기

from fastapi import FastAPI                          # API 서버 프레임워크
from selenium import webdriver                       # 브라우저(크롬) 제어
from selenium.webdriver.common.by import By          # find_element에서 CSS/XPath 방식 지정
from selenium.webdriver.support.ui import WebDriverWait          # "요소가 뜰 때까지 기다림"
from selenium.webdriver.support import expected_conditions as EC  # 기다림 조건(존재/클릭가능 등)
from selenium.webdriver.chromium.options import ChromiumOptions   # 크롬 옵션(헤드리스 등)
from selenium.webdriver.chrome.service import Service             # 크롬드라이버 서비스 객체
from webdriver_manager.chrome import ChromeDriverManager          # 크롬드라이버 자동 설치/경로 제공

from elasticsearch import Elasticsearch            # ES 클라이언트
from elasticsearch.helpers import bulk            # ES bulk 저장(대량 삽입) 헬퍼

from logger import Logger


# =========================
# FastAPI / Logger
# =========================
app = FastAPI()                                    # FastAPI 앱(서버) 생성
logger = Logger().get_logger(__name__)             # logger.info / logger.error 찍기


# =========================
# Elasticsearch 설정
# =========================
ES_HOST = "http://localhost:9200"                  # 로컬 ES 주소
ES_INDEX = "news_info"                             # 저장할 인덱스명


def get_es() -> Elasticsearch:
    """
    Elasticsearch 클라이언트를 생성해서 반환하는 함수
    - 인증이 필요한 경우:
      Elasticsearch(ES_HOST, basic_auth=("id","pw")) 형태로 변경하면 됨
    """
    return Elasticsearch(ES_HOST)

# =========================
# Selenium Options (운영용)
# =========================
# ChromiumOptions: 크롬(Chromium) 브라우저를 어떤 옵션으로 실행할지 지정하는 객체
options = ChromiumOptions()

# 크롬 최신 버전에서 종종 발생하는 CORS : 외부접속 관련 에러 방지용 옵션
options.add_argument("--remote-allow-origins=*")


# headless: 브라우저(크롬) 창을 띄우지 않고 백그라운드 실행(운영 서버에서 주로 사용)
options.add_argument("--headless=new")

# headless는 화면 크기를 지정 안 하면 레이아웃이 바뀌어서
# 요소 셀렉터가 달라질 수 있음 → window-size를 고정해주는 게 안정적
options.add_argument("--window-size=1400,1000")

# 자동화(WebDriver) 흔적을 줄여 탐지/차단을 덜 당하게 해주는 옵션(완벽하진 않음)
options.add_argument("--disable-blink-features=AutomationControlled")

# User-Agent : "일반 크롬 브라우저" 처럼 보이게 설정(자동화 판단 확률 감소)
options.add_argument(
    "user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
    "AppleWebKit/537.36 (KHTML, like Gecko) "
    "Chrome/120.0.0.0 Safari/537.36"
)


# =========================
# Utils
# =========================
def normalize_published_at(dt: str | None) -> str | None:
    """
    네이버 발행일은 보통 "YYYY-MM-DD HH:MM:SS" 형태로 나옴.
    ES date 타입은 ISO8601 형태를 더 안정적으로 받음:
      - ISO8601 형태 : "YYYY-MM-DDTHH:MM:SS"

    그래서 아래 형태로 바꿔줌 :
      "2025-12-17 09:31:00" -> "2025-12-17T09:31:00"
    """
    # 발행일이 없는 기사가 있을 수 있는데, 그런 값을 억지로 처리하면 에러 발생 위험
    if not dt: # dt 가 None 이거나 빈 문자열일 경우 None 반환
        return None
    dt = dt.strip() # 문자열 양쪽의 공백 제거
    if not dt: # None, 빈값, 공백값 모두 거르기
        return None
    # 포멧 통일
    # 이미 T 가 들어있으면 그대로 반환
    # T가 없으면 공백을 T로 바꿔서 반환
    return dt if "T" in dt else dt.replace(" ", "T")

# ES 에 넣기 전 문서에서 빈 값 필드 삭제 (파싱 에러 방지)
def clean_doc_for_es(doc: dict) -> dict:
    """
    ES에 넣기 전에 위험한 값 제거.
    - None 또는 ""(빈 문자열)인 필드는 아예 제거
    - 이유: ES date 필드에 "" 들어가면 파싱 에러 날 수 있음
    - 그래서 None/빈문자열은 제거한 dict만 반환.
    """
    # doc.items() : doc 의 (키, 값) 쌍을 전부 꺼내주는 반복자
    # k: v for k : 조건을 만족하는 항목만 골라서 새 dict 생성
    # if v not in (None, "") : 값 v 가 None, 빈문자열일 경우 제외
    return {k: v for k, v in doc.items() if v not in (None, "")}

# 함수 역할 : 하루치 기사 목록을 끝까지 훑음 (날짜, 섹션, 페이지 번호 사용)
def build_list_url(date_yyyymmdd: str, page: int, sid1: int = 101) -> str:
    """
    네이버 뉴스 목록(list.naver) URL 생성 함수.
    - date: YYYYMMDD (예: 20251217)
    - page: 1, 2, 3... 페이지 번호 (1부터 시작)
    - sid1: 섹션 번호 (경제=101)

    최종 예시:
    https://news.naver.com/main/list.naver?mode=LS2D&mid=shm&sid1=101&date=20251217&page=1
    """
    return (
            "https://news.naver.com/main/list.naver?" # 네이버 뉴스 목록 페이지의 기본 주소
            + urlencode({ # 딕셔너리를 URL 파라미터 문자열로 바꿔주는 함수
        "mode": "LS2D",  # 기사 목록 보기 모드
        "mid": "shm",  # 네이버 뉴스 내부 파라미터(관례적으로 붙음)
        "sid1": str(sid1),  # 1차 섹션(경제)
        "date": date_yyyymmdd, # 해당 날짜에 발행된 기사 목록
        "page": str(page), # 페이지 번호
    })
    )


def make_article_id(url: str) -> str:
    """
    URL을 SHA1 해시로 바꿔 고정 article_id 생성.
    - 같은 URL이면 언제 수집해도 같은 article_id가 나옴.
    - ES 저장 시 _id로 쓰면 중복 저장이 아니라 "덮어쓰기"가 가능.
    """
    """
    기사 URL 을 UTF-8 바이트로 바꾸고, SHA1 해시를 적용해서, 고정 길이 (40자)의 문자열 ID로 만든다.
    # hashlib.sha1() : str 못 받음. 바이트만 받을 수 있음
    # url.encode("utf-8") : 문자열 URL을 컴퓨터가 처리할 수 있는 바이트 형태로 변환
    # sha1 : 임의 길이 문자열 → 고정 길이의 해시값으로 변환
    # hexdigest() : 사람이 보기 좋게 16진수 문자열로 바꿔줌
    """
    return hashlib.sha1(url.encode("utf-8")).hexdigest()


# =========================
# 목록 페이지 → 링크 전체 수집
# =========================
# selenium driver 가 열고 있는 "뉴스 목록 페이지 1장"에서 실제 기사로 연결되는 URL만 뽑아내는 역할
# 메뉴, 광고, 이미지, 중복 링크들을 걸래내고 뽑아냄
def collect_article_links(driver) -> list[str]:
    """
    과정:
    1) 기사 링크가 로딩될 때까지 기다림(WebDriverWait)
    2) ul.type06_headline / ul.type06 영역 안의 a[href]만 선택
       (메뉴/광고 링크 섞이는 걸 방지)
    3) href를 절대경로로 변환(urljoin)
    4) 기사 URL 패턴에 해당하는 것만 남김(구형/신형)
    5) 중복 제거 후 반환
    """
    # 기사 링크가 DOM에 생성될 때까지 기다림(최대 15초)
    wait = WebDriverWait(driver, 15)
    # ul.type06_headline : 네이버 뉴스 메인 목록
    # ul.type06 : 일반 목록
    # li a[href] : 리스트 안의 링크만
    # 메뉴, 헤더, 광고 영역 차단
    wait.until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, "ul.type06_headline li a[href], ul.type06 li a[href]")
        )
    )

    # 기사 후보 링크 a태그 전부 가져오기
    # find_elements : 위에 나온 영역을 그대로 리스트로 가져옴
    a_tags = driver.find_elements(
        By.CSS_SELECTOR,
        "ul.type06_headline li a[href], ul.type06 li a[href]"
    )

    links = []
    for a in a_tags:
        # a 태그의 링크 주소는 text가 아니라 href attribute에 있음
        href = a.get_attribute("href")  # a태그의 href 속성 가져오기
        if not href:
            continue

        # 상대 URL이 올 수 있으니 현재 URL 기준으로 절대 URL로 변환
        abs_url = urljoin(driver.current_url, href)

        # 기사 페이지 URL만 골라내기 (구형/신형 모두 허용)
        # 뉴스 목록 페이지에는 댓글, 이미지, 광고 등의 링크도 있기 때문에 해당 작업 필요
        if (
            "news.naver.com/main/read.naver" in abs_url       # 구형
            or "n.news.naver.com/article/" in abs_url         # 신형
            or "n.news.naver.com/mnews/article/" in abs_url   # 신형(모바일)
        ):
            links.append(abs_url) # 조건을 만족한 URL 만 links 리스트에 추가

    # 중복 제거(순서 유지)
    # list(dict.fromkeys(list)) 패턴 = 파이썬에서 "순서 유지 중복 제거" 빠른 방법
    return list(dict.fromkeys(links))


def collect_all_links_for_date(driver, date: str, max_pages: int = 1000) -> list[str]:
    """
    특정 날짜(date)에 대해 page=1,2,3...을 끝까지 돌면서
    중복 없는 기사 링크를 전부 수집하는 함수.

    종료 조건:
    1) 어떤 페이지에서 links가 0개면 → 더 이상 페이지가 없다고 보고 종료
    2) 새로 추가되는 링크(added)가 0개면 → 중복만 나오고 새 링크가 없으니 종료

    dirver : selenium webdriver 실제로 브라우저를 열고 페이지를 넘기는 역할
    date : 해당 날짜에 발행된 기사 목록을 대상으로 함
    max_pages:1000 : 무한루프 방지용 안전장치 (무한히 반복되는 버그가 있어도 1000페이지 이상은 돌지 않게)
    """
    all_links = []     # 최종 기사 링크들이 저장됨
    seen = set()       # 중복 체크용 set

    # 목록 페이지 열기
    for page in range(1, max_pages + 1):
        # driver.get() : 실제 브라우저에서 그 URL로 이동
        driver.get(build_list_url(date, page))

        # 해당 페이지에서 기사 링크 추출
        # collect_article_links() : 현재 페이지 한장에서만 기사 URL 골라서 반환
        links = collect_article_links(driver)
        logger.info(f"[list page {page}] links={len(links)}")

        # 페이지에 더 이상 링크가 없으면 종료(마지막 페이지)
        if not links:
            break

        # 새 링크만 누적 (중복 제거 핵심)
        added = 0
        for u in links:
            if u not in seen: # 이미 본 링크인지 확인
                seen.add(u) # 처음 보는 링크면 seen 에 기록
                all_links.append(u) # all_links 에 추가
                added += 1

        # 페이지는 존재하지만 새로운 기사는 더 이상 없는 경우
        # 새로 추가된 링크가 하나도 없으면 종료(중복만 도는 케이스)
        if added == 0:
            break

        # 과속 방지: 목록 페이지 넘김도 너무 빠르면 차단될 수 있음
        time.sleep(0.2)

    logger.info(f"[date {date}] total_links={len(all_links)}")
    # 해당 날짜 하루치 기사 링크 전부 (중복 없음, 순서 유지)
    return all_links


# =========================
# 기사 상세 페이지 → 필드 추출
# =========================
# 기사 페이지에서 발행 시간을 추출하는 함수 (발행 시간 없으면 None) -> 안 죽는 함수
def extract_published_at(driver):
    # 크롤링 중 에러 나면 크롤링 전체가 죽는 게 아니라 발행일 None 처리
    try:
        # 기사 상단에 있는 발행 시간 span 태그 찾기
        el = driver.find_element(By.CSS_SELECTOR, "span.media_end_head_info_datestamp_time")
        # normalize_published_at() : "2025-12-17 09:31:00" → "2025-12-17T09:31:00"
        # data-date-time : 가져온 span 태그에서 발행 시간 추출 (2025-12-17 09:31:00)
        return normalize_published_at(el.get_attribute("data-date-time"))
    # 실패하면 published_at 필드 None 반환 -> clean_doc_for_es()에서 제거
    except Exception:
        return None

# 기사 페이지에서 언론사명을 추출하는 함수 (발행 시간 없으면 None) -> 안 죽는 함수
def extract_press_name(driver):
    try:
        img = driver.find_element(By.CSS_SELECTOR, "a.media_end_head_top_logo img")
        return img.get_attribute("alt")
    except Exception:
        return None

# 기사 페이지에서 제목을 추출하는 함수 (발행 시간 없으면 None) -> 안 죽는 함수
def extract_title(driver):
    # 신형: h2#title_area / 구형: h3#articleTitle
    for sel in ["h2#title_area", "h3#articleTitle"]:
        try:
            # driver.find_element() : CSS_SELECTOR(sel) 에 해당하는 첫번째 요소 하나 찾음
            # .text : HTML 태그가 제거된 텍스트만 추출
            # .strip() : 문자열 앞뒤 공백, 줄바꿈 제거
            t = driver.find_element(By.CSS_SELECTOR, sel).text.strip()
            if t: # 제목이 빈 문자열이 아니면 함수 종료
                return t
        except Exception: # 에러가 나면
            pass # 아무것도 하지 말고 다음 반복으로
    # 모든 셀렉터(신형,구형) 다 시도했는데 실패한 경우 None 반환 -> clean_doc_for_es()에서 제거
    return None

# 기사 페이지에서 본문을 추출하는 함수 (발행 시간 없으면 None) -> 안 죽는 함수
def extract_body(driver):
    # 신형: #dic_area / 구형: #articleBodyContents, #articeBody
    # 본문은 로딩이 늦을 수 있음 → WebDriverWait으로 기다렸다가 가져오기
    wait = WebDriverWait(driver, 15)
    el = wait.until(
        EC.presence_of_element_located(
            (By.CSS_SELECTOR, "#dic_area, #articleBodyContents, #articeBody")
        )
    )
    return el.text.strip()

# 기사 페이지에서 기자명을 추출하는 함수 (발행 시간 없으면 None) -> 안 죽는 함수
def extract_reporter(driver):
    """
    처리 순서:
    1) 텍스트 가져오기 (headless에서 el.text가 비면 textContent도 사용)
    2) 이메일 제거 (예: 디지털팀@heraldcorp.com)
    3) 괄호 제거 (예: (서울=연합뉴스) 같은 정보)
    4) '기자' 단어 제거
    5) 한글 2~4글자 패턴만 추출해서 첫 번째를 기자명으로 사용
    """
    # 기사마다 기자 표기 위치가 달라서 후보 셀렉터를 여러 개 둠
    selectors = [
        "span.byline_s",
        "span.media_end_head_journalist_name",
        "p.byline_p",
    ]
    # 셀렉터 하나씩 시도
    for sel in selectors:
        try:
            el = driver.find_element(By.CSS_SELECTOR, sel)

            # 텍스트 가져오기
            # el.text : 사용자 눈에 보이는 텍스트를 뽑아줌
            # textContent : DOM에 들어있는 텍스트 원문
            # 둘 다 없으면 ""
            # .strip() : 앞뒤 공백 제거
            txt = (el.text or el.get_attribute("textContent") or "").strip()

            # re.sub(패턴, 바꿀문자, 원본문자열)
            # 이메일 제거: "최민서 디지털팀@heraldcorp.com" → "최민서"
            txt = re.sub(r"\S+@\S+", "", txt)

            # 괄호 제거: "(서울=연합뉴스)" 같은 부분 제거
            # \( : 여는 괄호
            # [^)]* : 닫는 괄호가 나올 때까지 모든 문자
            # \) : 닫는 괄호
            txt = re.sub(r"\([^)]*\)", "", txt)

            # '기자' 제거
            txt = txt.replace("기자", "").strip()

            # re.findall(패턴, 문자열) : 패턴에 맞는 모든 부분 리스트로 반환
            # 한글 이름(2~4자)만 추출
            names = re.findall(r"\b[가-힣]{2,4}\b", txt)
            if names:
                return names[0]  # 첫 번째를 기자명으로 사용
        except Exception: # 에러가 나면
            pass  # 아무것도 하지 말고 다음 반복으로
    return None

# 기사 URL를 통해 필요한 필드를 뽑아 dict 로 만든 뒤, ES 넣기 좋게 정제
def parse_article(driver, url: str) -> dict:
    """
    기사 URL 하나를 받아서 그 기사 페이지를 들어간 뒤
    필요한 필드를 전부 뽑아 doc(dict)로 만든 뒤 ES에 넣기 좋게 정제(clean)해서 반환.
    """
    # selenium 브라우저를 url 기사 페이지로 이동 시킴
    driver.get(url) # URL : links 리스트에서 하나씩 꺼낸 기사 URL
    # 기사 1개 -> dict 1개 를 만드는 과정
    doc = {
        "article_id": make_article_id(url),           # 중복 방지용 고정 ID
        "published_at": extract_published_at(driver), # 발행일
        "press_name": extract_press_name(driver),     # 언론사
        "reporter": extract_reporter(driver),         # 기자
        "title": extract_title(driver),               # 제목
        "body": extract_body(driver),                 # 본문
        "url": url,                                   # 원문 URL
    }
    return clean_doc_for_es(doc)


# =========================
# ES 저장
# =========================
def es_exists(es: Elasticsearch, article_id: str) -> bool:
    """
    ES에 같은 _id(article_id)가 이미 있는지 확인.
    - 이미 있으면 중복 저장/중복 크롤링을 피할 수 있음.
    """
    return es.exists(index=ES_INDEX, id=article_id)

# 기사 여러개를 ES 에 한번에(bulk) 저장을 성공한 문서 개수 반환
def bulk_index_news(es: Elasticsearch, docs: list[dict]) -> int:
    """
    ES에 docs를 bulk로 저장.
    - _id를 article_id로 고정하면, 같은 문서는 재저장 시 "덮어쓰기"가 됨.
    - 대량 저장 시 1개씩 index하는 것보다 훨씬 빠르고 안정적.
    """
    actions = [
        {
            "_op_type": "index",            # index: 없으면 생성, 있으면 덮어쓰기
            "_index": ES_INDEX,             # 저장 대상 인덱스
            "_id": d["article_id"],         # ES 문서의 고유 ID
            "_source": d,                   # 실제 저장할 본문
        }
        for d in docs
    ]

    # bulk 실행
    success, errors = bulk(es, actions, raise_on_error=False)

    # bulk는 일부 성공/일부 실패가 가능하므로 errors 확인이 중요
    if errors:
        logger.error(f"[ES bulk errors] {errors[:2]}")  # 에러 2개만 샘플로 로그

    return success


# =========================
# FastAPI Endpoint (운영용)
# =========================
@app.get("/naver/news") # 이 함수가 get 요청을 받을 URL 경로
def crawl_naver_news(date: str): # 쿼리파라미터로 date값을 입력받음
    """
    실제 운영 방식:
    1) 해당 날짜 기사 링크를 끝까지 수집
    2) 각 기사에 들어가서 제목/본문/기자/언론사/발행일 추출
    3) ES(news_info)에 bulk 저장
    호출 예시:
    http://127.0.0.1:8000/naver/news?date=20251217
    """

    # 1) ES 연결 체크
    es = get_es()
    if not es.ping(): # es.ping() : ES 가 살아있는지 확인(9200 열려있는지)
        # 실패하면 크롤링 자체를 하지 않고 바로 종료 (에러 반환)
        return {"error": "Elasticsearch is not available"}

    # 2) Selenium 드라이버 시작
    # ChromeDriverManager().install() : 크롬드라이버 자동으로 설치, 경로를 줌
    service = Service(ChromeDriverManager().install())
    # webdriver.Chrome() : 실제 크롬 브라우저를 코드로 조작할 수 있는 객체 생성
    # driver 가 이후에 driver.get(url)로 페이지 열고...
    driver = webdriver.Chrome(service=service, options=options)

    # 운영/디버깅을 위한 카운터(얼마나 잘 돌았는지 통계)
    crawled_ok = 0    # 새로 수집해서 저장한 기사 수
    skipped = 0       # ES에 이미 있어서 스킵된 수
    failed = 0        # 기사 상세 수집 중 실패한 수

    buffer = [] # doc들을 모아서 한번에 bulk 저장을 위해 문서를 모아둘 리스트(배치 저장)

    try:
        # 크롤링 과정 시작
        logger.info(f"=== NAVER NEWS CRAWL START / date={date} ===")

        # 3) links : 하루치 기사 URL 기사 전부 수집
        # 제목/본문/기자는 이 링크들로 들어가야 수집 가능
        links = collect_all_links_for_date(driver, date)
        logger.info(f"total_links={len(links)}")

        # 4) 날짜 검증용 prefix(발행일이 다른 날짜로 섞이면 스킵하기 위함)
        # ex) date=20251217 -> target_prefix="2025-12-17"
        target_prefix = f"{date[:4]}-{date[4:6]}-{date[6:8]}"

        # 5) 기사 링크 하나씩 상세 수집 + 저장
        for url in links:
            # article_id : URL을 해시로 만들어 고정ID 생성(중복방지 핵심)
            article_id = make_article_id(url)

            # ES에 이미 있으면 중복 저장/재수집 방지
            if es_exists(es, article_id):
                skipped += 1
                continue

            try:
                # 기사 상세 수집(제목/본문/기자/언론사/발행일) 후 doc(dict)를 만들어 반환
                # 위에 parse_article() 함수 참고
                doc = parse_article(driver, url)

                # 발행일이 다른 날짜 기사가 섞이는 걸 막기 위한 장치
                # 발행일 정보가 있고, 그 날짜가 우리가 요청한 날짜가 아니면, 그 기사는 패스
                if doc.get("published_at") and not doc["published_at"].startswith(target_prefix):
                    continue

                # bulk 저장을 위해 buffer에 쌓기
                buffer.append(doc)
                crawled_ok += 1

                # buffer에 200개 쌓이면 bulk로 저장(성능/안정성)
                if len(buffer) >= 200:
                    bulk_index_news(es, buffer)
                    buffer = []

                # 과속 방지: 상세 기사 페이지를 너무 빠르게 돌면 차단될 수 있음
                time.sleep(0.25)

            # 어떤 기사 하나가 실패해도 전체 수집은 계속 진행
            except Exception:
                failed += 1

        # 6) 마지막 남은 버퍼 저장
        # 200개씩 저장하고 남은 자투리(예, 마지막에 남은 53개)도 저장해줘야함.
        if buffer:
            bulk_index_news(es, buffer)

        logger.info("=== NAVER NEWS CRAWL DONE ===")

        # 7) 최종 결과 리턴(API 응답)
        return {
            "date": date,
            "total_links": len(links),
            "crawled_ok": crawled_ok,
            "skipped_existing": skipped,
            "failed": failed,
            "saved": True,
        }

    finally:
        # 중간에 에러가 나도 드라이버는 무조건 종료(자원 반납)
        driver.quit()
