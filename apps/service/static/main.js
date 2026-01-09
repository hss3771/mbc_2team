// #region 확인끝
// #region ===== 전역변수 =====
let KEYWORDS = [];

// dropdownApi는 selectKeyword에서 쓰므로 위에 선언 (TDZ 방지)
let dropdownApi = null;

const SUMMARY_MAP = {
  "주식": ["(샘플) 요약/선정이유 영역입니다.", "실제 서버 요약으로 교체하세요."],
};

const ts3Root = document.getElementById('main3');
const ts3KlistEl = ts3Root?.querySelector(".ts3-klist");
const ts3WordTag = ts3Root.querySelector('#ts3WordTag');
const ts3DonutTag = ts3Root.querySelector('#ts3DonutTag');
const ts3DonutEl = ts3Root.querySelector('#ts3Donut');
const ts3CloudEl = ts3Root.querySelector('#ts3WordCloud');
const ts3Canvas = document.getElementById('ts3LineCanvas');
const ts3Placeholder = ts3Root.querySelector('.ts3-placeholder');
const btns = Array.from(ts3Root.querySelectorAll('.ts3-kbtn'));
// #endregion

// #region ===== DOM =====
const rankListEl = document.getElementById("rankList");
const summaryKeywordEl = document.getElementById("summaryKeyword");
const summaryListEl = document.getElementById("summaryList");
const segmentedBtns = Array.from(document.querySelectorAll(".seg-btn"));
const startDateEl = document.getElementById("startDate");
const endDateEl = document.getElementById("endDate");

// #endregion

// #region ===== util =====
// 날짜 유틸
function pad2(n) { return String(n).padStart(2, "0"); }
function toISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
function parseISO(iso) {
    if (!iso) return null;
    const d = new Date(iso + "T00:00:00");
    return Number.isNaN(d.getTime()) ? null : d;
}
function normalize(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
}
function addDays(d, days) {
    const x = normalize(d);
    x.setDate(x.getDate() + days);
    return x;
}

function daysInMonth(y, m) {
    return new Date(y, m + 1, 0).getDate(); // m: 0~11
}

function addYearsClamp(date, deltaYears) {
    const d = normalize(date);
    const y = d.getFullYear() + deltaYears;
    const m = d.getMonth();
    const day = d.getDate();

    const last = daysInMonth(y, m);
    return new Date(y, m, Math.min(day, last));
}

function clearSegActive() {
  segmentedBtns.forEach((b) => {
    b.classList.remove("is-active");
    b.setAttribute("aria-selected", "false");
  });
}

function setSegActive(grain) {
  segmentedBtns.forEach((b) => {
    const on = b.dataset.grain === grain;
    b.classList.toggle("is-active", on);
    b.setAttribute("aria-selected", on ? "true" : "false");
  });
}

function addMonthsClamp(date, deltaMonths) {
    const d = normalize(date);
    const y = d.getFullYear();
    const m = d.getMonth();
    const day = d.getDate();

    const target = new Date(y, m + deltaMonths, 1);
    const ty = target.getFullYear();
    const tm = target.getMonth();
    const last = daysInMonth(ty, tm);

    return new Date(ty, tm, Math.min(day, last));
}

// ===== mode 결정 =====
function getActiveMode() {
  // 버튼이 활성화면 day/week/month/year, 아니면 자유기간 range
  return document.querySelector(".seg-btn.is-active")?.dataset.grain || "range";
}
function getActiveGrainForChart() {
  // 차트 라벨은 seg 활성 기준으로, 없으면 "day"로 표시(원하면 range->day로 둬도 OK)
  return document.querySelector(".seg-btn.is-active")?.dataset.grain || "day";
}

// #region ===== donut util =====
function getDonutWrap() {
    if (!ts3DonutEl) return null;
    return ts3DonutEl.closest(".ts3-donutwrap") || ts3DonutEl.parentElement;
}

function clearDonutLabels() {
    const wrap = getDonutWrap();
    if (!wrap) return;
    wrap.querySelectorAll(".donut-anno").forEach((el) => el.remove());
}

function renderDonutPercentLabels(pPos, pNeu, pNeg) {
    if (!ts3DonutEl) return;

    const wrap = getDonutWrap();
    if (!wrap) return;

    clearDonutLabels();

    const segments = [
        { name: "긍정", pct: Number(pPos) || 0 },
        { name: "중립", pct: Number(pNeu) || 0 },
        { name: "부정", pct: Number(pNeg) || 0 },
    ].filter((s) => s.pct > 0);

    if (!segments.length) return;

    const wrapRect = wrap.getBoundingClientRect();
    const donutRect = ts3DonutEl.getBoundingClientRect();

    const w = wrapRect.width;
    const h = wrapRect.height;

    if (!w || !h || !donutRect.width || !donutRect.height) {
        requestAnimationFrame(() => renderDonutPercentLabels(pPos, pNeu, pNeg));
        return;
    }

    // donut 중심을 wrap 좌표로 변환
    const cx = (donutRect.left - wrapRect.left) + donutRect.width / 2;
    const cy = (donutRect.top - wrapRect.top) + donutRect.height / 2;

    const size = Math.min(donutRect.width, donutRect.height);

    // wrap이 기준이 되게
    const csWrap = getComputedStyle(wrap);
    if (csWrap.position === "static") wrap.style.position = "relative";

    // ✅ wrap 밖으로 절대 안 나가게
    wrap.style.overflow = "hidden";

    // 거리 튜닝
    const rOuter = size * 0.50;
    const rTick  = rOuter + 10;
    const rLabel = rOuter + 26;
    const xGap   = 16;
    const margin = 8;

    const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("donut-anno");
    svg.setAttribute("width", String(w));
    svg.setAttribute("height", String(h));
    svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
    svg.style.position = "absolute";
    svg.style.left = "0";
    svg.style.top = "0";
    svg.style.pointerEvents = "none";

    let acc = 0;

    segments.forEach((seg) => {
        const startDeg = acc * 3.6;
        const endDeg = (acc + seg.pct) * 3.6;
        const midDeg = (startDeg + endDeg) / 2;
        acc += seg.pct;

        const rad = (midDeg - 90) * (Math.PI / 180);

        const x1 = cx + rOuter * Math.cos(rad);
        const y1 = cy + rOuter * Math.sin(rad);

        const x2 = cx + rTick * Math.cos(rad);
        const y2 = cy + rTick * Math.sin(rad);

        const isRight = x2 >= cx;

        let x3 = cx + rLabel * Math.cos(rad) + (isRight ? xGap : -xGap);
        let y3 = cy + rLabel * Math.sin(rad);

        // ✅ wrap 경계 안으로 가둠
        x3 = clamp(x3, margin, w - margin);
        y3 = clamp(y3, margin, h - margin);

        const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
        poly.setAttribute("points", `${x1},${y1} ${x2},${y2} ${x3},${y3}`);
        poly.setAttribute("fill", "none");
        poly.setAttribute("stroke", "#111");
        poly.setAttribute("stroke-width", "1.5");
        poly.setAttribute("stroke-linecap", "round");
        poly.setAttribute("stroke-linejoin", "round");
        svg.appendChild(poly);

        const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
        text.textContent = `${seg.pct}%`;

        const tx = clamp(x3 + (isRight ? 6 : -6), margin, w - margin);
        const ty = clamp(y3 + 4, margin, h - margin);

        text.setAttribute("x", String(tx));
        text.setAttribute("y", String(ty));
        text.setAttribute("font-size", "12");
        text.setAttribute("font-weight", "700");
        text.setAttribute("fill", "#111");
        text.setAttribute("text-anchor", isRight ? "start" : "end");
        svg.appendChild(text);
    });

    wrap.appendChild(svg);
}
// #endregion

// #endregion

// #region ===== 랭킹 렌더 유틸 =====
function fmtRate(n) {
  if (n === null || n === undefined) return "-";
  const num = Number(n);
  const sign = num > 0 ? "+" : "";
  return `${sign}${num}%`;
}
function rateClass(n) {
    if (n === null || n === undefined) return "is-flat";
    const num = Number(n);
    if (num > 0) return "is-up";
    if (num < 0) return "is-down";
    return "is-flat";
}

function moveText(badge, rankChange) {
  if (!badge) return "-"; // range 등 비교 없음
  if (badge === "NEW") return "NEW";
  if (badge === "UP") return `▲${Math.abs(Number(rankChange || 0))}`;
  if (badge === "DOWN") return `▼${Math.abs(Number(rankChange || 0))}`;
  return "-";
}

