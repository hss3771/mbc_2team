/* =========================
   TrendScope main.js (완성본)
   - HTML 구조: user가 준 main.html 기준
   ========================= */

// ===== 전역 상태 =====
let KEYWORDS = []; // ranking items
let dropdownApi = null;

// ===== DOM =====
const rankListEl = document.getElementById("rankList");
const summaryKeywordEl = document.getElementById("summaryKeyword");
const summaryListEl = document.getElementById("summaryList");

const segmentedBtns = Array.from(document.querySelectorAll(".seg-btn"));
const startDateEl = document.getElementById("startDate");
const endDateEl = document.getElementById("endDate");

// TS2 list elements
const ts2Els = {
  pos: document.getElementById("ts2ListPos"),
  neu: document.getElementById("ts2ListNeu"),
  neg: document.getElementById("ts2ListNeg"),
};

// TS3 elements
const ts3Root = document.getElementById("main3");
const ts3KlistEl = ts3Root?.querySelector(".ts3-klist");
const ts3WordTag = document.getElementById("ts3WordTag");
const ts3DonutTag = document.getElementById("ts3DonutTag");
const ts3DonutEl = document.getElementById("ts3Donut");
const ts3CloudEl = document.getElementById("ts3WordCloud");
const ts3Canvas = document.getElementById("ts3LineCanvas");
const ts3Placeholder = ts3Root?.querySelector(".ts3-placeholder");

// ===== 유틸 =====
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
function daysInMonth(y, m) { return new Date(y, m + 1, 0).getDate(); }
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

// ===== mode 결정 =====
function getActiveMode() {
  // 버튼이 활성화면 day/week/month/year, 아니면 자유기간 range
  return document.querySelector(".seg-btn.is-active")?.dataset.grain || "range";
}
function getActiveGrainForChart() {
  // 차트 라벨은 seg 활성 기준으로, 없으면 "day"로 표시(원하면 range->day로 둬도 OK)
  return document.querySelector(".seg-btn.is-active")?.dataset.grain || "day";
}

// ===== app range 상태 =====
let __appRange = null;

function clampEndToYesterdayISO(inputISO) {
  const yesterdayISO = toISO(addDays(new Date(), -1));
  return (!inputISO || inputISO > yesterdayISO) ? yesterdayISO : inputISO;
}

function calcPrevSameLength(start, end) {
  const msDay = 24 * 60 * 60 * 1000;
  const diffDays = Math.round((end - start) / msDay); // start==end면 0
  const prevEnd = addDays(start, -1);
  const prevStart = addDays(prevEnd, -diffDays);
  return { prevStart: toISO(prevStart), prevEnd: toISO(prevEnd) };
}

function calcStartByGrain(grain, end) {
  if (grain === "day") return new Date(end);
  if (grain === "week") return addDays(end, -6);        // 총 7일
  if (grain === "month") return addMonthsClamp(end, -1);
  if (grain === "year") return addYearsClamp(end, -1);
  return new Date(end);
}

function emitRangeChange({ preset = false } = {}) {
  const mode = getActiveMode();

  // 종료일은 "어제까지만" 제한
  const yesterdayISO = toISO(addDays(new Date(), -1));
  if (endDateEl) endDateEl.max = yesterdayISO;

  const endISO = clampEndToYesterdayISO(endDateEl?.value);
  if (endDateEl) endDateEl.value = endISO;
  let end = normalize(parseISO(endISO) || addDays(new Date(), -1));

  let start;
  if (preset && mode !== "range") {
    start = normalize(calcStartByGrain(mode, end));
    if (startDateEl) startDateEl.value = toISO(start);
  } else {
    start = normalize(parseISO(startDateEl?.value) || end);
  }

  if (start > end) {
    start = new Date(end);
    if (startDateEl) startDateEl.value = toISO(start);
  }

  // 서로 제약
  if (startDateEl) startDateEl.max = toISO(end);
  if (endDateEl) endDateEl.min = toISO(start);

  const prev = calcPrevSameLength(start, end);

  __appRange = {
    mode,                  // day/week/month/year/range
    grain: getActiveGrainForChart(), // 차트 라벨용
    start: toISO(start),
    end: toISO(end),
    prevStart: prev.prevStart,
    prevEnd: prev.prevEnd,
  };

  document.dispatchEvent(new CustomEvent("app:rangechange", { detail: __appRange }));
}

