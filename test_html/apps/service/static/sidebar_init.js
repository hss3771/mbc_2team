// /static/sidebar_init.js
// (최종 안정 버전: active 동기화 + main 해시 스크롤 + 로그인 필요 모달을 body로 이동)

(function () {
  const SIDEBAR = "#sidebarMount";
  const LINK_SEL = `${SIDEBAR} .menu a`;
  const LI_SEL = `${SIDEBAR} .menu li`;

  function fileName(pathname) {
    return (pathname.split("/").pop() || "").split("?")[0];
  }

  function clearActive() {
    document.querySelectorAll(LI_SEL).forEach(li => li.classList.remove("active"));
  }

  function setActiveByLink(a) {
    clearActive();
    a?.closest("li")?.classList.add("active");
  }

  function getLinks() {
    return Array.from(document.querySelectorAll(LINK_SEL));
  }

  function findMainTopLink(links) {
    return links.find(a => {
      const href = (a.getAttribute("href") || "").trim();
      if (!href) return false;
      const u = new URL(href, location.href);
      return fileName(u.pathname) === "main.html" && !u.hash;
    });
  }

  function findHashLink(links, hash) {
    return links.find(a => {
      const href = (a.getAttribute("href") || "").trim();
      if (!href) return false;
      const u = new URL(href, location.href);
      return u.hash === hash;
    });
  }

  function findFileLink(links, file) {
    return links.find(a => {
      const href = (a.getAttribute("href") || "").trim();
      if (!href) return false;
      const u = new URL(href, location.href);
      return fileName(u.pathname) === file;
    });
  }

  function getScroller() {
    return document.querySelector(".main-scroll");
  }

  function getOffset() {
    const toolbar = document.querySelector(".main-toolbar");
    return (toolbar?.offsetHeight || 0) + 12;
  }

  function scrollToId(id, smooth) {
    const scroller = getScroller();
    const target = id ? document.getElementById(id) : null;
    if (!scroller || !target) return false;

    const top =
      target.getBoundingClientRect().top -
      scroller.getBoundingClientRect().top +
      scroller.scrollTop;

    scroller.scrollTo({
      top: Math.max(0, top - getOffset()),
      behavior: smooth ? "smooth" : "auto",
    });
    return true;
  }

  function scrollToTop(smooth) {
    const scroller = getScroller();
    if (!scroller) return false;
    scroller.scrollTo({ top: 0, behavior: smooth ? "smooth" : "auto" });
    return true;
  }

  // ✅ 라우트(URL) 이름을 메뉴 파일명으로 매핑
  const FILE_ALIAS = {
    "main": "main.html",
    "my_page": "my_page.html",
    "info_edit": "my_page.html",
    "info_edit.html": "my_page.html",
  };

  function setActiveFromLocation() {
    const links = getLinks();
    if (!links.length) return;

    let file = fileName(location.pathname);          // ✅ let 이어야 재할당 가능
    const hash = (location.hash || "").trim();

    file = FILE_ALIAS[file] || file;

    // 확장자 없는 라우트면 .html도 한 번 붙여서 시도
    const fileTry = file.includes(".") ? file : (file + ".html");

    if (file === "main.html" || fileTry === "main.html") {
      if (hash) {
        const a = findHashLink(links, hash);
        if (a) return setActiveByLink(a);
      }
      const top = findMainTopLink(links);
      if (top) return setActiveByLink(top);
      return setActiveByLink(links[0]);
    }

    let a = findFileLink(links, file);
    if (!a) a = findFileLink(links, fileTry);

    if (a) return setActiveByLink(a);
    setActiveByLink(links[0]);
  }

  function syncContainerToHash(smooth) {
    const cur = fileName(location.pathname);
    const cur2 = FILE_ALIAS[cur] || cur;
    if (cur2 !== "main.html") return;

    const hash = (location.hash || "").trim();
    if (!hash) return scrollToTop(false);

    const id = hash.slice(1);
    scrollToId(id, smooth);
  }

  function bindClicks() {
    const links = getLinks();
    if (!links.length) return;

    links.forEach(a => {
      a.addEventListener("click", (e) => {
        const href = (a.getAttribute("href") || "").trim();
        if (!href) return;

        const url = new URL(href, location.href);
        const samePage = url.pathname === location.pathname;
        const file = fileName(url.pathname);
        const hash = (url.hash || "").trim();

        // 같은 main.html 안에서만 “컨테이너 스크롤”로 가로채기
        if (samePage && file === "main.html") {
          const scroller = getScroller();
          if (!scroller) return;

          // main.html(해시 없음) -> top
          if (!hash) {
            e.preventDefault();
            setActiveByLink(a);
            scrollToTop(true);
            history.pushState(null, "", location.pathname);
            return;
          }

          // main.html#main2/#main3 -> 해당 섹션
          const id = hash.slice(1);
          if (document.getElementById(id)) {
            e.preventDefault();
            setActiveByLink(a);
            scrollToId(id, true);
            history.pushState(null, "", location.pathname + hash);
            return;
          }
        }
      });
    });
  }

  function bindObserver() {
    const scroller = getScroller();
    if (!scroller) return;

    const cur = fileName(location.pathname);
    const cur2 = FILE_ALIAS[cur] || cur;
    if (cur2 !== "main.html") return;

    const links = getLinks();
    const sections = ["main1", "main2", "main3"]
      .map(id => document.getElementById(id))
      .filter(Boolean);

    if (!sections.length) return;

    const linkFor = (id) => {
      if (id === "main1") return findMainTopLink(links);
      return findHashLink(links, `#${id}`);
    };

    const io = new IntersectionObserver((entries) => {
      const v = entries
        .filter(en => en.isIntersecting)
        .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!v) return;

      const id = v.target.id || "main1";
      const a = linkFor(id);
      if (a) setActiveByLink(a);
    }, {
      root: scroller,
      threshold: [0.2, 0.4, 0.6],
      rootMargin: `-${getOffset()}px 0px -60% 0px`,
    });

    sections.forEach(s => io.observe(s));
  }

  // sidebar.js가 mount 후 호출
  window.__initSidebarAndAnchors = function () {
    const root = document.querySelector(SIDEBAR);
    if (!root) return;

    if (root.dataset.sidebarInited === "1") return;
    root.dataset.sidebarInited = "1";

    setActiveFromLocation();
    bindClicks();
    bindObserver();

    // “처음 진입 해시” 처리(레이아웃 안정화 후)
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        syncContainerToHash(false);
      });
    });

    window.addEventListener("popstate", () => {
      setActiveFromLocation();
      syncContainerToHash(true);
    });

    window.addEventListener("hashchange", () => {
      setActiveFromLocation();
      syncContainerToHash(true);
    });
  };
})();