function moveClassByBadge(badge) {
  if (!badge) return "is-flat";
  if (badge === "NEW") return "is-new";
  if (badge === "UP") return "is-up";
  if (badge === "DOWN") return "is-down";
  return "is-flat";
}

function renderRanking(selectedKeyword) {
  if (!rankListEl) return;
  rankListEl.innerHTML = "";

  const top = KEYWORDS.slice(0, 10);
  if (!top.length) {
    rankListEl.innerHTML = `
      <div class="rank-empty">
        <div class="rank-empty-title">해당 기간의 랭킹 데이터가 없어요</div>
        <div class="rank-empty-sub">기간을 바꿔 다시 시도해보세요.</div>
      </div>`;
    return;
  }

  top.forEach((k) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "rank-row rank-item" + (k.keyword === selectedKeyword ? " is-selected" : "");
    row.setAttribute("role", "listitem");

    row.innerHTML = `
      <div class="c-rank"><span class="rank-badge">${k.rank ?? "-"}</span></div>
      <div class="c-keyword">${k.keyword ?? "-"}</div>
      <div class="c-count">${k.count ?? "-"}</div>
      <div class="c-rate ${rateClass(k.change_rate)}">${fmtRate(k.change_rate)}</div>
      <div class="c-move ${moveClassByBadge(k.badge)}">${moveText(k.badge, k.rank_change)}</div>
    `;

    row.addEventListener("click", () => selectKeyword(k.keyword));
    rankListEl.appendChild(row);
  });
}
// #endregion

// ===== 요약 렌더링 =====
function renderSummary(keyword) {
    if (!summaryKeywordEl || !summaryListEl) return;

    summaryKeywordEl.textContent = keyword;
    summaryListEl.innerHTML = "";

    const items = SUMMARY_MAP[keyword] || SUMMARY_MAP["주식"];
    items.forEach((txt) => {
        const li = document.createElement("li");
        li.textContent = txt;
        summaryListEl.appendChild(li);
    });
}




// #region ===== 키워드 선택(랭킹/드롭다운 공통) =====
function selectKeyword(keyword) {
    renderRanking(keyword);
    renderSummary(keyword);
    dropdownApi?.setValue(keyword); // 랭킹 클릭 시 드롭다운도 변경
    window.ts2Api?.setKeyword(keyword);
    window.ts3Api?.setKeyword(keyword);
}
window.selectKeyword = selectKeyword;

// =====================================================
// 1) 키워드 드롭다운 (이벤트 위임 방식 → 옵션 재생성해도 OK)
// =====================================================
(function () {
    const root = document.getElementById('keywordDropdown');
    if (!root) return;

    // =========================================================
    // ✅ 도넛 퍼센트 라벨(바깥 % 표기) 유틸
    // =========================================================
    

    

    function renderDonutPercentLabels(pPos, pNeu, pNeg) {
        if (!ts3DonutEl) return;

        const wrap = getDonutWrap();
        if (!wrap) return;

        clearDonutLabels();

        const segments = [
            { name: "긍정", pct: Number(pPos) || 0 },
            { name: "중립", pct: Number(pNeu) || 0 },
            { name: "부정", pct: Number(pNeg) || 0 },
        ].filter((s) => s.pct > 0);

        if (!segments.length) return;

        const wrapRect = wrap.getBoundingClientRect();
        const donutRect = ts3DonutEl.getBoundingClientRect();

        const w = wrapRect.width;
        const h = wrapRect.height;

        if (!w || !h || !donutRect.width || !donutRect.height) {
            requestAnimationFrame(() => renderDonutPercentLabels(pPos, pNeu, pNeg));
            return;
        }

        // donut 중심을 wrap 좌표로 변환
        const cx = (donutRect.left - wrapRect.left) + donutRect.width / 2;
        const cy = (donutRect.top - wrapRect.top) + donutRect.height / 2;

        const size = Math.min(donutRect.width, donutRect.height);

        // wrap이 기준이 되게
        const csWrap = getComputedStyle(wrap);
        if (csWrap.position === "static") wrap.style.position = "relative";

        // ✅ wrap 밖으로 절대 안 나가게
        wrap.style.overflow = "hidden";

        // 거리 튜닝
        const rOuter = size * 0.50;
        const rTick  = rOuter + 10;
        const rLabel = rOuter + 26;
        const xGap   = 16;
        const margin = 8;

        const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

        const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
        svg.classList.add("donut-anno");
        svg.setAttribute("width", String(w));
        svg.setAttribute("height", String(h));
        svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
        svg.style.position = "absolute";
        svg.style.left = "0";
        svg.style.top = "0";
        svg.style.pointerEvents = "none";

        let acc = 0;

        segments.forEach((seg) => {
            const startDeg = acc * 3.6;
            const endDeg = (acc + seg.pct) * 3.6;
            const midDeg = (startDeg + endDeg) / 2;
            acc += seg.pct;

            const rad = (midDeg - 90) * (Math.PI / 180);

            const x1 = cx + rOuter * Math.cos(rad);
            const y1 = cy + rOuter * Math.sin(rad);

            const x2 = cx + rTick * Math.cos(rad);
            const y2 = cy + rTick * Math.sin(rad);

            const isRight = x2 >= cx;

            let x3 = cx + rLabel * Math.cos(rad) + (isRight ? xGap : -xGap);
            let y3 = cy + rLabel * Math.sin(rad);

            // ✅ wrap 경계 안으로 가둠
            x3 = clamp(x3, margin, w - margin);
            y3 = clamp(y3, margin, h - margin);

            const poly = document.createElementNS("http://www.w3.org/2000/svg", "polyline");
            poly.setAttribute("points", `${x1},${y1} ${x2},${y2} ${x3},${y3}`);
            poly.setAttribute("fill", "none");
            poly.setAttribute("stroke", "#111");
            poly.setAttribute("stroke-width", "1.5");
            poly.setAttribute("stroke-linecap", "round");
            poly.setAttribute("stroke-linejoin", "round");
            svg.appendChild(poly);

            const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
            text.textContent = `${seg.pct}%`;

            const tx = clamp(x3 + (isRight ? 6 : -6), margin, w - margin);
            const ty = clamp(y3 + 4, margin, h - margin);

            text.setAttribute("x", String(tx));
            text.setAttribute("y", String(ty));
            text.setAttribute("font-size", "12");
            text.setAttribute("font-weight", "700");
            text.setAttribute("fill", "#111");
            text.setAttribute("text-anchor", isRight ? "start" : "end");
            svg.appendChild(text);
        });

        wrap.appendChild(svg);
    }


    const btn = root.querySelector('.cselect__btn');
    const list = root.querySelector('.cselect__list'); // ✅ 추가
    const valueEl = root.querySelector('.cselect__value');
    const hidden = root.querySelector('input[type="hidden"]');
    const options = Array.from(root.querySelectorAll('.cselect__opt'));

    let activeIndex = 0; // ✅ 추가(아래에서 사용하니까)

    if (!btn || !list || !valueEl || options.length === 0) return;

    function close() {
        root.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
    }

    function toggle() {
        root.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', root.classList.contains('is-open') ? 'true' : 'false');
    }

    function applyValue(v) {
        options.forEach(o => {
            const isMatch = (o.dataset.value ?? o.textContent.trim()) === v;
            o.classList.toggle('is-selected', isMatch);
            if (isMatch) o.setAttribute('aria-selected', 'true');
            else o.removeAttribute('aria-selected');
        });

        valueEl.textContent = v;
        if (hidden) hidden.value = v;

        const idx = options.findIndex(o => (o.dataset.value ?? o.textContent.trim()) === v);
        if (idx >= 0) activeIndex = idx; // ✅ 이제 안전
    }

    options.forEach(opt => {
        opt.addEventListener('click', () => {
            const v = opt.dataset.value ?? opt.textContent.trim();
            applyValue(v);
            close();
            selectKeyword(v);
        });
    });

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggle();
    });

    document.addEventListener('click', (e) => {
        if (!root.contains(e.target)) close();
    });

    dropdownApi = { setValue(v) { applyValue(v); } };

    const initial = (hidden?.value || valueEl.textContent || "주식").trim();
    applyValue(initial);
})();

// 드롭다운 옵션을 랭킹 키워드로 재생성
function rebuildKeywordDropdownFromRanking(items) {
  const root = document.getElementById("keywordDropdown");
  if (!root) return;
  const list = root.querySelector(".cselect__list");
  if (!list) return;

  list.innerHTML = items.slice(0, 10).map((it, idx) => `
    <li class="cselect__opt ${idx === 0 ? "is-selected" : ""}"
        role="option"
        data-value="${it.keyword}"
        aria-selected="${idx === 0 ? "true" : "false"}">${it.keyword}</li>
  `).join("");

  // 현재 값이 items에 없으면 1위로
  const current = root.querySelector(".cselect__value")?.textContent?.trim();
  const first = items[0]?.keyword;
  if (first && (!current || !items.some(x => x.keyword === current))) {
    dropdownApi?.setValue(first);
  }
}


