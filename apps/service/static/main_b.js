// ===== 샘플 데이터 =====
const KEYWORDS = [
    { rank: 1, keyword: "주식", count: 223, rate: +94, move: "NEW" },
    { rank: 2, keyword: "부동산", count: 201, rate: -22, move: "▼2" },
    { rank: 3, keyword: "고용", count: 189, rate: +10, move: "▲1" },
    { rank: 4, keyword: "경기침체", count: 173, rate: -7, move: "▼1" },
    { rank: 5, keyword: "유가", count: 162, rate: +18, move: "▲1" },
    { rank: 6, keyword: "반도체", count: 155, rate: +50, move: "▲3" },
    { rank: 7, keyword: "수출", count: 149, rate: -12, move: "▼2" },
    { rank: 8, keyword: "노동", count: 130, rate: -42, move: "▼3" },
    { rank: 9, keyword: "경제", count: 121, rate: +8, move: "▲1" },
    { rank: 10, keyword: "현금", count: 108, rate: -13, move: "▼1" },
];

const SUMMARY_MAP = {
    "주식": [
        "키워드 관련 기사 목록 조회(2~06건)",
        "전체 요약 생성(기사 내용 기반, 800~1200자)",
        "요약 API 호출 및 저장(예: summary_all 필드)",
        "사용자 선택 시점에 요약 제공(드롭다운/행 클릭)",
        "키워드별 요약/메타정보(언급량, 증감률, 변동) 함께 표시"
    ],
    "부동산": [
        "부동산 정책/금리/거래량 관련 기사 우선 수집",
        "기간별 비교(전주/전월) 기반 증감률 계산",
        "중복 기사/유사 기사 제거 후 요약 생성",
        "요약 결과를 키워드별 캐싱하여 빠르게 제공",
        "핵심 지표(거래, 대출, 가격) 중심으로 요약 구성"
    ],
    "고용": [
        "고용지표/실업률/채용시장 관련 기사 분류",
        "산업별 이슈 키워드(제조/서비스 등) 태깅",
        "요약 생성 후 핵심 문장 3~5개로 정리",
        "기간 단위(일/주/월/연) 변경 시 재집계",
        "요약과 함께 관련 기사 링크/제목 리스트 확장 가능"
    ]
};

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

