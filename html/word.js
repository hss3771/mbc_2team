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

    let WORDS = [];

    // ---- JSON -> WORDS 변환 로더 ----
    async function loadWordsFromJson(url = "./word.json") {
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`JSON load failed: ${res.status} ${res.statusText}`);

        const raw = await res.json(); // raw: [{term_id, keyword, content, tab, scraped_at, ...}, ...]
        if (!Array.isArray(raw)) throw new Error("JSON is not an array");

        // term_id 중복이 있을 수 있어서(데이터에 중복 항목 존재) term_id 기준 dedupe
        const seen = new Set();

        return raw
            .filter(Boolean)
            .map(toWordModel)
            .filter(w => {
                if (!w?.id) return false;
                if (seen.has(w.id)) return false;
                seen.add(w.id);
                return true;
            });
    }

    function toWordModel(row) {
        const id = `kdi_${String(row.term_id ?? "").trim()}` || `kdi_${randomId()}`;

        const { term, en } = splitKeyword(row.keyword || "");
        const seg = tabToSeg(row.tab, term);

        // content는 \n\n 단락 구분이 많아서 p 배열로 쪼개기
        const body = String(row.content || "")
            .split(/\n\s*\n/g)
            .map(s => s.trim())
            .filter(Boolean);

        const updatedAt = formatUpdatedAt(row.scraped_at);

        return { id, seg, term, en, updatedAt, body };
    }

    function splitKeyword(keyword) {
        const s = String(keyword).trim();

        // 예: "가격 차별(Price Discrimination, Price Differentiation)"
        const m = s.match(/^(.+?)\s*\((.+)\)\s*$/);
        if (!m) return { term: s, en: "" };

        return {
            term: m[1].trim(),
            en: m[2].trim(),
        };
    }

    function tabToSeg(tab, term) {
        const t = String(tab || "").toUpperCase().trim();
        if (t === "KOR") return "ko";
        if (t === "ENG") return "en";
        if (t === "NUM") return "num";

        // 혹시 tab이 이상하면 term 첫 글자로 추정
        const first = (term || "").trim()[0] || "";
        if (first >= "0" && first <= "9") return "num";
        if ((first >= "A" && first <= "Z") || (first >= "a" && first <= "z")) return "en";
        return "ko";
    }

    function formatUpdatedAt(iso) {
        // iso 예: "2025-12-29T19:53:35"
        const s = String(iso || "").trim();
        const d = new Date(s);
        if (Number.isNaN(d.getTime())) return "";

        const yy = String(d.getFullYear()).slice(-2);
        const mm = String(d.getMonth() + 1).padStart(2, "0");
        const dd = String(d.getDate()).padStart(2, "0");
        return `${yy}.${mm}.${dd} 수정`;
    }

    function randomId() {
        return (typeof crypto !== "undefined" && crypto.randomUUID)
            ? crypto.randomUUID()
            : `r${Math.random().toString(16).slice(2)}${Date.now()}`;
    }

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
          <div class="word-empty-title">해당 조건의 단어가 없어요<br> 다른 인덱스를 선택해보세요</div>
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
    <div class="word-item ${selected ? "is-selected" : ""}"
         data-id="${w.id}"
         role="option"
         tabindex="0"
         aria-selected="${selected}">
      <span class="word-item-title">${escapeHtml(w.term)}</span>

      <span class="word-item-right">
        <button class="star-mini ${on ? "is-on" : ""}"
                type="button"
                data-star="${w.id}"
                aria-label="즐겨찾기">
          ${on ? "★" : "☆"}
        </button>
        <span class="play-mini" aria-hidden="true">▶</span>
      </span>
    </div>
  `;
        }).join("");
        // 아이템 클릭
        $$(".word-item", listEl).forEach(el => {
            el.addEventListener("click", (e) => {
                // 내부 star 버튼 클릭이면 item 선택 이벤트 막음
                if (e.target && e.target.closest("[data-star]")) return;
                
                setSelected(el.dataset.id);
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

    async function init() {
        try {
            WORDS = await loadWordsFromJson("./word.json");
        } catch (err) {
            console.error(err);
            WORDS = [];
            // 로딩 실패 시 화면에 힌트 주고 싶으면 여기서 detailContent에 메시지 넣어도 됨
        }

        bindSegEvents();
        bindModalEvents();
        syncSegButtons();
        renderIndexBar();
        renderList();
    }

    document.addEventListener("DOMContentLoaded", () => {
        init();
    });
})();