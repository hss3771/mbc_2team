// dropdownApi는 selectKeyword에서 쓰므로 위에 선언 (TDZ 방지)
let dropdownApi = null;

// ===== DOM =====
const rankListEl = document.getElementById("rankList");
const summaryKeywordEl = document.getElementById("summaryKeyword");
const summaryListEl = document.getElementById("summaryList");
const segmentedBtns = Array.from(document.querySelectorAll(".seg-btn"));

function fmtRate(n) {
    const sign = n > 0 ? "+" : "";
    return `${sign}${n}%`;
}
function rateClass(n) {
    if (n > 0) return "is-up";
    if (n < 0) return "is-down";
    return "is-flat";
}
function moveClass(move) {
    if (move === "NEW") return "is-new";
    if (String(move).includes("▲")) return "is-up";
    if (String(move).includes("▼")) return "is-down";
    return "is-flat";
}

async function renderRanking(selectedKeyword) {
    if (!rankListEl) return;
    rankListEl.innerHTML = "";

    const { start, end } = window.getAppRange?.() || {};
    if (!start || !end) return;

    const res = await fetch(
        `/api/keyword_trend?start=${start}&end=${end}`,
        { credentials: "same-origin" }
    );
    const data = await res.json();
    if (!data.success) return;

    /*
      data 구조 (dashboard.py 기준)
      {
        dates: [...],
        series: {
          키워드: [count, count, ...]
        }
      }
    */

    const latestDateIndex = data.dates.length - 1;

    const ranking = Object.entries(data.series)
        .map(([keyword, counts]) => {
            const count = counts[latestDateIndex] ?? 0;
            return { keyword, count };
        })
        .sort((a, b) => b.count - a.count)
        .slice(0, 10)
        .map((item, idx) => ({
            rank: idx + 1,
            keyword: item.keyword,
            count: item.count,
            rate: 0,
            move: "-"
        }));

    ranking.forEach((k) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className =
            "rank-row rank-item" +
            (k.keyword === selectedKeyword ? " is-selected" : "");

        row.innerHTML = `
          <div class="c-rank"><span class="rank-badge">${k.rank}</span></div>
          <div class="c-keyword">${k.keyword}</div>
          <div class="c-count">${k.count}</div>
          <div class="c-rate is-flat">0%</div>
          <div class="c-move is-flat">-</div>
        `;

        row.addEventListener("click", () => selectKeyword(k.keyword));
        rankListEl.appendChild(row);
    });
}

async function renderSummary(keyword) {
  if (!summaryKeywordEl || !summaryListEl) return;

  summaryKeywordEl.textContent = keyword;
  summaryListEl.innerHTML = "";

  try {
    const { start } = window.getAppRange?.() || {};
    if (!start) throw new Error("start date missing");

    const res = await fetch(
      `/api/issue_wordcloud?start=${start}&keyword=${encodeURIComponent(keyword)}`,
      { credentials: "same-origin" }
    );
    const data = await res.json();

    const items =
      data && data.success && Array.isArray(data.sub_keywords)
        ? data.sub_keywords.slice(0, 6)
        : [];

    if (items.length === 0) {
      const li = document.createElement("li");
      li.textContent = "요약 데이터가 없습니다.";
      summaryListEl.appendChild(li);
      return;
    }

    items.forEach((word) => {
      const li = document.createElement("li");
      li.textContent = `연관 키워드: ${word}`;
      summaryListEl.appendChild(li);
    });
  } catch (e) {
    const li = document.createElement("li");
    li.textContent = "요약 데이터를 불러오지 못했습니다.";
    summaryListEl.appendChild(li);
  }
};


function selectKeyword(keyword) {
    renderRanking(keyword);
    renderSummary(keyword);
    dropdownApi?.setValue(keyword); // 랭킹 클릭 시 드롭다운도 변경
    window.ts2Api?.setKeyword(keyword);
    window.ts3Api?.setKeyword(keyword);
}
window.selectKeyword = selectKeyword;

