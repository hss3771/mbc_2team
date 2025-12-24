from elasticsearch import Elasticsearch
import matplotlib.pyplot as plt
from wordcloud import WordCloud

import matplotlib.pyplot as plt
from matplotlib import font_manager, rc

# 한글 폰트 설정 (Windows)
font_path = "C:/Windows/Fonts/malgun.ttf"
font = font_manager.FontProperties(fname=font_path)
rc("font", family=font.get_name())

# 마이너스 기호 깨짐 방지
plt.rcParams["axes.unicode_minus"] = False

es = Elasticsearch("http://localhost:9200")

query = {
    "query": {
        "terms": {
            "date": ["2025-10-10", "2025-10-11", "2025-10-12"]
        }
    },
    "_source": ["date", "keyword", "count"],
    "size": 1000
}

res = es.search(index="issue_keyword_count", body=query)

rows = [
    (
        hit["_source"]["date"],
        hit["_source"]["keyword"],
        hit["_source"]["count"]
    )
    for hit in res["hits"]["hits"]
]

from collections import defaultdict
data_by_date = defaultdict(dict)

for date, keyword, count in rows:
    data_by_date[date][keyword] = count

# print(data_by_date)

# 그래프 
dates = sorted(data_by_date.keys())

keywords = ["물가", "환율", "금리인상", "부동산", "SK하이닉스", "미국금리", "반도체", "한국은행", "환율전망", "주식시장"]

plt.figure(figsize=(10, 5))

for kw in keywords:
    counts = [data_by_date[d].get(kw, 0) for d in dates]
    plt.plot(dates, counts, marker="o", label=kw)

plt.title("주요 키워드 언급량 변화 (3일)")
plt.xlabel("날짜")
plt.ylabel("언급량")
plt.legend()
plt.tight_layout()

plt.savefig("image/keywords_3days_trend.png", dpi=150)
plt.close()

print("3일치 키워드 비교 그래프 저장 완료")


# 워드 클라우드 전 확인
from collections import Counter

total_counts = Counter()

for d in dates:
    total_counts.update(data_by_date[d])

print(total_counts)


# 워드 클라우드
wc = WordCloud(
    font_path="C:/Windows/Fonts/malgun.ttf",  # 한글 필수
    background_color="white",
    width=800,
    height=400
)

wc.generate_from_frequencies(total_counts)

plt.figure(figsize=(10, 5))
plt.imshow(wc, interpolation="bilinear")
plt.axis("off")
plt.tight_layout()

plt.savefig("image/keyword_wordcloud_3days.png", dpi=150)
plt.close()

print("3일치 워드클라우드 이미지 저장 완료")