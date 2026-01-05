import io
from collections import Counter
from wordcloud import WordCloud


def generate_keyword_wordcloud(freq: dict, font_path: str) -> bytes:
    if not freq:
        freq = {"데이터없음": 1}

    wc = WordCloud(
        font_path=font_path,
        background_color="white",
        width=900,
        height=400,
    ).generate_from_frequencies(Counter(freq))

    img = wc.to_image()
    buf = io.BytesIO()
    img.save(buf, format="PNG")
    buf.seek(0)
    return buf.read()