// ===== 커스텀 드롭다운 =====
(function () {
    const root = document.getElementById('keywordDropdown');
    if (!root) return;

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


// 초기 렌더는 무조건 1번 실행 (TOP10 첫 로드부터 보이게)
const bootKeyword =
    (document.querySelector('#keywordDropdown input[type="hidden"]')?.value ||
        document.querySelector('#keywordDropdown .cselect__value')?.textContent ||
        '주식').trim();

selectKeyword(bootKeyword);

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

(function TS2() {
    function toDateNum(iso) { return Number(String(iso || "").replaceAll("-", "")) || 0; }


    });

    

    let currentKeyword = '주식';
    const sortMode = { pos: 'recent', neu: 'recent', neg: 'recent' };

    const els = {
        pos: document.getElementById('ts2ListPos'),
        neu: document.getElementById('ts2ListNeu'),
        neg: document.getElementById('ts2ListNeg'),
    };

    // ===== 로고 설정: 프론트 정적파일 매핑 버전 (py 수정 없음) =====
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

    function setLogo(img) {
        const press = (img.dataset.press || "").trim();
        const mapped = PRESS_LOGO_MAP[press];

        img.src = mapped || makeBadgeSvg(press);

        img.onerror = () => {
            img.onerror = null;
            img.src = makeBadgeSvg(press);
        };
    }

    function hydratePressLogos(scopeEl) {
        if (!scopeEl) return;
        scopeEl.querySelectorAll('img.ts2-src__logo[data-press]').forEach(img => {
            if (img.dataset.logoBound === "1") return;
            img.dataset.logoBound = "1";
            setLogo(img);
        });
    }

    function escapeHtml(s) {
        return String(s ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#39;");
    }

    function trustScore(flag) {
        if (flag === '정상') return 2;
        if (flag === '의심') return 1;
        if (flag === '위험') return 0;
        return 0;
    }

    function sortItems(items, mode) {
        const arr = [...items];
        if (mode === 'popular') {
            arr.sort((a, b) => (b.popular || 0) - (a.popular || 0));
            return arr;
        }
        if (mode === 'trust') {
            arr.sort((a, b) => {
                const t = trustScore(b.flag) - trustScore(a.flag);
                if (t !== 0) return t;
                return String(b.date || "").localeCompare(String(a.date || ""));
            });
            return arr;
        }
        // recent(default): date desc
        arr.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
        return arr;
    }

    function cardHTML(it) {
        const press = String(it.source || "").trim();
        const safePress = escapeHtml(press);

        // 초기부터 src를 박아주면 깜빡임 줄어듦
        const initialSrc = PRESS_LOGO_MAP[press] || makeBadgeSvg(press);

        return `
    <article class="ts2-card" tabindex="0">
      <div class="ts2-card__top">
        <span class="ts2-src ts2-src--logoonly" aria-label="${safePress}">
          <img class="ts2-src__logo"
               src="${initialSrc}"
               data-press="${safePress}"
               alt="${safePress} 로고" />
        </span>
        <span class="ts2-mini">${escapeHtml(it.flag)}</span>
      </div>

      <h4 class="ts2-title">${escapeHtml(it.title)}</h4>
      <p class="ts2-desc">${escapeHtml(it.desc)}</p>

      <div class="ts2-meta">
        <span class="ts2-chip ts2-chip--date">${escapeHtml(it.date)}</span>
        <button type="button" class="ts2-chip ts2-chip--btn">기사 요약</button>
      </div>
    </article>
  `;
    }


    function px(v) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    }

    function applyFourCardScroll(listEl, visibleCount = 5) {
        if (!listEl) return;

        const cards = Array.from(listEl.querySelectorAll('.ts2-card'));
        const colbody = listEl.closest('.ts2-colbody');
        const pager = colbody?.querySelector('.ts2-pager');

        if (cards.length < visibleCount) {
            listEl.classList.remove('is-vscroll');
            listEl.style.removeProperty('--ts2-list-max');
            if (colbody) colbody.style.height = '';
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

        listEl.classList.add('is-vscroll');
        listEl.style.setProperty('--ts2-list-max', `${h}px`);

        if (colbody) {
            const pagerH = pager ? pager.offsetHeight : 0;
            const bt = px(getComputedStyle(colbody).borderTopWidth);
            colbody.style.height = `${h + pagerH + bt}px`;
        }
    }

    function render(sent) {
        const target = els[sent];
        if (!target) return;

        const items = sortItems(getDataBySent(sent), sortMode[sent]);
        target.innerHTML = items.map(cardHTML).join('');

        // ✅ 여기서 로고 실제 src 붙임(+ fallback)
        hydratePressLogos(target);

        const first = target.querySelector('.ts2-card');
        if (first) first.classList.add('is-open');

        requestAnimationFrame(() => applyFourCardScroll(target, 5));

        target.querySelectorAll('.ts2-card').forEach(card => {
            card.addEventListener('click', () => {
                target.querySelectorAll('.ts2-card').forEach(c => c.classList.remove('is-open'));
                card.classList.add('is-open');
                requestAnimationFrame(() => applyFourCardScroll(target, 5));
            });
        });

        target.querySelectorAll('.ts2-chip--btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                alert('기사 요약(샘플)');
            });
        });
    }

    function renderAll() { render('pos'); render('neu'); render('neg'); }

    function setKeyword(keyword) {
        currentKeyword = keyword;
        renderAll();
    }

    // 드롭다운(정렬) 연결
    function initCSelect(root, onPick) {
        const btn = root.querySelector('.cselect__btn');
        const valueEl = root.querySelector('.cselect__value');
        const opts = Array.from(root.querySelectorAll('.cselect__opt'));
        if (!btn || !valueEl || !opts.length) return;

        function close() {
            root.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
        }
        function toggle() {
            root.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', root.classList.contains('is-open') ? 'true' : 'false');
        }
        function applyValue(v) {
            opts.forEach(o => {
                const isMatch = (o.dataset.value ?? o.textContent.trim()) === v;
                o.classList.toggle('is-selected', isMatch);
                if (isMatch) o.setAttribute('aria-selected', 'true');
                else o.removeAttribute('aria-selected');
            });
            const picked = opts.find(o => (o.dataset.value ?? o.textContent.trim()) === v);
            valueEl.textContent = picked ? picked.textContent.trim() : v;
        }

        const initOpt = opts.find(o => o.classList.contains('is-selected')) || opts[0];
        const initVal = initOpt.dataset.value ?? initOpt.textContent.trim();
        applyValue(initVal);

        btn.addEventListener('click', (e) => { e.preventDefault(); toggle(); });

        opts.forEach(opt => {
            opt.addEventListener('click', () => {
                const v = opt.dataset.value ?? opt.textContent.trim();
                applyValue(v);
                close();
                onPick?.(v);
            });
        });

        document.addEventListener('click', (e) => { if (!root.contains(e.target)) close(); });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); });

        return { setValue: (v) => applyValue(v) };
    }

    document.querySelectorAll('.ts2-sort[data-sort]').forEach(root => {
        const sent = root.getAttribute('data-sort'); // pos/neu/neg
        initCSelect(root, (mode) => {
            sortMode[sent] = mode;
            render(sent);
        });
    });

    window.ts2Api = { setKeyword };

    renderAll();
    document.addEventListener("app:rangechange", () => { renderAll(); });
})();

