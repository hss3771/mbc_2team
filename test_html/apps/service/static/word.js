(() => {
  "use strict";

  /** =========================
   *  DOM Helpers
   *  ========================= */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  /** =========================
   *  DOM
   *  ========================= */
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

  // 필수 DOM 없으면 종료
  if (
    !indexBar || !listEl || !detailTitle || !detailMeta || !detailContent ||
    !detailStarBtn || !modal || !openBookmarkBtn || !closeBookmarkBtn ||
    !closeBookmarkBtn2 || !bookmarkListEl || !bookmarkEmptyEl || !clearBookmarksBtn
  ) return;

  /** =========================
   *  상태
   *  ========================= */
  const STORAGE_KEY = "ts_word_bookmarks_v1";

  const KO_INDEX = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  const EN_INDEX = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  const NUM_INDEX = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

  const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  const CHO_NORM = { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" };

  const state = {
    words: /** @type {Array<{id:string, seg:'ko'|'en'|'num', term:string, en:string, updatedAt:string, body:string[], indexKey:string|null}>} */ ([]),
    byId: new Map(),

    seg: /** @type {'ko'|'en'|'num'} */ ("ko"),
    index: /** @type {string} */ ("all"),
    selectedId: /** @type {string|null} */ (null),

    bookmarks: loadBookmarks(),
  };

  /** =========================
   *  Storage
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
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state.bookmarks));
  }

  function isBookmarked(id) {
    return state.bookmarks.includes(id);
  }

  function toggleBookmark(id) {
    if (!id) return;
    if (isBookmarked(id)) state.bookmarks = state.bookmarks.filter(x => x !== id);
    else state.bookmarks = [id, ...state.bookmarks];
    saveBookmarks();
  }

  /** =========================
   *  Utils
   *  ========================= */
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function randomId() {
    return (typeof crypto !== "undefined" && crypto.randomUUID)
      ? crypto.randomUUID()
      : `r${Math.random().toString(16).slice(2)}${Date.now()}`;
  }

  function splitKeyword(keyword) {
    const s = String(keyword ?? "").trim();
    const m = s.match(/^(.+?)\s*\((.+)\)\s*$/);
    if (!m) return { term: s, en: "" };
    return { term: m[1].trim(), en: m[2].trim() };
  }

  function tabToSeg(tab, term) {
    const t = String(tab || "").toUpperCase().trim();
    if (t === "KOR") return "ko";
    if (t === "ENG") return "en";
    if (t === "NUM") return "num";

    const first = (term || "").trim()[0] || "";
    if (first >= "0" && first <= "9") return "num";
    if ((first >= "A" && first <= "Z") || (first >= "a" && first <= "z")) return "en";
    return "ko";
  }

  function formatUpdatedAt(iso) {
    const s = String(iso || "").trim();
    const d = new Date(s);
    if (Number.isNaN(d.getTime())) return "";
    const yy = String(d.getFullYear()).slice(-2);
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yy}.${mm}.${dd} 수정`;
  }

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

  function computeIndexKey(seg, term) {
    if (seg === "ko") return getKoIndex(term);
    if (seg === "en") return getEnIndex(term);
    return getNumIndex(term);
  }

  function getLocaleForSeg(seg) {
    if (seg === "en") return "en";
    return "ko";
  }

  /** =========================
   *  Data Loading
   *  ========================= */
  async function loadWordsFromJson(url = "./word.json") {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`JSON load failed: ${res.status} ${res.statusText}`);

    const raw = await res.json();
    if (!Array.isArray(raw)) throw new Error("JSON is not an array");

    const seen = new Set();
    const words = [];

    for (const row of raw) {
      if (!row) continue;

      const tid = String(row.term_id ?? "").trim();
      const id = tid ? `kdi_${tid}` : `kdi_${randomId()}`; // ✅ BUG FIX
      if (seen.has(id)) continue;
      seen.add(id);

      const { term, en } = splitKeyword(row.keyword || "");
      const seg = tabToSeg(row.tab, term);

      const body = String(row.content || "")
        .split(/\n\s*\n/g)
        .map(s => s.trim())
        .filter(Boolean);

      const updatedAt = formatUpdatedAt(row.scraped_at);
      const indexKey = computeIndexKey(seg, term);

      words.push({ id, seg, term, en, updatedAt, body, indexKey });
    }

    return words;
  }

  /** =========================
   *  Render: Seg Tabs
   *  ========================= */
  function syncSegButtons() {
    const segBtns = $$(".word-seg-btn");
    segBtns.forEach(b => {
      const on = b.dataset.seg === state.seg;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
  }

  /** =========================
   *  Render: IndexBar
   *  ========================= */
  function renderIndexBtn(key, label) {
    const on = key === state.index ? "is-active" : "";
    return `<button class="index-btn ${on}" type="button" data-key="${key}">${label}</button>`;
  }

  /** =========================
   *  Render: List + Detail
   *  ========================= */
  function setSelected(id, { render = false } = {}) {
    state.selectedId = id;

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

    if (render) renderList();
    else {
      // 리스트 선택 표시만 갱신
      $$(".word-item", listEl).forEach(el => {
        const on = el.dataset.id === id;
        el.classList.toggle("is-selected", on);
        el.setAttribute("aria-selected", on ? "true" : "false");
      });
      renderDetail(id);
    }
  }

  function renderDetail(id) {
    const w = state.byId.get(id);
    if (!w) return;

    detailTitle.innerHTML = `
      ${escapeHtml(w.term)}
      ${w.en ? ` <small>(${escapeHtml(w.en)})</small>` : ""}
    `;
    detailMeta.textContent = w.updatedAt || "";
    detailContent.innerHTML = (w.body || []).map(p => `<p>${escapeHtml(p)}</p>`).join("");

    setDetailStar(w.id);
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
   *  Modal
   *  ========================= */
  function openModal() {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    renderBookmarkModalList();
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

    const items = state.bookmarks
      .map(id => state.byId.get(id))
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
  }

  /** =========================
   *  Events (single bind)
   *  ========================= */
  function bindEvents() {
    // Seg tabs
    $$(".word-seg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        state.seg = /** @type any */ (btn.dataset.seg || "ko");
        state.index = "all";
        state.selectedId = null;

        syncSegButtons();
        renderIndexBar();
        renderList();
      });
    });

    // Index bar (delegation)
    indexBar.addEventListener("click", (e) => {
      const btn = e.target.closest(".index-btn");
      if (!btn) return;
      state.index = btn.dataset.key || "all";
      renderIndexBar();
      renderList();
    });

    // Word list (delegation)
    listEl.addEventListener("click", (e) => {
      const starBtn = e.target.closest("[data-star]");
      if (starBtn) {
        const id = starBtn.dataset.star;
        toggleBookmark(id);
        renderList();
        renderBookmarkModalList();
        return;
      }

      const item = e.target.closest(".word-item");
      if (!item) return;
      setSelected(item.dataset.id);
    });

    // list keyboard: Enter/Space selects
    listEl.addEventListener("keydown", (e) => {
      const item = e.target.closest(".word-item");
      if (!item) return;

      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        setSelected(item.dataset.id);
      }
    });

    // Detail star (single)
    detailStarBtn.addEventListener("click", () => {
      if (!state.selectedId) return;
      toggleBookmark(state.selectedId);
      setDetailStar(state.selectedId);
      renderList();
      renderBookmarkModalList();
    });

    // Modal open/close
    openBookmarkBtn.addEventListener("click", openModal);
    closeBookmarkBtn.addEventListener("click", closeModal);
    closeBookmarkBtn2.addEventListener("click", closeModal);

    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });

    // Modal list (delegation)
    bookmarkListEl.addEventListener("click", (e) => {
      const rm = e.target.closest("[data-rm]");
      if (rm) {
        const id = rm.dataset.rm;
        toggleBookmark(id);
        renderBookmarkModalList();
        renderList();
        return;
      }

      const card = e.target.closest(".bookmark-item");
      if (!card) return;

      const id = card.dataset.id;
      const w = state.byId.get(id);
      if (!w) return;

      state.seg = w.seg;
      state.index = "all";
      state.selectedId = id;

      syncSegButtons();
      renderIndexBar();
      renderList();
      closeModal();
    });

    clearBookmarksBtn.addEventListener("click", () => {
      state.bookmarks = [];
      saveBookmarks();
      renderBookmarkModalList();
      renderList();
    });
  }

  /** =========================
   *  Init
   *  ========================= */
  async function init() {
    try {
      const words = await loadWordsFromJson("./word.json");
      state.words = words;
      state.byId = new Map(words.map(w => [w.id, w]));
    } catch (err) {
      console.error(err);
      state.words = [];
      state.byId = new Map();
    }

    bindEvents();
    syncSegButtons();
    renderIndexBar();
    renderList();
  }

  // word.html에서 script가 defer라면 DOMContentLoaded 기다릴 필요 없지만,
  // 안전하게 처리(둘 다 OK)
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();