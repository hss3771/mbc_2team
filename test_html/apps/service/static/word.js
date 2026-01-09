/* ==================
사이드바 active 처리
================== */
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


/* ==================
IIFE 즉시 실행 함수 시작 (단어 사전 기능 전체)
- 변수/함수들이 전역을 더럽히지 않게 감싸는 역할
================== */
(() => {
  "use strict";

  let WORDS = [];

  // 서버 북마크 API
  // const BOOKMARK_API_BASE = "/api/bookmark";
  const BOOKMARK_API_BASE = "";

  /* ==================
  CSV의 tab 값(KOR, ENG, NUM)을 UI에서 쓰는 세그(ko/en/num)로 바꾸는 함수
  ================== */
  function tabToSeg(tab) {
    const t = String(tab ?? "").trim().toUpperCase();
    if (t === "KOR") return "ko";
    if (t === "ENG") return "en";
    if (t === "NUM") return "num";
    return "ko";
  }

  /* ==================
  CSV를 가져와서 WORDS를 채우는 비동기 함수
  ================== */
  async function loadWords() {
    const res = await fetch("/static/word_data/kdi_worddic_strict_20251230_165545.csv");
    if (!res.ok) throw new Error("CSV fetch failed");

    const csvText = await res.text();

    const parsed = Papa.parse(csvText, {
      header: true,
      skipEmptyLines: true,
    });

    // 각 행(item)을 정규화해서 WORDS에 저장
    WORDS = parsed.data.map((item, idx) => ({
      id: item.term_id
        ? `kdi_${item.term_id}`          // term_id 가 있으면 그걸로 id 생성
        : `kdi_${idx}`,                  // 없으면 idx로 대체 (유니크 보장용)
      seg: tabToSeg(item.tab),           // CSV tab을 ko/en/num으로 변환한 값 저장
      term: (item.keyword ?? "").trim(), // CSV keyword를 term으로 저장
      en: "",                            // CSV에 영문 설명 컬럼 없으므로 비워둠
      updatedAt: item.scraped_at ?? "",
      body: String(item.content ?? "")   // content 문자열로 강제 변환
        .split(/\n+/)                    // 각 줄 공백 제거
        .map(s => s.trim())              // 빈 줄 제거
        .filter(Boolean),
    }));
  }

  /* ==================
  페이지가 처음 열릴 때 흐름을 하나로 묶어둔 것
  즉, 서버 요청/파일 로드 같은 비동기 작업을 순서대로 처리하려는 함수
  - 단어 데이터 로드
  - 로그인한 경우 북마크 로드
  - 이벤트 연결
  - 화면 렌더링
  - 로딩 화면 제거
  ================== */
  async function init() {
    try {
      await loadWords(); // CSV를 가져와서 WORDS를 채우는 비동기 함수
    } catch (e) {
      console.error("[worddic] loadWords failed:", e);
      WORDS = [];
    }

    // ✅ 서버에서 북마크 목록 로드(로그인 사용자)
    try {
      const r = await fetchBookmarksFromServer(); // 서버에서 북마크 목록 가져오기
      if (r.ok) bookmarks = r.items; // 로그인 했으면 북마크는 서버에서 받은 값!!
      else bookmarks = []; // 로그인 안했으면 비워둠 (북마크 없는 사용자)
    } catch (e) {
      console.error("[bookmark] init fetch failed:", e);
      bookmarks = [];
    }

    // 이벤트 바인딩
    bindSegEvents();
    bindModalEvents();
    // 초기 UI 상태 동기화
    syncSegButtons();
    renderIndexBar();
    renderList();

    // 로딩 완료 -> 단어 영역 표시
    document.querySelector(".word-panel")?.classList.remove("is-loading");
  }

  // DOM 로드 완료 시 init 실행
  document.addEventListener("DOMContentLoaded", () => {
    init();
  });


  /* ==================
  DOM
  ================== */
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


  /* ==================
  상태값
  ================== */
  let currentSeg = "ko";     // 초기 세그 : 한글
  let currentIndex = "all";  // 초기 인덱스 : 전체
  let selectedId = null;     // 선택된 단어 : 없음

  // ✅ 서버에서 받아서 채울 북마크 배열
  let bookmarks = [];


  /* ==================
  인덱스 정의
  ================== */
  const KO_INDEX = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  const EN_INDEX = Array.from({ length: 26 }, (_, i) => String.fromCharCode(65 + i));
  const NUM_INDEX = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];


  /* ==================
  ✅ 즐겨찾기(북마크) 유틸
  ================== */
  async function fetchBookmarksFromServer() { // 지금 로그인 한 사용자의 북마크 목록 가져옴
    const res = await fetch(`${BOOKMARK_API_BASE}/me`, { // /api/bookmark/me 서버 요청
      method: "GET",
      credentials: "include", // 세션 쿠키 포함 (로그인 여부 판별 가능)
    });

    // 로그인 안 한 경우
    if (res.status === 401) return { ok: false, code: "LOGIN_REQUIRED", items: [] };

    // 서버 에러
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[bookmark] fetch /me failed:", res.status, t);
      return { ok: false, code: "API_ERROR", items: [] };
    }

    // 정상 응답 (서버에서 id 배열만 내려줌 : WORDS 랑 매칭해서 사용)
    const items = await res.json(); // ["kdi_123", ...] 즉, bookmarks = items;
    return { ok: true, items: Array.isArray(items) ? items : [] };
  }

  // 해당 단어가 지금 북마크 상태인가? 확인
  function isBookmarked(id) {
    return bookmarks.includes(id);
  }

  // 서버: 북마크 토글(ADD/CANCEL)
  // 북마크 추가 / 해제 버튼 눌렀을 때
  async function toggleBookmark(id) {
    if (!id) return { ok: false };

    // 이미 북마크 있으면 CANCEL, 없으면 ADD
    const willAdd = !isBookmarked(id);
    const state = willAdd ? "ADD" : "CANCEL";

    // 서버에 토글 요청
    const res = await fetch(`${BOOKMARK_API_BASE}/toggle`, { // /api/bookmark/toggle 서버 요청
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ term_id: id, state }), // 서버에 보내는 데이터
    });

    // 로그인 안 된 경우
    if (res.status === 401) {
      alert("로그인 후 이용 가능합니다.");
      return { ok: false, code: "LOGIN_REQUIRED" };
    }

    // 서버 에러
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[bookmark] toggle failed:", res.status, t);
      alert("북마크 처리 중 오류가 발생했습니다.");
      return { ok: false, code: "API_ERROR" };
    }

    const data = await res.json(); // {ok:true,...}

    // ✅ 서버 성공 후 로컬 배열 동기화
    // 서버 반영 후 bookmarks 도 바꿔야 화면이 바뀜
    if (state === "ADD") {
      if (!bookmarks.includes(id)) bookmarks = [id, ...bookmarks];
    } else {
      bookmarks = bookmarks.filter(x => x !== id);
    }

    return data;
  }

  // 서버: 북마크 전체 삭제 (POST /clear 필요)
  async function clearBookmarksOnServer() {
    const res = await fetch(`${BOOKMARK_API_BASE}/clear`, { // /api/bookmark/clear 서버 요청
      method: "POST",
      credentials: "include",
    });

    // 로그인 안 된 경우
    if (res.status === 401) {
      alert("로그인 후 이용 가능합니다.");
      return { ok: false, code: "LOGIN_REQUIRED" };
    }

    // 서버 에러
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("[bookmark] clear failed:", res.status, t);
      alert("전체 삭제 중 오류가 발생했습니다.");
      return { ok: false, code: "API_ERROR" };
    }

    const data = await res.json();
    bookmarks = []; // 프론트 상태 초기화
    return data;
  }


  /* ==================
  한글 초성 추출
  - ㄲ/ㄸ/ㅃ/ㅆ/ㅉ는 ㄱ/ㄷ/ㅂ/ㅅ/ㅈ로 정규화
  ================== */
  const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  const CHO_NORM = { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" };
  function getKoIndex(term) {
    const c = (term || "").trim().charCodeAt(0);     // term 의 첫 글자 유니코드 값을 얻음
    if (!c) return null;                             // term 이 빈값이면 null 처리
    if (c >= 0xAC00 && c <= 0xD7A3) {                // 한글 완성형(가~힣) 범위인지 체크
      const idx = Math.floor((c - 0xAC00) / 588);    // 초성 인덱스 계산 공식
      const cho = CHO[idx] || null;                  // 초성 배열에서 해당 초성 가져오기
      return CHO_NORM[cho] || cho;                  // 겹자음이면 기본 자음으로 치환해서 반환
    }
    return null;                                    // 한글이 아니면 null
  }

  /* ==================
  영어 앞글자 추출
  ================== */
  function getEnIndex(term) {
    const first = (term || "").trim()[0];
    if (!first) return null;
    const up = first.toUpperCase();
    return (up >= "A" && up <= "Z") ? up : null;
  }

  /* ==================
  숫자 추출
  ================== */
  function getNumIndex(term) {
    const first = (term || "").trim()[0];
    if (!first) return null;
    return (first >= "0" && first <= "9") ? first : null;
  }

  /* ==================
  단어의 인덱스 계산
  ================== */
  function getIndexForWord(w) {
    if (w.seg === "ko") return getKoIndex(w.term);
    if (w.seg === "en") return getEnIndex(w.term);
    return getNumIndex(w.term);
  }

  /* ==================
  인덱스 바 렌더
  ================== */
  function renderIndexBar() {
    // 현재탭(currentSeg)에 따라 인덱스 버튼 목록을 결정
    const list = currentSeg === "ko" ? KO_INDEX : (currentSeg === "en" ? EN_INDEX : NUM_INDEX);

    // 현재 세그에 존재하는 인덱스만 Set으로 만들기
    // 예: ㄱ으로 시작하는 단어가 있으면 enabledKeys에 "ㄱ" 포함
    const enabledKeys = new Set(
      WORDS
        .filter(w => w.seg === currentSeg)
        .map(w => getIndexForWord(w))
        .filter(Boolean)
    );

    // 인덱스바 HTML을 통째로 교체 렌더링
    // 전체 버튼은 항상 enabled. 나머지는 enabledKeys에 있으면 enabled, 없으면 disabled
    indexBar.innerHTML = `
    <div class="index-pill" role="tablist" aria-label="인덱스 선택">
      ${renderIndexButton("all", "전체", true)}
      ${list.map(k => renderIndexButton(k, k, enabledKeys.has(k))).join("")}
    </div>
  `;

    // 생성된 버튼들에 클릭 이벤트 연결 (disabled는 클릭 무시)
    $$(".index-btn", indexBar).forEach(btn => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;

        currentIndex = btn.dataset.key;
        // 모든 버튼을 돌면서 현재 인덱스 버튼만 is-active 클래스를 붙임
        $$(".index-btn", indexBar).forEach(b =>
          b.classList.toggle("is-active", b.dataset.key === currentIndex)
        );
        renderList(); // 단어 리스트를 새로 렌더
      });
    });

    // 인덱스바에 현재 선택 상태가 반영되도록 한번 더 active 동기화
    $$(".index-btn", indexBar).forEach(b =>
      b.classList.toggle("is-active", b.dataset.key === currentIndex)
    );
  }


  /* ==================
  버튼 하나의 HTML 문자열을 만들어주는 함수
  ================== */
  function renderIndexButton(key, label, enabled = true) {
    const isActive = key === currentIndex;
    const disabledAttr = enabled ? "" : "disabled";
    const disabledClass = enabled ? "" : "is-disabled";

    return `
    <button
      class="index-btn ${isActive ? "is-active" : ""} ${disabledClass}"
      type="button"
      data-key="${key}"
      ${disabledAttr}
    >${label}</button>
  `;
  }

  /* ==================
  리스트 렌더
  ================== */
  function getFilteredWords() {
    let arr = WORDS.filter(w => w.seg === currentSeg);

    if (currentIndex !== "all") {
      arr = arr.filter(w => getIndexForWord(w) === currentIndex);
    }

    arr = arr.slice().sort((a, b) => a.term.localeCompare(b.term, "ko"));
    return arr;
  }

  // 현재 상태(seg/index) 에 맞는 단어 목록 가져옴
  function renderList() {
    const items = getFilteredWords();

    if (!items.length) {
      listEl.innerHTML = `
      <div class="word-empty" style="min-height:240px;">
        <div class="word-empty-emoji">🫥</div>
        <div class="word-empty-title">표시할 단어가 없어요</div>
        <div class="word-empty-sub">다른 분류를 선택해보세요</div>
      </div>
    `;
      setSelected(null); // 상세 초기화
      return;
    }

    // 선택 유지: 현재 필터에 선택값이 없으면 첫 항목 선택
    if (!selectedId || !items.some(x => x.id === selectedId)) {
      selectedId = items[0].id;
    }

    // 단어 리스트를 HTML 문자열로 만들어서 한번에 넣음
    listEl.innerHTML = items.map(w => {
      const on = isBookmarked(w.id);
      const selected = w.id === selectedId;
      // 단어 1개를 버튼으로 만듦 + 내부에 별 버튼 또 따로 있음 (중첩 버튼 구조)
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
        if (e.target && e.target.closest("[data-star]")) return;
        setSelected(id);
      });
    });

    // ✅ star-mini 클릭: 서버 토글
    $$("[data-star]", listEl).forEach(starBtn => {
      starBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = starBtn.dataset.star;

        await toggleBookmark(id);

        renderList();
        if (selectedId) renderDetail(selectedId);
        renderBookmarkModalList();
      });
    });

    renderDetail(selectedId);
  }

  function formatDateOnly(value) {
    const s = String(value ?? "").trim();
    if (!s) return "";

    // YYYY-MM-DD / YYYY.MM.DD / YYYY/MM/DD 형태에서 날짜만 추출
    const m = s.match(/(\d{4})[.\-/](\d{2})[.\-/](\d{2})/);
    if (m) return `${m[1]}-${m[2]}-${m[3]}`;

    // ISO 비슷하게 앞 10자에 날짜가 있는 경우
    if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);

    // 파싱 가능하면 Date로 처리
    const d = new Date(s);
    if (!Number.isNaN(d.getTime())) {
      const yyyy = d.getFullYear();
      const mm = String(d.getMonth() + 1).padStart(2, "0");
      const dd = String(d.getDate()).padStart(2, "0");
      return `${yyyy}-${mm}-${dd}`;
    }

    // 어떤 형식인지 애매하면 원문 그대로
    return s;
  }


  /* ==================
  상세 렌더
  ================== */
  function setSelected(id) {
    selectedId = id;

    // 리스트에서 선택된 항목만 is-selected 표시
    $$(".word-item", listEl).forEach(el => {
      const on = el.dataset.id === id;
      el.classList.toggle("is-selected", on);
      el.setAttribute("aria-selected", on ? "true" : "false");
    });

    // id가 없으면 상세 영역에 안내 UI 표시하고 별도 초기화.
    if (!id) {
      detailTitle.textContent = "단어를 선택하세요";
      detailMeta.textContent = "";
      detailContent.innerHTML = `
      <div class="word-empty">
        <div class="word-empty-emoji">📘</div>
        <div class="word-empty-title">왼쪽 목록에서 단어를 선택해 주세요</div>
      </div>
    `;
      setDetailStar(null);
      return;
    }

    renderDetail(id);
  }


  // WORDS 에서 해당 단어 찾고 없으면 종료
  function renderDetail(id) {
    const w = WORDS.find(x => x.id === id);
    if (!w) return;

    const titleHtml = `
    ${escapeHtml(w.term)}
    ${w.en ? ` <small>(${escapeHtml(w.en)})</small>` : ""}
  `;
    detailTitle.innerHTML = titleHtml;
    detailMeta.textContent = w.updatedAt || "";
    detailContent.innerHTML = (w.body || []).map(p => `<p>${escapeHtml(p)}</p>`).join("");

    setDetailStar(w.id);

    // ✅ 상세 별 버튼: 서버 토글
    detailStarBtn.onclick = async () => {
      await toggleBookmark(w.id);
      setDetailStar(w.id);
      renderList();
      renderBookmarkModalList();
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

  /* ==================
  모달(북마크 리스트)
  ================== */
  function openModal() {
    modal.classList.add("is-open");
    modal.setAttribute("aria-hidden", "false");
    renderBookmarkModalList();
  }

  function closeModal() {
    modal.classList.remove("is-open");
    modal.setAttribute("aria-hidden", "true");
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

    // 카드 클릭: 해당 단어로 이동
    $$(".bookmark-item", bookmarkListEl).forEach(card => {
      card.addEventListener("click", (e) => {
        if (e.target && e.target.closest("[data-rm]")) return;

        const id = card.dataset.id;
        const w = WORDS.find(x => x.id === id);
        if (!w) return;

        // ✅ 1) 단어가 속한 seg로 이동
        currentSeg = w.seg;

        // ✅ 2) 단어의 "인덱스 키(ㄱ/A/3...)"로 index-pill도 맞추기
        const key = getIndexForWord(w);
        currentIndex = key || "all";

        // ✅ 3) 선택값을 먼저 넣어두면 renderList가 첫 항목으로 덮어쓰지 않음
        selectedId = w.id;

        syncSegButtons();
        renderIndexBar();
        renderList();   // renderList 안에서 selectedId 기준으로 상세도 같이 갱신됨

        closeModal();

        // ✅ 4) UX: 좌측 리스트/인덱스가 선택 위치로 스크롤되게
        requestAnimationFrame(() => {
          const selItem = listEl.querySelector(`.word-item[data-id="${w.id}"]`);
          selItem?.scrollIntoView({ block: "nearest" });

          const activeIdxBtn = indexBar.querySelector(`.index-btn[data-key="${currentIndex}"]`);
          activeIdxBtn?.scrollIntoView({ inline: "center", block: "nearest" });
        });
      });
    });


    // 삭제 버튼: 서버 토글(CANCEL로 가도록 toggleBookmark 사용)
    $$("[data-rm]", bookmarkListEl).forEach(btn => {
      btn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const id = btn.dataset.rm;

        await toggleBookmark(id);

        renderBookmarkModalList();
        renderList();
        if (selectedId) renderDetail(selectedId);
      });
    });
  }

  /* ==================
  탭(세그) 이벤트
  ================== */
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

  /* ==================
  모달 관련 이벤트 바인딩
  ================== */
  function bindModalEvents() {
    openBookmarkBtn.addEventListener("click", openModal);
    closeBookmarkBtn.addEventListener("click", closeModal);
    closeBookmarkBtn2.addEventListener("click", closeModal);

    // ✅ (신규) 서버 전체 삭제 (/clear)
    clearBookmarksBtn.addEventListener("click", async () => {
      const ok = confirm("북마크를 전체 삭제할까요?");
      if (!ok) return;

      await clearBookmarksOnServer();

      renderBookmarkModalList();
      renderList();
      if (selectedId) renderDetail(selectedId);
    });
  }

  /* ==================
  escapeHtml
  ================== */
  function escapeHtml(str) {
    return String(str ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

})(); // IIFE 종료