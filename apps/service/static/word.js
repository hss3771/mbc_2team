(() => {
"use strict";

let WORDS = [];
let bookmarks = [];
let currentSeg = "ko";
let currentIndex = "all";
let selectedId = null;

const API_BASE = "/economic";
const BOOKMARK_API_BASE = "/bookmarks";

// DOM 요소 안전하게 선택
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const elements = {
  indexBar: $("#indexBar"),
  listEl: $("#wordList"),
  detailTitle: $("#detailTitle"),
  detailMeta: $("#detailMeta"),
  detailContent: $("#detailContent"),
  detailStarBtn: $("#detailStarBtn"),
  detailStarIcon: $(".icon-star"),
  modal: $("#bookmarkModal"),
  bookmarkListEl: $("#bookmarkList"),
  bookmarkEmptyEl: $("#bookmarkEmpty"),
  panel: $(".word-panel")
};

/* ==================
1. 데이터 로드 및 통신
================== */
function getSegment(term) {
    const char = term.trim().charAt(0);
    if (/[가-힣]/.test(char)) return "ko";
    if (/[a-zA-Z]/.test(char)) return "en";
    if (/[0-9]/.test(char)) return "num";
    return "ko";
}

async function loadWords() {
    const res = await fetch(`${API_BASE}/terms`);
    const json = await res.json();
    const dataList = json.data || [];

    // DB 데이터를 받아서 분류 정보를 포함한 객체로 변환
    WORDS = dataList.map(item => ({
        id: item.term_id,
        term: item.term,
        seg: getSegment(item.term), // 여기서 자동 분류!
        isBookmarked: item.is_bookmarked === 1
    }));
}

async function loadMyBookmarks() {
  try {
      const res = await fetch(`${BOOKMARK_API_BASE}/me`);
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data || []).map(b => String(b.term_id));
  } catch (e) {
      return [];
  }
}

async function toggleBookmark(id) {
  if (!id) return false;
  const willAdd = !bookmarks.includes(id);
  const state = willAdd ? "ADD" : "CANCEL";

  try {
      const res = await fetch(`${BOOKMARK_API_BASE}/toggle`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ term_id: id, state: state }),
      });

      if (res.status === 401) {
          alert("로그인 후 이용 가능합니다.");
          return false;
      }

      if (res.ok) {
          if (state === "ADD") {
              if (!bookmarks.includes(id)) bookmarks.push(id);
          } else {
              bookmarks = bookmarks.filter(x => x !== id);
          }
          return true;
      }
  } catch (e) {
      console.error("북마크 통신 에러:", e);
  }
  return false;
}

/* ==================
2. 렌더링 함수
================== */
function renderIndexBar() {
  if (!elements.indexBar) return;

  // 1. 각 탭별 인덱스 구성 정의
  const KO_INDEX = ["ㄱ", "ㄴ", "ㄷ", "ㄹ", "ㅁ", "ㅂ", "ㅅ", "ㅇ", "ㅈ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  const EN_INDEX = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L", "M", "N", "O", "P", "Q", "R", "S", "T", "U", "V", "W", "X", "Y", "Z"];
  const NUM_INDEX = ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9"];

  // 2. 현재 선택된 탭(currentSeg)에 따라 그릴 인덱스 결정
  let targetIndex = [];
  if (currentSeg === "ko") targetIndex = KO_INDEX;
  else if (currentSeg === "en") targetIndex = EN_INDEX;
  else if (currentSeg === "num") targetIndex = NUM_INDEX;

  // 3. HTML 생성 (currentIndex가 "all"이면 '전체' 버튼 활성화)
  elements.indexBar.innerHTML = `
    <div class="index-pill">
      <button class="index-btn ${currentIndex === 'all' ? 'is-active' : ''}" data-key="all">전체</button>
      ${targetIndex.map(k => `
        <button class="index-btn ${currentIndex === k ? 'is-active' : ''}" data-key="${k}">${k}</button>
      `).join("")}
    </div>`;

  // 4. 클릭 이벤트 연결
  $$(".index-btn").forEach(btn => {
    btn.onclick = () => {
      currentIndex = btn.dataset.key;
      renderIndexBar(); // 버튼 활성화 상태 갱신
      renderList();     // 리스트 필터링 갱신
    };
  });
}

