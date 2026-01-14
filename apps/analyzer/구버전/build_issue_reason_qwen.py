import os
import json
import pandas as pd
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM

# =========================
# CONFIG
# =========================
CSV_PATH = "data/news_with_issue1212.csv"

MODEL_NAME = "Qwen/Qwen2.5-3B-Instruct"   # 사용 중인 모델에 맞춰 변경 가능
OUTPUT_JSON = "issue_keyword_reasons.json"

# 키워드별로 몇 개 기사 쓸지 (요구사항: 20~40)
TOP_K_PER_KEYWORD = 30   # 20~40 사이로 조정

# 모델 입력이 길어질 수 있으니 기사별 "요약/근거 추출" 단계에서 길이 제한
PER_ARTICLE_MAX_CHARS = 1800   # title+content 합쳐서 이 정도만 사용 (너무 길면 잘라냄)

# =========================
# Optional: TF 로그 억제 (원하면)
# =========================
os.environ["TF_CPP_MIN_LOG_LEVEL"] = "2"
os.environ["TF_ENABLE_ONEDNN_OPTS"] = "0"

# =========================
# Load model
# =========================
def load_model(model_name: str):
    tokenizer = AutoTokenizer.from_pretrained(model_name)

    # GPU가 매우 작으면(1060 3GB) 여기서 CPU로 내려가거나 4bit 로딩이 필요할 수 있음.
    # 기본은 auto. (환경 따라 실패하면 아래 주석 참고)
    model = AutoModelForCausalLM.from_pretrained(
        model_name,
        torch_dtype="auto",
        device_map="auto",
    )

    return tokenizer, model

# =========================
# Helpers
# =========================
def safe_str(x):
    return "" if pd.isna(x) else str(x)

def clip_text(title: str, content: str, max_chars: int) -> str:
    t = title.strip()
    c = content.strip()
    merged = f"[제목]\n{t}\n\n[본문]\n{c}"
    return merged[:max_chars]

def chat_generate(tokenizer, model, messages, max_new_tokens=300, temperature=0.2):
    inputs = tokenizer.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_tensors="pt",
        return_dict=True,
    )
    inputs = {k: v.to(model.device) for k, v in inputs.items()}

    with torch.no_grad():
        out = model.generate(
            **inputs,
            max_new_tokens=max_new_tokens,
            temperature=temperature,
            do_sample=(temperature > 0),
        )

    gen = out[0][inputs["input_ids"].shape[-1]:]
    return tokenizer.decode(gen, skip_special_tokens=True).strip()

# =========================
# Stage 1: Map (기사별 근거 추출)
# =========================
def extract_article_rationale(tokenizer, model, issue_keyword: str, title: str, content: str) -> dict:
    text = clip_text(title, content, PER_ARTICLE_MAX_CHARS)

    system = (
        "너는 한국어 경제/시사 뉴스 분석가다. "
        "주어진 기사 내용이 특정 이슈 키워드와 왜 연결되는지, "
        "기사에서 직접 확인되는 근거만으로 짧고 정확하게 정리한다. "
        "추측 금지."
    )

    user = f"""
이슈 키워드: {issue_keyword}

아래 기사에 대해:
1) 이 이슈 키워드와 연결되는 '핵심 이유' 1문장
2) 기사 원문에서 확인되는 '근거 문장' 1~2문장(가능하면 그대로 인용)

반드시 JSON으로만 출력:
{{
  "reason": "...",
  "evidence": ["...", "..."]
}}

기사:
{text}
""".strip()

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    raw = chat_generate(tokenizer, model, messages, max_new_tokens=220, temperature=0.0)

    # JSON 파싱 시도(깨지면 raw 그대로 저장)
    try:
        data = json.loads(raw)
        if not isinstance(data, dict):
            raise ValueError("not dict")
        data.setdefault("reason", "")
        data.setdefault("evidence", [])
        if not isinstance(data["evidence"], list):
            data["evidence"] = [str(data["evidence"])]
        return data
    except Exception:
        return {"reason": "", "evidence": [], "_raw": raw}

