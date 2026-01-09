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