// ✅ 로그인 필요 링크(단어사전/마이페이지) 클릭 시 모달
window.__initRequireLoginModal = function () {
  const SIDEBAR = "#sidebarMount";
  const root = document.querySelector(SIDEBAR);
  if (!root) return;

  const layer = document.getElementById("tsNeedLoginLayer");
  if (!layer) return;

  // ✅ 반드시 body로 이동(헤더 포함 전체를 덮기 위해)
  if (layer.parentElement !== document.body) {
    document.body.appendChild(layer);
  }
  // 헤더보다 위로
  layer.style.zIndex = "99999";

  if (root.dataset.requireLoginInited === "1") return;
  root.dataset.requireLoginInited = "1";

  const AUTH_CHECK_URL = "/my_page_load/data";

  async function isLoggedInAsync() {
    try {
      const res = await fetch(AUTH_CHECK_URL, {
        method: "GET",
        credentials: "include",
        cache: "no-store",
        headers: { "Accept": "application/json" },
      });

      const ct = (res.headers.get("content-type") || "").toLowerCase();
      if (!ct.includes("application/json")) return false;

      const json = await res.json().catch(() => ({}));

      if (json.success === true) return true;

      // success=false여도 메시지가 "로그인"이 아니면(예: 비번확인 필요) 로그인으로 취급
      const msg = String(json.message || json.msg || "");
      if (msg.includes("로그인")) return false;

      return true;
    } catch {
      return false;
    }
  }

  const btnCancel = document.getElementById("tsNeedLoginCancel");
  const btnGo = document.getElementById("tsNeedLoginGo");

  const guardedLinks = Array.from(
    root.querySelectorAll('a[data-require-login="true"], a[data-require-login]')
  );

  let pendingHref = "";
  const prevOverflow = { html: "", body: "" };

  function openModal(nextHref) {
    pendingHref = nextHref || "";
    layer.setAttribute("aria-hidden", "false");

    prevOverflow.html = document.documentElement.style.overflow || "";
    prevOverflow.body = document.body.style.overflow || "";
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    document.addEventListener("keydown", onKeydown);
    setTimeout(() => (btnGo || btnCancel)?.focus?.(), 0);
  }

  function closeModal() {
    layer.setAttribute("aria-hidden", "true");

    document.documentElement.style.overflow = prevOverflow.html;
    document.body.style.overflow = prevOverflow.body;

    document.removeEventListener("keydown", onKeydown);
  }

  function onKeydown(e) {
    if (e.key === "Escape") closeModal();
  }

  layer.addEventListener("click", (e) => {
    if (e.target === layer) closeModal();
  });

  btnCancel?.addEventListener("click", closeModal);

  btnGo?.addEventListener("click", () => {
    const base = location.pathname.includes("/view/") ? "/view/login.html" : "/login.html";
    const loginUrl = new URL(base, location.origin);
    const returnTo = pendingHref || (location.pathname + location.search + location.hash);
    loginUrl.searchParams.set("returnTo", returnTo);
    location.href = loginUrl.toString();
  });

  guardedLinks.forEach((a) => {
    a.addEventListener("click", async (e) => {
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button === 1) return;

      e.preventDefault();
      const href = a.getAttribute("href") || "";

      const ok = await isLoggedInAsync();
      if (ok) {
        location.href = new URL(href, location.href).toString();
      } else {
        openModal(href);
      }
    });
  });

  closeModal();
};

