(function () {
  // ===== util =====
  const $ = (sel, el = document) => el.querySelector(sel);

  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  function isoToday() {
    const d = new Date();
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  }

  function toDateNum(iso) {
    // "YYYY-MM-DD" -> YYYYMMDD number
    if (!iso) return 0;
    return Number(iso.replaceAll("-", ""));
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function formatDateTime(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(
      d.getMinutes()
    )}:${pad2(d.getSeconds())}`;
  }

  function formatWorkAt(d) {
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} / ${pad2(d.getHours())}시`;
  }

  function codeClass(code) {
    if (code >= 300 && code < 400) return "is-3xx";
    if (code >= 400 && code < 500) return "is-4xx";
    if (code >= 500) return "is-5xx";
    return "";
  }

  function escapeHtml(s) {
    return String(s)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replaceAll("\n", " ");
  }

  // ===== auth area =====
  // 공통헤더(#headerMount)를 쓰는 페이지에서는 header_init.js가 auth 토글을 담당하므로
  //    여기서 #authArea.innerHTML을 덮어쓰면 헤더 메뉴가 깨질 수 있음.
  async function renderAuth() {
    // 공통헤더 사용 시: authArea 조작 금지
    if (document.querySelector("#headerMount")) return;

    const authArea = $("#authArea");
    if (!authArea) return;

    try {
      const res = await fetch("/api/session", { credentials: "include" });
      const data = await res.json();

      if (!data.logged_in) {
        location.replace("/view/login.html");
        return;
      }

      // (레거시 모드) 관리자 페이지: 로그아웃만
      authArea.innerHTML = `<a href="/logout" class="btn-secondary logout-button">로그아웃</a>`;
    } catch (e) {
      location.replace("/view/login.html");
    }
  }

  // =========================================================
  // 설계서 요구: 컬럼(Keyword/Sentiment/Trust/Summary) 고정 + 비활성 컬럼 스타일
  // - 기존/다른 JS가 display:none 처리해도, 이 스크립트가 "되돌리고" 클래스만 토글
  // - 비활성 컬럼은 점(·) 표시 + 연한색(사진6 느낌)
  // =========================================================
  const RERUN_MODELS = ["keyword", "sentiment", "trust", "summary"];
  let __rerunFixedColumnsInited = false;

  function initRerunFixedColumns() {
    if (__rerunFixedColumnsInited) return;

    const chipsWrap = document.getElementById("modelChips");
    if (!chipsWrap) return; // 이 페이지가 아니면 아무것도 안 함

    __rerunFixedColumnsInited = true;

    const btnAll = document.getElementById("chipAll");
    const btnClear = document.getElementById("chipClear");
    const tbodyArticles = document.getElementById("tbodyArticles");

    const selectedModels = new Set();

    const getModelButtons = () =>
      Array.from(chipsWrap.querySelectorAll('button[data-model]'));

    function readSelectedFromDOM() {
      selectedModels.clear();
      getModelButtons().forEach((btn) => {
        const m = btn.dataset.model;
        const on = btn.classList.contains("is-active");
        if (on) selectedModels.add(m);
      });
    }

    function setBtnActive(btn, on) {
      btn.classList.toggle("is-active", !!on);
    }

    function setAll(on) {
      getModelButtons().forEach((btn) => setBtnActive(btn, on));
      readSelectedFromDOM();
      applyColumnState();
    }

    function toggleOne(btn) {
      const now = !btn.classList.contains("is-active");
      setBtnActive(btn, now);
      readSelectedFromDOM();
      applyColumnState();
    }

    function applyColumnState() {
      RERUN_MODELS.forEach((m) => {
        const on = selectedModels.has(m);

        // ✅ 헤더/바디의 data-col 컬럼을 "숨기지 말고" 상태 클래스만 토글
        document.querySelectorAll(`[data-col="${m}"]`).forEach((cell) => {
          // 다른 코드가 display:none을 걸어놔도 강제로 복구
          cell.style.display = "";

          cell.classList.toggle("is-col-off", !on);

          // ✅ 바디 td는 내용까지 점(·) 처리
          if (cell.tagName === "TD") {
            if (!cell.dataset.tsOrigHtml) {
              cell.dataset.tsOrigHtml = cell.innerHTML;
            }

            if (!on) {
              cell.innerHTML = `<span class="rerun-pill is-off">•</span>`;
            } else {
              cell.innerHTML = cell.dataset.tsOrigHtml;
            }
          }
        });
      });
    }

    // ✅ 칩 클릭 이벤트(위임)
    chipsWrap.addEventListener("click", (e) => {
      const btn = e.target.closest("button");
      if (!btn) return;

      // data-model 버튼만 토글
      if (btn.dataset && btn.dataset.model) {
        e.preventDefault();
        toggleOne(btn);
      }
    });

    // ✅ 전체 선택 / 전체 해제
    btnAll?.addEventListener("click", (e) => {
      e.preventDefault();
      // "전체 선택"은 UX상 항상 active처럼 보이게 유지하고 싶으면 class도 맞춰줌
      btnAll.classList.add("is-active");
      setAll(true);
    });

    btnClear?.addEventListener("click", (e) => {
      e.preventDefault();
      btnAll?.classList.remove("is-active");
      setAll(false);
    });

    // ✅ tbody가 동적으로 갱신되는 경우(조회/필터 등) 자동 반영
    if (tbodyArticles) {
      const mo = new MutationObserver(() => {
        // 새로 추가된 td들도 원본 캐시(tsOrigHtml) 잡고 상태 적용
        applyColumnState();
      });
      mo.observe(tbodyArticles, { childList: true, subtree: true });
    }

    // ✅ 초기 1회 반영
    readSelectedFromDOM();
    applyColumnState();
  }

  // =========================================================
  // MOCK: batch_runs (크롤링 오류만)
  // =========================================================
  const JOB_NAME = "크롤링";

  const ERR_MSG = [
    "Invalid format. Please check the input format and try again.",
    "DB 연결 실패: timeout",
    "외부 API rate limit 초과",
    "필수 파라미터 누락: keyword",
    "HTML 파싱 실패: selector not found",
    "네트워크 오류: connection reset",
    "403 Forbidden: robots 정책 차단",
    "500 Internal Error: parsing pipeline failed",
  ];

  function pickErrorCode() {
    // 2xx는 절대 없음
    const r = Math.random();
    if (r < 0.1) return randInt(300, 308); // 10%
    if (r < 0.85) return randInt(400, 429); // 75%
    return randInt(500, 504); // 15%
  }

  function makeDetail(run) {
    return `${run.message}

run_id=${run.run_id}
job_name=${run.job_name}
start_at=${run.start_at}
end_at=${run.end_at}
work_at=${run.work_at}
state_code=${run.state_code}

Trace:
  at crawler.fetch(url)
  at parser.extract(html)
  at pipeline.run()
(임시 데이터)
`;
  }

  function createMockBatchRuns(days = 220) {
    const now = new Date();
    const runs = [];
    let runId = 1000;

    for (let dayOffset = 0; dayOffset < days; dayOffset++) {
      // 날짜별 0~1건만 생성
      const hasError = Math.random() < 0.65; // 65% 확률로 오류 1건
      if (!hasError) continue;

      runId++;

      const base = new Date(now);
      base.setDate(now.getDate() - dayOffset);
      base.setHours(2, randInt(0, 10), randInt(0, 59), 0);

      const durationMin = randInt(3, 35);
      const end = new Date(base.getTime() + durationMin * 60 * 1000);

      const run = {
        run_id: runId,
        job_name: JOB_NAME,
        start_at: formatDateTime(base),
        end_at: formatDateTime(end),
        work_at: formatWorkAt(base),
        state_code: pickErrorCode(),
        message: ERR_MSG[randInt(0, ERR_MSG.length - 1)],
      };
      run.detail = makeDetail(run);
      runs.push(run);
    }

    // 최신순
    runs.sort((a, b) => b.run_id - a.run_id);
    return runs;
  }

  const ALL_RUNS = createMockBatchRuns(240);

  // =========================================================
  // UI state
  // =========================================================
  const PAGE_SIZE = 20;
  let filtered = [];
  let page = 0;
  let loading = false;
  let done = false;

  // 현재 선택된(상세로 열어둔) 행 1건
  let selectedRun = null;

  // ✅ rerun 진행률: "선택 1건" 기준 퍼센트
  let rerunRunning = false;
  let rerunPct = 0;
  let rerunTimer = null;
  let rerunActiveRunId = null;

  // ===== elements =====
  const startInput = $("#startDate");
  const endInput = $("#endDate");
  const btnSearch = $("#btnSearch");

  const tbody = $("#tbodyRuns");
  const tableBodyWrap = $("#tableBodyWrap");

  const infiniteLoader = $("#infiniteLoader");
  const infiniteLoaderText = $("#infiniteLoaderText");
  const emptyState = $("#emptyState");

  const detailModal = $("#detailModal");
  const detailMeta = $("#detailMeta");
  const detailMessage = $("#detailMessage");
  const btnCloseModal = $("#btnCloseModal");
  const btnRun = $("#btnRun");

  const toast = $("#toast");
  const toastText = $("#toastText");
  const btnToastClose = $("#btnToastClose");

  const runRatePill = $("#runRatePill");
  const runRate = $("#runRate");
  const runRateLabel = $("#runRateLabel");
  const runRateInfo = $("#runRateInfo");

  const confirmModal = $("#confirmModal");
  const btnConfirmCancel = $("#btnConfirmCancel");
  const btnConfirmOk = $("#btnConfirmOk");

  // =========================================================
  // loader helpers
  // =========================================================
  function setLoader(mode) {
    if (!infiniteLoader) return;

    if (mode === "hide") {
      infiniteLoader.hidden = true;
      infiniteLoader.classList.remove("is-done");
      return;
    }

    infiniteLoader.hidden = false;
    if (mode === "loading") {
      infiniteLoader.classList.remove("is-done");
      if (infiniteLoaderText) infiniteLoaderText.textContent = "로딩 중...";
      return;
    }

    if (mode === "done") {
      infiniteLoader.classList.add("is-done");
      if (infiniteLoaderText) infiniteLoaderText.textContent = "모든 오류 건을 불러왔습니다.";
    }
  }

  function showEmpty(show) {
    if (!emptyState) return;
    emptyState.hidden = !show;
  }

  // =========================================================
  // toast
  // =========================================================
  function showToast(msg) {
    if (!toast) return;
    if (toastText && msg) toastText.innerHTML = msg;
    toast.hidden = false;
  }

  function hideToast() {
    if (!toast) return;
    toast.hidden = true;
  }

  // =========================================================
  // modal open/close
  // =========================================================
  function openDetail(run) {
    if (!detailModal) return;

    // 지금 상세로 보는(선택된) run 저장
    selectedRun = run;

    // meta chips
    if (detailMeta) {
      detailMeta.innerHTML = `
        <div class="admin-meta">run_id: ${escapeHtml(run.run_id)}</div>
        <div class="admin-meta">job: ${escapeHtml(run.job_name)}</div>
        <div class="admin-meta">start: ${escapeHtml(run.start_at)}</div>
        <div class="admin-meta">end: ${escapeHtml(run.end_at)}</div>
        <div class="admin-meta">work: ${escapeHtml(run.work_at)}</div>
        <div class="admin-meta">code: ${escapeHtml(run.state_code)}</div>
      `;
    }

    if (detailMessage) detailMessage.textContent = run.detail || run.message || "";

    detailModal.hidden = false;
  }

  function closeDetail() {
    if (!detailModal) return;
    detailModal.hidden = true;
  }

  function openConfirm() {
    if (!confirmModal) return;
    confirmModal.hidden = false;
  }

  function closeConfirm() {
    if (!confirmModal) return;
    confirmModal.hidden = true;
  }

  // =========================================================
  // rerun progress (pill + 5초 갱신)
  // =========================================================
  function updateRunRatePill() {
    if (!runRatePill || !runRate) return;

    if (!rerunRunning) {
      runRatePill.hidden = true;
      runRate.textContent = "(0%)";
      return;
    }

    runRatePill.hidden = false;

    // 라벨은 필요하면 여기서 상황별 변경 가능
    if (runRateLabel) runRateLabel.textContent = "분석 작업 실행 중";

    const pct = Math.max(0, Math.min(100, Math.round(rerunPct)));
    runRate.textContent = `(${pct}%)`;
  }

  function stopRerun() {
    rerunRunning = false;
    rerunPct = 0;
    rerunActiveRunId = null;

    if (rerunTimer) clearInterval(rerunTimer);
    rerunTimer = null;

    updateRunRatePill();
  }

  function startRerun() {
    // 상세(선택된 행) 없이 실행 방지
    if (!selectedRun) {
      showToast("실행할 작업(행)을 먼저 선택해주세요.");
      return;
    }

    // 이미 실행중이면 안내
    if (rerunRunning) {
      showToast(
        "현재 실행이 진행 중입니다.<br>완료까지 재실행은 제한되며,<br>조회 기능은 정상적으로 이용 가능합니다."
      );
      return;
    }

    // ✅ 선택한 1건만 재실행 진행률 표시
    rerunRunning = true;
    rerunActiveRunId = selectedRun.run_id;
    rerunPct = 0;
    updateRunRatePill();

    // 5초마다 진행률 업데이트(샘플)
    rerunTimer = setInterval(() => {
      // 8~20%씩 증가
      rerunPct += randInt(8, 20);

      if (rerunPct >= 100) {
        rerunPct = 100;
        updateRunRatePill();

        stopRerun();
        showToast("재실행이 완료되었습니다.");
        return;
      }

      updateRunRatePill();
    }, 5000);
  }

  // =========================================================
  // render / data
  // =========================================================
  function filterByDate(startIso, endIso) {
    const s = toDateNum(startIso);
    const e = toDateNum(endIso);

    const out = ALL_RUNS.filter((r) => {
      // start_at "YYYY-MM-DD HH:mm:ss" -> date part
      const datePart = r.start_at?.slice(0, 10) || "";
      const dn = toDateNum(datePart);
      return dn >= s && dn <= e;
    });

    // 혹시 모르니 2xx 제외
    return out.filter((r) => !(r.state_code >= 200 && r.state_code < 300));
  }

  function appendRows(rows) {
    if (!tbody) return;

    const frag = document.createDocumentFragment();

    rows.forEach((r) => {
      const tr = document.createElement("tr");
      tr.dataset.runId = String(r.run_id);

      tr.innerHTML = `
        <td style="width:70px;">${escapeHtml(r.run_id)}</td>
        <td style="width:120px;">${escapeHtml(r.job_name)}</td>
        <td style="width:160px;" title="${escapeAttr(r.start_at)}">${escapeHtml(r.start_at)}</td>
        <td style="width:160px;" title="${escapeAttr(r.end_at)}">${escapeHtml(r.end_at)}</td>
        <td style="width:150px;" title="${escapeAttr(r.work_at)}">${escapeHtml(r.work_at)}</td>
        <td style="width:110px;">
          <span class="status-badge ${codeClass(r.state_code)}">${escapeHtml(r.state_code)}</span>
        </td>
        <td title="${escapeAttr(r.message)}">${escapeHtml(r.message)}</td>
      `;

      tr.addEventListener("click", () => {
        // selected row UI
        tbody?.querySelectorAll("tr").forEach((x) => x.classList.remove("is-selected"));
        tr.classList.add("is-selected");

        openDetail(r);
      });

      frag.appendChild(tr);
    });

    tbody.appendChild(frag);
  }

  function resetList() {
    page = 0;
    loading = false;
    done = false;
    if (tbody) tbody.innerHTML = "";
    showEmpty(false);
    setLoader("hide");

    // ✅ 조회 새로 하면 선택 초기화
    selectedRun = null;
  }

  function loadNextPage() {
    if (loading || done) return;
    loading = true;

    setLoader("loading");

    // 네트워크처럼 보이게 약간 딜레이
    setTimeout(() => {
      const start = page * PAGE_SIZE;
      const end = start + PAGE_SIZE;
      const slice = filtered.slice(start, end);

      if (slice.length === 0) {
        done = true;
        loading = false;
        setLoader("done");
        if (filtered.length === 0) {
          setLoader("hide");
          showEmpty(true);
        }
        return;
      }

      appendRows(slice);
      page += 1;

      // 끝이면 "모든 오류 건" 표시
      if (page * PAGE_SIZE >= filtered.length) {
        done = true;
        setLoader("done");
      } else {
        setLoader("hide");
      }

      loading = false;
    }, randInt(250, 650));
  }

  function doSearch() {
    const today = isoToday();

    // 값이 비어 있으면 오늘 날짜로
    let startIso = startInput && startInput.value ? startInput.value : today;
    let endIso = endInput && endInput.value ? endInput.value : today;

    // input에도 반영
    if (startInput) startInput.value = startIso;
    if (endInput) endInput.value = endIso;

    // 시작일 > 종료일이면 스왑
    if (toDateNum(startIso) > toDateNum(endIso)) {
      [startIso, endIso] = [endIso, startIso];
      if (startInput) startInput.value = startIso;
      if (endInput) endInput.value = endIso;
    }

    resetList();

    filtered = filterByDate(startIso, endIso);
    filtered.sort((a, b) => b.run_id - a.run_id);

    if (filtered.length === 0) {
      showEmpty(true);
      return;
    }

    loadNextPage();
  }

  // =========================================================
  // events
  // =========================================================
  function bindEvents() {
    btnSearch?.addEventListener("click", doSearch);

    // 무한 스크롤
    tableBodyWrap?.addEventListener("scroll", () => {
      if (loading || done) return;
      const nearBottom = tableBodyWrap.scrollTop + tableBodyWrap.clientHeight >= tableBodyWrap.scrollHeight - 120;
      if (nearBottom) loadNextPage();
    });

    // 상세 모달 닫기
    btnCloseModal?.addEventListener("click", closeDetail);
    detailModal?.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.close === "true") closeDetail();
    });

    // ESC로 닫기
    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        if (confirmModal && !confirmModal.hidden) closeConfirm();
        if (detailModal && !detailModal.hidden) closeDetail();
      }
    });

    // 토스트 닫기
    btnToastClose?.addEventListener("click", hideToast);

    // ✅ i 버튼 클릭 -> 안내 토스트(실행중일 때만)
    runRateInfo?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation(); // ✅ pill 클릭으로 이벤트 번짐 방지

      if (!rerunRunning) return;

      showToast(
        "현재 실행이 진행 중입니다.<br>완료까지 재실행은 제한되며,<br>조회 기능은 정상적으로 이용 가능합니다."
      );
    });

    // 실행 버튼 -> 확인 모달(실행중이면 토스트)
    btnRun?.addEventListener("click", () => {
      if (rerunRunning) {
        showToast(
          "현재 실행이 진행 중입니다.<br>완료까지 재실행은 제한되며,<br>조회 기능은 정상적으로 이용 가능합니다."
        );
        return;
      }
      openConfirm();
    });

    // 확인 모달 닫기 (배경 클릭)
    confirmModal?.addEventListener("click", (e) => {
      const t = e.target;
      if (t && t.dataset && t.dataset.close === "true") closeConfirm();
    });

    // 확인/취소
    btnConfirmCancel?.addEventListener("click", closeConfirm);
    btnConfirmOk?.addEventListener("click", () => {
      closeConfirm();
      startRerun();
    });
  }

  // =========================================================
  // init
  // =========================================================
  async function init() {
    await renderAuth();

    // ✅ (핵심) rerun 페이지라면 컬럼 고정/비활성 스타일 초기화
    initRerunFixedColumns();

    // 기본 날짜: 오늘로
    const today = isoToday();
    if (startInput) startInput.value = today;
    if (endInput) endInput.value = today;

    bindEvents();

    // 초기엔 아무것도 안 띄우고, 조회 버튼 누르면 리스트 생성
    updateRunRatePill();
  }

  // DOM이 늦게 구성되거나 header가 나중에 주입되는 케이스까지 커버
  document.addEventListener("DOMContentLoaded", () => {
    initRerunFixedColumns();
  });
  document.addEventListener("header:loaded", () => {
    initRerunFixedColumns();
  });

  init();
})();