# =========================
# Stage 2: Reduce (키워드별 종합 선정 이유)
# =========================
def summarize_issue_reason(tokenizer, model, issue_keyword: str, items: list) -> str:
    # items: [{"title","trust_score","reason","evidence"...}, ...]
    # Reduce 입력을 너무 길게 만들지 않기 위해 간결하게 구성
    lines = []
    for i, it in enumerate(items, start=1):
        title = it.get("title", "")
        score = it.get("trust_score", None)
        reason = it.get("reason", "")
        ev = it.get("evidence", [])
        ev1 = ev[0] if len(ev) > 0 else ""
        lines.append(f"{i}. (trust_score={score}) {title}\n   - reason: {reason}\n   - evidence: {ev1}")

    packed = "\n".join(lines)
    packed = packed[:12000]  # Reduce 입력 상한(환경에 맞춰 조정)

    system = (
        "너는 한국어 경제/시사 뉴스 이슈 큐레이터다. "
        "여러 기사에서 공통적으로 나타나는 '이슈 키워드 선정 이유'를 작성한다. "
        "근거는 제공된 evidence/요약에만 기반하고, 추측 금지."
    )

    user = f"""
이슈 키워드: {issue_keyword}

아래는 해당 키워드로 분류된 기사들의 '이유/근거' 요약이다.
이를 바탕으로 최종 산출물을 작성하라.

요구 출력(마크다운):
- 선정 이유(핵심 주장) 1개: 2~3문장
- 근거 3개: 각 근거는 (기사번호)와 함께 1문장씩
- 경계/주의 1개: 이 키워드가 과대/오분류될 수 있는 조건

입력 요약:
{packed}
""".strip()

    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": user},
    ]

    return chat_generate(tokenizer, model, messages, max_new_tokens=380, temperature=0.0)

# =========================
# Main
# =========================
def main():
    df = pd.read_csv(CSV_PATH)

    # 필요한 필드만
    need_cols = ["title", "content", "issue_keyword", "trust_score", "label"]
    for c in need_cols:
        if c not in df.columns:
            raise ValueError(f"CSV에 '{c}' 컬럼이 없습니다. 현재 컬럼: {list(df.columns)}")

    # label==1 필터 (label이 숫자/문자 혼재 가능성 대비)
    df["label"] = pd.to_numeric(df["label"], errors="coerce")
    df = df[df["label"] == 1].copy()

    # trust_score 정렬
    df["trust_score"] = pd.to_numeric(df["trust_score"], errors="coerce")
    df = df.sort_values("trust_score", ascending=False)

    # issue_keyword별 상위 K개
    grouped = (
        df.groupby("issue_keyword", dropna=False)
          .head(TOP_K_PER_KEYWORD)
          .copy()
    )

    # 모델 로드
    tokenizer, model = load_model(MODEL_NAME)

    results = {}
    for issue_kw, g in grouped.groupby("issue_keyword"):
        issue_kw = safe_str(issue_kw).strip()
        if not issue_kw:
            issue_kw = "_EMPTY_ISSUE_KEYWORD_"

        g = g.sort_values("trust_score", ascending=False).copy()

        # Map: 기사별 rationale 추출
        items = []
        for _, row in g.iterrows():
            title = safe_str(row["title"])
            content = safe_str(row["content"])
            ts = float(row["trust_score"]) if pd.notna(row["trust_score"]) else None

            r = extract_article_rationale(tokenizer, model, issue_kw, title, content)

            items.append({
                "title": title[:200],
                "trust_score": ts,
                "reason": r.get("reason", ""),
                "evidence": r.get("evidence", []),
                "_raw": r.get("_raw", None),
            })

        # Reduce: 키워드 선정 이유 종합
        summary = summarize_issue_reason(tokenizer, model, issue_kw, items)

        results[issue_kw] = {
            "top_k_used": len(items),
            "articles": items,
            "issue_reason_markdown": summary,
        }

        print(f"[DONE] {issue_kw} (n={len(items)})")

    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    print("Saved:", OUTPUT_JSON)


if __name__ == "__main__":
    main()