// ==============================
// ✅ Role 기반 메뉴 토글 브릿지
// - base.js에서 setAuth({loggedIn, roleId}) 호출하면 admin-only 메뉴 표시
// - sidebar가 mount 전이어도 상태를 저장했다가 mount 후 적용 가능
// ==============================
(function () {
  const SIDEBAR_ROOT = "#sidebarMount";
  const ADMIN_SELECTOR = ".admin-only, [data-require-admin='true']";

  // ✅ 여기만 네 규칙에 맞게 수정하면 됨 (예: role_id 1이 관리자)
  let ADMIN_ROLE_IDS = new Set([1]);

  // ✅ base.js가 주입할 상태(기본값: 비로그인/일반)
  let authState = { loggedIn: false, roleId: null };

  function isAdmin() {
    if (!authState.loggedIn) return false;
    const rid = Number(authState.roleId);
    if (Number.isNaN(rid)) return false;
    return ADMIN_ROLE_IDS.has(rid);
  }

  function applyRoleMenu() {
    const root = document.querySelector(SIDEBAR_ROOT);
    if (!root) return; // sidebar mount 전이면 그냥 대기

    const adminNodes = root.querySelectorAll(ADMIN_SELECTOR);

    // 기본은 숨김
    adminNodes.forEach(el => el.classList.add("is-hidden"));

    // 관리자면 노출
    if (isAdmin()) {
      adminNodes.forEach(el => el.classList.remove("is-hidden"));
    }
  }

  // ✅ base.js에서 호출할 함수(권한 상태 주입)
  function setAuth(next) {
    authState.loggedIn = !!next?.loggedIn;
    authState.roleId = (next?.roleId ?? null);
    applyRoleMenu();
  }

  // ✅ 관리자 role_id 목록을 바꾸고 싶을 때(옵션)
  function setAdminRoleIds(ids) {
    ADMIN_ROLE_IDS = new Set((ids || []).map(Number).filter(v => !Number.isNaN(v)));
    applyRoleMenu();
  }

  // ✅ sidebar.js가 mount 후 호출할 훅
  window.__initRoleBasedMenu = function () {
    applyRoleMenu();
  };

  // ✅ 전역 노출: base.js에서 window.SidebarRoleBridge.setAuth(...)로 사용
  window.SidebarRoleBridge = {
    setAuth,
    setAdminRoleIds,
    apply: applyRoleMenu,
  };

  // ✅ (선택) 이벤트 방식도 지원: base.js에서 dispatchEvent로 느슨하게 연결 가능
  window.addEventListener("app:auth", (e) => {
    setAuth(e.detail || {});
  });
})();

