// #region 확인끝
// #region ===== 전역변수 =====
let KEYWORDS = [];

// dropdownApi는 selectKeyword에서 쓰므로 위에 선언 (TDZ 방지)
let dropdownApi = null;

const SUMMARY_MAP = {
  "주식": ["(샘플) 요약/선정이유 영역입니다.", "실제 서버 요약으로 교체하세요."],
};

const ts3Root = document.getElementById('main3');
const ts3Canvas = document.getElementById('ts3LineCanvas');
const ts3KlistEl = ts3Root?.querySelector(".ts3-klist") ?? null;
const ts3WordTag = ts3Root?.querySelector('#ts3WordTag') ?? null;
const ts3DonutTag = ts3Root?.querySelector('#ts3DonutTag') ?? null;
const ts3DonutEl  = ts3Root?.querySelector('#ts3Donut') ?? null;
const ts3CloudEl  = ts3Root?.querySelector('#ts3WordCloud') ?? null;
const ts3Placeholder = ts3Root?.querySelector('.ts3-placeholder') ?? null;
const btns = ts3Root ? Array.from(ts3Root.querySelectorAll('.ts3-kbtn')) : [];
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
function pad2(n) {
  return String(n).padStart(2, "0");
}
function toISO(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}
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

// ===== mode 결정 =====
function getActiveMode() {
  // 버튼이 활성화면 day/week/month/year, 아니면 자유기간 range
  return document.querySelector(".seg-btn.is-active")?.dataset.grain || "range";
}
function getActiveGrainForChart() {
  // 차트 라벨은 seg 활성 기준으로, 없으면 "day"로 표시
  return document.querySelector(".seg-btn.is-active")?.dataset.grain || "day";
}
// #endregion

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
  const cx = donutRect.left - wrapRect.left + donutRect.width / 2;
  const cy = donutRect.top - wrapRect.top + donutRect.height / 2;
  const size = Math.min(donutRect.width, donutRect.height);

  // wrap이 기준이 되게
  const csWrap = getComputedStyle(wrap);
  if (csWrap.position === "static") wrap.style.position = "relative";

  // ✅ wrap 밖으로 절대 안 나가게
  wrap.style.overflow = "hidden";

  // 거리 튜닝
  const rOuter = size * 0.5;
  const rTick = rOuter + 10;
  const rLabel = rOuter + 26;
  const xGap = 16;
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
      </div>
    `;
    return;
  }

  top.forEach((k) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className =
      "rank-row rank-item" + (k.keyword === selectedKeyword ? " is-selected" : "");
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
  if (!keyword) return;

  // 1) UI 동기화 (랭킹 리스트 & 드롭다운)
  renderRanking(keyword);
  dropdownApi?.setValue(keyword);

  // 2) 키워드 요약 영역 업데이트
  renderSummary(keyword);

  // 3) 뉴스 리스트(TS2) 업데이트
  if (window.ts2Api) window.ts2Api.setKeyword(keyword);

  // 4) 상세 분석(TS3) 업데이트
  if (window.ts3Api) window.ts3Api.setKeyword(keyword);
}
window.selectKeyword = selectKeyword;
// #endregion

// =====================================================
// 1) 키워드 드롭다운
// =====================================================
(function () {
  const root = document.getElementById("keywordDropdown");
  if (!root) return;

  const btn = root.querySelector(".cselect__btn");
  const list = root.querySelector(".cselect__list");
  const valueEl = root.querySelector(".cselect__value");
  const hidden = root.querySelector('input[type="hidden"]');

  let activeIndex = 0;

  if (!btn || !list || !valueEl) return;

  function close() {
    root.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  }

  function toggle() {
    root.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", root.classList.contains("is-open") ? "true" : "false");
  }

  function getOptions() {
    return Array.from(list.querySelectorAll(".cselect__opt"));
  }

  function applyValue(v) {
    const options = getOptions();
    if (!options.length) return;

    options.forEach((o) => {
      const isMatch = (o.dataset.value ?? o.textContent.trim()) === v;
      o.classList.toggle("is-selected", isMatch);
      if (isMatch) o.setAttribute("aria-selected", "true");
      else o.removeAttribute("aria-selected");
    });

    valueEl.textContent = v;
    if (hidden) hidden.value = v;

    const idx = options.findIndex((o) => (o.dataset.value ?? o.textContent.trim()) === v);
    if (idx >= 0) activeIndex = idx;
  }

  list.addEventListener("click", (e) => {
    const opt = e.target.closest(".cselect__opt");
    if (!opt) return;
    const v = opt.dataset.value ?? opt.textContent.trim();
    applyValue(v);
    close();
    selectKeyword(v);
  });

  root.addEventListener("click", (e) => {
    if (e.target.closest(".cselect__btn")) {
      e.preventDefault();
      toggle();
    }
  });

  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) close();
  });

  dropdownApi = {
    setValue(v) {
      applyValue(v);
    },
  };

  const initial = (hidden?.value || valueEl.textContent || "주식").trim();
  applyValue(initial);
})();

// 드롭다운 옵션을 랭킹 키워드로 재생성
function rebuildKeywordDropdownFromRanking(items) {
  const root = document.getElementById("keywordDropdown");
  if (!root || !items.length) return;

  const list = root.querySelector(".cselect__list");
  const valueEl = root.querySelector(".cselect__value");
  if (!list) return;

  list.innerHTML = items
    .slice(0, 10)
    .map(
      (it, idx) => `
        <li class="cselect__opt ${idx === 0 ? "is-selected" : ""}"
            role="option"
            data-value="${it.keyword}"
            aria-selected="${idx === 0 ? "true" : "false"}">${it.keyword}</li>
      `
    )
    .join("");

  // 현재 값이 items에 없으면 1위로
  const currentValue = valueEl?.textContent?.trim();
  const exists = items.some((x) => x.keyword === currentValue);
  const targetValue = exists ? currentValue : items[0].keyword;

  dropdownApi?.setValue(targetValue);
}

// 초기 렌더
const bootKeyword = (
  document.querySelector('#keywordDropdown input[type="hidden"]')?.value ||
  document.querySelector("#keywordDropdown .cselect__value")?.textContent ||
  "주식"
).trim();
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

  const res = await fetch(`/api/keywords/ranking?${qs.toString()}`, {
    method: "GET",
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    console.error("[ranking] fetch failed:", res.status, msg);
    alert("랭킹 조회에 실패했습니다.");
    return;
  }

  const data = await res.json();
  const items = Array.isArray(data?.items) ? data.items : [];

  KEYWORDS = items;

  // (1) 드롭다운 옵션 재생성
  rebuildKeywordDropdownFromRanking(items);

  // (2) TS3 키워드 버튼 재생성
  window.ts3Api?.rebuildButtons?.(items);

  // 선택 키워드 유지(없으면 1위)
  const prev = keepSelected ? summaryKeywordEl?.textContent?.trim() : null;
  const fallback = items[0]?.keyword || "선택된 키워드 없음";
  const currentSelected = prev && items.some((x) => x.keyword === prev) ? prev : fallback;

  selectKeyword(currentSelected);
}

document.addEventListener("app:rangechange", () => {
  fetchRankingAndRender({ keepSelected: true });
});

// ===== 증감률/변동 안내 툴팁 (각 has-tip 안에서만 토글) =====
(function () {
  const wraps = document.querySelectorAll(".has-tip");
  if (!wraps.length) return;

  function closeAll() {
    wraps.forEach((w) => {
      const btn = w.querySelector(".info-btn");
      const tip = w.querySelector(".tooltip");
      if (!btn || !tip) return;
      tip.hidden = true;
      btn.setAttribute("aria-expanded", "false");
    });
  }

  wraps.forEach((w) => {
    const btn = w.querySelector(".info-btn");
    const tip = w.querySelector(".tooltip");
    if (!btn || !tip) return;

    btn.addEventListener("click", (e) => {
      e.stopPropagation();
      const willOpen = tip.hidden;
      closeAll();
      tip.hidden = !willOpen;
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
    });

    tip.addEventListener("click", (e) => e.stopPropagation());
  });

  document.addEventListener("click", closeAll);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });
})();

// ===============================
// TS2 기사 상세 팝업 모달 (전역)
// ===============================
// ===============================
// TS2 기사 상세 팝업 모달 (전역) - 단순 버전(닫기 버튼만)
// ===============================
(function initTS2Modal() {
  let root = document.getElementById("ts2ModalRoot");
  if (!root) {
    root = document.createElement("div");
    root.id = "ts2ModalRoot";
    root.innerHTML = `
      <div class="ts2m-backdrop" hidden>
        <div class="ts2m-panel" role="dialog" aria-modal="true" aria-label="기사 상세">
          <button type="button" class="ts2m-close js-ts2m-close" aria-label="닫기">×</button>

          <div class="ts2m-head">
            <div class="ts2m-press"></div>
            <div class="ts2m-title"></div>
            <div class="ts2m-meta"></div>
          </div>

          <div class="ts2m-body">
            <div class="ts2m-summary"></div>
          </div>

          <div class="ts2m-actions">
            <button type="button" class="ts2m-btn ts2m-btn-primary js-ts2m-open">원문 보기</button>
            <button type="button" class="ts2m-btn js-ts2m-close">닫기</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root);
  }

  const backdrop = root.querySelector(".ts2m-backdrop");
  const elPress = root.querySelector(".ts2m-press");
  const elTitle = root.querySelector(".ts2m-title");
  const elMeta = root.querySelector(".ts2m-meta");
  const elSummary = root.querySelector(".ts2m-summary");
  const btnOpen = root.querySelector(".js-ts2m-open");

  function close() {
    backdrop.hidden = true;
    document.body.classList.remove("is-modal-open");
  }

  // ✅ 닫기는 버튼으로만 (한 번만 등록)
  root.querySelectorAll(".js-ts2m-close").forEach((b) => {
    if (b.dataset.bound) return;
    b.dataset.bound = "1";
    b.addEventListener("click", close);
  });

  // ✅ TS2에서 호출할 전역 함수
  window.openTS2Modal = function open(payload = {}) {
    const press = payload.press || "";
    const date = payload.date || "";
    const title = payload.title || "";
    const bodyOrSummary = payload.body || payload.summary || "";
    const url = payload.url || "";

    elPress.textContent = press;
    elTitle.textContent = title;
    elMeta.textContent = date;
    elSummary.textContent = bodyOrSummary;

    btnOpen.disabled = !url;
    btnOpen.onclick = () => {
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    };

    backdrop.hidden = false;
    document.body.classList.add("is-modal-open");
  };
})();