function getKoIndex(term) {
  const CHO = ["ㄱ", "ㄲ", "ㄴ", "ㄷ", "ㄸ", "ㄹ", "ㅁ", "ㅂ", "ㅃ", "ㅅ", "ㅆ", "ㅇ", "ㅈ", "ㅉ", "ㅊ", "ㅋ", "ㅌ", "ㅍ", "ㅎ"];
  const CHO_NORM = { "ㄲ": "ㄱ", "ㄸ": "ㄷ", "ㅃ": "ㅂ", "ㅆ": "ㅅ", "ㅉ": "ㅈ" };
  const c = (term || "").charCodeAt(0);
  if (c >= 0xAC00 && c <= 0xD7A3) {
      const idx = Math.floor((c - 0xAC00) / 588);
      const cho = CHO[idx];
      return CHO_NORM[cho] || cho;
  }
  return null;
}

function renderList() {
    if (!elements.listEl) return;

    // 1. 현재 탭(한글/영문/숫자)에 해당하는 단어만 먼저 분류
    let items = WORDS.filter(w => w.seg === currentSeg);
    
    // 2. 인덱스 필터링 (ㄱㄴㄷ, ABC, 012)
    if (currentIndex !== "all") {
      items = items.filter(w => {
        const term = (w.term || "").trim().toUpperCase();
        if (currentSeg === "ko") {
          return getKoIndex(term) === currentIndex;
        } else {
          // 영문/숫자는 첫 글자가 인덱스와 일치하는지 확인
          return term.charAt(0) === currentIndex;
        }
      });
    }

    // 3. 정렬 기준도 언어에 맞게 설정
    items.sort((a, b) => a.term.localeCompare(b.term, currentSeg === "ko" ? "ko" : "en"));

    if (!items.length) {
        elements.listEl.innerHTML = `<div class="word-empty">단어가 없습니다.</div>`;
        return;
    }

    if (!selectedId || !items.some(x => x.id === selectedId)) {
        selectedId = items[0].id;
    }

    elements.listEl.innerHTML = items.map(w => {
        const on = bookmarks.includes(w.id);
        return `
            <button class="word-item ${w.id === selectedId ? "is-selected" : ""}" data-id="${w.id}">
                <span class="word-item-title">${w.term}</span>
                <span class="word-item-right">
                    <span class="star-mini ${on ? 'is-on' : ''}" data-star="${w.id}">${on ? '★' : '☆'}</span>
                </span>
            </button>`;
    }).join("");

  // 리스트 클릭 이벤트 바인딩
  $$(".word-item").forEach(el => {
      el.onclick = (e) => {
          if (e.target.closest("[data-star]")) return;
          selectedId = el.dataset.id;
          renderList(); // UI 갱신 (선택 표시)
      };
  });

  // 리스트 내 별표 클릭 이벤트
  $$("[data-star]").forEach(el => {
      el.onclick = async (e) => {
          e.stopPropagation();
          const id = el.dataset.star;
          if (await toggleBookmark(id)) {
              renderList();
              if (selectedId === id) updateDetailStarUI();
          }
      };
  });

  renderDetail(selectedId);
}

async function renderDetail(id) {
  if (!id || !elements.detailTitle) return;

  try {
      const res = await fetch(`${API_BASE}/terms/${id}`);
      if (!res.ok) return;
      const { data: w } = await res.json();

      elements.detailTitle.textContent = w.term || "정보 없음";
      elements.detailMeta.textContent = w.event_at ? w.event_at.split('T')[0] : "";
      
      // 설명문 줄바꿈 처리 (null 체크 추가)
      const desc = w.description || "설명이 등록되지 않았습니다.";
      elements.detailContent.innerHTML = desc.split('\n').filter(Boolean).map(p => `<p>${p}</p>`).join("");
      
      updateDetailStarUI();
  } catch (e) {
      console.error("상세 로드 실패:", e);
  }
}

function updateDetailStarUI() {
  if (!elements.detailStarIcon) return;
  const on = bookmarks.includes(selectedId);
  elements.detailStarIcon.textContent = on ? "★" : "☆";
  elements.detailStarIcon.classList.toggle("is-on", on);
}