// #endregion

// #endregion
// 초기 렌더는 무조건 1번 실행 (TOP10 첫 로드부터 보이게)
const bootKeyword =
    (document.querySelector('#keywordDropdown input[type="hidden"]')?.value ||
        document.querySelector('#keywordDropdown .cselect__value')?.textContent ||
        '주식').trim();

selectKeyword(bootKeyword);



// =====================================================
// 2) 랭킹 API fetch + UI 동기화
// =====================================================
async function fetchRankingAndRender({ keepSelected = true } = {}) {
    const range = window.getAppRange?.() || {};
    const mode = getActiveMode();
    const start = range.start;
    const end = range.end;

    if (!start || !end) return;

    const qs = new URLSearchParams({ mode, start, end, size: "10" });
    const res = await fetch(`/api/keywords/ranking?${qs.toString()}`, { method: "GET" });

    if (!res.ok) {
        const msg = await res.text().catch(() => "");
        console.error("[ranking] fetch failed:", res.status, msg);
        alert("랭킹 조회에 실패했습니다.");
        return;
    }

    const data = await res.json();
    const items = Array.isArray(data?.items) ? data.items : [];

    KEYWORDS = items;

    // ✅ (1) 드롭다운 옵션 재생성
    rebuildKeywordDropdownFromRanking(items);

    // ✅ (2) TS3 키워드 버튼 재생성
    ts3Api?.rebuildButtons?.(items);

    // ✅ 선택 키워드 유지(없으면 1위)
    const prev = keepSelected ? summaryKeywordEl?.textContent?.trim() : null;
    const fallback = items[0]?.keyword || "선택된 키워드 없음";
    const currentSelected = (prev && items.some(x => x.keyword === prev)) ? prev : fallback;

    selectKeyword(currentSelected);
}

// app:rangechange 시 랭킹 다시 불러오기
document.addEventListener("app:rangechange", () => {
  fetchRankingAndRender({ keepSelected: true });
});





// ===== 증감률/변동 안내 툴팁 (각 has-tip 안에서만 토글) =====
(function () {
    const wraps = document.querySelectorAll('.has-tip');
    if (!wraps.length) return;

    function closeAll() {
        wraps.forEach(w => {
            const btn = w.querySelector('.info-btn');
            const tip = w.querySelector('.tooltip');
            if (!btn || !tip) return;
            tip.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
        });
    }

    wraps.forEach(w => {
        const btn = w.querySelector('.info-btn');
        const tip = w.querySelector('.tooltip');
        if (!btn || !tip) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = tip.hidden; // true면 열기
            closeAll();
            tip.hidden = !willOpen;
            btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });

        tip.addEventListener('click', (e) => e.stopPropagation());
    });

    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAll();
    });
})();

