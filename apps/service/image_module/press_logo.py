from typing import Optional

PRESS_LOGO_MAP = {
    "연합뉴스": "/upload/연합뉴스_로고.png",
    "한국경제": "/upload/한국경제_로고.png",
    "매일경제": "/upload/매일경제_로고.png",
    "서울경제": "/upload/서울경제_로고.png",
    "이데일리": "/upload/이데일리_로고.png",
    "아시아경제": "/upload/아시아경제_로고.png",
    "조선일보": "/upload/조선일보_로고.png",
    "중앙일보": "/upload/중앙일보_로고.png",
    "동아일보": "/upload/동아일보_로고.png",
    "한겨레신문": "/upload/한겨레신문_로고.png",
    "경향신문": "/upload/경향신문_로고.png",
    "뉴스1": "/upload/뉴스1_로고.png",
    "뉴시스": "/upload/뉴시스_로고.png",
}

DEFAULT_LOGO = "/upload/default.png"


def get_press_logo(press: Optional[str]) -> str:
    if not press:
        return DEFAULT_LOGO
    return PRESS_LOGO_MAP.get(press, DEFAULT_LOGO)