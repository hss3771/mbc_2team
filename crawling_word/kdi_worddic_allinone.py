import argparse
import csv
import json
import re
import time
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Dict, List, Optional, Tuple

from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait


URL = "https://eiec.kdi.re.kr/material/wordDic.do"

TAB_SECTIONS = {
    "KOR": [""] + list("ㄱㄴㄷㄹㅁㅂㅅㅇㅈㅊㅋㅌㅍㅎ"),
    "ENG": [""] + list("ABCDEFGHIJKLMNOPQRSTUVWXYZ"),
    "NUM": [""] + [str(i) for i in range(10)],
}


@dataclass
class TermRef:
    term_id: str
    tab: str
    section: str
    label: str


# -------------------------
# Driver + Cert bypass
# -------------------------
def build_driver(headless: bool) -> webdriver.Chrome:
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1400,900")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")

    # ✅ 인증서 경고 무시(크롬/셀레니움)
    opts.add_argument("--ignore-certificate-errors")
    opts.add_argument("--ignore-ssl-errors=yes")
    opts.add_argument("--allow-insecure-localhost")
    opts.set_capability("acceptInsecureCerts", True)

    return webdriver.Chrome(options=opts)


def now_ts() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


def bypass_cert_warning_if_any(driver: webdriver.Chrome, timeout: int = 8) -> None:
    """
    Chrome '개인 정보 보호 오류' 화면이면 자동으로 통과 시도.
    - 크롬 경고 페이지 body에 'thisisunsafe' 타이핑 (버튼 클릭보다 안정적)
    """
    end = time.time() + timeout
    while time.time() < end:
        title = (driver.title or "")
        url = (driver.current_url or "")

        is_warn = ("개인 정보 보호 오류" in title) or ("chrome-error://" in url)
        if not is_warn:
            # page_source에 ERR_CERT가 있으면 경고일 가능성
            try:
                if "ERR_CERT" in driver.page_source or "NET::ERR_CERT" in driver.page_source:
                    is_warn = True
            except Exception:
                pass

        if is_warn:
            try:
                body = driver.find_element(By.TAG_NAME, "body")
                body.send_keys("thisisunsafe")
                time.sleep(1.0)
                return
            except Exception:
                time.sleep(0.5)
                continue
        else:
            return


def wait_js_ready(driver: webdriver.Chrome, timeout: int = 30) -> None:
    WebDriverWait(driver, timeout).until(
        lambda d: d.execute_script("return document.readyState") == "complete"
    )
    WebDriverWait(driver, timeout).until(
        lambda d: d.execute_script(
            "return (typeof langTab === 'function') && (typeof langset === 'function') && (typeof getdetail === 'function');"
        )
    )
    WebDriverWait(driver, timeout).until(
        lambda d: d.execute_script("return document.querySelector('#dictionarySecl') !== null;")
    )
    WebDriverWait(driver, timeout).until(
        lambda d: d.execute_script("return document.querySelector('#dicDetail') !== null;")
    )


# -------------------------
# Tab/Section/List
# -------------------------
def set_tab(driver: webdriver.Chrome, tab: str) -> None:
    driver.execute_script(f"langTab('{tab}');")


def set_section(driver: webdriver.Chrome, tab: str, section: str) -> None:
    driver.execute_script(f"langset('{tab}','{section}');")


def collect_term_refs(driver: webdriver.Chrome, pause: float = 0.25) -> List[TermRef]:
    """
    1) 탭/섹션을 돌면서 목록 a[onclick*='getdetail'] 스캔 → term_id 수집
    2) 중복 term_id는 1개만 유지
    """
    refs: Dict[str, TermRef] = {}

    for tab, sections in TAB_SECTIONS.items():
        print(f"\n[LIST] 탭 전환: {tab}")
        set_tab(driver, tab)
        time.sleep(pause)

        for sec in sections:
            set_section(driver, tab, sec)
            time.sleep(pause)

            anchors = driver.find_elements(By.CSS_SELECTOR, "#dictionarySecl a[onclick*='getdetail']")
            if not anchors:
                continue

            for a in anchors:
                onclick = a.get_attribute("onclick") or ""
                if "getdetail" not in onclick or "'" not in onclick:
                    continue
                try:
                    term_id = onclick.split("'")[1]
                except Exception:
                    continue

                label = (a.text or "").strip()

                if term_id and (term_id not in refs):
                    refs[term_id] = TermRef(term_id=term_id, tab=tab, section=sec, label=label)

    return list(refs.values())


