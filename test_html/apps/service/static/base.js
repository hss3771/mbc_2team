(function () {
  const authInEls  = document.querySelectorAll(".js-auth-in");
  const authOutEls = document.querySelectorAll(".js-auth-out");

  if (!authInEls.length && !authOutEls.length) return;

  function setUI(loggedIn) {
    authInEls.forEach(el  => el.hidden = !loggedIn);
    authOutEls.forEach(el => el.hidden =  loggedIn);
  }

  // 기본값: 로그아웃 상태
  setUI(false);

  fetch("/api/session", { credentials: "include" })
    .then(r => r.ok ? r.json() : Promise.reject())
    .then(s => setUI(!!s.logged_in))
    .catch(() => setUI(false));
})();