window.getAppRange = () => __appRange || {
  mode: getActiveMode(),
  grain: getActiveGrainForChart(),
  start: startDateEl?.value,
  end: endDateEl?.value,
  prevStart: null,
  prevEnd: null
};

// ===== 랭킹 렌더 유틸 =====
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

// ===== 요약(임시) =====
const SUMMARY_MAP = {
  "주식": ["(샘플) 요약/선정이유 영역입니다.", "실제 서버 요약으로 교체하세요."],
};
function renderSummary(keyword) {
  if (!summaryKeywordEl || !summaryListEl) return;
  summaryKeywordEl.textContent = keyword;
  summaryListEl.innerHTML = "";

  const items = SUMMARY_MAP[keyword] || SUMMARY_MAP["주식"] || [];
  items.forEach((txt) => {
    const li = document.createElement("li");
    li.textContent = txt;
    summaryListEl.appendChild(li);
  });
}

// ===== 키워드 선택(랭킹/드롭다운 공통) =====
function selectKeyword(keyword) {
  // 랭킹/요약
  renderRanking(keyword);
  renderSummary(keyword);

  // 드롭다운도 같이 변경
  dropdownApi?.setValue(keyword);

  // TS2(기사) / TS3(그래프) 갱신
  ts2Api?.setKeyword(keyword);
  ts3Api?.setKeyword(keyword);
}
window.selectKeyword = selectKeyword;

// =====================================================
// 1) 키워드 드롭다운 (이벤트 위임 방식 → 옵션 재생성해도 OK)
// =====================================================
(function initKeywordDropdown() {
  const root = document.getElementById("keywordDropdown");
  if (!root) return;

  const btn = root.querySelector(".cselect__btn");
  const valueEl = root.querySelector(".cselect__value");
  const list = root.querySelector(".cselect__list");
  const hidden = root.querySelector('input[type="hidden"]');

  if (!btn || !valueEl || !list) return;

  function close() {
    root.classList.remove("is-open");
    btn.setAttribute("aria-expanded", "false");
  }
  function toggle() {
    root.classList.toggle("is-open");
    btn.setAttribute("aria-expanded", root.classList.contains("is-open") ? "true" : "false");
  }

  function applyValue(v) {
    const opts = Array.from(root.querySelectorAll(".cselect__opt"));
    opts.forEach(o => {
      const isMatch = (o.dataset.value ?? o.textContent.trim()) === v;
      o.classList.toggle("is-selected", isMatch);
      if (isMatch) o.setAttribute("aria-selected", "true");
      else o.removeAttribute("aria-selected");
    });

    valueEl.textContent = v;
    if (hidden) hidden.value = v;
  }

  // 버튼 클릭
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    toggle();
  });

  // 옵션 클릭(이벤트 위임)
  list.addEventListener("click", (e) => {
    const opt = e.target.closest(".cselect__opt");
    if (!opt) return;
    const v = opt.dataset.value ?? opt.textContent.trim();
    applyValue(v);
    close();
    selectKeyword(v);
  });

  // 외부 클릭 닫기
  document.addEventListener("click", (e) => {
    if (!root.contains(e.target)) close();
  });

  dropdownApi = { setValue: applyValue };

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

// =====================================================
// 3) 기간 UI(날짜/seg) 이벤트
// =====================================================
function onManualDateChange() {
  clearSegActive();                 // ✅ 수동 날짜 => 자유기간(range)
  emitRangeChange({ preset: false });
}

startDateEl?.addEventListener("input", onManualDateChange);
startDateEl?.addEventListener("change", onManualDateChange);
endDateEl?.addEventListener("input", onManualDateChange);
endDateEl?.addEventListener("change", onManualDateChange);