# -------------------------
# Detail + STRICT Integrity
# -------------------------
EMAIL_RE = re.compile(r"[\w\.-]+@[\w\.-]+")


def get_detail_texts(driver: webdriver.Chrome) -> Tuple[str, str]:
    dt = driver.execute_script("return document.querySelector('#dicDetail dt')?.innerText || ''") or ""
    dd = driver.execute_script("return document.querySelector('#dicDetail dd')?.innerText || ''") or ""
    return dt.strip(), dd.strip()


def open_detail_via_js(driver: webdriver.Chrome, tab: str, term_id: str) -> None:
    driver.execute_script(f"langTab('{tab}');")
    driver.execute_script(f"getdetail(null,'{term_id}');")


def _norm(s: str) -> str:
    s = (s or "").strip().lower()
    s = re.sub(r"\s+", "", s)
    s = re.sub(r"[()（）\[\]{}<>]", "", s)
    s = re.sub(r"[^0-9a-z가-힣]", "", s)
    return s


def is_keyword_match(expected_label: str, dt: str) -> bool:
    """
    label(목록 텍스트)과 dt(상세 제목)가 정합한지 판단.
    - 정규화 문자열 기준 포함관계/앞부분 토큰 비교
    """
    a = _norm(expected_label)
    b = _norm(dt)
    if not a or not b:
        return False
    if a in b or b in a:
        return True
    if len(a) >= 6 and len(b) >= 6:
        return a[:6] == b[:6]
    return a[:3] == b[:3]


def wait_detail_strict(
    driver: webdriver.Chrome,
    expected_label: str,
    prev_sig: str,
    timeout: int,
    min_content_len: int,
) -> Tuple[str, str, str]:
    """
    ✅ 저장 직전 '절대 불일치 방지' 조건:
    1) dt 비어있지 않음
    2) dd가 최소 길이 이상
    3) dt가 expected_label과 매칭
    4) 이전 signature와 달라서 실제 갱신 확인
    """
    def ready(d) -> bool:
        dt, dd = get_detail_texts(d)
        if not dt:
            return False
        if len(dd) < min_content_len:
            return False
        if not is_keyword_match(expected_label, dt):
            return False
        sig = f"{_norm(dt)}||{_norm(dd)[:120]}"
        return sig != prev_sig

    WebDriverWait(driver, timeout).until(ready)
    dt, dd = get_detail_texts(driver)
    sig = f"{_norm(dt)}||{_norm(dd)[:120]}"
    return dt, dd, sig


# -------------------------
# Checkpoint / Save
# -------------------------
def load_checkpoint(path: Path) -> Dict[str, dict]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        out = {}
        for row in data:
            tid = row.get("term_id")
            if tid:
                out[tid] = row
        return out
    except Exception:
        return {}


def save_checkpoint(rows_by_id: Dict[str, dict], path: Path) -> None:
    rows = list(rows_by_id.values())
    path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")


def save_final(rows: List[dict], outdir: Path, prefix: str) -> Tuple[Path, Path]:
    outdir.mkdir(parents=True, exist_ok=True)
    ts = now_ts()

    json_path = outdir / f"{prefix}_{ts}.json"
    csv_path = outdir / f"{prefix}_{ts}.csv"

    json_path.write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding="utf-8")

    fieldnames = ["term_id", "keyword", "content", "tab", "section", "source", "scraped_at"]
    with csv_path.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=fieldnames)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in fieldnames})

    return json_path, csv_path


