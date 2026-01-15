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
const ts3DonutEl = ts3Root?.querySelector('#ts3Donut') ?? null;
const ts3CloudEl = ts3Root?.querySelector('#ts3WordCloud') ?? null;
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

// ✅ 마지막 도넛 퍼센트(리사이즈 재배치용) - renderDonutPercentLabels 밖(전역/모듈 스코프)
let __lastDonutPcts = null;

// ✅ resize 연타 방지
let __donutRaf = 0;

// ✅ 리스너/옵저버 1회만 바인딩
let __donutBound = false;
let __donutRO = null;
let __donutMql = null;

function scheduleDonutLabelRerender() {
  if (!__lastDonutPcts) return;
  cancelAnimationFrame(__donutRaf);
  __donutRaf = requestAnimationFrame(() => {
    renderDonutPercentLabels(__lastDonutPcts.pos, __lastDonutPcts.neu, __lastDonutPcts.neg);
  });
}

function bindDonutLabelAutoRerenderOnce() {
  if (__donutBound) return;

  const wrap = getDonutWrap();
  if (!wrap) return; // wrap 아직 없으면(초기 렌더 타이밍) 다음 render에서 다시 시도됨

  __donutBound = true;

  window.addEventListener("resize", scheduleDonutLabelRerender, { passive: true });
  window.visualViewport?.addEventListener("resize", scheduleDonutLabelRerender);

  __donutMql = window.matchMedia("(max-width: 520px)");
  __donutMql.addEventListener?.("change", scheduleDonutLabelRerender);

  if (typeof ResizeObserver !== "undefined") {
    __donutRO = new ResizeObserver(() => scheduleDonutLabelRerender());
    __donutRO.observe(wrap);
  }
}