// main2
(function TS2() {
    "use strict";

    // =========================
    // 옵션(원하면 조절)
    // =========================
    const UI_PAGE_SIZE = 10;       // 화면에 보여줄 개수
    const FETCH_PAGE_SIZE = 30;    // 서버에서 한 번에 가져올 개수(필터링 대비)
    const MAX_FETCH_PAGES = 6;     // 한 번 렌더링에 서버 페이지 최대 몇 번 더 끌어올지(과도 호출 방지)

    // ✅ 키워드(주식/부동산...)까지 맞추고 싶으면 true
    const ENABLE_KEYWORD_FILTER = false;

    // =========================
    // util
    // =========================
    const PRESS_LOGO_MAP = {
        "연합뉴스": "/view/img/연합뉴스_로고.png",
        "한국경제": "/view/img/한국경제_로고.png",
        "매일경제": "/view/img/매일경제_로고.png",
        "서울경제": "/view/img/서울경제_로고.png",
        "이데일리": "/view/img/이데일리_로고.png",
        "아시아경제": "/view/img/아시아경제_로고.png",
        "조선일보": "/view/img/조선일보_로고.png",
        "중앙일보": "/view/img/중앙일보_로고.png",
        "동아일보": "/view/img/동아일보_로고.png",
        "한겨레신문": "/view/img/한겨레신문_로고.png",
        "경향신문": "/view/img/경향신문_로고.png",
        "뉴스1": "/view/img/뉴스1_로고.png",
        "뉴시스": "/view/img/뉴시스_로고.png",
    };

    // ✅ TS2 컬럼(pos/neu/neg) -> ES sentiment.label 후보들
    // (py를 못 건드리니, "positive/neutral/negative"가 아니어도 자동으로 맞춰보게 함)
    const SENTIMENT_CANDIDATES = {
        pos: ["positive", "pos", "긍정"],
        neu: ["neutral", "neu", "중립"],
        neg: ["negative", "neg", "부정"],
    };

    // ✅ UI 정렬 -> py가 허용하는 orderby(latest|score)로만 매핑
    function mapOrderby(uiMode) {
        // py는 latest|score만 가능
        if (uiMode === "trust_high") return "score";
        // recent / old / popular / trust_low 는 py에서 불가 -> latest로 받고 프론트에서 재정렬
        return "latest";
    }

    function escapeHtml(s) {
        return String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function pad2(n) { return String(n).padStart(2, "0"); }

    function formatDateOnly(v) {
        const s = String(v ?? "").trim();
        if (!s) return "";
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) {
            return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        }
        return s.slice(0, 10);
    }

    function getTrustInfo(a) {
        const rawLabel = String(a?.trustLabel ?? "").trim();
        if (rawLabel) {
            const cls =
                rawLabel.includes("정상") ? "is-ok" :
                    rawLabel.includes("의심") ? "is-warn" :
                        rawLabel.includes("위험") ? "is-risk" : "";
            return { text: rawLabel, cls, title: a?.score != null ? `score: ${a.score}` : "" };
        }

        if (a?.score == null) return { text: "", cls: "", title: "" };

        let s = Number(a.score);
        if (!Number.isFinite(s)) return { text: "", cls: "", title: "" };

        // 0~100이면 0~1로만 정규화
        if (s > 1 && s <= 100) s = s / 100;

        const text = (s >= 0.7) ? "정상" : (s >= 0.4) ? "의심" : "위험";
        const cls = (s >= 0.7) ? "is-ok" : (s >= 0.4) ? "is-warn" : "is-risk";
        return { text, cls, title: `score: ${s.toFixed(2)}` };
    }



    function makeBadgeSvg(text) {
        const t = String(text || "NEWS").trim().slice(0, 2);
        const svg = `
      <svg xmlns="http://www.w3.org/2000/svg" width="120" height="72">
        <rect width="100%" height="100%" rx="12" ry="12" fill="#ffffff"/>
        <rect x="1" y="1" width="118" height="70" rx="12" ry="12" fill="none" stroke="#dfe8f7"/>
        <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
              font-family="system-ui, -apple-system, Segoe UI, Roboto, Noto Sans KR, sans-serif"
              font-size="28" font-weight="800" fill="#2c3a52">${t}</text>
      </svg>`;
        return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    }

    function hydratePressLogos(scopeEl) {
        if (!scopeEl) return;
        scopeEl.querySelectorAll("img.ts2-src__logo[data-press]").forEach((img) => {
            const press = (img.dataset.press || "").trim();
            const mapped = PRESS_LOGO_MAP[press];
            img.onerror = null;
            img.src = mapped || makeBadgeSvg(press);
            img.onerror = () => {
                img.onerror = null;
                img.src = makeBadgeSvg(press);
            };
        });
    }

    function px(v) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    }

    function applyFourCardScroll(listEl, visibleCount = 5) {
        if (!listEl) return;

        const cards = Array.from(listEl.querySelectorAll(".ts2-card"));
        const colbody = listEl.closest(".ts2-colbody");
        const pager = colbody?.querySelector(".ts2-pager");

        if (cards.length < visibleCount) {
            listEl.classList.remove("is-vscroll");
            listEl.style.removeProperty("--ts2-list-max");
            if (colbody) colbody.style.height = "";
            return;
        }

        const cs = getComputedStyle(listEl);
        const gap = px(cs.rowGap || cs.gap);
        const pt = px(cs.paddingTop);
        const pb = px(cs.paddingBottom);

        let h = pt + pb;
        for (let i = 0; i < visibleCount; i++) {
            h += cards[i].offsetHeight;
            if (i < visibleCount - 1) h += gap;
        }
        h = Math.ceil(h);

        listEl.classList.add("is-vscroll");
        listEl.style.setProperty("--ts2-list-max", `${h}px`);

        if (colbody) {
            const pagerH = pager ? pager.offsetHeight : 0;
            const bt = px(getComputedStyle(colbody).borderTopWidth);
            colbody.style.height = `${h + pagerH + bt}px`;
        }
    }

    function getActiveDateForTS2() {
        // py는 date(하루)만 받으니: 범위의 "end"를 대표 날짜로 사용
        const r = window.getAppRange?.();
        if (r?.end) return r.end;

        const endEl = document.getElementById("endDate");
        if (endEl?.value) return endEl.value;

        // fallback: 어제
        const d = new Date();
        d.setDate(d.getDate() - 1);
        const pad2 = (n) => String(n).padStart(2, "0");
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }

    function matchesKeyword(article, keyword) {
        if (!ENABLE_KEYWORD_FILTER) return true;
        const kw = String(keyword || "").trim();
        if (!kw) return true;

        const hay =
            `${article?.press || ""} ${article?.title || ""} ${article?.summary || ""}`.toLowerCase();
        return hay.includes(kw.toLowerCase());
    }

    // =========================
    // DOM
    // =========================
    const els = {
        pos: document.getElementById("ts2ListPos"),
        neu: document.getElementById("ts2ListNeu"),
        neg: document.getElementById("ts2ListNeg"),
    };

    function getPager(sent) {
        const listEl = els[sent];
        const colbody = listEl?.closest(".ts2-colbody");
        const pager = colbody?.querySelector(".ts2-pager");
        const btns = pager ? Array.from(pager.querySelectorAll(".ts2-pagebtn")) : [];
        const text = pager?.querySelector(".ts2-pagetext");
        return { pager, btnPrev: btns[0], btnNext: btns[1], text };
    }

    // =========================
    // state + cache (프론트에서 키워드 필터링/재정렬 때문에 캐시 필요)
    // =========================
    const state = {
        keyword: "주식",
        uiPage: { pos: 1, neu: 1, neg: 1 },
        sortMode: { pos: "recent", neu: "recent", neg: "recent" }, // recent|old|popular|trust_high|trust_low
        cache: {
            pos: null,
            neu: null,
            neg: null,
        },
        endpointBase: null, // "/api" or ""
    };

    state.sentimentEndpoint = null;
    state.sentimentEndpointPromise = null;
    state.sentimentEndpointMissing = false;

    // (선택) 네가 정확한 엔드포인트를 알면 여기다 고정
    const SENTIMENT_ENDPOINT_OVERRIDE = null; // 예: "/api/articles/by-sentiment"

    async function discoverSentimentEndpoint() {
        if (SENTIMENT_ENDPOINT_OVERRIDE) return SENTIMENT_ENDPOINT_OVERRIDE;

        if (state.sentimentEndpoint) return state.sentimentEndpoint;
        if (state.sentimentEndpointMissing) throw new Error("sentiment endpoint missing");
        if (state.sentimentEndpointPromise) return state.sentimentEndpointPromise;

        state.sentimentEndpointPromise = (async () => {
            // 1) OpenAPI로 찾기
            const openapiUrls = ["/openapi.json", "/api/openapi.json"];
            for (const u of openapiUrls) {
                try {
                    const r = await fetch(u, { credentials: "same-origin" });
                    if (!r.ok) continue;
                    const j = await r.json();
                    const paths = Object.keys(j.paths || {});

                    const hits = paths.filter(p => /sentiment/i.test(p) && /article/i.test(p));
                    const pick = hits.find(p => /by[-_]?sentiment/i.test(p)) || hits[0];
                    if (pick) {
                        state.sentimentEndpoint = pick;
                        return pick;
                    }
                } catch (_) { }
            }

            // 2) 흔한 후보 probe
            const probeDate = getActiveDateForTS2();
            const qs = new URLSearchParams({
                sentiment: "positive",
                date: probeDate,
                page: "1",
                size: "1",
                orderby: "latest",
            }).toString();

            const candidates = [
                "/api/articles/by-sentiment",
                "/articles/by-sentiment",
            ];

            for (const p of candidates) {
                try {
                    const r = await fetch(`${p}?${qs}`, { credentials: "same-origin" });
                    if (r.status !== 404) {
                        state.sentimentEndpoint = p;
                        return p;
                    }
                } catch (_) { }
            }

            state.sentimentEndpointMissing = true;
            throw new Error("sentiment endpoint missing");
        })();

        try {
            return await state.sentimentEndpointPromise;
        } finally {
            state.sentimentEndpointPromise = null;
        }
    }

    // ===== TS2: 기사 로드 + 렌더 (추가) =====

    // payload 형태가 제각각이어도 items/total 비슷하게 맞추기
    function normalizeList(payload) {
        if (Array.isArray(payload)) return { items: payload, total: payload.length };

        const items =
            payload?.items ??
            payload?.articles ??
            payload?.data ??
            payload?.results ??
            payload?.rows ??
            payload?.docs ??
            payload?.hits?.hits ??          // ES/OpenSearch
            [];

        const total =
            payload?.total ??
            payload?.total_count ??
            payload?.count ??
            payload?.totalCount ??
            payload?.hits?.total?.value ??  //  ES7+
            payload?.hits?.total ??         //  ES6
            (Array.isArray(items) ? items.length : 0);

        return { items: Array.isArray(items) ? items : [], total: Number(total) || 0 };
    }

    // 기사 객체 필드명도 제각각일 수 있어 안전하게 뽑기
    function normalizeArticle(a) {
        const raw = a || {};
        const src = (raw._source || raw.source || raw.doc || raw.data) || raw;

        const title = src?.title ?? src?.headline ?? src?.news_title ?? "";
        const summary = src?.summary ?? src?.snippet ?? src?.description ?? src?.news_summary ?? "";
        const press = src?.press ?? src?.publisher ?? src?.media ?? src?.source ?? "";
        const url = src?.url ?? src?.link ?? src?.news_url ?? "";
        const date = src?.date ?? src?.published_at ?? src?.publishedAt ?? src?.pubDate ?? src?.datetime ?? "";

        // ✅ 점수: src뿐 아니라 raw에서도 찾기 (top-level 대응)
        const scoreRaw =
            src?.score ??
            src?.trust_score ?? src?.trustScore ??
            src?.reliability_score ?? src?.reliabilityScore ??
            src?.rank_score ??
            src?.trust?.score ?? src?.reliability?.score ??

            raw?.score ??
            raw?.trust_score ?? raw?.trustScore ??
            raw?.reliability_score ?? raw?.reliabilityScore ??
            raw?.rank_score ??
            raw?.trust?.score ?? raw?.reliability?.score ??

            // 마지막 fallback: 서버가 여기로 보내는 경우가 있어 대비
            raw?._score ??
            null;

        let score = (scoreRaw == null) ? null : Number(scoreRaw);
        if (!Number.isFinite(score)) score = null;

        // 라벨: src뿐 아니라 raw에서도 찾기
        const trustLabelRaw =
            src?.trust_label ?? src?.trustLabel ??
            src?.reliability_label ?? src?.reliabilityLabel ??
            src?.risk_label ?? src?.riskLabel ?? src?.risk_level ?? src?.riskLevel ??
            src?.trust?.label ?? src?.reliability?.label ??

            raw?.trust_label ?? raw?.trustLabel ??
            raw?.reliability_label ?? raw?.reliabilityLabel ??
            raw?.risk_label ?? raw?.riskLabel ?? raw?.risk_level ?? raw?.riskLevel ??
            raw?.trust?.label ?? raw?.reliability?.label ??
            null;

        const trustLabel = (trustLabelRaw == null) ? null : (String(trustLabelRaw).trim() || null);

        return { title, summary, press, url, date, score, trustLabel, raw };
    }



    function setListMessage(listEl, msg) {
        if (!listEl) return;
        listEl.innerHTML = `<div class="ts2-empty" style="padding:14px;color:#6a7a93;">${escapeHtml(msg)}</div>`;
    }

    function renderCards(sent, cards, page, totalPages) {
        const listEl = els[sent];
        if (!listEl) return;

        if (!cards.length) {
            setListMessage(listEl, "기사 데이터 없음");
        } else {
            listEl.innerHTML = cards.map((a) => {
                const press = String(a.press || "").trim();
                const title = String(a.title || "").trim();
                const summary = String(a.summary || "").trim();
                const url = String(a.url || "").trim();
                const dateOnly = formatDateOnly(a.date);

                const trust = getTrustInfo(a); //  추가

                const titleHtml = url
                    ? `<a class="ts2-title" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(title || "제목 없음")}</a>`
                    : `<div class="ts2-title">${escapeHtml(title || "제목 없음")}</div>`;

                return `
        <article class="ts2-card">
          <div class="ts2-card__top">
            <div class="ts2-src ts2-src--logoonly">
              <img class="ts2-src__logo" data-press="${escapeHtml(press)}" alt="${escapeHtml(press)} 로고">
              <span class="ts2-src__name">${escapeHtml(press || "언론사")}</span>
            </div>

            <div class="ts2-meta">
              ${trust.text ? `<span class="ts2-chip ts2-chip--trust ${trust.cls}" title="${escapeHtml(trust.title)}">${escapeHtml(trust.text)}</span>` : ``}
              ${dateOnly ? `<span class="ts2-chip ts2-chip--date">${escapeHtml(dateOnly)}</span>` : ``}
              <button type="button" class="ts2-chip ts2-chip--btn js-ts2-toggle">기사 요약</button>
            </div>
          </div>

          ${titleHtml}
          ${summary ? `<p class="ts2-desc">${escapeHtml(summary)}</p>` : ``}
        </article>
      `;
            }).join("");

            hydratePressLogos(listEl);

            // ✅ “기사 요약” 버튼으로 펼침/접힘
            listEl.querySelectorAll(".ts2-card").forEach((card) => {
                const btn = card.querySelector(".js-ts2-toggle");
                if (btn && !btn.dataset.bound) {
                    btn.dataset.bound = "1";
                    btn.addEventListener("click", (e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        card.classList.toggle("is-open");
                    });
                }
            });

            applyFourCardScroll(listEl, 5);
        }

        const { text, btnPrev, btnNext } = getPager(sent);
        if (text) text.textContent = `${page} / ${totalPages}`;
        if (btnPrev) btnPrev.disabled = page <= 1;
        if (btnNext) btnNext.disabled = page >= totalPages;
    }

    async function fetchSentiment(sent, page, size) {
        const endpoint = await discoverSentimentEndpoint();
        const date = getActiveDateForTS2();
        const orderby = mapOrderby(state.sortMode[sent] || "recent");

        // sentiment 값 후보를 돌려서 422/빈값 이슈를 완화
        const labels = SENTIMENT_CANDIDATES[sent] || [sent];

        let lastErr = null;
        for (const label of labels) {
            const qs = new URLSearchParams({
                sentiment: label,
                date,
                page: String(page),
                size: String(size),
                orderby,
            }).toString();

            const url = `${endpoint}?${qs}`;
            try {
                const r = await fetch(url, { credentials: "same-origin" });
                if (r.status === 404) {
                    // endpoint는 잡혔는데 라우팅이 다르면 404가 날 수 있음
                    lastErr = new Error(`404 ${url}`);
                    continue;
                }
                if (!r.ok) {
                    lastErr = new Error(`${r.status} ${url}`);
                    continue;
                }

                const j = await r.json();
                const { items, total } = normalizeList(j);

                console.log("[TS2] fetched", { sent, label, url, items: items.length, total });

                return { items, total, url, label };
            } catch (e) {
                lastErr = e;
            }
        }

        throw lastErr || new Error("fetch failed");
    }

    async function loadOne(sent) {
        const listEl = els[sent];
        if (!listEl) return;

        const page = state.uiPage[sent] || 1;
        const size = UI_PAGE_SIZE;

        setListMessage(listEl, "불러오는 중...");

        try {
            const res = await fetchSentiment(sent, page, size);
            const normalized = res.items.map(normalizeArticle);

            // 키워드 필터가 너무 빡세서 “전부 0” 되는 경우가 많음 → 0이면 필터 없이 보여주기
            const filtered = normalized.filter(a => matchesKeyword(a, state.keyword));
            const show = (ENABLE_KEYWORD_FILTER && filtered.length > 0) ? filtered : normalized;

            // totalPages 계산(서버 total이 없으면 1로)
            const total = res.total || show.length;
            const totalPages = Math.max(1, Math.ceil(total / size));

            // 혹시 page가 넘어가 있으면 clamp
            const clampedPage = Math.min(Math.max(1, page), totalPages);
            state.uiPage[sent] = clampedPage;

            renderCards(sent, show, clampedPage, totalPages);
        } catch (e) {
            console.log("[TS2] load failed", sent, e);
            setListMessage(listEl, "기사 API를 찾지 못했거나 응답이 없습니다(콘솔 로그 확인).");

            // pager도 1/1로 정리
            const { text, btnPrev, btnNext } = getPager(sent);
            if (text) text.textContent = `1 / 1`;
            if (btnPrev) btnPrev.disabled = true;
            if (btnNext) btnNext.disabled = true;
        }

    }

    // pager 버튼 이벤트(한 번만 바인딩)
    function bindPagerOnce(sent) {
        const { btnPrev, btnNext } = getPager(sent);
        if (btnPrev && !btnPrev.dataset.bound) {
            btnPrev.dataset.bound = "1";
            btnPrev.addEventListener("click", () => {
                state.uiPage[sent] = Math.max(1, (state.uiPage[sent] || 1) - 1);
                loadOne(sent);
            });
        }
        if (btnNext && !btnNext.dataset.bound) {
            btnNext.dataset.bound = "1";
            btnNext.addEventListener("click", () => {
                state.uiPage[sent] = (state.uiPage[sent] || 1) + 1;
                loadOne(sent);
            });
        }
    }
    ["pos", "neu", "neg"].forEach(bindPagerOnce);

    function ts2ReloadAll() {
        return Promise.all(["pos", "neu", "neg"].map(loadOne));
    }

    // 외부에서 키워드 바꾸면 TS2도 다시 로드되도록 노출
    window.ts2Api = {
        setKeyword(kw) {
            state.keyword = kw;
            state.uiPage = { pos: 1, neu: 1, neg: 1 };
            ts2ReloadAll();
        },
        refresh: ts2ReloadAll
    };

    // 기간 바뀌면 다시 로드
    document.addEventListener("app:rangechange", () => {
        state.uiPage = { pos: 1, neu: 1, neg: 1 };
        ts2ReloadAll();
    });

    // 최초 로드
    ts2ReloadAll();

})();