# -------------------------
# Debug dump
# -------------------------
def dump_debug(driver: webdriver.Chrome, outdir: Path, term_id: str, tag: str) -> None:
    outdir.mkdir(parents=True, exist_ok=True)
    ts = now_ts()

    html_path = outdir / f"debug_{term_id}_{tag}_{ts}.html"
    png_path = outdir / f"debug_{term_id}_{tag}_{ts}.png"

    try:
        html_path.write_text(driver.page_source, encoding="utf-8", errors="ignore")
    except Exception:
        pass

    try:
        driver.save_screenshot(str(png_path))
    except Exception:
        pass


# -------------------------
# Crawl loop (STRICT)
# -------------------------
def crawl_all_strict(
    driver: webdriver.Chrome,
    refs: List[TermRef],
    outdir: Path,
    limit: Optional[int],
    delay: float,
    timeout: int,
    retries: int,
    checkpoint_every: int,
    min_content_len: int,
    stuck_repeat_threshold: int,
) -> Tuple[List[dict], List[dict]]:
    outdir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = outdir / "checkpoint.json"
    failures_path = outdir / "failures.json"
    debug_dir = outdir / "debug"

    rows_by_id = load_checkpoint(checkpoint_path)
    already = set(rows_by_id.keys())

    if already:
        print(f"[RESUME] 체크포인트 로드: {len(already)}건 이미 수집됨 → 이어서 진행")

    failures: List[dict] = []
    prev_sig = ""
    last_dt_norm = ""
    same_dt_count = 0

    total = len(refs) if limit is None else min(limit, len(refs))
    print(f"[CRAWL] 대상: {total}건 (전체 {len(refs)} 중)")

    done_count = 0
    for idx, ref in enumerate(refs[:total], start=1):
        if ref.term_id in already:
            if idx % 200 == 0:
                print(f"[SKIP] {idx}/{total} (이미 수집됨) term_id={ref.term_id}")
            continue

        print(f"\n[{idx}/{total}] term_id={ref.term_id} tab={ref.tab} sec={ref.section} label='{ref.label}'")

        ok = False
        last_err = ""
        for attempt in range(1, retries + 1):
            try:
                print(f"  - 시도 {attempt}/{retries}: getdetail + STRICT wait(라벨 매칭)")
                open_detail_via_js(driver, ref.tab, ref.term_id)

                dt, dd, sig = wait_detail_strict(
                    driver=driver,
                    expected_label=ref.label,
                    prev_sig=prev_sig,
                    timeout=timeout,
                    min_content_len=min_content_len,
                )

                # stuck 감지: dt가 너무 오래 동일하게 반복되면 refresh
                dt_norm = _norm(dt)
                if dt_norm == last_dt_norm:
                    same_dt_count += 1
                else:
                    same_dt_count = 0
                    last_dt_norm = dt_norm

                if same_dt_count >= stuck_repeat_threshold:
                    print(f"  ⚠️ STUCK 감지(dt 반복 {same_dt_count}) → refresh 후 재시도")
                    dump_debug(driver, debug_dir, ref.term_id, "stuck_before_refresh")
                    driver.refresh()
                    bypass_cert_warning_if_any(driver)
                    wait_js_ready(driver, timeout=timeout)
                    prev_sig = ""
                    same_dt_count = 0
                    time.sleep(max(0.8, delay))
                    continue

                # ✅ 최종 정합성 재확인(이중 안전장치)
                if not is_keyword_match(ref.label, dt):
                    dump_debug(driver, debug_dir, ref.term_id, "mismatch_after_wait")
                    raise RuntimeError(f"IntegrityFail: label='{ref.label}' dt='{dt}'")

                prev_sig = sig

                row = {
                    "term_id": ref.term_id,
                    "keyword": dt,
                    "content": dd,
                    "tab": ref.tab,
                    "section": ref.section,
                    "source": URL,
                    "scraped_at": datetime.now().isoformat(timespec="seconds"),
                }
                rows_by_id[ref.term_id] = row
                already.add(ref.term_id)

                print(f"  ✅ 저장: keyword='{dt}' (content {len(dd)} chars) / label match OK")
                ok = True
                done_count += 1
                break

            except Exception as e:
                last_err = repr(e)
                print(f"  ⚠️ 실패: {last_err}")

                # mismatch면 디버그 덤프
                try:
                    dt_now, dd_now = get_detail_texts(driver)
                    if dt_now and not is_keyword_match(ref.label, dt_now):
                        dump_debug(driver, debug_dir, ref.term_id, "mismatch")
                        print(f"  🧾 mismatch 덤프 저장: label='{ref.label}' dt='{dt_now}'")
                except Exception:
                    pass

                time.sleep(min(2.0, delay) * attempt)

        if not ok:
            dump_debug(driver, debug_dir, ref.term_id, "final_fail")
            failures.append({
                "term_id": ref.term_id,
                "tab": ref.tab,
                "section": ref.section,
                "label": ref.label,
                "error": last_err,
                "at": datetime.now().isoformat(timespec="seconds"),
            })
            failures_path.write_text(json.dumps(failures, ensure_ascii=False, indent=2), encoding="utf-8")
            print("  ❌ 최종 실패 처리(스킵) → failures.json 기록 + debug 저장")

        if (done_count > 0) and (done_count % checkpoint_every == 0):
            print(f"\n[CHECKPOINT] {done_count}건마다 저장 → {checkpoint_path}")
            save_checkpoint(rows_by_id, checkpoint_path)

        time.sleep(delay)

    print(f"\n[CHECKPOINT] 최종 저장 → {checkpoint_path}")
    save_checkpoint(rows_by_id, checkpoint_path)

    return list(rows_by_id.values()), failures


