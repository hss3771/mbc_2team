# preprocess_aihub_trust.py
"""
AI-Hub 낚시성 기사 탐지 데이터 구조에 맞춰서 JSON → CSV로 변환

- sourceDataInfo.newsTitle
- sourceDataInfo.newsContent (요약본)
- sentenceInfo[*].sentenceContent (실제 본문)
- useType (0=낚시, 1=정상)

⚙️ 추가: 파일이 너무 많을 경우, 최대 MAX_FILES 개까지만 처리
"""

import os
import json
import glob
import pandas as pd

# ===== 설정 =====
RAW_DIR = "data/fake_news_data/146.낚시성 기사 탐지 데이터/01-1.정식개방데이터/Training/01.원천데이터"
OUTPUT_CSV = "data/train_trust.csv"

CATEGORY_FILTER = "경제"   # 경제 기사만 사용 (전체 사용하려면 None)
MAX_FILES = 1000          # ⚠️ 처리할 JSON 파일 최대 개수


def safe_get(d, key, default=""):
    v = d.get(key, default)
    if v is None:
        return ""
    return str(v)


def clean_text(x):
    return " ".join(str(x).replace("\n", " ").replace("\r", " ").split())


def extract_content(item):
    """본문 텍스트 생성: sentenceInfo를 모두 합치기"""
    sentences = item.get("sentenceInfo", [])
    if isinstance(sentences, list) and len(sentences) > 0:
        all_sent = []
        for s in sentences:
            text = s.get("sentenceContent", "")
            if text:
                all_sent.append(clean_text(text))
        return " ".join(all_sent)

    # sentenceInfo 없으면 newsContent라도 반환
    return clean_text(item.get("newsContent", ""))


def main():
    # 모든 JSON 파일 목록
    json_paths = sorted(glob.glob(os.path.join(RAW_DIR, "*.json")))
    if not json_paths:
        print(f"[ERROR] {RAW_DIR} 에서 JSON 파일을 찾지 못했습니다.")
        return

    # ⚠️ 최대 MAX_FILES 개까지만 사용
    if len(json_paths) > MAX_FILES:
        print(f"[INFO] JSON 파일이 {len(json_paths)}개 있습니다. 그 중 상위 {MAX_FILES}개만 사용합니다.")
        json_paths = json_paths[:MAX_FILES]
    else:
        print(f"[INFO] JSON 파일 개수: {len(json_paths)}개 (모두 사용)")

    rows = []

    for path in json_paths:
        with open(path, "r", encoding="utf-8") as f:
            data = json.load(f)

        # 실제 데이터는 sourceDataInfo 안에 들어 있음
        item = data.get("sourceDataInfo", None)
        if item is None:
            continue

        category = safe_get(item, "newsCategory")
        if CATEGORY_FILTER is not None:
            if category != CATEGORY_FILTER:
                continue

        title = clean_text(safe_get(item, "newsTitle"))

        # sentenceInfo 기반 본문 생성
        content = extract_content(item)

        use_type = item.get("useType", None)
        if use_type not in [0, 1]:
            continue  # 0=낚시, 1=정상만 사용

        rows.append({
            "title": title,
            "content": content,
            "label": int(use_type)
        })

    if not rows:
        print("[ERROR] 유효한 샘플이 없습니다. 필터 조건이나 MAX_FILES를 확인하세요.")
        return

    df = pd.DataFrame(rows)

    print("[INFO] 총 샘플 수:", len(df))
    print("[INFO] 라벨 분포:")
    print(df["label"].value_counts())

    os.makedirs(os.path.dirname(OUTPUT_CSV), exist_ok=True)
    df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    print(f"[SAVE] train_trust.csv 생성 완료 -> {OUTPUT_CSV}")


if __name__ == "__main__":
    main()
