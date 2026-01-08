(() => {
  "use strict";

  // -----------------------------
  // Index constants
  // -----------------------------
  const KO_INDEX = ["ㄱ","ㄴ","ㄷ","ㄹ","ㅁ","ㅂ","ㅅ","ㅇ","ㅈ","ㅊ","ㅋ","ㅌ","ㅍ","ㅎ"];
  const EN_INDEX = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  const NUM_INDEX = ["0","1","2","3","4","5","6","7","8","9"];

  const CHO_NORM = { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" };

  // local persistence (client-only)
  const STORAGE_KEY = "admin_terms_overrides_v1";

  // -----------------------------
  // State
  // -----------------------------
  const state = {
    allWords: [],
    words: [],
    seg: "ko",
    index: "all",
    selectedId: null,

    // edit mode
    isEditing: false,
    editMode: "edit", // "edit" | "add"
    editingId: null,
    draft: { keyword: "", content: "" },
  };

  // -----------------------------
  // DOM helpers
  // -----------------------------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  function escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatYmdDot(d = new Date()) {
    const yyyy = String(d.getFullYear());
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${yyyy}.${mm}.${dd} 수정`;
  }

  function parseKeyword(keywordRaw) {
    const keyword = (keywordRaw ?? "").trim();
    const term = keyword.split("(")[0].trim();
    const en = keyword.match(/\((.*?)\)/)?.[1]?.trim() || "";
    return { keyword, term, en };
  }

  // -----------------------------
  // Index computations
  // -----------------------------
  function getKoIndex(term) {
    if (!term) return null;
    const ch = term.trim().charAt(0);
    const code = ch.charCodeAt(0);
    if (code < 0xac00 || code > 0xd7a3) return null;
    const choIndex = Math.floor((code - 0xac00) / 588);
    const cho = KO_INDEX[choIndex];
    return CHO_NORM[cho] || cho;
  }

  function getEnIndex(term) {
    if (!term) return null;
    const c = term.trim().charAt(0).toUpperCase();
    return c >= "A" && c <= "Z" ? c : null;
  }

  function getNumIndex(term) {
    if (!term) return null;
    const c = term.trim().charAt(0);
    return c >= "0" && c <= "9" ? c : null;
  }

  function detectSeg(term) {
    const t = (term ?? "").trim();
    return /^[0-9]/.test(t) ? "num" : /^[A-Za-z]/.test(t) ? "en" : "ko";
  }

  function computeIndex(seg, term) {
    term = term?.trim();
    if (seg === "ko") return getKoIndex(term);
    if (seg === "en") return getEnIndex(term);
    return getNumIndex(term);
  }

  // -----------------------------
  // Local overrides (persist)
  // -----------------------------
  function loadOverrides() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      if (!parsed || typeof parsed !== "object") return { items: {} };
      if (!parsed.items || typeof parsed.items !== "object") return { items: {} };
      return parsed;
    } catch {
      return { items: {} };
    }
  }

  function saveOverrides(obj) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    } catch {
      // ignore
    }
  }

  function upsertOverride(id, patch) {
    const ovr = loadOverrides();
    ovr.items[id] = { ...(ovr.items[id] || {}), ...patch };
    saveOverrides(ovr);
  }

  function markDeleted(id) {
    upsertOverride(id, { deleted: true });
  }

  function clearDeleted(id) {
    const ovr = loadOverrides();
    if (!ovr.items[id]) return;
    delete ovr.items[id].deleted;
    saveOverrides(ovr);
  }

  function applyOverridesToList(baseList) {
    const ovr = loadOverrides();
    const map = new Map(baseList.map(w => [w.id, w]));

    // apply edits & deletes
    for (const [id, patch] of Object.entries(ovr.items)) {
      if (!patch || typeof patch !== "object") continue;

      if (patch.deleted) {
        map.delete(id);
        continue;
      }

      // new item (not in base)
      if (!map.has(id) && patch.isNew) {
        const { keyword, term, en } = parseKeyword(patch.keyword || "");
        const seg = detectSeg(term);
        const body = (patch.content || "")
          .split("\n")
          .map(v => v.trim())
          .filter(Boolean);

        map.set(id, {
          id,
          term,
          en,
          seg,
          body,
          updatedAt: patch.updatedAt || "",
          indexKey: computeIndex(seg, term),
        });
        continue;
      }

      // edit existing
      const w = map.get(id);
      if (!w) continue;

      const nextKeyword = patch.keyword ?? `${w.term}${w.en ? `(${w.en})` : ""}`;
      const { term, en } = parseKeyword(nextKeyword);
      const seg = detectSeg(term);
      const body = (patch.content ?? w.body.join("\n"))
        .split("\n")
        .map(v => v.trim())
        .filter(Boolean);

      map.set(id, {
        ...w,
        term,
        en,
        seg,
        body,
        updatedAt: patch.updatedAt ?? w.updatedAt,
        indexKey: computeIndex(seg, term),
      });
    }

    return Array.from(map.values());
  }

  // -----------------------------
  // Data load
  // -----------------------------
  async function loadWords() {
    const res = await fetch("/view/word.json", { cache: "no-store" });
    if (!res.ok) throw new Error("word.json 로드 실패");

    const raw = await res.json();
    const items = Array.isArray(raw) ? raw : raw.words || raw.data || raw.items || [];

    const base = items.map((row, i) => {
      const keyword = row.keyword || "";
      const { term, en } = parseKeyword(keyword);
      const seg = detectSeg(term);

      return {
        id: row.term_id ? `word_${row.term_id}` : `word_${i}`,
        term,
        en,
        seg,
        body: (row.content || "")
          .split("\n")
          .map(v => v.trim())
          .filter(Boolean),
        updatedAt: row.scraped_at
          ? row.scraped_at.split("T")[0].replace(/-/g, ".") + " 수정"
          : "",
        indexKey: computeIndex(seg, term),
      };
    });

    state.allWords = applyOverridesToList(base);
  }

  // -----------------------------
  // Filtering + sorting
  // -----------------------------
  function applyFilter() {
    let list = state.allWords.filter(w => w.seg === state.seg);

    if (state.index !== "all") {
      list = list.filter(w => w.indexKey === state.index);
    }

    list.sort((a, b) =>
      a.term.localeCompare(b.term, state.seg === "en" ? "en" : "ko")
    );

    state.words = list;

    if (!state.words.some(w => w.id === state.selectedId)) {
      state.selectedId = state.words[0]?.id || null;
    }
  }

  // -----------------------------
  // Rendering
  // -----------------------------
  function renderIndexBar() {
    const indexBar = $("#indexBar");
    if (!indexBar) return;

    const list =
      state.seg === "ko" ? KO_INDEX :
      state.seg === "en" ? EN_INDEX :
      NUM_INDEX;

    indexBar.innerHTML = `
      <div class="index-pill" role="tablist">
        <button class="index-btn ${state.index === "all" ? "is-active" : ""}"
                data-key="all">전체</button>
        ${list.map(k => `
          <button class="index-btn ${state.index === k ? "is-active" : ""}"
                  data-key="${k}">${k}</button>
        `).join("")}
      </div>
    `;
  }

  function renderList() {
    const listEl = $("#wordList");
    if (!listEl) return;

    if (!state.words.length) {
      listEl.innerHTML = `
        <div class="word-empty" style="min-height:240px;">
          <div class="word-empty-title">해당 조건의 단어가 없어요</div>
        </div>
      `;
      renderDetail(null);
      return;
    }

    listEl.innerHTML = state.words.map(w => `
      <div class="word-item ${w.id === state.selectedId ? "is-selected" : ""}"
           data-id="${w.id}" role="option">
        <span class="word-item-title">${escapeHtml(w.term)}</span>
        <span class="word-item-right">
          <span class="play-mini">▶</span>
        </span>
      </div>
    `).join("");

    renderDetail(state.words.find(w => w.id === state.selectedId) || null);
  }

  function ensureInlineActions() {
    const head = $(".word-detail-head");
    if (!head) return null;

    let actions = $("#detailActions");
    if (!actions) {
      actions = document.createElement("div");
      actions.id = "detailActions";
      actions.className = "word-detail-actions";
      head.appendChild(actions);
    }
    return actions;
  }

  function setToolbarLocked(locked) {
    // lock segment/index/list while editing to avoid accidental navigation
    $$(".word-seg-btn").forEach(b => (b.disabled = !!locked));
    $$("#indexBar .index-btn").forEach(b => (b.disabled = !!locked));

    const btnEdit = $("#btnEdit");
    const btnAdd = $("#btnAdd");
    const btnDelete = $("#btnDelete");

    if (btnEdit) btnEdit.disabled = !!locked;
    if (btnAdd) btnAdd.disabled = !!locked;
    if (btnDelete) btnDelete.disabled = !!locked;
  }

  function renderDetail(word) {
    const title = $("#detailTitle");
    const meta = $("#detailMeta");
    const content = $("#detailContent");
    const actions = ensureInlineActions();

    if (!title || !meta || !content) return;

    // no selection
    if (!word) {
      if (actions) actions.innerHTML = "";
      title.textContent = "단어를 선택하세요";
      meta.textContent = "";
      content.innerHTML = `
        <div class="word-empty">
          <div class="word-empty-emoji">📘</div>
        </div>
      `;
      return;
    }

    // edit mode UI
    if (state.isEditing && state.editingId === word.id) {
      title.textContent = state.editMode === "add" ? "용어 추가" : "용어 편집";
      meta.textContent = "";

      if (actions) {
        actions.innerHTML = `
          <button class="word-primary-btn" id="btnSaveInline" type="button">저장</button>
          <button class="word-outline-btn" id="btnCancelInline" type="button">취소</button>
        `;
      }

      content.innerHTML = `
        <div class="wm-form word-inline-editor">
          <label class="wm-label" for="editKeyword">용어명</label>
          <input class="wm-input" id="editKeyword" type="text" placeholder="예) 가격 차별(Price Discrimination)" />
          <label class="wm-label" for="editContent">내용</label>
          <textarea class="wm-textarea" id="editContent" rows="14" placeholder="설명을 입력하세요"></textarea>
        </div>
      `;

      // set values safely
      const keywordEl = $("#editKeyword");
      const contentEl = $("#editContent");
      if (keywordEl) keywordEl.value = state.draft.keyword;
      if (contentEl) contentEl.value = state.draft.content;

      // bind buttons
      const saveBtn = $("#btnSaveInline");
      const cancelBtn = $("#btnCancelInline");
      if (saveBtn) saveBtn.onclick = onSaveInline;
      if (cancelBtn) cancelBtn.onclick = exitEditMode;

      return;
    }

    // view mode UI
    if (actions) actions.innerHTML = "";

    title.innerHTML = `
      ${escapeHtml(word.term)}
      ${word.en ? `<small>(${escapeHtml(word.en)})</small>` : ""}
    `;
    meta.textContent = word.updatedAt || "";
    content.innerHTML = word.body.map(p => `<p>${escapeHtml(p)}</p>`).join("");
  }

  // -----------------------------
  // Edit mode handlers
  // -----------------------------
  function enterEditMode(mode) {
    const word = state.words.find(w => w.id === state.selectedId) || null;

    if (mode === "edit") {
      if (!word) return;
      state.isEditing = true;
      state.editMode = "edit";
      state.editingId = word.id;
      state.draft = {
        keyword: `${word.term}${word.en ? `(${word.en})` : ""}`,
        content: word.body.join("\n"),
      };
      setToolbarLocked(true);
      renderList();
      return;
    }

    // add
    state.isEditing = true;
    state.editMode = "add";
    state.editingId = "__new__";
    state.draft = { keyword: "", content: "" };

    // to show edit UI, we need some "current word" target in detail
    // we'll temporarily render using currently selected word (if any), but bind to __new__
    // easier: just force detail to show edit form even without selection by faking word object.
    const title = $("#detailTitle");
    const meta = $("#detailMeta");
    const content = $("#detailContent");
    const actions = ensureInlineActions();
    if (!title || !meta || !content) return;

    title.textContent = "용어 추가";
    meta.textContent = "";
    if (actions) {
      actions.innerHTML = `
        <button class="word-primary-btn" id="btnSaveInline" type="button">저장</button>
        <button class="word-outline-btn" id="btnCancelInline" type="button">취소</button>
      `;
    }
    content.innerHTML = `
      <div class="wm-form word-inline-editor">
        <label class="wm-label" for="editKeyword">용어명</label>
        <input class="wm-input" id="editKeyword" type="text" placeholder="예) 가격 차별(Price Discrimination)" />
        <label class="wm-label" for="editContent">내용</label>
        <textarea class="wm-textarea" id="editContent" rows="14" placeholder="설명을 입력하세요"></textarea>
      </div>
    `;

    const keywordEl = $("#editKeyword");
    const contentEl = $("#editContent");
    if (keywordEl) keywordEl.value = "";
    if (contentEl) contentEl.value = "";

    const saveBtn = $("#btnSaveInline");
    const cancelBtn = $("#btnCancelInline");
    if (saveBtn) saveBtn.onclick = onSaveInline;
    if (cancelBtn) cancelBtn.onclick = exitEditMode;

    setToolbarLocked(true);
  }

  function exitEditMode() {
    state.isEditing = false;
    state.editMode = "edit";
    state.editingId = null;
    state.draft = { keyword: "", content: "" };
    setToolbarLocked(false);

    applyFilter();
    renderIndexBar();
    renderList();
  }

  function onSaveInline() {
    const keywordEl = $("#editKeyword");
    const contentEl = $("#editContent");
    const keyword = (keywordEl?.value ?? "").trim();
    const content = (contentEl?.value ?? "").trim();

    if (!keyword) {
      alert("용어명을 입력해 주세요.");
      keywordEl?.focus();
      return;
    }

    const { term, en } = parseKeyword(keyword);
    if (!term) {
      alert("용어명을 확인해 주세요.");
      keywordEl?.focus();
      return;
    }

    const seg = detectSeg(term);
    const body = content
      .split("\n")
      .map(v => v.trim())
      .filter(Boolean);

    const updatedAt = formatYmdDot(new Date());

    // add new
    if (state.editMode === "add") {
      const id = `local_${Date.now()}`;

      // persist as new
      upsertOverride(id, {
        isNew: true,
        keyword,
        content,
        updatedAt,
        deleted: false,
      });

      clearDeleted(id);

      // update in-memory list (without re-fetch)
      state.allWords.push({
        id,
        term,
        en,
        seg,
        body,
        updatedAt,
        indexKey: computeIndex(seg, term),
      });

      // after adding, switch seg/index to match new term (better UX)
      state.seg = seg;
      state.index = "all";
      state.selectedId = id;

      exitEditMode();
      return;
    }

    // edit existing
    const id = state.selectedId;
    if (!id) return;

    upsertOverride(id, { keyword, content, updatedAt, deleted: false });
    clearDeleted(id);

    // update in-memory
    const idx = state.allWords.findIndex(w => w.id === id);
    if (idx >= 0) {
      state.allWords[idx] = {
        ...state.allWords[idx],
        term,
        en,
        seg,
        body,
        updatedAt,
        indexKey: computeIndex(seg, term),
      };
    }

    // keep selection visible even if seg changed
    state.seg = seg;
    state.index = "all";
    state.selectedId = id;

    exitEditMode();
  }

  // -----------------------------
  // Delete
  // -----------------------------
  function deleteSelected() {
    if (state.isEditing) return;

    const word = state.words.find(w => w.id === state.selectedId) || null;
    if (!word) return;

    const ok = confirm(`"${word.term}" 항목을 삭제할까요?`);
    if (!ok) return;

    markDeleted(word.id);
    state.allWords = state.allWords.filter(w => w.id !== word.id);

    applyFilter();
    renderIndexBar();
    renderList();
  }

  // -----------------------------
  // Events
  // -----------------------------
  function bindEvents() {
    // segment buttons
    $$(".word-seg-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        if (state.isEditing) return;
        state.seg = btn.dataset.seg;
        state.index = "all";

        $$(".word-seg-btn").forEach(b => {
          b.classList.toggle("is-active", b === btn);
          b.setAttribute("aria-selected", b === btn);
        });

        applyFilter();
        renderIndexBar();
        renderList();
      });
    });

    // index bar
    $("#indexBar")?.addEventListener("click", e => {
      if (state.isEditing) return;
      const btn = e.target.closest(".index-btn");
      if (!btn) return;
      state.index = btn.dataset.key;
      applyFilter();
      renderIndexBar();
      renderList();
    });

    // word list selection
    $("#wordList")?.addEventListener("click", e => {
      if (state.isEditing) return;
      const item = e.target.closest(".word-item");
      if (!item) return;
      state.selectedId = item.dataset.id;
      renderList();
    });

    // toolbar buttons
    $("#btnEdit")?.addEventListener("click", () => enterEditMode("edit"));
    $("#btnAdd")?.addEventListener("click", () => enterEditMode("add"));
    $("#btnDelete")?.addEventListener("click", () => deleteSelected());

    // ESC to cancel edit
    document.addEventListener("keydown", (e) => {
      if (!state.isEditing) return;
      if (e.key === "Escape") exitEditMode();
    });
  }

  // -----------------------------
  // Init
  // -----------------------------
  async function init() {
    await loadWords();
    applyFilter();
    renderIndexBar();
    renderList();
    bindEvents();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