# -------------------------
# Main
# -------------------------
def main():
    p = argparse.ArgumentParser()
    p.add_argument("--outdir", default="out_worddic_strict", help="저장 폴더(새 폴더 추천)")
    p.add_argument("--headless", action="store_true", help="브라우저 창 없이 실행")
    p.add_argument("--limit", type=int, default=0, help="0이면 전체, 아니면 상위 N개만")
    p.add_argument("--delay", type=float, default=0.45, help="요청 간 딜레이(초)")
    p.add_argument("--timeout", type=int, default=80, help="상세 로딩 대기 타임아웃(초)")
    p.add_argument("--retries", type=int, default=5, help="항목당 재시도 횟수")
    p.add_argument("--checkpoint-every", type=int, default=50, help="N건마다 체크포인트 저장")
    p.add_argument("--min-content-len", type=int, default=30, help="본문 최소 길이")
    p.add_argument("--stuck-repeat-threshold", type=int, default=8, help="같은 dt 반복 N회면 refresh")
    args = p.parse_args()

    outdir = Path(args.outdir)
    limit = None if args.limit == 0 else args.limit

    driver = build_driver(headless=args.headless)
    try:
        driver.get(URL)
        bypass_cert_warning_if_any(driver)  # ✅ 인증서 경고 자동 우회
        wait_js_ready(driver)

        print("1) 용어 목록 수집 중...")
        refs = collect_term_refs(driver)
        print(f"   - 수집된 term_id 개수: {len(refs)}")

        print("\n2) 상세 내용 크롤링(STRICT) 중...")
        rows, failures = crawl_all_strict(
            driver,
            refs,
            outdir=outdir,
            limit=limit,
            delay=args.delay,
            timeout=args.timeout,
            retries=args.retries,
            checkpoint_every=args.checkpoint_every,
            min_content_len=args.min_content_len,
            stuck_repeat_threshold=args.stuck_repeat_threshold,
        )

        json_path, csv_path = save_final(rows, outdir=outdir, prefix="kdi_worddic_strict")
        print("\n✅ 완료!")
        print(f"- JSON: {json_path.resolve()}")
        print(f"- CSV : {csv_path.resolve()}")
        print(f"- 실패 건수: {len(failures)} (outdir/failures.json + outdir/debug 참고)")

    finally:
        driver.quit()


if __name__ == "__main__":
    main()