// =====================================================
// main2 (TS2)
// =====================================================
(function TS2() {
    function hidePopularSortOptions() {
        document.querySelectorAll('.ts2-sort .cselect__opt[data-value="popular"]').forEach((opt) => {
            opt.remove(); // ✅ 아예 제거
        });
    }
  "use strict";

  // =========================
  // 옵션(원하면 조절)
  // =========================
  const UI_PAGE_SIZE = 10;      // 화면에 보여줄 개수
  const FETCH_PAGE_SIZE = 30;   // 서버에서 한 번에 가져올 개수(필터링 대비)
  const MAX_FETCH_PAGES = 6;    // 한 번 렌더링에 서버 페이지 최대 몇 번 더 끌어올지(과도 호출 방지)
  const ENABLE_KEYWORD_FILTER = false; // ✅ 키워드까지 맞추고 싶으면 true

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
    "헤럴드경제": "/view/img/헤럴드경제_로고.png",
    "KBS": "/view/img/KBS_로고.png",
  };

  // ✅ TS2 컬럼(pos/neu/neg) -> ES sentiment.label 후보들
  const SENTIMENT_CANDIDATES = {
    pos: ["positive", "pos", "긍정"],
    neu: ["neutral", "neu", "중립"],
    neg: ["negative", "neg", "부정"],
  };

  // ✅ UI 정렬 -> py가 허용하는 orderby(latest|score)로만 매핑
  function mapOrderby(uiMode) {
    switch (uiMode) {
        case "recent":     return "latest";
        case "old":        return "old";
        case "trust_high": return "trust_high";
        case "trust_low":  return "trust_low";
        // popular은 UI에서 제거했지만 혹시 남아있으면 폴백
        case "popular":    return "latest";
        default:           return "latest";
    }
}

function shouldShowTrustBadge(sent) {
  const mode = state.sortMode?.[sent] || "recent";
  // ✅ 최신순/오래된순에서는 신뢰도 숨김
  return mode === "trust_high" || mode === "trust_low";
}

function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

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
  const sRaw = a?.trustScore ?? a?.score ?? null;
  if (sRaw == null) return { text: "", cls: "", title: "" };

  let s = Number(sRaw);
  if (!Number.isFinite(s)) return { text: "", cls: "", title: "" };

  // 0~1 또는 0~100 들어와도 대응
  if (s > 1 && s <= 100) s = s / 100;

  // ✅ 뱃지 텍스트는 score 자체
  const text = s.toFixed(2); // 예: 0.83

  // (선택) 색은 점수로만 구분
  const cls = s >= 0.7 ? "is-ok" : s >= 0.4 ? "is-warn" : "is-risk";

  return { text, cls, title: `trust.score: ${s.toFixed(4)}` };
}

  function makeBadgeSvg(text) {
    const t = String(text || "NEWS").trim().slice(0, 2);
    const svg = `
<svg xmlns="http://www.w3.org/2000/svg" width="120" height="72">
  <rect width="100%" height="100%" rx="12" ry="12" fill="#ffffff"/>
  <rect x="1" y="1" width="118" height="70" rx="12" ry="12" fill="none" stroke="#dfe8f7"/>
  <text x="50%" y="52%" dominant-baseline="middle" text-anchor="middle"
        font-family="system-ui, -apple-system, Segoe UI, Roboto, Noto Sans KR, sans-serif"
        font-size="28" font-weight="800" fill="#2c3a52">${escapeHtml(t)}</text>
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

  function matchesKeyword(article, keyword) {
    if (!ENABLE_KEYWORD_FILTER) return true;
    const kw = String(keyword || "").trim();
    if (!kw) return true;
    const hay = `${article?.press || ""} ${article?.title || ""} ${article?.summary || ""}`.toLowerCase();
    return hay.includes(kw.toLowerCase());
  }

  function getRangeForTS2() {
    const r = window.getAppRange?.() || {};
    return { start: r.start, end: r.end };
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
  // state
  // =========================
  const state = {
    keyword: "주식",
    uiPage: { pos: 1, neu: 1, neg: 1 },
    sortMode: { pos: "recent", neu: "recent", neg: "recent" }, // recent|old|popular|trust_high|trust_low
    sentimentEndpoint: null,
    sentimentEndpointPromise: null,
    sentimentEndpointMissing: false,
  };

   // =========================
  // TS2 정렬 드롭다운 바인딩
  // =========================
  function initTS2SortDropdowns() {
    const roots = Array.from(document.querySelectorAll(".ts2-sort.cselect"));
    if (!roots.length) return;

    function closeAll(except) {
      roots.forEach((r) => {
        if (except && r === except) return;
        r.classList.remove("is-open");
        const btn = r.querySelector(".cselect__btn");
        if (btn) btn.setAttribute("aria-expanded", "false");
      });
    }

    roots.forEach((root) => {
      const btn = root.querySelector(".cselect__btn");
      const list = root.querySelector(".cselect__list");
      const valueEl = root.querySelector(".cselect__value");
      if (!btn || !list || !valueEl) return;

      const sent = root.dataset.sort; // pos | neu | neg

      // 버튼 클릭 → 열기/닫기
      btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();

        const willOpen = !root.classList.contains("is-open");
        closeAll(root);

        root.classList.toggle("is-open", willOpen);
        btn.setAttribute("aria-expanded", willOpen ? "true" : "false");
      });

      // 옵션 클릭 → 정렬 변경
      list.addEventListener("click", (e) => {
        const opt = e.target.closest(".cselect__opt");
        if (!opt) return;

        const v = opt.dataset.value ?? opt.textContent.trim();
        valueEl.textContent = opt.textContent.trim();

        root.querySelectorAll(".cselect__opt").forEach((o) => {
          const isSel = o === opt;
          o.classList.toggle("is-selected", isSel);
          if (isSel) o.setAttribute("aria-selected", "true");
          else o.removeAttribute("aria-selected");
        });

        if (sent) {
          state.sortMode[sent] = v;
          state.uiPage[sent] = 1;
          loadOne(sent); // 🔥 해당 컬럼만 다시 로드
        }

        root.classList.remove("is-open");
        btn.setAttribute("aria-expanded", "false");
      });
    });

    document.addEventListener("click", () => closeAll());
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeAll();
    });
  }

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
          const hits = paths.filter((p) => /sentiment/i.test(p) && /article/i.test(p));
          const pick = hits.find((p) => /by[-_]?sentiment/i.test(p)) || hits[0];
          if (pick) {
            state.sentimentEndpoint = pick;
            return pick;
          }
        } catch (_) {}
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

      const candidates = ["/api/articles/by-sentiment", "/articles/by-sentiment"];
      for (const p of candidates) {
        try {
          const r = await fetch(`${p}?${qs}`, { credentials: "same-origin" });
          if (r.status !== 404) {
            state.sentimentEndpoint = p;
            return p;
          }
        } catch (_) {}
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

  // payload 형태 normalize
  function normalizeList(payload) {
    if (Array.isArray(payload)) return { items: payload, total: payload.length };

    const items =
      payload?.items ??
      payload?.articles ??
      payload?.data ??
      payload?.results ??
      payload?.rows ??
      payload?.docs ??
      payload?.hits?.hits ??
      [];

    const total =
      payload?.total ??
      payload?.total_count ??
      payload?.count ??
      payload?.totalCount ??
      payload?.hits?.total?.value ??
      payload?.hits?.total ??
      (Array.isArray(items) ? items.length : 0);

    return { items: Array.isArray(items) ? items : [], total: Number(total) || 0 };
  }

  // 기사 필드 normalize
  function normalizeArticle(a) {
  const raw = a || {};
  const src = raw._source || raw.source || raw.doc || raw.data || raw;

  const title = src?.title ?? src?.headline ?? src?.news_title ?? "";

  // 요약: summary.summary_text 우선
  const summary =
    src?.summary?.summary_text ??
    src?.summary_text ??
    src?.summary ??
    src?.snippet ??
    src?.description ??
    src?.news_summary ??
    "";

  // 본문: body
  const body =
    src?.body ??
    src?.content ??
    src?.news_content ??
    "";

  // 언론사: press_name
  const press =
    src?.press_name ??
    src?.press ??
    src?.publisher ??
    src?.media ??
    src?.source ??
    "";

  // URL
  const url = src?.url ?? src?.link ?? src?.news_url ?? "";

  // 날짜: published_at
  const date = src?.published_at ?? src?.date ?? src?.publishedAt ?? src?.pubDate ?? src?.datetime ?? "";

  // trust.score
  const trustScoreRaw =
    src?.trust?.score ??
    src?.trust_score ??
    src?.trustScore ??
    raw?.trust?.score ??
    raw?.trust_score ??
    raw?.trustScore ??
    null;

  let trustScore = trustScoreRaw == null ? null : Number(trustScoreRaw);
  if (!Number.isFinite(trustScore)) trustScore = null;

  const trustLabelRaw =
    src?.trust?.label ??
    src?.trust_label ??
    src?.trustLabel ??
    null;

  const trustLabel = trustLabelRaw == null ? null : (String(trustLabelRaw).trim() || null);

  return { title, summary, body, press, url, date, trustScore, trustLabel, raw };
}


  function setListMessage(listEl, msg) {
    if (!listEl) return;
    listEl.innerHTML = `<div class="ts2-empty" style="padding:14px;color:#6a7a93;">${escapeHtml(msg)}</div>`;
  }

  // ✅ 카드 클릭 모달: 이벤트 위임(한 번만 바인딩)
function bindTS2CardOpen(listEl) {
  if (!listEl) return;
  if (listEl.dataset.boundCardOpen) return;
  listEl.dataset.boundCardOpen = "1";

  function openFromCard(card) {
    if (!card) return;
    openTS2Modal({
        press: card.dataset.ts2Press || "",
        date: card.dataset.ts2Date || "",
        title: card.dataset.ts2Title || "",
        summary: card.dataset.ts2Body || card.dataset.ts2Summary || "", // ✅
        url: card.dataset.ts2Url || "",
    });
  }

  listEl.addEventListener("click", (e) => {
    // ✅ 요약 버튼 클릭이면 모달 금지
    if (e.target.closest(".js-ts2-toggle")) return;

    const card = e.target.closest(".js-ts2-card");
    if (!card || !listEl.contains(card)) return;

    e.preventDefault();
    openFromCard(card);
  });

  listEl.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;

    const card = e.target.closest(".js-ts2-card");
    if (!card || !listEl.contains(card)) return;

    e.preventDefault();
    openFromCard(card);
  });
}

function renderCards(sent, cards, page, totalPages) {
  const listEl = els[sent];
  if (!listEl) return;

  if (!cards.length) {
    setListMessage(listEl, "기사 데이터 없음");
  } else {
    listEl.innerHTML = cards
      .map((a) => {
        const press = String(a.press || "").trim();
        const title = String(a.title || "").trim();
        const summary = String(a.summary || "").trim();
        const body = String(a.body || "").trim();
        const url = String(a.url || "").trim();
        const dateOnly = formatDateOnly(a.date);

        const showTrust = shouldShowTrustBadge(sent);
        const trust = getTrustInfo(a);
        const trustChipHtml =
          (showTrust && trust.text)
            ? `<span class="ts2-chip ts2-chip--trust ${trust.cls}" title="${escapeHtml(trust.title)}">${escapeHtml(trust.text)}</span>`
            : "";

        // ✅ 제목 링크 제거(원문 이동 제거)
        return `
<article class="ts2-card js-ts2-card"
  role="button"
  tabindex="0"
  data-ts2-press="${escapeHtml(press)}"
  data-ts2-date="${escapeHtml(dateOnly)}"
  data-ts2-title="${escapeHtml(title || "제목 없음")}"
  data-ts2-summary="${escapeHtml(summary || "")}"
  data-ts2-body="${escapeHtml(body || "")}"
  data-ts2-url="${escapeHtml(url || "")}"
>
  <div class="ts2-card__top">
    <div class="ts2-src ts2-src--logoonly">
      <img class="ts2-src__logo" data-press="${escapeHtml(press)}" alt="${escapeHtml(press)} 로고">
      <span class="ts2-src__name">${escapeHtml(press || "언론사")}</span>
    </div>

    <div class="ts2-meta">
      ${trustChipHtml}
      ${dateOnly ? `<span class="ts2-chip ts2-chip--date">${escapeHtml(dateOnly)}</span>` : ""}
      <button type="button" class="ts2-chip ts2-chip--btn js-ts2-toggle">기사 요약</button>
    </div>
  </div>

  <div class="ts2-title">${escapeHtml(title || "제목 없음")}</div>

  ${summary ? `<p class="ts2-desc">${escapeHtml(summary)}</p>` : ""}
</article>`;
      })
      .join("");

    hydratePressLogos(listEl);

    // ✅ 카드 클릭 모달(한 번만)
    bindTS2CardOpen(listEl);

    // ✅ 요약 버튼만 토글 (모달 방지 stopPropagation)
    listEl.querySelectorAll(".js-ts2-card").forEach((card) => {
      const btn = card.querySelector(".js-ts2-toggle");
      if (btn && !btn.dataset.bound) {
        btn.dataset.bound = "1";
        btn.addEventListener("click", (e) => {
          e.preventDefault();
          e.stopPropagation(); // ⭐ 카드 클릭 모달 막기
          card.classList.toggle("is-open");
        });
      }
    });

    applyFourCardScroll(listEl, 5);
  }

  // ✅ pager 갱신은 “딱 1번만”
  const { text, btnPrev, btnNext } = getPager(sent);
  if (text) text.textContent = `${page} / ${totalPages}`;
  if (btnPrev) btnPrev.disabled = page <= 1;
  if (btnNext) btnNext.disabled = page >= totalPages;
}
  async function fetchSentiment(sent, page, size) {
  // ✅ pos/neu/neg -> 서버 sentiment 값
  const sentiment =
    sent === "pos" ? "positive" :
    sent === "neu" ? "neutral"  :
    sent === "neg" ? "negative" :
    "all";

  const { start, end } = getRangeForTS2();
  if (!start || !end) throw new Error("range missing");

  const orderby = mapOrderby(state.sortMode[sent] || "recent");

  const qs = new URLSearchParams({
    keyword: state.keyword,
    start,
    end,
    sentiment,
    page: String(page),
    size: String(size),
    orderby,
  }).toString();

  const url = `/articles/list?${qs}`;

  const r = await fetch(url, { credentials: "same-origin" });
  const j = await r.json().catch(() => null);

  if (!r.ok || !j?.success) {
    throw new Error(`[TS2] list failed ${r.status} ${url}`);
  }

  const { items, total } = normalizeList(j);
  console.log("[TS2] fetched(list)", { sent, url, items: items.length, total });
  return { items, total, url };
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

      const filtered = normalized.filter((a) => matchesKeyword(a, state.keyword));
      const show = ENABLE_KEYWORD_FILTER && filtered.length > 0 ? filtered : normalized;

      const total = Number.isFinite(res.total) ? res.total : show.length;
      const totalPages = Math.max(1, Math.ceil(total / size));
      const clampedPage = Math.min(Math.max(1, page), totalPages);

      state.uiPage[sent] = clampedPage;
      renderCards(sent, show, clampedPage, totalPages);
    } catch (e) {
      console.log("[TS2] load failed", sent, e);
      setListMessage(listEl, "기사 API를 찾지 못했거나 응답이 없습니다(콘솔 로그 확인).");

      const { text, btnPrev, btnNext } = getPager(sent);
      if (text) text.textContent = "1 / 1";
      if (btnPrev) btnPrev.disabled = true;
      if (btnNext) btnNext.disabled = true;
    }
  }

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

  hidePopularSortOptions();
  initTS2SortDropdowns();
  ts2ReloadAll();
  
  function ts2ReloadAll() {
    return Promise.all(["pos", "neu", "neg"].map(loadOne));
  }

  window.ts2Api = {
    setKeyword(kw) {
      state.keyword = kw;
      state.uiPage = { pos: 1, neu: 1, neg: 1 };
      ts2ReloadAll();
    },
    refresh: ts2ReloadAll,
  };

  document.addEventListener("app:rangechange", () => {
    state.uiPage = { pos: 1, neu: 1, neg: 1 };
    ts2ReloadAll();
  });

  ts2ReloadAll();
})();


// =====================================================
// main3 (TS3)
// =====================================================
const ts3Api = (function TS3() {
  if (!ts3Root) return null;

  // -------------------------
  // 공통 util
  // -------------------------
  const LINE_PALETTE = [
    "#0462D2", "#e53935", "#18a567", "#ff9800", "#7b61ff",
    "#00acc1", "#795548", "#2a4f98", "#607d8b", "#d81b60",
  ];
  const __kwColorMap = new Map();

  function hashStr(s) {
    s = String(s || "");
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
    return Math.abs(h);
  }
  function colorFor(kw) {
    kw = String(kw || "").trim();
    if (!kw) return LINE_PALETTE[0];
    if (__kwColorMap.has(kw)) return __kwColorMap.get(kw);
    const c = LINE_PALETTE[hashStr(kw) % LINE_PALETTE.length];
    __kwColorMap.set(kw, c);
    return c;
  }
  function clamp(n, a, b) {
    return Math.max(a, Math.min(b, n));
  }
  function pad2(n) {
    return String(n).padStart(2, "0");
  }
  function isoDate(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  // -------------------------
  // 상태
  // -------------------------
  let baseKeyword = (document.querySelector("#keywordDropdown .cselect__value")?.textContent || "주식").trim();
  let compareSet = new Set(); // base 제외한 비교 키워드만

  // =========================================================
  // TS3: 워드클라우드
  // =========================================================
  const CLOUD_PALETTE = [
    "#1e63ff", "#e53935", "#18a567", "#ff9800", "#7b61ff", 
    "#00acc1", "#795548", "#2a4f98", "#607d8b", "#d81b60"];

  function pickColor(word, i) {
    const h = hashStr(word) + i * 97;
    return CLOUD_PALETTE[h % CLOUD_PALETTE.length];
  }
  function pickRotateDeg(word) {
    const r = (hashStr(word) % 5) - 2;
    return r * 3;
  }

  async function renderCloud(keyword) {
    const DEBUG_CLOUD = false;
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

      const scores = items.map((x) => (typeof x.score === "number" ? x.score : null)).filter((v) => v != null);
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
          span.style.opacity = String(clamp(0.7 + t * 0.3, 0.7, 1));
          span.title = `score: ${it.score.toFixed(4)}`;
        } else {
          span.classList.add(i === 0 ? "lg" : i < 3 ? "md" : "sm");
        }

        span.style.transform = `rotate(${pickRotateDeg(it.kw)}deg)`;
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
  // TS3: 도넛(감성 합계)
  // =========================================================
  let __donutReqSeq = 0;

  function setDonutByCounts(pos, neu, neg, meta = {}) {
    if (!ts3DonutEl) return;

    const total = (pos + neu + neg) || 0;

    if (total <= 0) {
      ts3DonutEl.style.background = "conic-gradient(#8a97ad 0 100%)";
      ts3DonutEl.setAttribute("aria-label", "감성 비율 도넛 차트 (데이터 없음)");
      clearDonutLabels();
      return;
    }

    const pPos = Math.floor((pos / total) * 100);
    const pNeu = Math.floor((neu / total) * 100);
    const pNeg = Math.max(0, 100 - pPos - pNeu);

    const a = pPos;
    const b = pPos + pNeu;

    ts3DonutEl.style.background = `conic-gradient(
      #1e63ff 0 ${a}%,
      #8a97ad ${a}% ${b}%,
      #e53935 ${b}% 100%
    )`;

    ts3DonutEl.setAttribute(
      "aria-label",
      `감성 비율 도넛 차트 (${meta.keyword || ""} ${meta.start || ""}~${meta.end || ""})
      (긍정 ${pPos}%, 중립 ${pNeu}%, 부정 ${pNeg}%)
      | 건수(긍정 ${pos}, 중립 ${neu}, 부정 ${neg}, 합계 ${total})`
    );

    renderDonutPercentLabels(pPos, pNeu, pNeg);
  }

  async function renderDonut(keyword) {
    if (!ts3DonutEl) return;

    const r = window.getAppRange?.() || {};
    const start = r.start;
    const end = r.end;
    if (!start || !end) return;

    const seq = ++__donutReqSeq;

    ts3DonutEl.style.background = "conic-gradient(#eef2fb 0 100%)";
    ts3DonutEl.setAttribute("aria-label", "감성 비율 도넛 차트 (불러오는 중)");
    clearDonutLabels();

    try {
      const url = `/articles/sentiment-sum?keyword=${encodeURIComponent(keyword)}&start=${start}&end=${end}`;
      const res = await fetch(url, { credentials: "same-origin" });
      const data = await res.json().catch(() => null);

      console.log("[TS3][donut] response:", data);

      if (seq !== __donutReqSeq) return;

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

  // =========================================================
  // 기간(range) 관리 + 이벤트(app:rangechange)
  // =========================================================
  let __appRange = null;

  function clampEndToYesterdayISO(inputISO) {
    const yesterdayISO = toISO(addDays(new Date(), -1));
    return !inputISO || inputISO > yesterdayISO ? yesterdayISO : inputISO;
  }

  function calcPrevSameLength(start, end) {
    const msDay = 24 * 60 * 60 * 1000;
    const lenDays = Math.round((end - start) / msDay) + 1;; // start==end면 0
    const prevEnd = addDays(start, -1);
    const prevStart = addDays(prevEnd, -(lenDays - 1));
    return { prevStart: toISO(prevStart), prevEnd: toISO(prevEnd) };
  }

  function getActiveGrain() {
    return document.querySelector(".seg-btn.is-active")?.dataset.grain || "day";
  }

  function calcStartByGrain(grain, end) {
    if (grain === "day") return new Date(end);
    if (grain === "week") return addDays(end, -7); // 7일
    if (grain === "month") return addMonthsClamp(end, -1);
    if (grain === "year") return addYearsClamp(end, -1);
    return new Date(end);
  }

  function emitRangeChange({ preset = false } = {}) {
    const grain = getActiveGrain();

    const yesterdayISO = toISO(addDays(new Date(), -1));
    if (endDateEl) endDateEl.max = yesterdayISO;

    const endISO = clampEndToYesterdayISO(endDateEl?.value);
    if (endDateEl) endDateEl.value = endISO;

    let end = normalize(parseISO(endISO) || addDays(new Date(), -1));

    let start;
    if (preset) {
      start = normalize(calcStartByGrain(grain, end));
      if (startDateEl) startDateEl.value = toISO(start);
    } else {
      start = normalize(parseISO(startDateEl?.value) || end);
    }

    if (start > end) {
      start = new Date(end);
      if (startDateEl) startDateEl.value = toISO(start);
    }

    if (startDateEl) startDateEl.max = toISO(end);
    if (endDateEl) endDateEl.min = toISO(start);

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

  window.getAppRange = () =>
    __appRange || {
      grain: getActiveGrain(),
      start: startDateEl?.value,
      end: endDateEl?.value,
      prevStart: null,
      prevEnd: null,
    };

  function onManualDateChange() {
    clearSegActive(); // ✅ 수동 날짜 => 자유기간(range)
    emitRangeChange({ preset: false });
  }

  startDateEl?.addEventListener("input", onManualDateChange);
  startDateEl?.addEventListener("change", onManualDateChange);
  endDateEl?.addEventListener("input", onManualDateChange);
  endDateEl?.addEventListener("change", onManualDateChange);

  segmentedBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      setSegActive(btn.dataset.grain);
      emitRangeChange({ preset: true });
    });
  });

  emitRangeChange({ preset: true }); // 최초 로드도 프리셋으로

  // =========================================================
  // TS3: Line Chart (keyword_trend)
  // =========================================================
  let __trendReqSeq = 0;
  let chart = null;

  function bucketKey(dateObj, grain) {
    const d = new Date(dateObj);
    d.setHours(0, 0, 0, 0);

    if (grain === "day") return isoDate(d);
    if (grain === "week") {
      const day = d.getDay(); // 0=일 ... 1=월
      const diffToMon = (day + 6) % 7;
      const mon = new Date(d);
      mon.setDate(d.getDate() - diffToMon);
      return isoDate(mon);
    }
    if (grain === "month") return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
    if (grain === "year") return String(d.getFullYear());
    return isoDate(d);
  }

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

  function aggregateTrendToGrain(trend, grain, startISO, endISO) {
    const dates = Array.isArray(trend?.dates) ? trend.dates : [];
    const series = trend?.series || {};

    const fullDateObjs = makeFullDateObjs(startISO, endISO);
    const labels = [];
    const labelIndex = new Map();

    fullDateObjs.forEach((d) => {
      const key = bucketKey(d, grain);
      if (!labelIndex.has(key)) {
        labelIndex.set(key, labels.length);
        labels.push(key);
      }
    });

    const outSeries = {};
    Object.entries(series).forEach(([kw, arr]) => {
      const bucketed = new Array(labels.length).fill(0);
      dates.forEach((iso, i) => {
        const d = new Date(iso + "T00:00:00");
        const key = bucketKey(d, grain);
        const idx = labelIndex.get(key);
        if (idx != null) bucketed[idx] += arr?.[i] ?? 0;
      });
      outSeries[kw] = bucketed;
    });

    return { labels, series: outSeries };
  }

  async function fetchTrend(start, end, keywords) {
    const qs = new URLSearchParams({ start, end });
    (keywords || []).forEach((k) => qs.append("keywords", k));

    const res = await fetch(`/api/keyword_trend?${qs.toString()}`, {
      credentials: "same-origin",
    });

    if (!res.ok) throw new Error(`keyword_trend HTTP ${res.status}`);
    return await res.json();
  }

  function pickUniqueColor(kw, usedColors) {
    const base = hashStr(kw) % LINE_PALETTE.length;

    for (let step = 0; step < LINE_PALETTE.length; step++) {
        const idx = (base + step) % LINE_PALETTE.length;
        const c = LINE_PALETTE[idx];
        if (!usedColors.has(c)) {
        usedColors.add(c);
        return c;
        }
    }

    // 팔레트 다 썼으면 기본값
    return LINE_PALETTE[base];
    }

  async function renderLineChart() {
    if (!ts3Canvas || typeof Chart === "undefined") return;

    const { start, end } = window.getAppRange?.() || {};
    const grain = getActiveGrainForChart();
    if (!start || !end) return;

    const seq = ++__trendReqSeq;

    if (ts3Placeholder) {
      ts3Placeholder.style.display = "grid";
      ts3Placeholder.textContent = "불러오는 중...";
    }
    ts3Canvas.style.display = "none";

    try {
      const reqKeywords = [baseKeyword, ...Array.from(compareSet)];
      console.log("[TS3] fetchTrend keywords =", reqKeywords);

      const trend = await fetchTrend(start, end, reqKeywords);

      if (seq !== __trendReqSeq) return;

      if (!trend?.success || !trend?.series) {
        if (ts3Placeholder) {
          ts3Placeholder.style.display = "grid";
          ts3Placeholder.textContent = "trend 데이터 없음";
        }
        return;
      }

      const agg = aggregateTrendToGrain(trend, grain, start, end);
      const labels = agg.labels;
      const seriesAll = agg.series;
      const seriesKeys = Object.keys(seriesAll);

      function resolveSeriesKey(uiKw) {
        const kw = String(uiKw).trim();
        if (seriesAll[kw]) return kw;
        return seriesKeys.find((k) => k.includes(kw) || kw.includes(k)) || null;
      }

      const kws = [baseKeyword, ...Array.from(compareSet)];
      const datasets = [];

      const usedColors = new Set(); // ✅ 차트 1회 렌더 기준

        for (const uiKw of kws) {
        const serverKw = resolveSeriesKey(uiKw);
        if (!serverKw) continue;

        const lineColor = pickUniqueColor(uiKw, usedColors);

        datasets.push({
            label: uiKw,
            data: seriesAll[serverKw] || new Array(labels.length).fill(0),
            borderColor: lineColor,
            backgroundColor: lineColor,
            borderWidth: uiKw === baseKeyword ? 3 : 2,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 4,
        });
        }

      if (!datasets.length) {
        if (ts3Placeholder) {
          ts3Placeholder.style.display = "grid";
          ts3Placeholder.textContent = `선택 키워드("${baseKeyword}")가 trend 데이터(series)에 없습니다.`;
        }
        ts3Canvas.style.display = "none";
        if (chart) {
          chart.destroy();
          chart = null;
        }
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
    } catch (e) {
      if (seq !== __trendReqSeq) return;
      console.error("[TS3][line] error", e);

      if (ts3Placeholder) {
        ts3Placeholder.style.display = "grid";
        ts3Placeholder.textContent = "차트 불러오기 실패(콘솔 확인)";
      }
      ts3Canvas.style.display = "none";
    }
  }

  // =========================================================
  // TS3: 버튼(비교 토글) + baseKeyword 변경
  // =========================================================
  function syncButtons() {
    if (!ts3KlistEl) return;
    const btns = Array.from(ts3KlistEl.querySelectorAll(".ts3-kbtn"));
    btns.forEach((b) => {
      const kw = b.dataset.keyword;
      const isBase = kw === baseKeyword;
      const isCompare = compareSet.has(kw);

      b.classList.toggle("is-active", isBase || isCompare);
      b.setAttribute("aria-pressed", isBase || isCompare ? "true" : "false");
    });
  }

  function setBaseKeyword(next) {
    if (!next) return;

    baseKeyword = next;
    compareSet = new Set(); // 기준 바뀌면 비교 초기화 (원하면 유지로 바꿀 수 있음)

    if (ts3WordTag) ts3WordTag.textContent = baseKeyword;
    if (ts3DonutTag) ts3DonutTag.textContent = baseKeyword;

    syncButtons();
    renderCloud(baseKeyword);
    renderDonut(baseKeyword);
    renderLineChart();
    console.log("KEYWORDS:", JSON.stringify(KEYWORDS, null, 2));
  }

  function toggleCompareKeyword(kw) {
    if (!kw) return;
    if (kw === baseKeyword) return; // 기준은 제거 불가

    console.log("[TS3] toggleCompareKeyword", kw, "before", Array.from(compareSet));

    if (compareSet.has(kw)) compareSet.delete(kw);
    else compareSet.add(kw);

    console.log("[TS3] after", Array.from(compareSet));

    syncButtons();
    renderLineChart();
  }

  ts3KlistEl?.addEventListener("click", (e) => {
    const btn = e.target.closest(".ts3-kbtn");
    if (!btn) return;
    const kw = btn.dataset.keyword;
    toggleCompareKeyword(kw);
  });

  function rebuildButtons(items) {
    if (!ts3KlistEl) return;

    const kws = items.slice(0, 10).map((x) => x.keyword);

    ts3KlistEl.innerHTML = kws
      .map(
        (kw) =>
          `<button type="button" class="ts3-kbtn" data-keyword="${kw}" role="tab" aria-selected="false">${kw}</button>`
      )
      .join("");

    if (kws.length && !kws.includes(baseKeyword)) {
      setBaseKeyword(kws[0]);
    } else {
      syncButtons();
      renderLineChart();
    }
  }

  // 초기 baseKeyword: 드롭다운과 동기화
  const init = (
    document.querySelector('#keywordDropdown input[type="hidden"]')?.value ||
    document.querySelector("#keywordDropdown .cselect__value")?.textContent ||
    "주식"
  ).trim();
  setBaseKeyword(init);

  // 기간 바뀌면 TS3 갱신
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

window.ts3Api = ts3Api;