function renderDonutPercentLabels(pPos, pNeu, pNeg) {
  if (!ts3DonutEl) return;

  // 라벨 자동 재배치(리사이즈/컨테이너 변화)
  bindDonutLabelAutoRerenderOnce();

  const wrapEl = getDonutWrap();
  if (!wrapEl) return;

  // 기존 라벨 제거
  clearDonutLabels();

  const COLOR = { pos: "#0073ff", neu: "#8a97ad", neg: "#ff0000" };

  const segments = [
    { key: "pos", pct: Number(pPos) || 0, color: COLOR.pos },
    { key: "neu", pct: Number(pNeu) || 0, color: COLOR.neu },
    { key: "neg", pct: Number(pNeg) || 0, color: COLOR.neg },
  ].filter((s) => s.pct > 0);

  if (!segments.length) return;

  const wrapRect = wrapEl.getBoundingClientRect();
  const donutRect = ts3DonutEl.getBoundingClientRect();
  const w = wrapRect.width;
  const h = wrapRect.height;

  // 레이아웃 아직 0이면 다음 프레임에 재시도
  if (!w || !h || !donutRect.width || !donutRect.height) {
    requestAnimationFrame(() => renderDonutPercentLabels(pPos, pNeu, pNeg));
    return;
  }

  // 도넛 중심 좌표(랩 기준)
  const cx = donutRect.left - wrapRect.left + donutRect.width / 2;
  const cy = donutRect.top - wrapRect.top + donutRect.height / 2;
  const size = Math.min(donutRect.width, donutRect.height);
  const rOuter = size * 0.5;

  const isMobile = window.matchMedia("(max-width: 520px)").matches;

  // 모바일: 안쪽, PC: 바깥쪽
  const LABEL_MODE = isMobile ? "inside" : "outside";
  const OUTSIDE_GAP = isMobile ? 6 : 13;
  const INSIDE_RATIO = isMobile ? 0.80 : 0.84;

  const rDesired =
    LABEL_MODE === "inside" ? rOuter * INSIDE_RATIO : rOuter + OUTSIDE_GAP;

  // inside일 때만 “박스 밖으로 튀지 않게” 전역 상한 적용
  const margin = 10;
  const sideNudge = 6;

  const rMaxGlobal = Math.max(
    0,
    Math.min(
      cx - margin,
      (w - margin) - cx,
      cy - margin,
      (h - margin) - cy
    )
  );

  const rFixed =
    LABEL_MODE === "inside"
      ? Math.min(rDesired, rMaxGlobal)
      : rDesired; // PC outside는 반경 유지

  // wrapEl positioning
  const csWrap = getComputedStyle(wrapEl);
  if (csWrap.position === "static") wrapEl.style.position = "relative";
  wrapEl.style.overflow = (LABEL_MODE === "outside") ? "visible" : "hidden";

  // SVG 라벨 레이어
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.classList.add("donut-anno");
  svg.setAttribute("width", String(w));
  svg.setAttribute("height", String(h));
  svg.setAttribute("viewBox", `0 0 ${w} ${h}`);
  svg.style.position = "absolute";
  svg.style.left = "0";
  svg.style.top = "0";
  svg.style.pointerEvents = "none";
  svg.style.overflow = "visible";

  let acc = 0; // 누적 퍼센트
  segments.forEach((seg) => {
    const startDeg = acc * 3.6;
    const endDeg = (acc + seg.pct) * 3.6;
    const midDeg = (startDeg + endDeg) / 2;
    acc += seg.pct;

    const rad = (midDeg - 90) * (Math.PI / 180);
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);

    const isRight = cos >= 0;

    let x = cx + rFixed * cos;
    let y = cy + rFixed * sin;

    // 좌/우 살짝 밀어서 겹침 완화
    x += isRight ? sideNudge : -sideNudge;

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.textContent = `${seg.pct}%`;
    text.setAttribute("x", String(x));
    text.setAttribute("y", String(y));
    text.setAttribute("text-anchor", isRight ? "start" : "end");
    text.setAttribute("dominant-baseline", "middle");
    text.setAttribute("font-size", "12");
    text.setAttribute("font-weight", "900");
    text.setAttribute("fill", seg.color);

    // 흰색 외곽선(가독성)
    text.setAttribute("paint-order", "stroke");
    text.setAttribute("stroke", "#ffffff");
    text.setAttribute("stroke-width", "3");

    svg.appendChild(text);
  });

  wrapEl.appendChild(svg);
}


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

// ===== 증감률/변동 안내 툴팁 (공통: viewport 안으로 자동 배치) =====
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

      // 다음 오픈 때 CSS 기본값으로 시작하도록 정리(선택)
      tip.style.removeProperty("position");
      tip.style.removeProperty("left");
      tip.style.removeProperty("top");
      tip.style.removeProperty("right");
    });
  }

  function placeTooltip(btn, tip) {
    const GAP = 8;
    const MARGIN = 12;
    const ARROW = 10; // ::before size(너 CSS가 10px)

    const vv = window.visualViewport;
    const vw = vv?.width || window.innerWidth;
    const vh = vv?.height || window.innerHeight;

    const b = btn.getBoundingClientRect();
    const t = tip.getBoundingClientRect(); // tip이 visible 상태여야 값이 나옴

    // 기본: 버튼 중앙 아래
    let left = b.left + b.width / 2 - t.width / 2;
    left = Math.max(MARGIN, Math.min(left, vw - MARGIN - t.width));

    let top = b.bottom + GAP;

    // 아래로 못 놓으면 위로
    if (top + t.height + MARGIN > vh) {
      top = b.top - GAP - t.height;
    }
    top = Math.max(MARGIN, Math.min(top, vh - MARGIN - t.height));

    // fixed로 박아버리면 main-scroll/overflow 영향 안 받음
    tip.style.position = "fixed";
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
    tip.style.right = "auto";

    // 화살표를 버튼 중앙에 맞춤(툴팁 내부 좌표)
    const arrowLeft = b.left + b.width / 2 - left - ARROW / 2;
    tip.style.setProperty(
      "--arrow-left",
      `${Math.max(10, Math.min(arrowLeft, t.width - 20))}px`
    );
  }

  wraps.forEach((w) => {
    const btn = w.querySelector(".info-btn");
    const tip = w.querySelector(".tooltip");
    if (!btn || !tip) return;

    // 초기 상태 안전하게
    tip.hidden = true;
    btn.setAttribute("aria-expanded", "false");

    btn.addEventListener("click", (e) => {
      e.stopPropagation();

      const willOpen = tip.hidden;
      closeAll();

      tip.hidden = !willOpen;
      btn.setAttribute("aria-expanded", willOpen ? "true" : "false");

      if (willOpen) {
        requestAnimationFrame(() => placeTooltip(btn, tip));
      }
    });

    tip.addEventListener("click", (e) => e.stopPropagation());
  });

  document.addEventListener("click", closeAll);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeAll();
  });

  // 스크롤/리사이즈 시 닫기(고정툴팁 떠있는 느낌 방지)
  document.querySelector(".main-scroll")?.addEventListener("scroll", closeAll, { passive: true });
  window.addEventListener("resize", closeAll);
  window.visualViewport?.addEventListener("resize", closeAll);
})();