// main3
(function TS3() {

    function daysInMonth(y, m) {
        return new Date(y, m + 1, 0).getDate(); // m: 0~11
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

    function addYearsClamp(date, deltaYears) {
        const d = normalize(date);
        const y = d.getFullYear() + deltaYears;
        const m = d.getMonth();
        const day = d.getDate();

        const last = daysInMonth(y, m);
        return new Date(y, m, Math.min(day, last));
    }


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

    const root = document.getElementById('main3');
    if (!root) return;

    const btns = Array.from(root.querySelectorAll('.ts3-kbtn'));
    const wordTag = root.querySelector('#ts3WordTag');
    const donutTag = root.querySelector('#ts3DonutTag');
    const donutEl = root.querySelector('#ts3Donut');
    const cloudEl = root.querySelector('#ts3WordCloud');

    const canvas = document.getElementById('ts3LineCanvas');
    const placeholder = root.querySelector('.ts3-placeholder');

    // ===== 상태: 기준키워드 + (추가된)비교키워드들 =====
    let baseKeyword = '주식';
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


async function renderCloud(keyword) {
    const { start } = window.getAppRange?.() || {};
    if (!start) return;

    const res = await fetch(
        `/api/issue_wordcloud?start=${start}&keyword=${encodeURIComponent(keyword)}`
    );
    const data = await res.json();

    if (!data.success || !data.sub_keywords.length) {
        cloudEl.innerHTML = `<div class="ts3-cloud-inner">데이터 없음</div>`;
        return;
    }

    const spans = data.sub_keywords.slice(0, 12).map((w, i) => {
        const cls = i === 0 ? 'lg' : i < 3 ? 'md' : 'sm';
        return `<span class="ts3-w ${cls}">${w}</span>`;
    }).join('');

    cloudEl.innerHTML = `<div class="ts3-cloud-inner">${spans}</div>`;
}

    function renderDonut(keyword) {
        const v = SENT[keyword] || SENT['주식'];
        const total = (v.pos + v.neu + v.neg) || 1;
        const p1 = Math.round((v.pos / total) * 100);
        const p2 = Math.round((v.neu / total) * 100);
        const p3 = Math.max(0, 100 - p1 - p2);

        donutEl.style.background =
            `conic-gradient(#1e63ff 0 ${p1}%, #8a97ad ${p1}% ${p1 + p2}%, #e53935 ${p1 + p2}% 100%)`;
        donutEl.setAttribute('aria-label', `감성 비율 도넛 차트 (긍정 ${p1}%, 중립 ${p2}%, 부정 ${p3}%)`);
    }

    // ===== 기간 탭 + 날짜 범위(시작일 수동, 종료일은 어제까지만) =====
    const startDateEl = document.getElementById("startDate");
    const endDateEl = document.getElementById("endDate");

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
    startDateEl?.addEventListener("input", () => emitRangeChange({ preset: false }));
    startDateEl?.addEventListener("change", () => emitRangeChange({ preset: false }));

    endDateEl?.addEventListener("input", () => emitRangeChange({ preset: false }));
    endDateEl?.addEventListener("change", () => emitRangeChange({ preset: false }));


    // 탭 클릭: 프리셋 기간으로 시작일 자동 세팅
    segmentedBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            segmentedBtns.forEach((b) => {
                b.classList.remove("is-active");
                b.setAttribute("aria-selected", "false");
            });
            btn.classList.add("is-active");
            btn.setAttribute("aria-selected", "true");

            emitRangeChange({ preset: true }); // 핵심!!
        });
    });

    // 첫 로드도 프리셋으로 시작일 자동 세팅 + 종료일 어제 고정
    emitRangeChange({ preset: true });

    // ===== Chart.js =====
    let chart = null;