// main3
const ts3Api = (function TS3() {

    function makeLabels(startISO, endISO, grain) {
        const labels = [];
        if (!startISO || !endISO) return labels;

        let s = new Date(startISO + "T00:00:00");
        let e = new Date(endISO + "T00:00:00");

        // start > end면 스왑 (사용자가 날짜를 거꾸로 잡아도 동작)
        if (s > e) [s, e] = [e, s];

        const pad2 = (n) => String(n).padStart(2, "0");
        const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

        if (grain === "day") {
            for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) labels.push(iso(d));
            return labels;
        }

        if (grain === "week") {
            // 주 단위: 시작일부터 7일씩
            for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 7)) labels.push(iso(d));
            return labels;
        }

        if (grain === "month") {
            // 월 단위: 매월 1일
            for (let d = new Date(s.getFullYear(), s.getMonth(), 1); d <= e; d.setMonth(d.getMonth() + 1)) {
                labels.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
            }
            return labels;
        }

        if (grain === "year") {
            for (let y = s.getFullYear(); y <= e.getFullYear(); y++) labels.push(String(y));
            return labels;
        }

        return labels;
    }

    
    if (!ts3Root) return;

    // ===== 상태: 기준키워드 + (추가된)비교키워드들 =====
    let baseKeyword = (document.querySelector("#keywordDropdown .cselect__value")?.textContent || "주식").trim();
    let compareSet = new Set(); // base 제외한 비교 키워드만
    
    // 색상 팔레트(키워드별 라인 컬러)
    const COLOR = {
        '주식': '#0462D2',
        '부동산': '#e53935',
        '고용': '#8a97ad',
        '경기침체': '#18a567',
        '유가': '#ff9800',
        '반도체': '#7b61ff',
        '수출': '#00acc1',
        '노동': '#795548',
        '경제': '#2a4f98',
        '현금': '#607d8b',
    };
    const colorFor = (kw) => COLOR[kw] || '#0462D2';

    // ===== (샘플) 워드/감성 =====
    const WORDS = {
        '주식': ['주식', '주식시장', '인상', '물가', '정부', '정책', '대출', '연준', '경기', '부동산', '금리', '인하'],
        '부동산': ['부동산', '전세', '매매', '대출', '금리', '규제', '청약', '거래량', '분양', '전월세', '집값', '정책'],
        '고용': ['고용', '취업자', '실업률', '청년', '임금', '채용', '서비스업', '제조업', '구직', '정책', '경기', '노동'],
    };
    const SENT = {
        '주식': { pos: 40, neu: 30, neg: 30 },
        '부동산': { pos: 35, neu: 40, neg: 25 },
        '고용': { pos: 45, neu: 35, neg: 20 },
    };

    const DEBUG_CLOUD = true;

