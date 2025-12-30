document.addEventListener('DOMContentLoaded', function () {
    const alias = { 'info_edit.html': 'my_page.html' };

    function setSidebarActive() {
        const curFileRaw = (location.pathname.split('/').pop() || '').split('?')[0];
        const curFile = alias[curFileRaw] || curFileRaw;
        const curHash = location.hash || '';

        // active 초기화
        document.querySelectorAll('.menu li').forEach(li => li.classList.remove('active'));

        const links = Array.from(document.querySelectorAll('.menu a'));

        // main.html에서 hash(#main2/#main3)가 있으면 그 항목을 우선 active
        if (curFile === 'main.html' && (curHash === '#main2' || curHash === '#main3')) {
            const hashTarget = links.find(a => {
                const href = a.getAttribute('href') || '';
                const parts = href.split('#');
                const file = (parts[0].split('/').pop() || '').split('?')[0];
                const hash = parts[1] ? ('#' + parts[1]) : '';
                return file === 'main.html' && hash === curHash;
            });

            if (hashTarget) {
                hashTarget.closest('li').classList.add('active');
                return;
            }
        }

        // 기본: 파일명만 비교 (hash 무시)
        const fileTarget = links.find(a => {
            const href = a.getAttribute('href') || '';
            const file = (href.split('#')[0].split('/').pop() || '').split('?')[0];
            return file === curFile;
        });

        if (fileTarget) fileTarget.closest('li').classList.add('active');
    }

    setSidebarActive();
    window.addEventListener('hashchange', setSidebarActive);
});