segmentedBtns.forEach((btn) => {
  btn.addEventListener("click", () => {
    setSegActive(btn.dataset.grain);
    emitRangeChange({ preset: true }); // 프리셋: start 자동 세팅
  });
});

// =====================================================
// 4) TS2 기사(샘플 제거, 서버 연동용)
//    - 카드에 선택 키워드 표시(요구사항)
// =====================================================
function escapeHtml(s) {
  return String(s ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderTs2Empty(targetEl, keyword) {
  if (!targetEl) return;
  targetEl.innerHTML = `
    <div class="ts2-empty">
      <div class="ts2-empty-title">${escapeHtml(keyword)} 관련 기사가 없어요</div>
      <div class="ts2-empty-sub">기간/정렬을 바꿔 다시 확인해보세요.</div>
    </div>`;
}

function cardHTML_Ts2(it, keyword) {
  // it: { title, desc, date, press_name/source, flag, url ... }
  const press = escapeHtml(it.press_name || it.source || "-");
  const title = escapeHtml(it.title || "-");
  const desc = escapeHtml(it.desc || it.summary || "");
  const date = escapeHtml(it.date || it.published_at || "-");
  const flag = escapeHtml(it.flag || it.trust_flag || "정상");
  const kw = escapeHtml(keyword);

  return `
    <article class="ts2-card" tabindex="0">
      <div class="ts2-card__top">
        <span class="ts2-mini">${flag}</span>
        <span class="ts2-mini">${press}</span>
      </div>

      <h4 class="ts2-title">${title}</h4>
      <p class="ts2-desc">${desc}</p>

      <div class="ts2-meta">
        <span class="ts2-chip ts2-chip--date">${date}</span>
        <span class="ts2-chip">${kw}</span>
        <button type="button" class="ts2-chip ts2-chip--btn">기사 요약</button>
      </div>
    </article>
  `;
}

/**
 * ✅ 여기만 네 서버에 맞게 수정하면 TS2가 진짜 데이터로 돌아감.
 * 기본 가정:
 * - GET /api/articles?keyword=...&sent=pos|neu|neg&start=YYYY-MM-DD&end=YYYY-MM-DD&sort=recent|old|popular|trust_high|trust_low
 * - 응답: { items: [...] }
 */
async function fetchTs2Articles({ keyword, sent, sort }) {
  const range = window.getAppRange?.() || {};
  const start = range.start;
  const end = range.end;

  const qs = new URLSearchParams({
    keyword,
    sent,
    start,
    end,
    sort,
    size: "20",
  });

  const res = await fetch(`/api/articles?${qs.toString()}`, { method: "GET" });
  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    console.error("[ts2] fetch failed:", res.status, msg);
    return [];
  }

  const data = await res.json();
  return Array.isArray(data?.items) ? data.items : [];
}

const ts2Api = (function initTS2() {
  // 정렬 상태
  const sortMode = { pos: "recent", neu: "recent", neg: "recent" };
  let currentKeyword = (document.querySelector("#keywordDropdown .cselect__value")?.textContent || "주식").trim();

  async function renderOne(sent) {
    const target = ts2Els[sent];
    if (!target) return;

    // 서버에서 fetch
    const items = await fetchTs2Articles({
      keyword: currentKeyword,
      sent,
      sort: sortMode[sent],
    }).catch(() => []);

    if (!items.length) {
      renderTs2Empty(target, currentKeyword);
      return;
    }

    target.innerHTML = items.map(it => cardHTML_Ts2(it, currentKeyword)).join("");

    // 카드 클릭 open
    const first = target.querySelector(".ts2-card");
    if (first) first.classList.add("is-open");

    target.querySelectorAll(".ts2-card").forEach(card => {
      card.addEventListener("click", () => {
        target.querySelectorAll(".ts2-card").forEach(c => c.classList.remove("is-open"));
        card.classList.add("is-open");
      });
    });

    target.querySelectorAll(".ts2-chip--btn").forEach(btn => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        alert("기사 요약(서버 연동 예정)");
      });
    });
  }

  async function renderAll() {
    await Promise.all([renderOne("pos"), renderOne("neu"), renderOne("neg")]);
  }

  // TS2 정렬 드롭다운(너 HTML의 ts2-sort 그대로 활용)
  function initCSelect(root, onPick) {
    const btn = root.querySelector(".cselect__btn");
    const valueEl = root.querySelector(".cselect__value");
    const opts = Array.from(root.querySelectorAll(".cselect__opt"));
    if (!btn || !valueEl || !opts.length) return;

    function close() { root.classList.remove("is-open"); btn.setAttribute("aria-expanded", "false"); }
    function toggle() {
      root.classList.toggle("is-open");
      btn.setAttribute("aria-expanded", root.classList.contains("is-open") ? "true" : "false");
    }
    function applyValue(v) {
      opts.forEach(o => {
        const isMatch = (o.dataset.value ?? o.textContent.trim()) === v;
        o.classList.toggle("is-selected", isMatch);
        if (isMatch) o.setAttribute("aria-selected", "true");
        else o.removeAttribute("aria-selected");
      });
      const picked = opts.find(o => (o.dataset.value ?? o.textContent.trim()) === v);
      valueEl.textContent = picked ? picked.textContent.trim() : v;
    }

    const initOpt = opts.find(o => o.classList.contains("is-selected")) || opts[0];
    const initVal = initOpt.dataset.value ?? initOpt.textContent.trim();
    applyValue(initVal);

    btn.addEventListener("click", (e) => { e.preventDefault(); toggle(); });
    opts.forEach(opt => {
      opt.addEventListener("click", () => {
        const v = opt.dataset.value ?? opt.textContent.trim();
        applyValue(v);
        close();
        onPick?.(v);
      });
    });
    document.addEventListener("click", (e) => { if (!root.contains(e.target)) close(); });

    return { setValue: applyValue };
  }

  document.querySelectorAll(".ts2-sort[data-sort]").forEach(root => {
    const sent = root.getAttribute("data-sort");
    initCSelect(root, (mode) => {
      sortMode[sent] = mode;
      renderOne(sent);
    });
  });

  // 외부 API
  const api = {
    setKeyword: (kw) => { currentKeyword = kw; renderAll(); },
    renderAll,
  };

  // 기간 바뀌면 다시 렌더
  document.addEventListener("app:rangechange", () => { renderAll(); });

  return api;
})();