const CLOUD_PALETTE = [
  "#1e63ff", "#e53935", "#18a567", "#ff9800", "#7b61ff",
  "#00acc1", "#795548", "#2a4f98", "#607d8b", "#d81b60"
];

function clamp(n, a, b) { return Math.max(a, Math.min(b, n)); }

function hashStr(s) {
  s = String(s || "");
  let h = 0;
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h) + s.charCodeAt(i);
  return Math.abs(h);
}

function pickColor(word, i) {
  const h = hashStr(word) + (i * 97);
  return CLOUD_PALETTE[h % CLOUD_PALETTE.length];
}

function pickRotateDeg(word) {
  const r = (hashStr(word) % 5) - 2;
  return r * 3;
}

async function renderCloud(keyword) {
  if (!ts3CloudEl) return;

  const r = window.getAppRange?.() || {};
  const dateISO = r.end || r.start;
  if (!dateISO) return;

  if (DEBUG_CLOUD) {
    console.log("[TS3][cloud] called", { keyword });
    console.log("[TS3][cloud] range", r, "targetDate:", dateISO);
  }

  ts3CloudEl.innerHTML = `<div class="ts3-cloud-inner">불러오는 중…</div>`;

  const candidates = [dateISO, r.start, r.prevEnd].filter(Boolean);
  const uniqDates = [...new Set(candidates)];

  async function tryFetch(d) {
    const url = `/api/issue_wordcloud?start=${d}&keyword=${encodeURIComponent(keyword)}`;
    if (DEBUG_CLOUD) console.log("[TS3][cloud] request", url);

    const res = await fetch(url, { credentials: "same-origin" });
    const data = await res.json().catch(() => null);

    if (DEBUG_CLOUD) console.log("[TS3][cloud] response", { dateISO: d, ok: res.ok, status: res.status, data });

    if (!data?.success || !Array.isArray(data.sub_keywords) || data.sub_keywords.length === 0) {
      return { ok: false, data, dateISO: d };
    }
    return { ok: true, data, dateISO: d };
  }

  try {
    let result = null;

    for (const d of uniqDates) {
      result = await tryFetch(d);
      if (result.ok) break;
    }

    if (!result?.ok) {
      ts3CloudEl.innerHTML = `<div class="ts3-cloud-inner">데이터 없음</div>`;
      if (DEBUG_CLOUD) console.log("[TS3][cloud] empty/fail case");
      return;
    }

    const { data } = result;

    if (DEBUG_CLOUD) console.log("[TS3][cloud] sub_keywords[0]", data?.sub_keywords?.[0]);

    const items = data.sub_keywords
      .slice(0, 16)
      .map((x) => {
        if (typeof x === "string") return { kw: x, score: null };
        if (x && typeof x === "object") {
          const kw = x.keyword ?? x.word ?? x.text ?? "";
          const score = typeof x.score === "number" ? x.score : null;
          return { kw, score };
        }
        return { kw: String(x), score: null };
      })
      .filter((it) => it.kw && it.kw !== "[object Object]");

    if (items.length === 0) {
      ts3CloudEl.innerHTML = `<div class="ts3-cloud-inner">데이터 없음</div>`;
      if (DEBUG_CLOUD) console.log("[TS3][cloud] items empty after normalize");
      return;
    }

    const scores = items.map(x => (typeof x.score === "number" ? x.score : null)).filter(v => v != null);
    const minS = scores.length ? Math.min(...scores) : 0;
    const maxS = scores.length ? Math.max(...scores) : 1;

    const wrap = document.createElement("div");
    wrap.className = "ts3-cloud-inner";

    items.forEach((it, i) => {
      const span = document.createElement("span");
      span.className = "ts3-w";
      span.textContent = it.kw;

      span.style.color = pickColor(it.kw, i);

      if (typeof it.score === "number" && maxS !== minS) {
        const t = (it.score - minS) / (maxS - minS);
        const sizePx = clamp(12 + t * 24, 12, 36);
        span.style.fontSize = `${sizePx}px`;
        span.style.fontWeight = t > 0.75 ? "800" : t > 0.45 ? "700" : "600";
        span.style.opacity = String(clamp(0.70 + t * 0.30, 0.70, 1));
      } else {
        span.classList.add(i === 0 ? "lg" : i < 3 ? "md" : "sm");
      }

      span.style.transform = `rotate(${pickRotateDeg(it.kw)}deg)`;

      if (typeof it.score === "number") span.title = `score: ${it.score.toFixed(4)}`;

      wrap.appendChild(span);
    });

    ts3CloudEl.innerHTML = "";
    ts3CloudEl.appendChild(wrap);

    if (DEBUG_CLOUD) console.log("[TS3][cloud] rendered", { count: items.length, items });

  } catch (e) {
    ts3CloudEl.innerHTML = `<div class="ts3-cloud-inner">불러오기 실패</div>`;
    if (DEBUG_CLOUD) console.log("[TS3][cloud] error", e);
  }
}

    // =========================================================
    // ✅ TS3 도넛: 기간(start~end) 감성 합계
    // =========================================================
    let __donutReqSeq = 0;

    function setDonutByCounts(pos, neu, neg, meta = {}) {
    if (!ts3DonutEl) return;

    const total = (pos + neu + neg) || 0;

    // 데이터 없으면 "중립 100%"처럼 보이게(빈 도넛)
    if (total <= 0) {
        ts3DonutEl.style.background = `conic-gradient(#8a97ad 0 100%)`;
        ts3DonutEl.setAttribute("aria-label", `감성 비율 도넛 차트 (데이터 없음)`);

        // ✅ 라벨도 같이 제거
        clearDonutLabels();
        return;
    }

    // 퍼센트는 floor 2개 + 나머지 몰아주기(100% 안정)
    const pPos = Math.floor((pos / total) * 100);
    const pNeu = Math.floor((neu / total) * 100);
    const pNeg = Math.max(0, 100 - pPos - pNeu);

    const a = pPos;
    const b = pPos + pNeu;

    ts3DonutEl.style.background =
        `conic-gradient(#1e63ff 0 ${a}%, #8a97ad ${a}% ${b}%, #e53935 ${b}% 100%)`;

    ts3DonutEl.setAttribute(
        "aria-label",
        `감성 비율 도넛 차트 (${meta.keyword || ""} ${meta.start || ""}~${meta.end || ""}) `
        + `(긍정 ${pPos}%, 중립 ${pNeu}%, 부정 ${pNeg}%) `
        + `| 건수(긍정 ${pos}, 중립 ${neu}, 부정 ${neg}, 합계 ${total})`
    );

    // ✅ 퍼센트 라벨 표시
        renderDonutPercentLabels(pPos, pNeu, pNeg);
    }

    async function renderDonut(keyword) {
        if (!ts3DonutEl) { console.log("도넛없음"); return};
        
        const r = window.getAppRange?.() || {};
        const start = r.start;
        const end = r.end;
        if (!start || !end) return;

        const seq = ++__donutReqSeq;

        // 로딩 느낌
        ts3DonutEl.style.background = `conic-gradient(#eef2fb 0 100%)`;
        ts3DonutEl.setAttribute("aria-label", "감성 비율 도넛 차트 (불러오는 중)");

        // ✅ 로딩 중엔 이전 라벨 제거(잔상 방지)
        clearDonutLabels();

        try {
            const url =
            `/articles/sentiment-sum?keyword=${encodeURIComponent(keyword)}&start=${start}&end=${end}`;

            const res = await fetch(url, { credentials: "same-origin" });
            const data = await res.json().catch(() => null);
            console.log(`data : ${data}`);
            if (seq !== __donutReqSeq) return; // 레이스 방지

            if (!res.ok || !data?.success) {
            setDonutByCounts(0, 0, 0);
            console.log("[TS3][donut] fail", { ok: res.ok, status: res.status, data });
            return;
            }

            const pos = Number(data.positive || 0);
            const neu = Number(data.neutral || 0);
            const neg = Number(data.negative || 0);

            setDonutByCounts(pos, neu, neg, { keyword, start, end });
            console.log("[TS3][donut] ok", { keyword, start, end, pos, neu, neg });
        } catch (e) {
            if (seq !== __donutReqSeq) return;
            setDonutByCounts(0, 0, 0);
            console.log("[TS3][donut] error", e);
        }
    }


    // ===== 기간 탭 + 날짜 범위(시작일 수동, 종료일은 어제까지만) =====


    let userRangeLocked = false;

    function lockRange() { userRangeLocked = true; }

    startDateEl?.addEventListener("input", lockRange);
    startDateEl?.addEventListener("change", lockRange);
    endDateEl?.addEventListener("input", lockRange);
    endDateEl?.addEventListener("change", lockRange);

    function pad2(n) { return String(n).padStart(2, "0"); }

    function formatDateOnly(v) {
        const s = String(v ?? "").trim();
        if (!s) return "";
        if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
        const d = new Date(s);
        if (!Number.isNaN(d.getTime())) {
            return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        }
        return s.slice(0, 10);
    }

    function getTrustInfo(a) {
        // 1) 서버가 라벨을 주면 그대로 사용 (정상/의심/위험/높음/낮음 등)
        const rawLabel = String(a?.trustLabel ?? "").trim();
        if (rawLabel) {
            const cls =
                rawLabel.includes("정상") ? "is-ok" :
                    rawLabel.includes("의심") ? "is-warn" :
                        rawLabel.includes("위험") ? "is-risk" :
                            ""; // 모르면 기본
            return { text: rawLabel, cls, title: a?.score != null ? `score: ${a.score}` : "" };
        }

        // 2) 점수만 있으면 점수로 라벨 생성
        if (a?.score == null) return { text: "", cls: "", title: "" };

        let s = Number(a.score);
        if (!Number.isFinite(s)) return { text: "", cls: "", title: "" };

        // 0~100이면 0~1로 정규화
        if (s > 1) s = s / 100;

        const text = (s >= 0.7) ? "정상" : (s >= 0.4) ? "의심" : "위험";
        const cls = (s >= 0.7) ? "is-ok" : (s >= 0.4) ? "is-warn" : "is-risk";
        return { text, cls, title: `score: ${Number.isFinite(s) ? s.toFixed(2) : ""}` };
    }

    let __appRange = null;

    function getActiveGrain() {
        return document.querySelector(".seg-btn.is-active")?.dataset.grain || "day";
    }

    // 종료일: "미래만" 금지 (어제까지만), 사용자가 과거로 바꾸는 건 허용
    function clampEndToYesterdayISO(inputISO) {
        const yesterdayISO = toISO(addDays(new Date(), -1));
        return (!inputISO || inputISO > yesterdayISO) ? yesterdayISO : inputISO;
    }


    // (선택) 이전기간 계산: 현재 기간 길이만큼 바로 이전 구간
    function calcPrevSameLength(start, end) {
        const msDay = 24 * 60 * 60 * 1000;
        const diffDays = Math.round((end - start) / msDay); // start==end면 0
        const prevEnd = addDays(start, -1);
        const prevStart = addDays(prevEnd, -diffDays);
        return { prevStart: toISO(prevStart), prevEnd: toISO(prevEnd) };
    }

    function calcStartByGrain(grain, end) {
        // ✅ end 포함해서 "최근 N일" 느낌으로 만들려면 week는 -6 (총 7일)
        //    만약 너가 'start = end-7'을 원하면 -7로 바꿔도 됨.
        if (grain === "day") return new Date(end);
        if (grain === "week") return addDays(end, -6);

        // month/year는 "같은 날짜 기준 1개월/1년 전" (원래 네 코드 스타일)
        if (grain === "month") return addMonthsClamp(end, -1);
        if (grain === "year") return addYearsClamp(end, -1);

        return new Date(end);
    }

    // ✅ preset=true면 탭(day/week/month/year) 기준으로 start 자동 세팅
    function emitRangeChange({ preset = false } = {}) {
        const grain = getActiveGrain();

        // 1) endISO 결정: 사용자 입력 존중 + 미래만 어제까지 제한
        const yesterdayISO = toISO(addDays(new Date(), -1));
        if (endDateEl) endDateEl.max = yesterdayISO;

        const endISO = clampEndToYesterdayISO(endDateEl?.value);
        if (endDateEl) endDateEl.value = endISO;

        let end = normalize(parseISO(endISO) || addDays(new Date(), -1));

        // 2) start 결정
        let start;
        if (preset) {
            start = normalize(calcStartByGrain(grain, end));
            if (startDateEl) startDateEl.value = toISO(start);
        } else {
            start = normalize(parseISO(startDateEl?.value) || end);
        }

        // 3) start > end면 start를 end로 내림 (스왑보다 UX 깔끔)
        if (start > end) {
            start = new Date(end);
            if (startDateEl) startDateEl.value = toISO(start);
        }

        // 4) 서로 제약 걸기 (핵심!!)
        if (startDateEl) startDateEl.max = toISO(end);       // start는 end 이후 선택 불가
        if (endDateEl) endDateEl.min = toISO(start);         // end는 start 이전 선택 불가

        const prev = calcPrevSameLength(start, end);

        __appRange = {
            grain,
            start: toISO(start),
            end: toISO(end),
            prevStart: prev.prevStart,
            prevEnd: prev.prevEnd,
        };

        document.dispatchEvent(new CustomEvent("app:rangechange", { detail: __appRange }));
    }


    // 외부(TS2/TS3 등)에서 범위 읽기
    window.getAppRange = () => __appRange || {
        grain: getActiveGrain(),
        start: startDateEl?.value,
        end: endDateEl?.value,
        prevStart: null,
        prevEnd: null
    };

    // 이벤트
    function onManualDateChange() {
        clearSegActive();                 // ✅ 수동 날짜 => 자유기간(range)
        emitRangeChange({ preset: false });
    }

    startDateEl?.addEventListener("input", onManualDateChange);
    startDateEl?.addEventListener("change", onManualDateChange);
    endDateEl?.addEventListener("input", onManualDateChange);
    endDateEl?.addEventListener("change", onManualDateChange);


    // 탭 클릭: 프리셋 기간으로 시작일 자동 세팅
    segmentedBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            setSegActive(btn.dataset.grain);
            emitRangeChange({ preset: true }); // 프리셋: start 자동 세팅
        });
    });

    // 첫 로드도 프리셋으로 시작일 자동 세팅 + 종료일 어제 고정
    emitRangeChange({ preset: true });


    // ===== TS3: dashboard.py(/api/keyword_trend) 데이터로 라인차트 렌더 =====
    let __trendReqSeq = 0;
    let chart = null;

    function buildDatasets(labels) {
        const kws = [baseKeyword, ...Array.from(compareSet)];
        return kws.map((kw) => ({
        label: kw,
        data: makeSeries(kw, labels),
        borderColor: colorFor(kw),
        backgroundColor: colorFor(kw),
        borderWidth: kw === baseKeyword ? 3 : 2,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 4,
        }));
    }
    
    async function fetchTrend(start, end) {
        const res = await fetch(`/api/keyword_trend?start=${start}&end=${end}`, {
            credentials: "same-origin",
        });

        if (!res.ok) throw new Error(`keyword_trend HTTP ${res.status}`);

        const data = await res.json();
        console.log("[trend]", {
            start, end,
            success: data?.success,
            dates: data?.dates?.length,
            seriesKeys: Object.keys(data?.series || {}).slice(0, 20),
        });
        return data;
    }

    // 날짜 -> 버킷 라벨 만들기 (day/week/month/year)
    function isoDate(d) {
        return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
    }
    function bucketKey(dateObj, grain) {
        const d = new Date(dateObj);
        d.setHours(0, 0, 0, 0);

        if (grain === "day") return isoDate(d);

        if (grain === "week") {
            // 월요일 시작 주: 해당 날짜가 속한 주의 월요일 yyyy-mm-dd
            const day = d.getDay(); // 0=일 ... 1=월
            const diffToMon = (day + 6) % 7; // 월요일이면 0
            const mon = new Date(d);
            mon.setDate(d.getDate() - diffToMon);
            return isoDate(mon);
        }

        if (grain === "month") return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
        if (grain === "year") return String(d.getFullYear());

        return isoDate(d);
    }

    // 서버(day 단위) 데이터를 선택 grain에 맞춰 프론트에서 합산
    function makeFullDateObjs(startISO, endISO) {
        const out = [];
        let s = new Date(startISO + "T00:00:00");
        let e = new Date(endISO + "T00:00:00");
        if (s > e) [s, e] = [e, s];
        for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) {
            out.push(new Date(d));
        }
        return out;
    }

    // ✅ 전체 기간 라벨을 먼저 만들고, 서버 dates는 그 라벨에 합산
    function aggregateTrendToGrain(trend, grain, startISO, endISO) {
        const dates = Array.isArray(trend?.dates) ? trend.dates : [];
        const series = trend?.series || {};

        // 1) 전체 기간(시작~끝) 기반으로 라벨 버킷 생성 (데이터 없는 구간도 0으로 보이게)
        const fullDateObjs = makeFullDateObjs(startISO, endISO);

        const labels = [];
        const labelIndex = new Map();

        fullDateObjs.forEach(d => {
            const key = bucketKey(d, grain);
            if (!labelIndex.has(key)) {
                labelIndex.set(key, labels.length);
                labels.push(key);
            }
        });

        // 2) 서버가 준 값만 해당 버킷에 합산
        const outSeries = {};
        Object.entries(series).forEach(([kw, arr]) => {
            const bucketed = new Array(labels.length).fill(0);

            dates.forEach((iso, i) => {
                const d = new Date(iso + "T00:00:00");
                const key = bucketKey(d, grain);
                const idx = labelIndex.get(key);
                if (idx != null) bucketed[idx] += (arr?.[i] ?? 0);
            });

            outSeries[kw] = bucketed;
        });

        return { labels, series: outSeries };
    }


    async function renderLineChart() {
        if (!ts3Canvas || typeof Chart === "undefined") return;

        const { start, end } = window.getAppRange?.() || {};
        const grain = getActiveGrainForChart();

        if (!start || !end) return;

        const seq = ++__trendReqSeq;

        // 로딩 표시(원하면 텍스트 바꿔도 됨)
        if (ts3Placeholder) {
            ts3Placeholder.style.display = "grid";
            ts3Placeholder.textContent = "불러오는 중...";
        }
        ts3Canvas.style.display = "none";

        const trend = await fetchTrend(start, end);

        // 최신 요청만 반영 (탭/날짜 연타 레이스 방지)
        if (seq !== __trendReqSeq) return;

        if (!trend?.success) {
            if (ts3Placeholder) {
                ts3Placeholder.style.display = "grid";
                ts3Placeholder.textContent = "데이터 없음";
            }
            if (chart) {
                chart.destroy();
                chart = null;
            }
            return;
        }

        const agg = aggregateTrendToGrain(trend, grain || "day", start, end);
        const labels = agg.labels;

        const seriesAll = agg.series || {};
        const seriesKeys = Object.keys(seriesAll)
            .map(k => String(k || "").trim())
            .filter(k => k && k.toLowerCase() !== "nan");

        // (1) UI 키워드를 서버 키로 "해결"해주는 함수
        function resolveSeriesKey(uiKw) {
            const kw = String(uiKw || "").trim();
            if (!kw) return null;

            // 0) 완전 일치
            if (seriesAll[kw]) return kw;

            // 1) 포함(부분일치)로 찾기: "주식" -> "주식시장" 같은 케이스
            const hit = seriesKeys.find(k => k.includes(kw) || kw.includes(k));
            if (hit) return hit;

            // 2) 수동 매핑(필요한 것만 추가)
            const MAP = {
                // "주식": "주식시장",
                // "부동산": "부동산대책",
            };
            const mapped = MAP[kw];
            if (mapped && seriesAll[mapped]) return mapped;

            return null; // 못 찾으면 null
        }


        // base + compare만 그리기
        const kws = [baseKeyword, ...Array.from(compareSet)];

        const datasets = [];
        for (const uiKw of kws) {
            const serverKw = resolveSeriesKey(uiKw);
            if (!serverKw) continue; // 서버에 없으면 라인 자체를 안 그림

            datasets.push({
                label: (serverKw === uiKw) ? uiKw : `${uiKw} (대체:${serverKw})`,
                data: seriesAll[serverKw] || new Array(labels.length).fill(0),
                borderColor: colorFor(uiKw),
                backgroundColor: colorFor(uiKw),
                borderWidth: uiKw === baseKeyword ? 3 : 2,
                tension: 0.3,
                pointRadius: 2,
                pointHoverRadius: 4,
            });
        }

        // 아무 것도 못 그리면, 빈 화면 대신 메시지
        if (!datasets.length) {
            if (ts3Placeholder) {
                ts3Placeholder.style.display = "grid";
                ts3Placeholder.textContent =
                    `선택 키워드("${baseKeyword}")가 trend 데이터(series)에 없습니다.\n`
            }
            ts3Canvas.style.display = "none";
            if (chart) { chart.destroy(); chart = null; }
            return;
        }


        if (ts3Placeholder) ts3Placeholder.style.display = "none";
        ts3Canvas.style.display = "block";

        const ctx = ts3Canvas.getContext("2d");

        if (!chart) {
            chart = new Chart(ctx, {
                type: "line",
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: "index", intersect: false },
                    plugins: {
                        legend: { display: true, position: "top" },
                        tooltip: { enabled: true },
                    },
                    scales: {
                        x: { title: { display: true, text: "기간" }, ticks: { maxRotation: 0 } },
                        y: { title: { display: true, text: "언급량" }, beginAtZero: true },
                    },
                },
            });
        } else {
            chart.data.labels = labels;
            chart.data.datasets = datasets;
            chart.update();
        }
    }


    // ===== 버튼 UI 동기화 (base는 고정 + 비교는 토글) =====
    function syncButtons() {
        if (!ts3KlistEl) return;
        const btns = Array.from(ts3KlistEl.querySelectorAll(".ts3-kbtn"));
        
        btns.forEach(b => {
            const kw = b.dataset.keyword;
            const isBase = kw === baseKeyword;
            const isCompare = compareSet.has(kw);

            // base는 항상 active(잠금 느낌)
            b.classList.toggle("is-active", isBase || isCompare);
            b.setAttribute('aria-pressed', (isBase || isCompare) ? 'true' : 'false');
        });
    }

    function setBaseKeyword(next) {
        baseKeyword = next;
        compareSet = new Set(); // 기준이 바뀌면 비교는 초기화(원하면 유지하도록 바꿀 수 있어)
        if (ts3WordTag) ts3WordTag.textContent = baseKeyword;
        if (ts3DonutTag) ts3DonutTag.textContent = baseKeyword;
        renderCloud(baseKeyword);
        renderDonut(baseKeyword);
        syncButtons();
        renderLineChart();
        console.log("KEYWORDS:", JSON.stringify(KEYWORDS, null, 2));
    }

    function toggleCompareKeyword(kw) {
        if (kw === baseKeyword) return; // 기준은 제거 불가

        if (compareSet.has(kw)) compareSet.delete(kw);
        else compareSet.add(kw);

        syncButtons();
        renderLineChart();
    }

    // ✅ TS3 버튼 클릭: base를 바꾸는게 아니라 "비교 토글"로(네 요구사항 흐름)
    // base는 selectKeyword(드롭다운/랭킹)로 바뀜
    ts3KlistEl?.addEventListener("click", (e) => {
        const btn = e.target.closest(".ts3-kbtn");
        if (!btn) return;
        const kw = btn.dataset.keyword;
        toggleCompareKeyword(kw);
    });

    // ✅ 랭킹 기반으로 TS3 버튼 재생성
    function rebuildButtons(items) {
        if (!ts3KlistEl) return;
        const kws = items.slice(0, 10).map(x => x.keyword);

        ts3KlistEl.innerHTML = kws.map((kw) => `
        <button type="button"
                class="ts3-kbtn"
                data-keyword="${kw}"
                role="tab"
                aria-selected="false">${kw}</button>
        `).join("");

        // baseKeyword가 새 목록에 없으면 1위로 교체
        if (kws.length && !kws.includes(baseKeyword)) {
        setBaseKeyword(kws[0]);
        } else {
        syncButtons();
        renderLineChart();
        }
    }

    // 버튼 클릭: "추가/삭제"만 수행 (기준 변경은 드롭다운/랭킹)
    btns.forEach(b => {
        b.addEventListener('click', () => {
            const kw = b.dataset.keyword;
            toggleCompareKeyword(kw);
        });
    });

    // 초기값: 상단 드롭다운과 동기화
    const init =
        (document.querySelector('#keywordDropdown input[type="hidden"]')?.value ||
            document.querySelector('#keywordDropdown .cselect__value')?.textContent ||
            '주식').trim();

    setBaseKeyword(init);

    // 기간 바뀌면 라인차트 갱신
    document.addEventListener("app:rangechange", () => {
        renderLineChart();
        renderCloud(baseKeyword);
        renderDonut(baseKeyword);
    });
    return {
        setKeyword: setBaseKeyword,
        toggleCompareKeyword,
        rebuildButtons,
        getState: () => ({ baseKeyword, compare: Array.from(compareSet) }),
    };
})();

