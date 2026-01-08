// /static/admin_rerun.js
(function () {
  "use strict";

  const $ = (sel, el = document) => el.querySelector(sel);
  const $$ = (sel, el = document) => Array.from(el.querySelectorAll(sel));

  // =========================
  // util
  // =========================
  function pad2(n) { return String(n).padStart(2, "0"); }
  function toInputValue(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }
  function parseInputDate(v) {
    const [y, m, d] = (v || "").split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(y, m - 1, d);
  }
  function clampStartEnd(startEl, endEl) {
    const s = parseInputDate(startEl.value);
    const e = parseInputDate(endEl.value);
    if (!s || !e) return;
    if (s > e) endEl.value = startEl.value;
  }
  function inRange(dateObj, s, e) {
    const t = dateObj.getTime();
    return t >= s.getTime() && t <= e.getTime();
  }
  function seededRand(seed) {
    let x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
  function randId(seed) {
    const chars = "abcdef0123456789";
    let s = "";
    for (let i = 0; i < 24; i++) {
      const r = seededRand(seed * 97 + i * 13);
      s += chars[Math.floor(r * chars.length)];
    }
    return s;
  }
  function wait(ms) { return new Promise(res => setTimeout(res, ms)); }

  // =========================
  // models / mock data
  // =========================
  const MODELS = ["keyword", "sentiment", "trust", "summary"];
  const MODEL_LABEL = {
    keyword: "Keyword",
    sentiment: "Sentiment",
    trust: "Trust",
    summary: "Summary",
  };

  // published_at + null fields
  const mockArticles = Array.from({ length: 70 }, (_, i) => {
    const today = new Date();
    const dayOffset = Math.floor(seededRand(i * 17 + 3) * 90);
    const pub = new Date(today);
    pub.setDate(today.getDate() - dayOffset);

    const kNull = seededRand(i * 11 + 1) < 0.35;
    const sNull = seededRand(i * 13 + 2) < 0.35;
    const tNull = seededRand(i * 19 + 3) < 0.35;
    const mNull = seededRand(i * 23 + 4) < 0.35;

    return {
      article_id: randId(i + 1) + randId(i + 9).slice(0, 8),
      published_at: pub,
      keyword: kNull ? null : "OK",
      sentiment: sNull ? null : "OK",
      trust: tNull ? null : "OK",
      summary: mNull ? null : "OK",
    };
  });

  // =========================
  // elements
  // =========================
  const startEl = $("#startDate");
  const endEl = $("#endDate");
  const btnSearch = $("#btnSearch");
  const btnRun = $("#btnRun");

  // ✅ countLabel/countPill은 설계서에서 제거되므로 "옵션"
  const countLabel = $("#countLabel"); // 없어도 됨

  const runRatePill = $("#runRatePill");
  const runRate = $("#runRate");
  const runRateLabel = $("#runRateLabel");
  const runRateInfo = $("#runRateInfo");

  const chipAll = $("#chipAll");
  const chipClear = $("#chipClear");
  const modelChips = $$(".rerun-chip[data-model]");

  const checkAllRows = $("#checkAllRows");
  const tbody = $("#tbodyArticles");
  const emptyState = $("#emptyState");
  const emptyHint = $("#emptyHint");

  const toast = $("#toast");
  const toastText = $("#toastText");
  const btnToastClose = $("#btnToastClose");

  const confirmModal = $("#confirmModal");
  const confirmDesc = $("#confirmDesc");
  const btnConfirmCancel = $("#btnConfirmCancel");
  const btnConfirmOk = $("#btnConfirmOk");

  // 필수 엘리먼트 체크 (✅ countLabel 제거)
  const required = [
    startEl, endEl, btnSearch, btnRun,
    chipAll, chipClear,
    checkAllRows, tbody, emptyState, emptyHint,
    toast, toastText, btnToastClose,
    confirmModal, confirmDesc, btnConfirmCancel, btnConfirmOk,
    runRatePill, runRate, runRateLabel, runRateInfo
  ];
  if (required.some(v => !v)) {
    console.warn("[admin_rerun.js] required element missing. abort.");
    return;
  }

  // =========================
  // state
  // =========================
  let selectedModels = new Set(MODELS);   // 필터 기준(컬럼 표시는 고정)
  let currentList = [];
  let selectedRowIds = new Set();
  let isLocked = false;

  let running = false;
  let pct = 0;

  // =========================
  // init dates: yesterday ~ today
  // =========================
  (function initDates() {
    const today = new Date();
    const y = new Date(today);
    y.setDate(today.getDate() - 1);
    startEl.value = toInputValue(y);
    endEl.value = toInputValue(today);
  })();

  // =========================
  // UI helpers
  // =========================
  function showToast(msg) {
    toastText.innerHTML = msg || "";
    toast.hidden = false;
  }
  function hideToast() {
    toast.hidden = true;
  }

  function setLocked(on) {
    isLocked = on;

    // 검색/실행 버튼
    btnSearch.disabled = on;
    btnRun.disabled = on ? true : btnRun.disabled;

    // 테이블/칩 인터랙션(최소)
    if (on) {
      document.body.classList.add("rerun-running");
    } else {
      document.body.classList.remove("rerun-running");
    }
  }

  // ✅ countLabel이 없어도 에러 없이 통과
  function updateCountPill() {
    if (!countLabel) return; // ← 핵심
    const target = currentList.length;
    const selected = Array.from(selectedRowIds).filter(id => currentList.some(r => r.article_id === id)).length;
    countLabel.textContent = `대상 ${target}건 · 선택 ${selected}건`;
  }

  function syncRunButton() {
    const can =
      !isLocked &&
      selectedModels.size > 0 &&
      currentList.length > 0 &&
      Array.from(selectedRowIds).some(id => currentList.some(r => r.article_id === id));
    btnRun.disabled = !can;
  }

  function syncHeaderCheck() {
    const ids = currentList.map(r => r.article_id);
    const allSelected = ids.length > 0 && ids.every(id => selectedRowIds.has(id));
    const anySelected = ids.some(id => selectedRowIds.has(id));

    checkAllRows.checked = allSelected;
    checkAllRows.indeterminate = (!allSelected && anySelected);
  }

  // =========================
  // chips (필터 기준만 변경)
  // =========================
  function syncChipUI() {
    modelChips.forEach(ch => {
      const m = ch.dataset.model;
      ch.classList.toggle("is-active", selectedModels.has(m));
    });

    chipAll.classList.toggle("is-active", selectedModels.size === MODELS.length);
    chipClear.classList.toggle("is-active", selectedModels.size === 0);
  }

  function setAllModels(on) {
    selectedModels = on ? new Set(MODELS) : new Set();
    syncChipUI();
    refresh();
  }

  chipAll.addEventListener("click", () => {
    if (isLocked) return;
    setAllModels(true);
  });
  chipClear.addEventListener("click", () => {
    if (isLocked) return;
    setAllModels(false);
  });

  modelChips.forEach(ch => {
    ch.addEventListener("click", () => {
      if (isLocked) return;
      const m = ch.dataset.model;
      if (selectedModels.has(m)) selectedModels.delete(m);
      else selectedModels.add(m);
      syncChipUI();
      refresh();
    });
  });

  // =========================
  // filtering
  // =========================
  function isAnySelectedModelNull(row) {
    if (selectedModels.size === 0) return false;
    for (const m of selectedModels) {
      if (row[m] === null) return true;
    }
    return false;
  }

  function filterList() {
    const s = parseInputDate(startEl.value);
    const e = parseInputDate(endEl.value);
    if (!s || !e) return [];

    if (selectedModels.size === 0) return [];

    const rows = mockArticles
      .filter(r => inRange(r.published_at, s, e))
      .filter(r => isAnySelectedModelNull(r));

    rows.sort((a, b) => b.published_at.getTime() - a.published_at.getTime());
    return rows;
  }

  // =========================
  // render
  // =========================
  function renderCell(v) {
    // ✅ 설계서 느낌: 정상 값은 "OK" 텍스트 대신 점(·)
    if (v === null) return `<span class="rerun-pill is-null">Null</span>`;
    return `<span class="rerun-pill is-dot" aria-label="OK">·</span>`;
  }

  function render() {
    updateCountPill();

    if (currentList.length === 0) {
      tbody.innerHTML = "";
      emptyState.hidden = false;

      if (selectedModels.size === 0) {
        emptyHint.textContent = "분석 모델을 선택하면 목록이 표시됩니다. (전체 해제 상태)";
      } else {
        emptyHint.textContent = "조건에 해당하는 null 기사 목록이 없습니다.";
      }

      checkAllRows.checked = false;
      checkAllRows.indeterminate = false;

      syncRunButton();
      return;
    }

    emptyState.hidden = true;

    tbody.innerHTML = "";
    currentList.forEach(row => {
      const checked = selectedRowIds.has(row.article_id);

      const tr = document.createElement("tr");
      tr.innerHTML = `
        <td style="width:54px;">
          <input type="checkbox" class="rerun-check rowCheck" data-id="${row.article_id}" ${checked ? "checked" : ""}>
        </td>
        <td style="width:360px;" class="rerun-mono">${row.article_id}</td>

        <!-- ✅ 컬럼은 항상 고정 표시 -->
        <td data-col="keyword">${renderCell(row.keyword)}</td>
        <td data-col="sentiment">${renderCell(row.sentiment)}</td>
        <td data-col="trust">${renderCell(row.trust)}</td>
        <td data-col="summary">${renderCell(row.summary)}</td>
      `;
      tbody.appendChild(tr);
    });

    $$(".rowCheck", tbody).forEach(ch => {
      ch.addEventListener("change", () => {
        if (isLocked) { ch.checked = !ch.checked; return; }
        const id = ch.dataset.id;
        if (!id) return;

        if (ch.checked) selectedRowIds.add(id);
        else selectedRowIds.delete(id);

        syncHeaderCheck();
        updateCountPill();
        syncRunButton();
      });
    });

    syncHeaderCheck();
    updateCountPill();
    syncRunButton();
  }

  function refresh() {
    currentList = filterList();

    // 기본: 조회 후 전체 선택
    selectedRowIds = new Set(currentList.map(r => r.article_id));

    render();
  }

  function selectAllRows(on) {
    const ids = currentList.map(r => r.article_id);
    if (on) ids.forEach(id => selectedRowIds.add(id));
    else ids.forEach(id => selectedRowIds.delete(id));
    render();
  }

  // =========================
  // toolbar events
  // =========================
  btnSearch.addEventListener("click", () => {
    if (isLocked) return;
    clampStartEnd(startEl, endEl);
    refresh();
  });

  checkAllRows.addEventListener("change", () => {
    if (isLocked) { checkAllRows.checked = !checkAllRows.checked; return; }
    selectAllRows(checkAllRows.checked);
  });

  // =========================
  // confirm modal
  // =========================
  function openConfirm() {
    const targetIds = currentList.filter(r => selectedRowIds.has(r.article_id)).map(r => r.article_id);
    const modelNames = Array.from(selectedModels).map(m => MODEL_LABEL[m]).join(", ");

    confirmDesc.innerHTML = `
      선택된 기사: <b>${targetIds.length}건</b><br>
      선택 모델: <b>${modelNames || "-"}</b><br><br>
      실행 시 시간이 오래 걸릴 수 있습니다.<br>
      확인을 누르면 실행이 시작됩니다.
    `;

    confirmModal.hidden = false;
  }
  function closeConfirm() {
    confirmModal.hidden = true;
  }

  btnRun.addEventListener("click", () => {
    if (btnRun.disabled) return;
    openConfirm();
  });

  btnConfirmCancel.addEventListener("click", closeConfirm);
  confirmModal.addEventListener("click", (e) => {
    const t = e.target;
    if (t && t.dataset && t.dataset.close === "true") closeConfirm();
  });

  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !confirmModal.hidden) closeConfirm();
  });

  // =========================
  // progress pill
  // =========================
  function setProgress(on, percent) {
    running = on;
    pct = Math.max(0, Math.min(100, Math.round(percent || 0)));

    if (!running) {
      runRatePill.hidden = true;
      runRate.textContent = "(0%)";
      return;
    }

    runRatePill.hidden = false;
    runRateLabel.textContent = "재분석 실행 중";
    runRate.textContent = `(${pct}%)`;
  }

  runRateInfo.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!running) return;
    showToast("현재 재분석이 진행 중입니다.<br>완료까지 재실행은 제한되며,<br>조회 기능은 정상적으로 이용 가능합니다.");
  });

  // =========================
  // run simulation
  // =========================
  async function simulateRun() {
    const targets = currentList.filter(r => selectedRowIds.has(r.article_id));
    const total = targets.length;

    if (total === 0) {
      showToast("선택된 기사가 없습니다.");
      return;
    }

    setLocked(true);
    setProgress(true, 0);
    btnRun.disabled = true;

    let done = 0;

    for (const row of targets) {
      // 처리 시간 연출
      await wait(350);

      // 선택된 모델 중 null만 OK로 채움
      for (const m of selectedModels) {
        if (row[m] === null) row[m] = "OK";
      }

      done++;
      setProgress(true, (done / total) * 100);
    }

    await wait(250);
    setProgress(false, 0);
    setLocked(false);

    refresh();
    showToast("재분석이 완료되었습니다.");
  }

  btnConfirmOk.addEventListener("click", async () => {
    closeConfirm();
    await simulateRun();
  });

  // =========================
  // toast close
  // =========================
  btnToastClose.addEventListener("click", hideToast);

  // =========================
  // boot
  // =========================
  (function boot() {
    // ✅ 공통헤더를 쓰므로 authArea를 건드리는 코드는 여기서 절대 넣지 않음
    syncChipUI();
    refresh();
    setProgress(false, 0);
  })();
})();
