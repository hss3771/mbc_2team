from wordcloud import WordCloud
import matplotlib.pyplot as plt
import io

def generate_issue_wordcloud(sub_keywords: list[dict]) -> bytes:
    """
    sub_keywords:
    [
        {"keyword": "금리", "score": 0.23},
        {"keyword": "환율", "score": 0.18},
        ...
    ]
    """

    freq = {
        item["keyword"]: item.get("score", 1)
        for item in sub_keywords
    }

    wc = WordCloud(
        font_path="C:/Windows/Fonts/malgun.ttf",
        background_color="white",
        width=800,
        height=400,
    ).generate_from_frequencies(freq)

    buf = io.BytesIO()
    plt.figure(figsize=(10, 5))
    plt.imshow(wc, interpolation="bilinear")
    plt.axis("off")
    plt.savefig(buf, format="png", bbox_inches="tight")
    plt.close()

    buf.seek(0)
    return buf.read()
