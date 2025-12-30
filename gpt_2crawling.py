import argparse
import csv
import json
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


def build_driver(headless: bool) -> webdriver.Chrome:
    opts = Options()
    if headless:
        opts.add_argument("--headless=new")
    opts.add_argument("--window-size=1400,900")
    opts.add_argument("--disable-gpu")
    opts.add_argument("--no-sandbox")
    opts.add_argument("--disable-dev-shm-usage")
    return webdriver.Chrome(options=opts)


def now_ts() -> str:
    return datetime.now().strftime("%Y%m%d_%H%M%S")


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


def set_tab(driver: webdriver.Chrome, tab: str) -> None:
    driver.execute_script(f"langTab('{tab}');")


def set_section(driver: webdriver.Chrome, tab: str, section: str) -> None:
    driver.execute_script(f"langset('{tab}','{section}');")


def collect_term_refs(driver: webdriver.Chrome, pause: float = 0.25) -> List[TermRef]:
    """
    1) 탭/섹션을 돌면서 목록 a[onclick*='getdetail']를 스캔해 term_id를 모음
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

            # 목록에서 onclick에 getdetail 들어간 a 수집
            anchors = driver.find_elements(By.CSS_SELECTOR, "#dictionarySecl a[onclick*='getdetail']")
            if not anchors:
                continue

            for a in anchors:
                onclick = a.get_attribute("onclick") or ""
                # onclick 예: getdetail(this,'12345')
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


def get_detail_texts(driver: webdriver.Chrome) -> Tuple[str, str]:
    dt = driver.execute_script("return document.querySelector('#dicDetail dt')?.innerText || ''") or ""
    dd = driver.execute_script("return document.querySelector('#dicDetail dd')?.innerText || ''") or ""
    return dt.strip(), dd.strip()


def open_detail_via_js(driver: webdriver.Chrome, tab: str, term_id: str) -> None:
    # 탭 맞춘 뒤, 목록 클릭 없이 getdetail 직접 호출 (가장 안정적)
    driver.execute_script(f"langTab('{tab}');")
    driver.execute_script(f"getdetail(null,'{term_id}');")


def wait_detail_loaded(driver: webdriver.Chrome, prev_sig: str, timeout: int) -> str:
    """
    상세영역이 로딩되면 (dt+dd)가 비어있지 않게 되고, 이전 signature와 달라짐.
    """
    def ready(d) -> bool:
        dt, dd = get_detail_texts(d)
        if not dt:
            return False
        sig = f"{dt}||{dd[:80]}"
        return sig != prev_sig

    WebDriverWait(driver, timeout).until(ready)
    dt, dd = get_detail_texts(driver)
    return f"{dt}||{dd[:80]}"


def load_checkpoint(path: Path) -> Dict[str, dict]:
    if not path.exists():
        return {}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
        # term_id 기준 dict로 관리
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


def crawl_all(
    driver: webdriver.Chrome,
    refs: List[TermRef],
    outdir: Path,
    limit: Optional[int],
    delay: float,
    timeout: int,
    retries: int,
    checkpoint_every: int,
) -> Tuple[List[dict], List[dict]]:
    """
    - 성공: rows
    - 실패: failures (term_id/tab/label/error)
    """
    outdir.mkdir(parents=True, exist_ok=True)
    checkpoint_path = outdir / "checkpoint.json"
    failures_path = outdir / "failures.json"

    rows_by_id = load_checkpoint(checkpoint_path)
    already = set(rows_by_id.keys())

    if already:
        print(f"[RESUME] 체크포인트 로드: {len(already)}건 이미 수집됨 → 이어서 진행")

    failures: List[dict] = []
    prev_sig = ""  # 상세 signature

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
                print(f"  - 시도 {attempt}/{retries}: getdetail JS 호출")
                open_detail_via_js(driver, ref.tab, ref.term_id)
                sig = wait_detail_loaded(driver, prev_sig=prev_sig, timeout=timeout)
                dt, dd = get_detail_texts(driver)
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

                print(f"  ✅ 성공: keyword='{dt}' (content {len(dd)} chars)")
                ok = True
                done_count += 1
                break

            except Exception as e:
                last_err = repr(e)
                print(f"  ⚠️ 실패: {last_err}")
                # 백오프
                time.sleep(min(2.0, delay) * attempt)

        if not ok:
            failures.append({
                "term_id": ref.term_id,
                "tab": ref.tab,
                "section": ref.section,
                "label": ref.label,
                "error": last_err,
                "at": datetime.now().isoformat(timespec="seconds"),
            })
            failures_path.write_text(json.dumps(failures, ensure_ascii=False, indent=2), encoding="utf-8")
            print("  ❌ 최종 실패 처리(스킵) → failures.json에 기록")

        # 체크포인트 저장
        if (done_count > 0) and (done_count % checkpoint_every == 0):
            print(f"\n[CHECKPOINT] {done_count}건마다 저장 → {checkpoint_path}")
            save_checkpoint(rows_by_id, checkpoint_path)

        time.sleep(delay)

    # 마지막 저장
    print(f"\n[CHECKPOINT] 최종 저장 → {checkpoint_path}")
    save_checkpoint(rows_by_id, checkpoint_path)

    return list(rows_by_id.values()), failures


def main():
    p = argparse.ArgumentParser()
    p.add_argument("--outdir", default="out_worddic", help="저장 폴더")
    p.add_argument("--headless", action="store_true", help="브라우저 창 없이 실행")
    p.add_argument("--limit", type=int, default=0, help="0이면 전체, 아니면 상위 N개만")
    p.add_argument("--delay", type=float, default=0.35, help="요청 간 딜레이(초)")
    p.add_argument("--timeout", type=int, default=60, help="상세 로딩 대기 타임아웃(초)")
    p.add_argument("--retries", type=int, default=3, help="항목당 재시도 횟수")
    p.add_argument("--checkpoint-every", type=int, default=50, help="N건마다 체크포인트 저장")
    args = p.parse_args()

    outdir = Path(args.outdir)
    limit = None if args.limit == 0 else args.limit

    driver = build_driver(headless=args.headless)
    try:
        driver.get(URL)
        wait_js_ready(driver)

        print("1) 용어 목록 수집 중...")
        refs = collect_term_refs(driver)
        print(f"   - 수집된 term_id 개수: {len(refs)}")

        print("\n2) 상세 내용 크롤링 중...")
        rows, failures = crawl_all(
            driver,
            refs,
            outdir=outdir,
            limit=limit,
            delay=args.delay,
            timeout=args.timeout,
            retries=args.retries,
            checkpoint_every=args.checkpoint_every,
        )

        json_path, csv_path = save_final(rows, outdir=outdir, prefix="kdi_worddic")
        print("\n✅ 완료!")
        print(f"- JSON: {json_path.resolve()}")
        print(f"- CSV : {csv_path.resolve()}")
        print(f"- 실패 건수: {len(failures)} (outdir/failures.json 참고)")

    finally:
        driver.quit()


if __name__ == "__main__":
    main()