(function () {
  function $(sel, el = document) { return el.querySelector(sel); }

  function ensureBackdrop() {
    let b = $("#tsSidebarBackdrop");
    if (!b) {
      b = document.createElement("div");
      b.id = "tsSidebarBackdrop";
      b.className = "tsSidebarBackdrop";
      document.body.appendChild(b);
    }
    return b;
  }

  function ensureHamburgerButton() {
    let btn = $("#btnSidebarToggle");
    if (btn) return btn;

    btn = document.createElement("button");
    btn.id = "btnSidebarToggle";
    btn.className = "tsHamburger";
    btn.type = "button";
    btn.setAttribute("aria-label", "메뉴 열기");
    btn.setAttribute("aria-expanded", "false");
    btn.innerHTML = "<span></span><span></span><span></span>";

    // ✅ 너 프로젝트에서 자주 나오는 헤더 컨테이너 후보들
    const headerInner =
      $("header .header-inner") ||
      $("header .topbar__inner") ||
      $(".topbar .header-inner") ||
      $(".topbar .topbar__inner");

    if (headerInner) {
      const authArea = $("#authArea", headerInner);
      if (authArea) headerInner.insertBefore(btn, authArea);
      else headerInner.appendChild(btn);
    } else {
      // 헤더 구조를 못 찾으면: 화면 우측 상단에 떠 있는 버튼으로 대체
      btn.style.position = "fixed";
      btn.style.top = "12px";
      btn.style.right = "12px";
      btn.style.zIndex = "100000";
      btn.style.display = "inline-flex";
      document.body.appendChild(btn);
    }
    return btn;
  }

  function initMobileSidebarToggle() {
    const sidebar = $("#sidebarMount");
    if (!sidebar) return;

    const backdrop = ensureBackdrop();
    const btnToggle = ensureHamburgerButton();

    function open() {
      sidebar.classList.add("is-open");
      backdrop.classList.add("is-open");
      btnToggle.setAttribute("aria-expanded", "true");
    }
    function close() {
      sidebar.classList.remove("is-open");
      backdrop.classList.remove("is-open");
      btnToggle.setAttribute("aria-expanded", "false");
    }
    function toggle() {
      sidebar.classList.contains("is-open") ? close() : open();
    }

    btnToggle.addEventListener("click", (e) => { e.preventDefault(); toggle(); });
    backdrop.addEventListener("click", close);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });

    // ✅ 메뉴 클릭 시 닫기(모바일 UX)
    sidebar.addEventListener("click", (e) => {
      const a = e.target.closest("a");
      if (a) close();
    }, true);

    // ✅ 데스크톱으로 커지면 열린 상태 정리
    window.addEventListener("resize", () => {
      if (window.innerWidth > 1100) close();
    });

    close();
  }

  // sidebar.js가 fetch로 sidebar를 꽂아넣어도, 감지해서 자동 초기화
  function onSidebarMounted(cb) {
    const mount = document.getElementById("sidebarMount");
    if (!mount) return;

    if (mount.querySelector(".menu")) return cb();

    const mo = new MutationObserver(() => {
      if (mount.querySelector(".menu")) {
        mo.disconnect();
        cb();
      }
    });
    mo.observe(mount, { childList: true, subtree: true });
  }

  function boot() { onSidebarMounted(initMobileSidebarToggle); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