async function buildDatasets(labels) {
    const { start, end } = window.getAppRange?.() || {};
    const res = await fetch(`/api/keyword_trend?start=${start}&end=${end}`);
    const data = await res.json();
    if (!data.success) return [];

    const kws = [baseKeyword, ...Array.from(compareSet)];

    return kws.map((kw) => ({
        label: kw,
        data: data.series[kw] || [],
        borderColor: colorFor(kw),
        backgroundColor: colorFor(kw),
        borderWidth: kw === baseKeyword ? 3 : 2,
        tension: 0.3,
        pointRadius: 2,
        pointHoverRadius: 4,
    }));
}

    function renderLineChart() {
        if (!canvas || typeof Chart === 'undefined') return;

        const { start, end, grain } = window.getAppRange?.() || {};
        const labels = makeLabels(start, end, grain || "day");
        const datasets = buildDatasets(labels);

        if (placeholder) placeholder.style.display = 'none';
        canvas.style.display = 'block';

        const ctx = canvas.getContext('2d');

        if (!chart) {
            chart = new Chart(ctx, {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        tooltip: { enabled: true },
                    },
                    scales: {
                        x: {
                            title: { display: true, text: '기간' },
                            ticks: { maxRotation: 0 },
                        },
                        y: {
                            title: { display: true, text: '언급량' },
                            beginAtZero: true,
                        }
                    }
                }
            });
        } else {
            chart.data.labels = labels;
            chart.data.datasets = datasets;
            chart.update();
        }
    }

    // ===== 버튼 UI 동기화 (base는 고정 + 비교는 토글) =====
    function syncButtons() {
        btns.forEach(b => {
            const kw = b.dataset.keyword;
            const isBase = kw === baseKeyword;
            const isCompare = compareSet.has(kw);

            // base는 항상 active(잠금 느낌)
            b.classList.toggle('is-active', isBase || isCompare);
            b.classList.toggle('is-base', isBase);
            b.setAttribute('aria-pressed', (isBase || isCompare) ? 'true' : 'false');
        });
    }

    function setBaseKeyword(next) {
        baseKeyword = next;
        compareSet = new Set(); // 기준이 바뀌면 비교는 초기화(원하면 유지하도록 바꿀 수 있어)
        if (wordTag) wordTag.textContent = baseKeyword;
        if (donutTag) donutTag.textContent = baseKeyword;
        renderCloud(baseKeyword);
        renderDonut(baseKeyword);
        syncButtons();
        renderLineChart();
    }

    function toggleCompareKeyword(kw) {
        if (kw === baseKeyword) return; // 기준은 제거 불가

        if (compareSet.has(kw)) compareSet.delete(kw);
        else compareSet.add(kw);

        syncButtons();
        renderLineChart();
    }

    // 버튼 클릭: "추가/삭제"만 수행 (기준 변경은 드롭다운/랭킹)
    btns.forEach(b => {
        b.addEventListener('click', () => {
            const kw = b.dataset.keyword;
            toggleCompareKeyword(kw);
        });
    });

    // 외부에서(=selectKeyword) 기준 키워드 바꾸게 노출
    window.ts3Api = {
        setKeyword: setBaseKeyword,
        toggleCompareKeyword,
        getState: () => ({ baseKeyword, compare: Array.from(compareSet) })
    };

    // 초기값: 상단 드롭다운과 동기화
    const init =
        (document.querySelector('#keywordDropdown input[type="hidden"]')?.value ||
            document.querySelector('#keywordDropdown .cselect__value')?.textContent ||
            '주식').trim();

    setBaseKeyword(init);

    document.addEventListener("app:rangechange", () => {
        renderLineChart();
    });
})();

document.addEventListener("DOMContentLoaded", () => {
  console.log("🔥 main.js loaded");
  renderRanking();
});