// ===============================
// TS2 기사 상세 팝업 모달 (전역)
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

        <!-- 헤더(고정) -->
        <div class="ts2m-head">
            <div class="ts2m-press"></div>
            <div class="ts2m-title"></div>
            <div class="ts2m-meta"></div>
        </div>

        <!-- 본문 스크롤 영역 -->
        <div class="ts2m-body">
            <div class="ts2m-media" hidden>
            <img class="ts2m-img" alt="" loading="lazy" />
            </div>
            <div class="ts2m-summary"></div>
        </div>

        <!-- 하단 버튼(항상 보이게) -->
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
  const elMedia = root.querySelector(".ts2m-media");
  const elImg = root.querySelector(".ts2m-img");
  const elBody = root.querySelector(".ts2m-body");


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
    const imageUrl = (payload.image_url || payload.imageUrl || "").trim();

    elPress.textContent = press;
    elTitle.textContent = title;
    elMeta.textContent = date;
    elSummary.textContent = bodyOrSummary;

    // ✅ 내용 채운 뒤에 스크롤 맨 위로
    if (elBody) {
        elBody.scrollTop = 0;
        requestAnimationFrame(() => { elBody.scrollTop = 0; });
        }



    // ✅ 이미지 처리
    if (elMedia && elImg) {
      if (imageUrl) {
        elImg.src = imageUrl;
        elImg.alt = title ? `${title} 기사 이미지` : "기사 이미지";
        elMedia.hidden = false;

        elImg.onerror = () => {
          elImg.removeAttribute("src");
          elMedia.hidden = true;
        };
      } else {
        elImg.removeAttribute("src");
        elImg.alt = "";
        elMedia.hidden = true;
      }
    }

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
  let PRESS_LOGO_MAP;
  async function PRESS_LOGO() {
    try {
      const r = await fetch("/api/PRESS_LOGO", {
        credentials: "same-origin"
      });

      if (!r.ok) {
        throw new Error(`PRESS_LOGO fetch failed: ${r.status}`);
      }

      PRESS_LOGO_MAP = await r.json();
      console.log("[TS2] PRESS_LOGO_MAP loaded");

    } catch (err) {
      console.error("[TS2] load failed", err);
      PRESS_LOGO_MAP = {}; // fallback
    }
    console.log("PRESS_LOGO_MAP")
    console.log(PRESS_LOGO_MAP)
  }
  PRESS_LOGO()

  // ✅ TS2 컬럼(pos/neu/neg) -> ES sentiment.label 후보들
  const SENTIMENT_CANDIDATES = {
    pos: ["positive", "pos", "긍정"],
    neu: ["neutral", "neu", "중립"],
    neg: ["negative", "neg", "부정"],
  };

  // ✅ UI 정렬 -> py가 허용하는 orderby(latest|score)로만 매핑
  function mapOrderby(uiMode) {
    switch (uiMode) {
      case "recent": return "latest";
      case "old": return "old";
      case "trust_high": return "trust_high";
      case "trust_low": return "trust_low";
      // popular은 UI에서 제거했지만 혹시 남아있으면 폴백
      case "popular": return "latest";
      default: return "latest";
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

/* =========================
   요약(회원 전용) util
========================= */
const SUMMARY_CACHE = new Map(); // docId -> summaryText
const LOGIN_URL = "/login";      // ✅ 너희 로그인 페이지 경로로 수정

async function fetchArticleSummary(docId) {
  if (!docId) return { ok: false, code: "NO_ID" };

  if (SUMMARY_CACHE.has(docId)) {
    return { ok: true, summary: SUMMARY_CACHE.get(docId) };
  }

  // ✅ 보통 이게 맞음 (/api 아래에 라우터 mount되어 있으면)
  const url = `/articles/${encodeURIComponent(docId)}/summary`;

  const r = await fetch(url, { credentials: "same-origin" });

  if (r.status === 401) return { ok: false, code: "LOGIN_REQUIRED" };
  if (!r.ok) return { ok: false, code: "API_ERROR" };

  const j = await r.json().catch(() => null);
  const text = (j?.summary ?? "").trim();

  SUMMARY_CACHE.set(docId, text);
  return { ok: true, summary: text };
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

      const candidates = ["/api/articles/by-sentiment", "/articles/by-sentiment"];
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

    const docId =
        src?.doc_id ??
        src?.docId ??
        raw?.doc_id ??
        raw?.docId ??
        raw?._id ??
        "";

    // 본문: body
    const body =
      src?.body ??
      src?.content ??
      src?.news_content ??
      "";

    const summary = "";

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

    // ✅ 대표 이미지 URL
    const imageUrl =
      src?.image_url ??
      src?.imageUrl ??
      src?.image ??
      src?.thumbnail ??
      "";

    return {docId, title, summary, body, press, url, date, trustScore, trustLabel, imageUrl, raw };
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
        image_url: card.dataset.ts2Image || "",
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
        const body = String(a.body || "").trim();
        const url = String(a.url || "").trim();
        const dateOnly = formatDateOnly(a.date);
        const imageUrl = String(a.imageUrl || a.image_url || "").trim();
        const docId = String(a.docId || "").trim();

        const showTrust = shouldShowTrustBadge(sent);
        const trust = getTrustInfo(a);
        const trustChipHtml =
          (showTrust && trust.text)
            ? `<span class="ts2-chip ts2-chip--trust ${trust.cls}" title="${escapeHtml(trust.title)}">${escapeHtml(trust.text)}</span>`
            : "";

        return `
<article class="ts2-card js-ts2-card"
  role="button"
  tabindex="0"
  data-ts2-id="${escapeHtml(docId)}"
  data-ts2-press="${escapeHtml(press)}"
  data-ts2-date="${escapeHtml(dateOnly)}"
  data-ts2-title="${escapeHtml(title || "제목 없음")}"
  data-ts2-body="${escapeHtml(body || "")}"
  data-ts2-url="${escapeHtml(url || "")}"
  data-ts2-image="${escapeHtml(imageUrl || "")}"
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

  <!-- ✅ 요약 박스: 기본은 숨김 -->
  <div class="ts2-sumbox" hidden>
    <div class="ts2-sumtext"></div>
  </div>
</article>`;
      })
      .join("");

    hydratePressLogos(listEl);

    // ✅ 카드 클릭 모달(한 번만)
    bindTS2CardOpen(listEl);

    // ✅ 요약 버튼 토글 + 로그인 안내
    listEl.querySelectorAll(".js-ts2-card").forEach((card) => {
      const btn = card.querySelector(".js-ts2-toggle");
      if (!btn || btn.dataset.bound) return;

      btn.dataset.bound = "1";

      btn.addEventListener("click", async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const box = card.querySelector(".ts2-sumbox");
        const textEl = box?.querySelector(".ts2-sumtext");
        if (!box || !textEl) return;

        const isOpen = !box.hasAttribute("hidden");
        if (isOpen) {
            box.setAttribute("hidden", "");
            box.classList.remove("is-locked");
            const old = box.querySelector(".ts2-sumoverlay");
            if (old) old.remove();
            return;
        }


        box.removeAttribute("hidden");

        const docId = card.dataset.ts2Id || "";
        textEl.textContent = "요약 불러오는 중...";

        const res = await fetchArticleSummary(docId);

        // ✅ 비로그인: 블러 처리 + 오버레이(클릭 시 로그인 이동)
        if (!res.ok && res.code === "LOGIN_REQUIRED") {
        // 1) 박스 locked 상태
        box.classList.add("is-locked");

        // 2) 블러될 "가짜 요약" 텍스트(보기만 되고 블러됨)
        //    서버에서 못 받아오니까, 길이감만 있는 더미로 채워두면 UI가 자연스러워.
        textEl.textContent =
            "핵심 주장: (회원 전용 요약)\n\n근거:\n- (회원 전용 요약)\n- (회원 전용 요약)";

        // 3) 오버레이가 없으면 생성
        let overlay = box.querySelector(".ts2-sumoverlay");
        if (!overlay) {
            overlay = document.createElement("div");
            overlay.className = "ts2-sumoverlay";
            overlay.innerHTML = `
            <span class="ts2-sumoverlay__msg" role="link" tabindex="0">
                기사 요약은 회원에게만 제공됩니다.<br/>로그인 후 열람 가능
            </span>
            `;
            box.appendChild(overlay);

            const msgEl = overlay.querySelector(".ts2-sumoverlay__msg");
            const goLogin = (ev) => {
            ev.preventDefault();
            ev.stopPropagation();
            window.location.href = LOGIN_URL;
            };

            msgEl.addEventListener("click", goLogin);
            msgEl.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter" || ev.key === " ") goLogin(ev);
            });
        }

        return;
        }


        // 기타 에러
        if (!res.ok) {
          textEl.textContent = "(요약을 불러오지 못했어요)";
          return;
        }

        // 로그인 성공
        box.classList.remove("is-locked");
        const old = box.querySelector(".ts2-sumoverlay");
        if (old) old.remove();
        textEl.textContent = res.summary || "(요약이 비어 있어요)";

      });
    });
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
        sent === "neu" ? "neutral" :
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
    "#6797ff",
    "#36e7ac",
    "#ffbc49",
    "#ff6c6c",
    "#a077ff",
    "#51e5ff",
    "#fff348",
    "#ff80bf",
    "#c6ff71",
    "#8b8dff",
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
    "#3374ff",
    "#13dd9a",
    "#fdaf29",
    "#ff5050",
    "#824cff",
    "#1fdcfd",
    "#f3e300",
    "#ff5dae",
    "#afff37",
    "#6a6cff",
  ];

  function pickColor(word, i) {
    const h = hashStr(word) + i * 97;
    return CLOUD_PALETTE[h % CLOUD_PALETTE.length];
  }

  // ✅ 요청 순서 관리(빠르게 기간 바꿀 때 이전 응답이 덮어쓰는 문제 방지)
  let __cloudReqSeq = 0;

  async function renderCloud(keyword) {
    const DEBUG_CLOUD = false;
    if (!ts3CloudEl) return;

    const r = window.getAppRange?.() || {};
    const start = r.start;
    const end = r.end || r.start; // ✅ end 없으면 start
    if (!start) return;

    const seq = ++__cloudReqSeq;

    if (DEBUG_CLOUD) {
      console.log("[TS3][cloud] called", { keyword, start, end, grain: r.grain });
    }

    ts3CloudEl.innerHTML = `<div class="ts3-cloud-inner">불러오는 중…</div>`;

    try {
      // ✅ 신규 백엔드: 기간 집계
      const url =
        `/api/issue_wordcloud?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}` +
        `&keyword=${encodeURIComponent(keyword)}`;

      if (DEBUG_CLOUD) console.log("[TS3][cloud] request", url);

      const res = await fetch(url, { credentials: "same-origin" });
      const data = await res.json().catch(() => null);

      if (seq !== __cloudReqSeq) return; // ✅ stale 응답 무시

      if (DEBUG_CLOUD) console.log("[TS3][cloud] response", { ok: res.ok, status: res.status, data });

      if (!res.ok || !data?.success || !Array.isArray(data.sub_keywords) || data.sub_keywords.length === 0) {
        ts3CloudEl.innerHTML = `<div class="ts3-cloud-inner">데이터 없음</div>`;
        return;
      }

      // ✅ 백엔드 반환 포맷 우선: [{text, value}]
      // 하위호환: [{keyword, score}] 또는 문자열 배열도 수용
      const items = data.sub_keywords
        .slice(0, 30)
        .map((x) => {
          // 문자열 배열
          if (typeof x === "string") return { kw: x, score: null };

          if (x && typeof x === "object") {
            // 신규 포맷
            const kw = (x.text ?? x.keyword ?? x.word ?? "").trim();
            const score =
              typeof x.value === "number"
                ? x.value
                : typeof x.score === "number"
                ? x.score
                : null;
            return { kw, score };
          }

          return { kw: String(x), score: null };
        })
        .filter((it) => it.kw && it.kw !== "[object Object]");

      if (items.length === 0) {
        ts3CloudEl.innerHTML = `<div class="ts3-cloud-inner">데이터 없음</div>`;
        return;
      }

      // ✅ score가 있으면 score로, 없거나 분포가 같으면 rank로 크기 차등
      const scoreVals = items
        .map((x) => (typeof x.score === "number" ? x.score : null))
        .filter((v) => v != null);

      const hasScore = scoreVals.length > 0;

      let minS = 0,
        maxS = 1;
      if (hasScore) {
        minS = Math.min(...scoreVals);
        maxS = Math.max(...scoreVals);
      }

      // ✅ 워드클라우드 컨테이너 안전장치
      ts3CloudEl.style.overflow = "hidden";

      const rect = ts3CloudEl.getBoundingClientRect();
      const W = rect.width || 467;
      const H = rect.height || 220;

      // padding 감안(현재 UI가 14px라면)
      const PAD = 14 * 2;
      const effW = Math.max(120, W - PAD);
      const effH = Math.max(120, H - PAD);

      const rows = Math.max(3, Math.ceil(Math.sqrt(items.length)));
      const rowH = effH / rows;

      const MAX = clamp(rowH * 1.25, 44, 90);
      const MIN = clamp(MAX * 0.38, 14, 24);

      const gamma = 2.2;

      const wrap = document.createElement("div");
      wrap.className = "ts3-cloud-inner";
      wrap.style.display = "flex";
      wrap.style.flexWrap = "wrap";
      wrap.style.justifyContent = "center";
      wrap.style.alignContent = "center";
      wrap.style.gap = "2px 6px";
      wrap.style.width = "100%";
      wrap.style.height = "100%";
      wrap.style.boxSizing = "border-box";
      wrap.style.padding = "0px";

      items.forEach((it, i) => {
        const span = document.createElement("span");
        span.className = "ts3-w";
        span.textContent = it.kw;
        span.style.color = pickColor(it.kw, i);
        span.style.transform = "none";
        span.style.whiteSpace = "nowrap";
        span.style.margin = "6px 10px";

        let t;
        if (typeof it.score === "number" && hasScore && maxS !== minS) {
          t = (it.score - minS) / (maxS - minS);
        } else {
          t = 1 - i / Math.max(1, items.length - 1);
        }
        t = clamp(t, 0, 1);

        const tAdj = Math.pow(t, gamma);

        let sizePx = MIN + tAdj * (MAX - MIN);

        const len = (it.kw || "").length || 1;
        const lenFactor = clamp(1 - Math.max(0, len - 8) * 0.015, 0.78, 1);
        sizePx *= lenFactor;

        const maxByWidth = effW / (len * 0.92);
        sizePx = Math.min(sizePx, maxByWidth);

        span.style.fontSize = `${sizePx}px`;
        span.style.fontWeight = tAdj > 0.7 ? "900" : tAdj > 0.4 ? "800" : "700";
        span.style.opacity = String(0.72 + tAdj * 0.28);
        span.style.display = "inline-block";
        span.style.lineHeight = "1.05";

        wrap.appendChild(span);
      });

      ts3CloudEl.innerHTML = "";
      ts3CloudEl.appendChild(wrap);

      requestAnimationFrame(() => {
        if (seq !== __cloudReqSeq) return; // ✅ 렌더 직후에도 stale 방지

        const cs = getComputedStyle(ts3CloudEl);
        const pl = parseFloat(cs.paddingLeft) || 0;
        const pr = parseFloat(cs.paddingRight) || 0;
        const pt = parseFloat(cs.paddingTop) || 0;
        const pb = parseFloat(cs.paddingBottom) || 0;

        const availW = ts3CloudEl.clientWidth - pl - pr;
        const availH = ts3CloudEl.clientHeight - pt - pb;

        wrap.style.width = "100%";
        wrap.style.height = "100%";
        wrap.style.boxSizing = "border-box";
        wrap.style.transformOrigin = "center center";

        const contentW = wrap.scrollWidth;
        const contentH = wrap.scrollHeight;

        const scaleW = availW > 0 ? availW / contentW : 1;
        const scaleH = availH > 0 ? availH / contentH : 1;

        const scale = Math.min(1, scaleW, scaleH);
        wrap.style.transform = `scale(${scale})`;
      });

      if (DEBUG_CLOUD) console.log("[TS3][cloud] rendered", { count: items.length, items });
    } catch (e) {
      if (seq !== __cloudReqSeq) return;
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
      __lastDonutPcts = null;
      ts3DonutEl.style.background = "conic-gradient(#8a97ad 0 100%)";
      ts3DonutEl.setAttribute("aria-label", "감성 비율 도넛 차트 (데이터 없음)");
      clearDonutLabels();
      return;
    }

    const pPos = Math.floor((pos / total) * 100);
    const pNeu = Math.floor((neu / total) * 100);
    const pNeg = Math.max(0, 100 - pPos - pNeu);

    __lastDonutPcts = { pos: pPos, neu: pNeu, neg: pNeg };

    const a = pPos;
    const b = pPos + pNeu;

    ts3DonutEl.style.background = `conic-gradient(
  #0073ff 0 ${a}%,
  #e6e6e6 ${a}% ${b}%,
  #ff0000 ${b}% 100%
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


// ===============================
// date-pill 전체 클릭 -> date picker 열기
// ===============================
(function bindDatePillPicker() {
  document.querySelectorAll(".date-pill").forEach((pill) => {
    const input = pill.querySelector('input[type="date"]');
    if (!input) return;

    // 중복 바인딩 방지
    if (pill.dataset.boundPicker) return;
    pill.dataset.boundPicker = "1";

    // 커서도 pill 전체가 클릭 가능하게
    pill.style.cursor = "pointer";

    pill.addEventListener("click", (e) => {
      // 기본 label 클릭은 input focus로도 이어지지만,
      // 확실히 picker까지 열어주기 위해 showPicker 사용
      e.preventDefault();
      e.stopPropagation();

      if (typeof input.showPicker === "function") input.showPicker();
      else input.focus();
    });
  });
})();