/* ==================
3. 이벤트 초기화
================== */
function bindStaticEvents() {
  // 북마크 모달 열기
  $("#openBookmark").onclick = () => {
      elements.modal?.classList.add("is-open");
      renderBookmarkModalList();
  };

  // 모달 닫기 (여러 버튼 공통)
  $$("#closeBookmark, #closeBookmark2").forEach(btn => {
      btn.onclick = () => elements.modal?.classList.remove("is-open");
  });

  // 세그먼트 버튼 (한글/영문/숫자)
  $$(".word-seg-btn").forEach(btn => {
      btn.onclick = () => {
          $$(".word-seg-btn").forEach(b => b.classList.remove("is-active"));
          btn.classList.add("is-active");
          currentSeg = btn.dataset.seg;
          currentIndex = "all";
          renderIndexBar();
          renderList();
      };
  });

  // 상세페이지 별표 버튼
  if (elements.detailStarBtn) {
      elements.detailStarBtn.onclick = async () => {
          if (await toggleBookmark(selectedId)) {
              updateDetailStarUI();
              renderList();
          }
      };
  }

  // 전체 삭제 버튼 요소 가져오기
const clearBtn = document.getElementById("clearBookmarks");

if (clearBtn) {
    clearBtn.onclick = async () => {
        if (!confirm("저장된 북마크를 모두 삭제하시겠습니까?")) return;

        try {
            // 주소를 /clear로 변경하고, 메소드를 POST로 변경합니다.
            const res = await fetch(`${BOOKMARK_API_BASE}/clear`, {
                method: "POST" 
            });

            if (res.ok) {
                // 로컬 데이터 초기화
                if (typeof bookmarks !== 'undefined') {
                    bookmarks = []; 
                }

                alert("모든 북마크가 삭제되었습니다.");
                
                // UI 갱신
                if (typeof renderBookmarkModalList === 'function') {
                    await renderBookmarkModalList();
                }
                renderList();
                
            } else {
                const errorData = await res.json();
                alert(`삭제 실패: ${errorData.message || "알 수 없는 오류"}`);
            }
        } catch (error) {
            console.error("전체 삭제 중 에러 발생:", error);
            alert("서버와 통신하는 중 문제가 발생했습니다.");
        }
    };
}
}

async function renderBookmarkModalList() {
  if (!elements.bookmarkListEl) return;
  
  const res = await fetch(`${BOOKMARK_API_BASE}/me`);
  const json = await res.json();
  const items = json.data || [];
  
  elements.bookmarkEmptyEl.hidden = items.length > 0;

  elements.bookmarkListEl.innerHTML = items.map(w => `
    <div class="bookmark-item" data-id="${w.term_id}" 
         style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; border-bottom: 1px solid #eee; cursor: pointer;">
        <span style="flex: 1; font-size: 16px;"><strong>${w.term}</strong></span>
        <button class="word-outline-btn rm-btn" data-id="${w.term_id}" style="flex-shrink: 0; margin-left: 10px;">삭제</button>
    </div>
  `).join("");

  const bookmarkRows = elements.bookmarkListEl.querySelectorAll(".bookmark-item");
  bookmarkRows.forEach(row => {
    row.onclick = (e) => {
      if (e.target.classList.contains("rm-btn")) return;

      const id = row.dataset.id;
      const target = WORDS.find(w => w.id === id);

      if (target) {
        // 1. 상태 업데이트
        selectedId = id;
        currentSeg = target.seg; 

        // 2. [수정됨] 단어의 초성/첫글자를 인덱스로 설정
        if (currentSeg === "ko") {
          // 한글인 경우 초성 추출 함수 사용
          currentIndex = getKoIndex(target.term);
        } else {
          // 영문/숫자인 경우 첫 글자를 대문자로 추출
          currentIndex = (target.term || "").trim().charAt(0).toUpperCase();
        }

        // 3. 상단 탭 버튼(한글/영문/숫자) UI 업데이트
        $$(".word-seg-btn").forEach(btn => {
          btn.classList.toggle("is-active", btn.dataset.seg === currentSeg);
        });

        // 4. 화면 갱신
        renderIndexBar(); // 이제 '전체'가 아닌 해당 초성 버튼에 불이 들어옵니다.
        renderList();     // 해당 초성에 속한 단어들만 리스트에 표시됩니다.
        
        elements.modal?.classList.remove("is-open");
      }
    };
  });

  // 삭제 로직은 동일
  $$(".rm-btn").forEach(btn => {
    btn.onclick = async (e) => {
      e.stopPropagation();
      if (await toggleBookmark(btn.dataset.id)) {
        renderBookmarkModalList();
        renderList();
      }
    };
  });
}

async function init() {
  await loadWords();
  bookmarks = await loadMyBookmarks();
  
  bindStaticEvents(); // 이벤트 먼저 연결
  renderIndexBar();
  renderList();
  
  elements.panel?.classList.remove("is-loading");
}

// 문서 로드 시 실행
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
})();