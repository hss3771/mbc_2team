import io
import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt


def generate_keyword_trend_graph(data_by_date: dict) -> bytes:
    if not data_by_date:
        plt.figure(figsize=(8, 4))
        plt.text(0.5, 0.5, "데이터 없음", ha="center", va="center")
        plt.axis("off")
        buf = io.BytesIO()
        plt.savefig(buf, format="png")
        plt.close()
        buf.seek(0)
        return buf.read()

    dates = sorted(data_by_date.keys())
    keywords = sorted({k for d in data_by_date.values() for k in d.keys()})

    plt.figure(figsize=(10, 5))
    for k in keywords:
        y = [data_by_date[d].get(k, 0) for d in dates]
        plt.plot(dates, y, marker="o", label=k)

    plt.title("키워드 언급량 변화")
    plt.xlabel("날짜")
    plt.ylabel("언급량")
    plt.legend()
    plt.tight_layout()

    buf = io.BytesIO()
    plt.savefig(buf, format="png")
    plt.close()
    buf.seek(0)
    return buf.read()