// =====================================================
// 5) TS3 키워드 버튼을 랭킹 기반으로 재생성 + 라인차트/워드/도넛(임시)
// =====================================================
const ts3Api = (function initTS3() {
  if (!ts3Root) return {};

  // 상태
  let baseKeyword = (document.querySelector("#keywordDropdown .cselect__value")?.textContent || "주식").trim();
  let compareSet = new Set();

  // 색상(키워드 늘어나도 기본색으로 fallback)
  const COLOR = {
    "주식": "#0462D2",
    "부동산": "#e53935",
    "고용": "#8a97ad",
  };
  const colorFor = (kw) => COLOR[kw] || "#0462D2";

  // 임시 워드/감성(실서버로 교체 예정)
  function renderCloud(keyword) {
    if (!ts3CloudEl) return;
    const words = [keyword, "정책", "금리", "시장", "수요", "경기", "물가", "투자", "수출", "고용", "기업", "환율"];
    const main = words[0];
    const rest = words.slice(1).slice(0, 11);

    const spans = [
      `<span class="ts3-w lg">${escapeHtml(main)}</span>`,
      ...rest.map((w, i) => {
        const cls = i % 3 === 0 ? "md" : "sm";
        return `<span class="ts3-w ${cls}">${escapeHtml(w)}</span>`;
      }),
    ].join("");

    ts3CloudEl.innerHTML = `<div class="ts3-cloud-inner">${spans}</div>`;
  }

  function renderDonut() {
    if (!ts3DonutEl) return;
    // 임시 비율(랜덤 느낌)
    const pos = 40, neu = 35, neg = 25;
    ts3DonutEl.style.background =
      `conic-gradient(#1e63ff 0 ${pos}%, #8a97ad ${pos}% ${pos + neu}%, #e53935 ${pos + neu}% 100%)`;
    ts3DonutEl.setAttribute("aria-label", `감성 비율 도넛 차트 (긍정 ${pos}%, 중립 ${neu}%, 부정 ${neg}%)`);
  }

  // 차트 라벨 생성
  function makeLabels(startISO, endISO, grain) {
    const labels = [];
    if (!startISO || !endISO) return labels;

    let s = new Date(startISO + "T00:00:00");
    let e = new Date(endISO + "T00:00:00");
    if (s > e) [s, e] = [e, s];

    const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

    if (grain === "day") {
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) labels.push(iso(d));
      return labels;
    }
    if (grain === "week") {
      for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 7)) labels.push(iso(d));
      return labels;
    }
    if (grain === "month") {
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

  // 임시 시계열 생성(서버로 교체 가능)
  function hash32(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function makeSeries(keyword, labels) {
    const seed = hash32(keyword);
    const base = (seed % 25) + 15;
    const len = Math.max(1, labels.length);

    return labels.map((lab, i) => {
      const t = i / len;
      const drift = t * 8;
      const wave = Math.sin(t * Math.PI * 2) * 6;
      const noise = (hash32(keyword + "|" + lab) % 11) - 5;
      const v = Math.round(base + drift + wave + noise);
      return Math.max(0, v);
    });
  }

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

  function renderLineChart() {
    if (!ts3Canvas || typeof Chart === "undefined") return;

    const { start, end } = window.getAppRange?.() || {};
    const grain = getActiveGrainForChart();
    const labels = makeLabels(start, end, grain);
    const datasets = buildDatasets(labels);

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

  function syncButtonsUI() {
    if (!ts3KlistEl) return;
    const btns = Array.from(ts3KlistEl.querySelectorAll(".ts3-kbtn"));

    btns.forEach(b => {
      const kw = b.dataset.keyword;
      const isBase = kw === baseKeyword;
      const isCompare = compareSet.has(kw);

      // base는 active 느낌 유지 + compare도 active
      b.classList.toggle("is-active", isBase || isCompare);
      b.setAttribute("aria-selected", (isBase || isCompare) ? "true" : "false");
    });
  }

  function setBaseKeyword(next) {
    baseKeyword = next;
    compareSet = new Set(); // 기준 변경 시 비교 초기화(원하면 유지로 바꿔도 됨)
    if (ts3WordTag) ts3WordTag.textContent = baseKeyword;
    if (ts3DonutTag) ts3DonutTag.textContent = baseKeyword;
    renderCloud(baseKeyword);
    renderDonut();
    syncButtonsUI();
    renderLineChart();
  }

  function toggleCompareKeyword(kw) {
    if (kw === baseKeyword) return;
    if (compareSet.has(kw)) compareSet.delete(kw);
    else compareSet.add(kw);
    syncButtonsUI();
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
      syncButtonsUI();
      renderLineChart();
    }
  }

  // 기간 바뀌면 라인차트 갱신
  document.addEventListener("app:rangechange", () => {
    renderLineChart();
  });

  // 초기 렌더
  setBaseKeyword(baseKeyword);

  return {
    setKeyword: setBaseKeyword,
    toggleCompareKeyword,
    rebuildButtons,
    getState: () => ({ baseKeyword, compare: Array.from(compareSet) }),
  };
})();

// =====================================================
// 6) 초기 부팅
// =====================================================
(function boot() {
  // 첫 로드: day 활성 상태(HTML에 is-active 이미 있음)
  // 종료일은 어제까지 고정 + 프리셋 기간 적용
  emitRangeChange({ preset: true });

  // 랭킹 최초 로드 → 드롭다운/TS3도 같이 바뀜
  fetchRankingAndRender({ keepSelected: false });
})();