function renderRanking(selectedKeyword) {
    if (!rankListEl) return;
    rankListEl.innerHTML = "";

    KEYWORDS.slice(0, 10).forEach((k) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "rank-row rank-item" + (k.keyword === selectedKeyword ? " is-selected" : "");
        row.setAttribute("role", "listitem");

        row.innerHTML = `
          <div class="c-rank"><span class="rank-badge">${k.rank}</span></div>
          <div class="c-keyword">${k.keyword}</div>
          <div class="c-count">${k.count}</div>
          <div class="c-rate ${rateClass(k.rate)}">${fmtRate(k.rate)}</div>
          <div class="c-move ${moveClass(k.move)}">${k.move}</div>
        `;

        // 랭킹 클릭하면 selectKeyword 실행 (드롭다운도 같이 동기화)
        row.addEventListener("click", () => selectKeyword(k.keyword));
        rankListEl.appendChild(row);
    });
}

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
    //    (py 수정 불가라서 "클라이언트에서 제목/요약에 포함" 기준으로만 거르는 방식)
    const ENABLE_KEYWORD_FILTER = true;

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
            [];

        const total =
            payload?.total ??
            payload?.total_count ??
            payload?.count ??
            payload?.totalCount ??
            (Array.isArray(items) ? items.length : 0);

        return { items: Array.isArray(items) ? items : [], total: Number(total) || 0 };
    }

    // 기사 객체 필드명도 제각각일 수 있어 안전하게 뽑기
    function normalizeArticle(a) {
        const title = a?.title ?? a?.headline ?? a?.news_title ?? "";
        const summary = a?.summary ?? a?.snippet ?? a?.description ?? a?.news_summary ?? "";
        const press = a?.press ?? a?.publisher ?? a?.source ?? a?.media ?? "";
        const url = a?.url ?? a?.link ?? a?.news_url ?? "";
        const date =
            a?.date ??
            a?.published_at ??
            a?.publishedAt ??
            a?.pubDate ??
            a?.datetime ??
            "";

        // 신뢰도 점수/라벨 후보들(백엔드 필드명이 달라도 최대한 잡기)
        const score =
            a?.score ?? a?.trust ?? a?.trust_score ?? a?.rank_score ?? a?.reliability_score ?? null;

        const trustLabel =
            a?.trust_label ?? a?.trustLabel ?? a?.reliability ?? a?.risk_label ?? a?.riskLevel ?? null;

        return { title, summary, press, url, date, score, trustLabel, raw: a };
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

                // url 없으면 클릭 불가 처리
                const titleHtml = url
                    ? `<a class="ts2-title" href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(title)}</a>`
                    : `<div class="ts2-title">${escapeHtml(title || "제목 없음")}</div>`;

                return `
        <article class="ts2-card">
          <div class="ts2-src">
            <img class="ts2-src__logo" data-press="${escapeHtml(press)}" alt="${escapeHtml(press)} 로고">
            <span class="ts2-src__name">${escapeHtml(press || "언론사")}</span>
          </div>
          <div class="ts2-body">
            ${titleHtml}
            ${summary ? `<p class="ts2-summary">${escapeHtml(summary)}</p>` : ``}
          </div>
        </article>
      `;
            }).join("");

            hydratePressLogos(listEl);
            applyFourCardScroll(listEl, 5);
        }

        // pager 표시
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

    const ts3Root = document.getElementById('main3');
    if (!ts3Root) return;

    const btns = Array.from(ts3Root.querySelectorAll('.ts3-kbtn'));
    const ts3WordTag = ts3Root.querySelector('#ts3WordTag');
    const ts3DonutTag = ts3Root.querySelector('#ts3DonutTag');
    const ts3DonutEl = ts3Root.querySelector('#ts3Donut');
    const ts3CloudEl = ts3Root.querySelector('#ts3WordCloud');
    const ts3KlistEl = ts3Root?.querySelector(".ts3-klist");
    const ts3Canvas = document.getElementById('ts3LineCanvas');
    const ts3Placeholder = ts3Root.querySelector('.ts3-placeholder');

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

    function renderCloud(keyword) {
        const list = WORDS[keyword] || WORDS['주식'];
        const main = list[0] || keyword;
        const rest = list.slice(1).slice(0, 11);

        const colors = ['#1e63ff', '#e53935', '#6a7a93', '#2a4f98', '#8a97ad'];
        const spans = [
            `<span class="ts3-w lg">${main}</span>`,
            `<span class="ts3-w lg" style="color:#1e63ff">${(list[1] || '키워드')}</span>`,
            ...rest.map((w, i) => {
                const cls = i % 3 === 0 ? 'md' : 'sm';
                const c = colors[i % colors.length];
                return `<span class="ts3-w ${cls}" style="--c:${c}">${w}</span>`;
            })
        ].join('');

        ts3CloudEl.innerHTML = `<div class="ts3-cloud-inner">${spans}</div>`;
    }

    function renderDonut(keyword) {
        const v = SENT[keyword] || SENT['주식'];
        const total = (v.pos + v.neu + v.neg) || 1;
        const p1 = Math.round((v.pos / total) * 100);
        const p2 = Math.round((v.neu / total) * 100);
        const p3 = Math.max(0, 100 - p1 - p2);

        ts3DonutEl.style.background =
            `conic-gradient(#1e63ff 0 ${p1}%, #8a97ad ${p1}% ${p1 + p2}%, #e53935 ${p1 + p2}% 100%)`;
        ts3DonutEl.setAttribute('aria-label', `감성 비율 도넛 차트 (긍정 ${p1}%, 중립 ${p2}%, 부정 ${p3}%)`);
    }

    // ===== 기간 탭 + 날짜 범위(시작일 수동, 종료일은 어제까지만) =====
    const startDateEl = document.getElementById("startDate");
    const endDateEl = document.getElementById("endDate");

    let userRangeLocked = false;

    function lockRange() { userRangeLocked = true; }

    startDateEl?.addEventListener("input", lockRange);
    startDateEl?.addEventListener("change", lockRange);
    endDateEl?.addEventListener("input", lockRange);
    endDateEl?.addEventListener("change", lockRange);

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

            emitRangeChange({ preset: !userRangeLocked });
        });
    });

    // 첫 로드도 프리셋으로 시작일 자동 세팅 + 종료일 어제 고정
    emitRangeChange({ preset: true });


    // ===== TS3: dashboard.py(/api/keyword_trend) 데이터로 라인차트 렌더 =====
    let __trendReqSeq = 0;
    let chart = null;

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

        const { start, end, grain } = window.getAppRange?.() || {};
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

        // base + compare만 그리기
        const kws = [baseKeyword, ...Array.from(compareSet)];
        const datasets = kws.map((kw) => ({
            label: kw,
            data: agg.series?.[kw] || new Array(labels.length).fill(0),
            borderColor: colorFor(kw),
            backgroundColor: colorFor(kw),
            borderWidth: kw === baseKeyword ? 3 : 2,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 4,
        }));

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
        btns.forEach(b => {
            const kw = b.dataset.keyword;
            const isBase = kw === baseKeyword;
            const isCompare = compareSet.has(kw);

            // base는 항상 active(잠금 느낌)
            b.classList.toggle("is-active", isBase || isCompare);
            b.setAttribute("aria-selected", (isBase || isCompare) ? "true" : "false");
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