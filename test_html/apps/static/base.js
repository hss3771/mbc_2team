(function checkSessionOnce() {
  fetch("/api/session", { credentials: "include" })
    .then(r => r.json())
    .then(s => {
      if (s.logged_in) {
        document.body.classList.add("logged-in");
      } else {
        document.body.classList.add("logged-out");
      }
    });
})();
