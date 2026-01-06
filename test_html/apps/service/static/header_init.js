// /static/header_init.js  ✅ base.js 교체 없이: 헤더 마운트 + 세션 기반(auth) 토글 + 깜빡임(FOUC) 방지
(function () {
  "use strict";

  const HEADER_MOUNT = "#headerMount";
  const HEADER_URL = "/view/header.html"; // header.html 경로

  const $ = (sel, el = document) => el.querySelector(sel);

  async function fetchSession() {
    try {
      const r = await fetch("/api/session", { credentials: "include", cache: "no-store" });
      if (!r.ok) return { loggedIn: false, admin: false, roleId: null };
      const body = await r.json();
      return {
        loggedIn: !!body.logged_in,
        admin:   !!body.admin_in,
        roleId:  (body.role_id ?? null),
      };
    } catch (_) {
      return { loggedIn: false, admin: false, roleId: null };
    }
  }

  function backupDisplayOnce(els) {
    els.forEach(el => {
      if (!el.dataset.tsDisplayBackup) {
        const d = getComputedStyle(el).display;
        el.dataset.tsDisplayBackup = (d === "none" ? "" : d);
      }
    });
  }

  function setVisible(els, visible) {
    els.forEach(el => {
      if (visible) {
        el.style.display = el.dataset.tsDisplayBackup || "";
        el.removeAttribute("hidden");
      } else {
        el.style.display = "none";
        el.setAttribute("hidden", "true");
      }
    });
  }

  async function syncAuthArea() {
    const s = await fetchSession();

    const authIn  = Array.from(document.querySelectorAll(".js-auth-in"));
    const authOut = Array.from(document.querySelectorAll(".js-auth-out"));

    backupDisplayOnce([...authIn, ...authOut]);

    // 로그인 → in 보이고 out 숨김
    setVisible(authIn,  s.loggedIn);
    setVisible(authOut, !s.loggedIn);

    // (선택) 관리자 메뉴 브릿지 (sidebar_init.js와 연결)
    window.SidebarRoleBridge?.setAuth?.({ loggedIn: s.loggedIn, roleId: s.roleId });
    window.dispatchEvent(new CustomEvent("app:auth", { detail: { loggedIn: s.loggedIn, roleId: s.roleId } }));
  }

  function bindLogout() {
    const btn = $("#btnLogout");
    if (!btn) return;

    btn.addEventListener("click", () => {
      // 프론트 임시 플래그를 쓰는 경우 대비(없어도 무해)
      try {
        localStorage.removeItem("access_token");
        localStorage.removeItem("user_id");
      } catch (_) {}

      // 곧 /logout으로 이동하니, UI도 즉시 비로그인으로 미리 바꿔줌(깜빡임 방지)
      const authIn  = Array.from(document.querySelectorAll(".js-auth-in"));
      const authOut = Array.from(document.querySelectorAll(".js-auth-out"));
      backupDisplayOnce([...authIn, ...authOut]);
      setVisible(authIn, false);
      setVisible(authOut, true);
    }, { capture: true });
  }

  function setAuthPending(on) {
    const area = $("#authArea");
    if (!area) return;
    area.setAttribute("data-auth-pending", on ? "1" : "0");
  }

  async function mountHeader() {
    const mount = $(HEADER_MOUNT);
    if (!mount) return;

    try {
      const res = await fetch(HEADER_URL, { cache: "no-store" });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

      // 1) 헤더 먼저 주입
      mount.innerHTML = await res.text();

      // 2) ✅ 세션 확인 전에는 authArea를 통째로 숨김 (깜빡임 제거)
      setAuthPending(true);

      // 3) 세션 확인 후 토글
      await syncAuthArea();
      bindLogout();

      // 4) ✅ 완료되면 authArea 표시
      setAuthPending(false);

      document.dispatchEvent(new CustomEvent("header:loaded"));
    } catch (err) {
      console.error("header mount failed:", err);

      // 실패해도 메뉴가 영원히 안 보이면 안 되니, 표시로 풀어줌
      setAuthPending(false);
    }
  }

  // 외부에서 강제 재동기화하고 싶을 때
  window.syncAuthArea = syncAuthArea;

  document.addEventListener("DOMContentLoaded", mountHeader);
})();
