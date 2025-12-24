# matplotlib 서버용 backend 설정
from fastapi.staticfiles import StaticFiles
import matplotlib
matplotlib.use("Agg")

import io
from collections import defaultdict, Counter

import matplotlib.pyplot as plt
from matplotlib import font_manager, rc
from wordcloud import WordCloud

from fastapi import FastAPI
from fastapi.responses import HTMLResponse, Response
from elasticsearch import Elasticsearch

app = FastAPI(title="TrendScope Dashboard")

app.mount("/static", StaticFiles(directory="static"), name="static")

# Elasticsearch 연결
es = Elasticsearch("http://localhost:9200")

# 한글 폰트 설정 (Windows)
FONT_PATH = "C:/Windows/Fonts/malgun.ttf"
font = font_manager.FontProperties(fname=FONT_PATH)
rc("font", family=font.get_name())
plt.rcParams["axes.unicode_minus"] = False

# Elasticsearch 데이터 조회
def get_keyword_data():
    """
    Elasticsearch에서 날짜별 키워드 언급량 데이터를 조회
    return: { date: { keyword: count } }
    """
    query = {
        "query": {
            "terms": {
                "date": [
                    "2025-10-10",
                    "2025-10-11",
                    "2025-10-12"
                ]
            }
        },
        "_source": ["date", "keyword", "count"],
        "size": 1000
    }

    res = es.search(index="issue_keyword_count", body=query)

    data_by_date = defaultdict(dict)
    for hit in res["hits"]["hits"]:
        src = hit["_source"]
        data_by_date[src["date"]][src["keyword"]] = src["count"]

    return data_by_date



# 메인 페이지 (HTML 직접 반환)
@app.get("/", response_class=HTMLResponse)
def home():
    # 기사 데이터 조회
    query = {
        "query": {
            "match_all": {}
        },
        "_source": ["title", "press", "published_at"],
        "size": 10
    }

    res = es.search(index="news_info", body=query)

    news_list = []
    for hit in res["hits"]["hits"]:
        src = hit["_source"]
        press = src.get("press")

        news_list.append({
            "title": src.get("title", "[제목 없음]"),
            "press": press,
            "logo": get_press_logo(press),
            "published_at": src.get("published_at", "")
        })

    news_html = render_news_list_html(news_list)

    return f"""
    <!DOCTYPE html>
    <html lang="ko">
    <head>
        <meta charset="UTF-8">
        <title>TrendScope</title>
        <style>
            body {{
                font-family: Arial, sans-serif;
            }}
            .news-item {{
                display: flex;
                align-items: center;
                margin-bottom: 12px;
            }}
            .press-logo {{
                width: 36px;
                height: 36px;
                object-fit: contain;
                margin-right: 10px;
            }}
            .news-title {{
                font-size: 15px;
                font-weight: 600;
            }}
            .news-meta {{
                font-size: 12px;
                color: #666;
            }}
        </style>
    </head>
    <body>
        <h2>키워드 언급량 변화 (3일)</h2>
        <img src="/chart?nocache=1" width="900">

        <h2>키워드 워드클라우드 (3일)</h2>
        <img src="/wordcloud?nocache=1" width="900">

        <h2>뉴스 기사 리스트</h2>
        {news_html}
    </body>
    </html>
    """



# 키워드 언급량 선 그래프
@app.get("/chart")
def chart():
    data_by_date = get_keyword_data()

    # 데이터가 없는 경우 안내 이미지 반환
    if not data_by_date:
        plt.figure(figsize=(8, 4))
        plt.text(0.5, 0.5, "데이터가 없습니다",
                 ha="center", va="center", fontsize=16)
        plt.axis("off")

        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        plt.close()
        buf.seek(0)

        return Response(buf.read(), media_type="image/png")

    dates = sorted(data_by_date.keys())

    keywords = [
        "물가", "환율", "금리인상", "부동산",
        "SK하이닉스", "미국금리", "반도체",
        "한국은행", "환율전망", "주식시장"
    ]

    plt.figure(figsize=(10, 5))

    for keyword in keywords:
        counts = [data_by_date[d].get(keyword, 0) for d in dates]
        plt.plot(dates, counts, marker="o", label=keyword)

    plt.title("주요 키워드 언급량 변화 (3일)")
    plt.xlabel("날짜")
    plt.ylabel("언급량")
    plt.legend()
    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format="png")
    plt.close()
    buf.seek(0)

    return Response(buf.read(), media_type="image/png")


# 워드클라우드
@app.get("/wordcloud")
def wordcloud():
    data_by_date = get_keyword_data()

    total_counts = Counter()
    for day_data in data_by_date.values():
        total_counts.update(day_data)

    wc = WordCloud(
        font_path=FONT_PATH,
        background_color="white",
        width=900,
        height=400
    ).generate_from_frequencies(total_counts)

    buf = io.BytesIO()
    wc.to_image().save(buf, format="PNG")
    buf.seek(0)

    return Response(buf.read(), media_type="image/png")

PRESS_LOGO_MAP = {
    "연합뉴스": "/static/press/연합뉴스_로고.png",
    "한국경제": "/static/press/한국경제_로고.png",
    "매일경제": "/static/press/매일경제_로고.png",
}

def get_press_logo(press: str | None):
    if not press:
        return "/static/press/default.png"
    return PRESS_LOGO_MAP.get(press, "/static/press/default.png")

@app.get("/news")
def get_news():
    """
    테스트용 기사 리스트 API
    - news_info 인덱스에서 기사 조회
    - press 기준으로 로고 매핑
    """

    query = {
        "query": {
            "match_all": {}
        },
        "_source": ["title", "press", "published_at"],
        "size": 20
    }

    res = es.search(index="news_info", body=query)

    news_list = []

    for hit in res["hits"]["hits"]:
        src = hit["_source"]

        press = src.get("press")
        news_list.append({
            "title": src.get("title", "[제목 없음]"),
            "press": press,
            "logo": get_press_logo(press),
            "published_at": src.get("published_at", "")
        })

    return news_list

def render_news_list_html(news_list):
    """
    기사 리스트를 HTML 문자열로 변환
    """
    if not news_list:
        return "<p>표시할 기사가 없습니다.</p>"

    html = ""

    for news in news_list:
        html += f"""
        <div class="news-item">
            <img src="{news['logo']}" class="press-logo">
            <div class="news-text">
                <div class="news-title">{news['title']}</div>
                <div class="news-meta">{news.get('press', '')} · {news.get('published_at', '')}</div>
            </div>
        </div>
        """

    return html