(() => {
    "use strict";

    /** =========================
     *  임시 데이터 (나중에 API로 교체하면 여기만 바꾸면 됨)
     *  ========================= */
    const WORDS = [
        {
            id: "w1",
            seg: "ko",
            term: "가격차별",
            en: "Price Discrimination, Price Differentiation",
            updatedAt: "25.12.18 수정",
            body: [
                "소비자의 나이, 신분, 재화가 판매되는 공간의 지리적 요인에 따라 가격을 다르게 책정하는 것을 가격차별이라고 한다.",
                "기업은 가격을 차별함으로써 이윤을 극대화하기도 한다. 일상에서 찾아볼 수 있는 가격차별의 대표적인 예로는 나이에 따라 다르게 매겨지는 대중교통 요금이 있다.",
                "또한 동일한 상품이라도 국내에서 출시하는 상품과 해외에서 출시하는 상품의 가격을 다르게 책정한다면 역시 가격차별이 이뤄진 경우다.",
                "가격차별이 가능하려면 첫째, 소비자를 몇 개의 그룹으로 분류할 수 있어야 하고, 둘째, 가격차별을 실시하는 기업이 소비자의 유형을 식별할 수 있어야 하며, 셋째, 소비자 사이에 재판매가 불가능해야 한다.",
                "경제학에서 가격차별은 제1급/제2급/제3급 가격차별로 구분되며, 대중교통 요금은 제3급 가격차별의 예시로 자주 언급된다."
            ]
        },
        { id: "w2", seg: "ko", term: "가격거품", en: "Price Bubble", updatedAt: "25.10.02 수정", body: ["특정 자산의 가격이 내재가치 대비 과도하게 상승한 상태를 의미한다.", "기대 심리와 투기적 수요가 결합되며, 붕괴 시 급락이 발생할 수 있다."] },
        { id: "w3", seg: "ko", term: "가격고정", en: "Price Fixing", updatedAt: "25.08.21 수정", body: ["경쟁사 간 가격을 인위적으로 합의해 고정하는 행위를 말한다.", "독점 규제/공정거래 측면에서 불법으로 다뤄지는 경우가 많다."] },
        { id: "w4", seg: "ko", term: "가격약속", en: "Price Commitment", updatedAt: "25.07.11 수정", body: ["향후 일정 기간 가격을 유지하겠다는 약속/정책을 의미한다.", "소비자 신뢰 확보 목적이 있을 수 있으나 시장 상황 변화에 취약할 수 있다."] },
        { id: "w5", seg: "ko", term: "가격통제", en: "Price Control", updatedAt: "25.06.03 수정", body: ["정부가 특정 재화 가격의 상한/하한을 규정하거나 개입하는 정책이다.", "공급/수요 왜곡, 품귀, 암시장 등 부작용이 발생할 수 있다."] },
        { id: "w6", seg: "ko", term: "가격파리티", en: "Price Parity", updatedAt: "25.05.19 수정", body: ["판매 채널 간 동일(또는 유사) 가격을 유지하도록 하는 조건/정책을 말한다.", "플랫폼/유통 계약에서 논쟁이 되기도 한다."] },
        { id: "w7", seg: "ko", term: "가계부채", en: "Household Debt", updatedAt: "25.04.08 수정", body: ["가계가 보유한 대출/채무의 총량을 의미한다.", "금리, 주택시장, 소비여력과 밀접하게 연관된다."] },
        { id: "w8", seg: "ko", term: "가동기담보", en: "Floating Charge", updatedAt: "25.03.01 수정", body: ["기업이 변동하는 자산(재고, 매출채권 등)을 담보로 설정하는 형태를 말한다.", "일부 관할권에서 법/회계 처리 차이가 존재한다."] },

        { id: "e1", seg: "en", term: "Arbitrage", en: "Arbitrage", updatedAt: "25.12.01 수정", body: ["동일/유사 자산의 가격 차이를 이용해 무위험 또는 저위험 수익을 추구하는 거래를 의미한다."] },
        { id: "e2", seg: "en", term: "Benchmark", en: "Benchmark", updatedAt: "25.11.10 수정", body: ["성과 평가/비교를 위한 기준 지표 또는 기준 포트폴리오를 말한다."] },
        { id: "e3", seg: "en", term: "Capital", en: "Capital", updatedAt: "25.10.07 수정", body: ["생산을 위해 사용되는 자산 또는 금융자본을 통칭한다."] },
        { id: "e4", seg: "en", term: "Deflation", en: "Deflation", updatedAt: "25.09.18 수정", body: ["전반적인 물가 수준이 지속적으로 하락하는 현상이다."] },

        { id: "n1", seg: "num", term: "1인당 GDP", en: "GDP per Capita", updatedAt: "25.07.30 수정", body: ["국내총생산(GDP)을 인구로 나눈 값으로, 평균 소득/생산 수준의 대략적 지표로 쓰인다."] },
        { id: "n2", seg: "num", term: "2차시장", en: "Secondary Market", updatedAt: "25.06.14 수정", body: ["이미 발행된 금융자산이 투자자 사이에서 거래되는 시장을 말한다."] },
        { id: "n3", seg: "num", term: "3자물류", en: "Third-party Logistics (3PL)", updatedAt: "25.05.02 수정", body: ["물류 기능을 외부 전문업체가 대행하는 형태를 의미한다."] },
        { id: "n4", seg: "num", term: "7% 규칙", en: "Rule of 7%", updatedAt: "25.03.12 수정", body: ["투자/리스크 문맥에서 쓰이는 경험적 규칙을 지칭하는 표현으로, 문맥에 따라 의미가 달라질 수 있다."] }
    ];

    /** =========================
     *  DOM
     *  ========================= */
    const $ = (sel, el = document) => el.querySelector(sel);
    const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

    const indexBar = $("#indexBar");
    const listEl = $("#wordList");
    const detailTitle = $("#detailTitle");
    const detailMeta = $("#detailMeta");
    const detailContent = $("#detailContent");
    const detailStarBtn = $("#detailStarBtn");
    const detailStarIcon = detailStarBtn?.querySelector(".icon-star");

    const modal = $("#bookmarkModal");
    const openBookmarkBtn = $("#openBookmark");
    const closeBookmarkBtn = $("#closeBookmark");
    const closeBookmarkBtn2 = $("#closeBookmark2");
    const bookmarkListEl = $("#bookmarkList");
    const bookmarkEmptyEl = $("#bookmarkEmpty");
    const clearBookmarksBtn = $("#clearBookmarks");

    /** =========================
     *  상태
     *  ========================= */
    const STORAGE_KEY = "ts_word_bookmarks_v1";
    let currentSeg = "ko";     // ko | en | num
    let currentIndex = "all";  // all | ㄱ | A | 1 ...
    let selectedId = null;
    let bookmarks = loadBookmarks();

    /** =========================
     *  인덱스 정의
     *  ========================= */
    const KO_INDEX = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
    const EN_INDEX = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
    const NUM_INDEX = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

    /** =========================
     *  유틸
     *  ========================= */
    function loadBookmarks() {
        try {
            const raw = localStorage.getItem(STORAGE_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            return Array.isArray(parsed) ? parsed : [];
        } catch {
            return [];
        }
    }

    function saveBookmarks() {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(bookmarks));
    }

    function isBookmarked(id) {
        return bookmarks.includes(id);
    }

    function toggleBookmark(id) {
        if (!id) return;
        if (isBookmarked(id)) bookmarks = bookmarks.filter(x => x !== id);
        else bookmarks = [id, ...bookmarks];
        saveBookmarks();
    }

    // 한글 초성 추출 (ㄲ/ㄸ/ㅃ/ㅆ/ㅉ는 ㄱ/ㄷ/ㅂ/ㅅ/ㅈ로 정규화)
    const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
    const CHO_NORM = { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" };

    function getKoIndex(term) {
        const c = (term || "").trim().charCodeAt(0);
        if (!c) return null;
        if (c >= 0xAC00 && c <= 0xD7A3) {
            const idx = Math.floor((c - 0xAC00) / 588);
            const cho = CHO[idx] || null;
            return CHO_NORM[cho] || cho;
        }
        return null;
    }

    function getEnIndex(term) {
        const first = (term || "").trim()[0];
        if (!first) return null;
        const up = first.toUpperCase();
        return (up >= "A" && up <= "Z") ? up : null;
    }

    function getNumIndex(term) {
        const first = (term || "").trim()[0];
        if (!first) return null;
        return (first >= "0" && first <= "9") ? first : null;
    }

    function getIndexForWord(w) {
        if (w.seg === "ko") return getKoIndex(w.term);
        if (w.seg === "en") return getEnIndex(w.term);
        return getNumIndex(w.term);
    }

    /** =========================
     *  렌더: 인덱스 바
     *  ========================= */
    function renderIndexBar() {
        const list = currentSeg === "ko" ? KO_INDEX : (currentSeg === "en" ? EN_INDEX : NUM_INDEX);

        indexBar.innerHTML = `
      <div class="index-pill" role="tablist" aria-label="인덱스 선택">
        ${renderIndexButton("all", "전체")}
        ${list.map(k => renderIndexButton(k, k)).join("")}
      </div>
    `;

        // 이벤트
        $$(".index-btn", indexBar).forEach(btn => {
            btn.addEventListener("click", () => {
                currentIndex = btn.dataset.key;
                $$(".index-btn", indexBar).forEach(b => b.classList.toggle("is-active", b.dataset.key === currentIndex));
                renderList();
            });
        });

        // active
        $$(".index-btn", indexBar).forEach(b => b.classList.toggle("is-active", b.dataset.key === currentIndex));
    }

    function renderIndexButton(key, label) {
        return `<button class="index-btn ${key === currentIndex ? "is-active" : ""}" type="button" data-key="${key}">${label}</button>`;
    }

    /** =========================
     *  렌더: 리스트
     *  ========================= */
    function getFilteredWords() {
        let arr = WORDS.filter(w => w.seg === currentSeg);

        if (currentIndex !== "all") {
            arr = arr.filter(w => getIndexForWord(w) === currentIndex);
        }

        // 가나다/ABC/숫자 정렬 느낌
        arr = arr.slice().sort((a, b) => a.term.localeCompare(b.term, "ko"));
        return arr;
    }

    function renderList() {
        const items = getFilteredWords();

        if (!items.length) {
            listEl.innerHTML = `
        <div class="word-empty" style="min-height:240px;">
          <div class="word-empty-emoji">🫥</div>
          <div class="word-empty-title">해당 조건의 단어가 없어요</div>
          <div class="word-empty-sub">다른 인덱스를 선택해보세요</div>
        </div>
      `;
            // 상세 초기화
            setSelected(null);
            return;
        }

        // 선택 유지: 현재 필터에 선택값이 없으면 첫 항목 선택
        if (!selectedId || !items.some(x => x.id === selectedId)) {
            selectedId = items[0].id;
        }

        listEl.innerHTML = items.map(w => {
            const on = isBookmarked(w.id);
            const selected = w.id === selectedId;
            return `
        <button class="word-item ${selected ? "is-selected" : ""}" type="button" data-id="${w.id}" role="option" aria-selected="${selected}">
          <span class="word-item-title">${escapeHtml(w.term)}</span>

          <span class="word-item-right">
            <button class="star-mini ${on ? "is-on" : ""}" type="button" data-star="${w.id}" aria-label="즐겨찾기">
              ${on ? "★" : "☆"}
            </button>
            <span class="play-mini" aria-hidden="true">▶</span>
          </span>
        </button>
      `;
        }).join("");

        // 아이템 클릭
        $$(".word-item", listEl).forEach(btn => {
            btn.addEventListener("click", (e) => {
                const id = btn.dataset.id;
                // 내부 star 버튼 클릭이면 item 선택 이벤트 막음
                if (e.target && e.target.closest("[data-star]")) return;
                setSelected(id);
            });
        });

        // star 버튼 클릭
        $$("[data-star]", listEl).forEach(starBtn => {
            starBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = starBtn.dataset.star;
                toggleBookmark(id);
                // 리스트만 다시 그려도 UI 싱크됨
                renderList();
                // 상세도 싱크
                if (selectedId) renderDetail(selectedId);
            });
        });

        // 상세 렌더
        renderDetail(selectedId);
    }

    /** =========================
     *  상세 렌더
     *  ========================= */
    function setSelected(id) {
        selectedId = id;

        // 리스트 선택 표시
        $$(".word-item", listEl).forEach(el => {
            const on = el.dataset.id === id;
            el.classList.toggle("is-selected", on);
            el.setAttribute("aria-selected", on ? "true" : "false");
        });

        if (!id) {
            detailTitle.textContent = "단어를 선택하세요";
            detailMeta.textContent = "";
            detailContent.innerHTML = `
        <div class="word-empty">
          <div class="word-empty-emoji">📘</div>
          <div class="word-empty-title">왼쪽 목록에서 단어를 선택해 주세요</div>
          <div class="word-empty-sub">임시 데이터로 구성되어 있어요. (API/DB 연결 시 쉽게 교체 가능)</div>
        </div>
      `;
            setDetailStar(null);
            return;
        }

        renderDetail(id);
    }

    function renderDetail(id) {
        const w = WORDS.find(x => x.id === id);
        if (!w) return;

        // 제목 + (영문)
        const titleHtml = `
      ${escapeHtml(w.term)}
      ${w.en ? ` <small>(${escapeHtml(w.en)})</small>` : ""}
    `;
        detailTitle.innerHTML = titleHtml;

        detailMeta.textContent = w.updatedAt || "";

        detailContent.innerHTML = (w.body || []).map(p => `<p>${escapeHtml(p)}</p>`).join("");

        // 상세 별 상태
        setDetailStar(w.id);

        // 상세 별 버튼 클릭
        detailStarBtn.onclick = () => {
            toggleBookmark(w.id);
            setDetailStar(w.id);
            renderList(); // 리스트의 별 UI도 동기화
            renderBookmarkModalList(); // 모달 열려있으면 즉시 반영
        };
    }

    function setDetailStar(id) {
        if (!detailStarIcon) return;
        if (!id) {
            detailStarIcon.textContent = "☆";
            detailStarIcon.classList.remove("is-on");
            return;
        }
        const on = isBookmarked(id);
        detailStarIcon.textContent = on ? "★" : "☆";
        detailStarIcon.classList.toggle("is-on", on);
    }

    /** =========================
     *  모달(북마크 리스트)
     *  ========================= */
    function openModal() {
        modal.classList.add("is-open");
        modal.setAttribute("aria-hidden", "false");
        renderBookmarkModalList();
        // ESC 닫기
        window.addEventListener("keydown", onEscClose);
    }

    function closeModal() {
        modal.classList.remove("is-open");
        modal.setAttribute("aria-hidden", "true");
        window.removeEventListener("keydown", onEscClose);
    }

    function onEscClose(e) {
        if (e.key === "Escape") closeModal();
    }

    function renderBookmarkModalList() {
        if (!modal.classList.contains("is-open")) return;

        const items = bookmarks
            .map(id => WORDS.find(w => w.id === id))
            .filter(Boolean);

        if (!items.length) {
            bookmarkListEl.innerHTML = "";
            bookmarkEmptyEl.hidden = false;
            return;
        }
        bookmarkEmptyEl.hidden = true;

        bookmarkListEl.innerHTML = items.map(w => `
      <div class="bookmark-item" data-id="${w.id}">
        <div>
          <strong>${escapeHtml(w.term)}</strong><br />
          <small>${escapeHtml(w.en || "")}</small>
        </div>
        <button class="rm" type="button" data-rm="${w.id}">삭제</button>
      </div>
    `).join("");

        // 클릭하면 해당 단어로 이동
        $$(".bookmark-item", bookmarkListEl).forEach(card => {
            card.addEventListener("click", (e) => {
                if (e.target && e.target.closest("[data-rm]")) return;

                const id = card.dataset.id;
                // 세그 맞추기
                const w = WORDS.find(x => x.id === id);
                if (w) {
                    currentSeg = w.seg;
                    currentIndex = "all";
                    // 탭 UI 반영
                    syncSegButtons();
                    renderIndexBar();
                    renderList();
                    setSelected(id);
                    closeModal();
                }
            });
        });

        // 삭제 버튼
        $$("[data-rm]", bookmarkListEl).forEach(btn => {
            btn.addEventListener("click", (e) => {
                e.stopPropagation();
                const id = btn.dataset.rm;
                toggleBookmark(id);
                renderBookmarkModalList();
                renderList();
                if (selectedId) renderDetail(selectedId);
            });
        });
    }

    /** =========================
     *  탭(세그) 이벤트
     *  ========================= */
    function syncSegButtons() {
        const segBtns = $$(".word-seg-btn");
        segBtns.forEach(b => {
            const on = b.dataset.seg === currentSeg;
            b.classList.toggle("is-active", on);
            b.setAttribute("aria-selected", on ? "true" : "false");
        });
    }

    function bindSegEvents() {
        const segBtns = $$(".word-seg-btn");
        segBtns.forEach(btn => {
            btn.addEventListener("click", () => {
                currentSeg = btn.dataset.seg;
                currentIndex = "all";
                selectedId = null;
                syncSegButtons();
                renderIndexBar();
                renderList();
            });
        });
    }

    /** =========================
     *  기타 이벤트
     *  ========================= */
    function bindModalEvents() {
        openBookmarkBtn.addEventListener("click", openModal);
        closeBookmarkBtn.addEventListener("click", closeModal);
        closeBookmarkBtn2.addEventListener("click", closeModal);

        // 배경 클릭 닫기
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });

        clearBookmarksBtn.addEventListener("click", () => {
            bookmarks = [];
            saveBookmarks();
            renderBookmarkModalList();
            renderList();
            if (selectedId) renderDetail(selectedId);
        });
    }

    /** =========================
     *  안전한 문자열
     *  ========================= */
    function escapeHtml(str) {
        return String(str ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    /** =========================
     *  초기화
     *  ========================= */
    function init() {
        bindSegEvents();
        bindModalEvents();
        syncSegButtons();
        renderIndexBar();
        renderList();
    }

    document.addEventListener("DOMContentLoaded", init);
})();