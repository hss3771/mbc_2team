from fastapi import APIRouter
from apps.service.article_module.article_service import get_articles_by_sentiment

router = APIRouter(
    prefix="/articles",
    tags=["Articles"]
)


@router.get("/by-sentiment")
def articles_by_sentiment(
    sentiment: str,          # positive | neutral | negative
    date: str,
    page: int = 1,
    size: int = 10,
    orderby: str = "latest"  # latest | score
):
    return get_articles_by_sentiment(
        sentiment,
        date,
        page,
        size,
        orderby
    )

# ====== 그래프(도넛 차트) ======
from apps.service.article_module.article_service import get_sentiment_stats


@router.get("/sentiment-stats")
def sentiment_stats(
    keyword: str,
    date: str
):
    return get_sentiment_stats(keyword, date)