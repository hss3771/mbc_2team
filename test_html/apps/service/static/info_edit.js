function getCurKey() {
  const segs = (location.pathname || "").split("/").filter(Boolean);
  let last = segs[segs.length - 1] || "";      // ex) "info_edit" or "info_edit.html"
  last = last.replace(/\.html$/i, "");

  // info_edit는 마이페이지 메뉴로 묶기
  if (last === "info_edit") last = "my_page";

  // main에서 hash(main2/main3)면 hash까지 포함해서 키 만들기
  if (last === "main" && (location.hash === "#main2" || location.hash === "#main3")) {
    return "main" + location.hash;            // "main#main2"
  }
  return last;                                // "my_page", "word", "main" ...
}

function hrefToKey(href) {
  href = (href || "").trim();

  // main 내부 스크롤 링크 (#main2 같은 경우)
  if (href.startsWith("#")) return "main" + href;

  const [pathPart, hashPart] = href.split("#");
  const file = (pathPart || "").split("/").filter(Boolean).pop() || ""; // "my_page.html"
  let key = file.replace(/\.html$/i, "");

  if (key === "main" && hashPart) key = "main#" + hashPart; // "main#main2"
  return key;
}

function setSidebarActive() {
  const curKey = getCurKey();

  // active 초기화
  document.querySelectorAll(".menu li").forEach(li => li.classList.remove("active"));

  const links = Array.from(document.querySelectorAll(".menu a"));

  const target = links.find(a => hrefToKey(a.getAttribute("href")) === curKey);
  if (target) target.closest("li")?.classList.add("active");

  // 디버그(안 되면 이거 콘솔에서 확인)
  // console.log("curKey =", curKey, "pathname =", location.pathname, "hash =", location.hash);
}

// jQuery 쓰는 페이지니까 이게 제일 안전
$(setSidebarActive);
$(window).on("hashchange", setSidebarActive);


// 최초 1회
document.addEventListener('DOMContentLoaded', setSidebarActive);

// main에서 #main2/#main3 바뀔 때도 반영
window.addEventListener('hashchange', setSidebarActive);

$(function () {
  // ===== refs =====
  const $form = $("#editForm");
  const $reviseBtn = $("button.revise");

  const $pw = $("#password");              // 변경 시에만 입력
  const $pw2 = $("#confirmPassword");
  const $pwMsg = $("#passwordError");

  const $updateModal = $("#updateModal");
  const $updateModalText = $("#updateModal .modal-content p");

  const $withdrawModal = $("#withdrawModal");

  const ENDPOINT_LOAD = "/my_page_load/data";
  const ENDPOINT_UPDATE = "/info_update";
  const ENDPOINT_VERIFY_PW = "/mypage/password_check";

  let passwordChanged = false;
  let pendingPayload = null; // 비번 확인 모달 후 자동 저장용

  // =========================
  // 모달 전역 (update)
  // =========================
  window.closeUpdateModal = () => {
    $updateModal.hide().attr("aria-hidden", "true");
    // 백엔드 수정 불가 조건에서는, 비번 변경해도 강제 로그아웃 로직이 없음
    // UX상 마이페이지(비번확인 화면)로 이동
    window.location.href = "/my_page";
  };

  // =========================
  // 모달 전역 (withdraw)
  // =========================
  window.openModal = () => { $withdrawModal.css("display", "flex"); };
  window.closeModal = () => { $withdrawModal.hide(); };
  window.confirmWithdraw = () => {
    alert("현재 백엔드에 '탈퇴 API'가 없어 실제 탈퇴는 불가능합니다.");
    closeModal();
  };

  // =========================
  // UI enable/disable
  // =========================
  function setReviseEnabled(enabled) {
    $reviseBtn.prop("disabled", !enabled).attr("aria-disabled", String(!enabled));
  }

  function validatePasswordMatch() {
    const pw = ($pw.val() || "").trim();
    const confirm = ($pw2.val() || "").trim();

    if (pw === "" && confirm === "") {
      $pwMsg.text("").removeClass("success");
      setReviseEnabled(true);
      return true;
    }
    if (pw === "" || confirm === "") {
      $pwMsg.text("비밀번호를 변경하려면 동일하게 2번 입력해 주세요.").removeClass("success");
      setReviseEnabled(false);
      return false;
    }
    if (pw !== confirm) {
      $pwMsg.text("비밀번호가 일치하지 않습니다.").removeClass("success");
      setReviseEnabled(false);
      return false;
    }

    $pwMsg.text("비밀번호가 일치합니다.").addClass("success");
    setReviseEnabled(true);
    return true;
  }

  $pw.on("input", validatePasswordMatch);
  $pw2.on("input", validatePasswordMatch);

  // =========================
  // AJAX helpers
  // =========================
  function requestLoad() {
    return $.ajax({
      url: ENDPOINT_LOAD,
      method: "GET",
      dataType: "json",
      timeout: 10000,
      xhrFields: { withCredentials: true }
    });
  }

  function requestUpdate(payload) {
    return $.ajax({
      url: ENDPOINT_UPDATE,
      method: "POST",
      dataType: "json",
      data: payload,
      timeout: 10000,
      xhrFields: { withCredentials: true }
    });
  }

  // 성공 시 RedirectResponse라 text로 받아서 판별
  function requestVerifyPassword(pw) {
    return $.ajax({
      url: ENDPOINT_VERIFY_PW,
      method: "POST",
      dataType: "text",
      data: { pw },
      timeout: 10000,
      xhrFields: { withCredentials: true }
    });
  }

  function fillForm(res) {
  const data = res.data || {};

  // 기본 입력 채우기
  $form[0].elements.name.value = data.name ?? "";
  $form[0].elements.email.value = data.email ?? "";
  $form[0].elements.birthday.value = data.birthday ?? "";
  $form[0].elements.phone.value = data.phone ?? "";

  // gender 매핑 (남/여 -> M/F)
  const genderMap = { "남": "M", "여": "F", "M": "M", "F": "F" };
  const genderVal = genderMap[(data.gender || "").trim()] || "M";

  $form.find('input[name="gender"]').prop("checked", false);
  $form.find(`input[name="gender"][value="${genderVal}"]`).prop("checked", true);

  // eco_state 매핑 (상/중상/중/중하/하 -> HIGH/MID_HIGH/MID/MID_LOW/LOW)
  const ecoMap = {
    "상": "HIGH",
    "중상": "MID_HIGH",
    "중": "MID",
    "중하": "MID_LOW",
    "하": "LOW",
    // 혹시 코드로 올 때도 대비
    "HIGH": "HIGH",
    "MID_HIGH": "MID_HIGH",
    "MID": "MID",
    "MID_LOW": "MID_LOW",
    "LOW": "LOW",
  };

  const ecoVal = ecoMap[(data.eco_state || "").trim()] || "MID_HIGH";

  $form.find('input[name="eco_state"]').prop("checked", false);
  $form.find(`input[name="eco_state"][value="${ecoVal}"]`).prop("checked", true);
}

  function buildPayload() {
    const payload = {
      email: ($form.find('input[name="email"]').val() || "").trim(),
      name: ($form.find('input[name="name"]').val() || "").trim(),
      birthday: $form.find('input[name="birthday"]').val(),
      phone: ($form.find('input[name="phone"]').val() || "").trim(),
      eco_state: $form.find('input[name="eco_state"]:checked').val(),
      gender: $form.find('input[name="gender"]:checked').val(),
    };

    const newPw = ($pw.val() || "").trim();
    const newPw2 = ($pw2.val() || "").trim();

    // main.py / user.py 가 pw/pw_confirm "필수"이므로:
    // - 변경 안 하면 verifiedPw로 채워서 전송
    if (newPw === "" && newPw2 === "") {
      const verifiedPw = sessionStorage.getItem("verifiedPw") || "";
      if (!verifiedPw) {
        throw new Error("비밀번호 확인이 필요합니다.");
      }
      payload.pw = verifiedPw;
      payload.pw_confirm = verifiedPw;
      passwordChanged = false;
    } else {
      payload.pw = newPw;
      payload.pw_confirm = newPw2;
      passwordChanged = true;
    }

    return payload;
  }

  // =========================
  // 비번 확인 모달 (info_edit 안에서 처리)
  // =========================
  function tryParseJson(text) {
    try { return JSON.parse(text); } catch { return null; }
  }

  function mountPwVerifyModalOnce() {
    if ($("#pwVerifyModal").length) return;

    $("head").append(`
      <style id="pwVerifyModalStyle">
        #pwVerifyModal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.35); z-index:99999; }
        #pwVerifyModal .box { width:min(420px, calc(100vw - 40px)); margin:auto; background:#fff; border-radius:14px; overflow:hidden; box-shadow:0 18px 45px rgba(15,40,90,.22); }
        #pwVerifyModal .hd { padding:14px 16px; font-weight:900; border-bottom:1px solid #eef2fb; color:#1d2b42; }
        #pwVerifyModal .bd { padding:14px 16px; display:flex; flex-direction:column; gap:10px; }
        #pwVerifyModal input { width:100%; padding:12px; border-radius:12px; border:1px solid #dfe8f7; outline:none; }
        #pwVerifyModal input:focus { border-color:#a6c8ef; box-shadow:0 0 0 3px rgba(4,98,210,.12); }
        #pwVerifyModal .msg { font-size:12px; font-weight:800; color:#e53935; min-height:16px; }
        #pwVerifyModal .ft { padding:12px 16px 16px; display:flex; gap:10px; justify-content:flex-end; }
        #pwVerifyModal .btn { border:none; border-radius:12px; padding:10px 14px; font-weight:900; cursor:pointer; }
        #pwVerifyModal .btn-cancel { background:#f1f5fb; color:#6a7a93; }
        #pwVerifyModal .btn-ok { background:#0462D2; color:#fff; }
        #pwVerifyModal .btn-ok:disabled { opacity:.6; cursor:not-allowed; }
      </style>
    `);

    $("body").append(`
      <div id="pwVerifyModal" aria-hidden="true">
        <div class="box" role="dialog" aria-modal="true" aria-labelledby="pwVerifyTitle">
          <div class="hd" id="pwVerifyTitle">비밀번호 확인</div>
          <div class="bd">
            <div style="font-size:12px; font-weight:800; color:#6a7a93;">
              회원정보 수정을 위해 비밀번호 확인이 필요합니다.
            </div>
            <input type="password" id="pwVerifyInput" placeholder="비밀번호를 입력해 주세요." />
            <div class="msg" id="pwVerifyMsg"></div>
          </div>
          <div class="ft">
            <button type="button" class="btn btn-cancel" id="pwVerifyCancel">취소</button>
            <button type="button" class="btn btn-ok" id="pwVerifyOk">확인</button>
          </div>
        </div>
      </div>
    `);

    $("#pwVerifyCancel").on("click", function () {
      $("#pwVerifyModal").hide().attr("aria-hidden", "true");
      window.location.href = "/my_page";
    });

    $("#pwVerifyOk").on("click", function () {
      const pw = ($("#pwVerifyInput").val() || "").trim();
      if (!pw) {
        $("#pwVerifyMsg").text("비밀번호를 입력해주세요.");
        $("#pwVerifyInput").focus();
        return;
      }

      $("#pwVerifyMsg").text("");
      $("#pwVerifyOk").prop("disabled", true).text("확인 중...");

      requestVerifyPassword(pw)
        .done((text) => {
          // 실패면 JSON({success:false, message})가 온다
          const json = tryParseJson(text);
          if (json && json.success === false) {
            $("#pwVerifyMsg").text(json.message || "비밀번호가 올바르지 않습니다.");
            return;
          }

          // 성공이면 redirect 결과 HTML이 옴 → 성공 처리
          sessionStorage.setItem("verifiedPw", pw);

          $("#pwVerifyModal").hide().attr("aria-hidden", "true");
          $("#pwVerifyInput").val("");

          // 1) info_edit 페이지 진입용이면 데이터 로드 재시도
          attemptLoad();

          // 2) 저장 중에 필요해서 띄운 거면 자동으로 저장 이어서
          if (pendingPayload) {
            const p = pendingPayload;
            pendingPayload = null;
            doUpdate(p);
          }
        })
        .fail(() => {
          $("#pwVerifyMsg").text("서버 오류가 발생했습니다.");
        })
        .always(() => {
          $("#pwVerifyOk").prop("disabled", false).text("확인");
        });
    });

    $(document).on("keydown", function (e) {
      if ($("#pwVerifyModal").is(":visible") && e.key === "Enter") {
        e.preventDefault();
        $("#pwVerifyOk").click();
      }
    });
  }

  function openPwVerifyModal() {
    mountPwVerifyModalOnce();
    $("#pwVerifyModal").css("display", "flex").attr("aria-hidden", "false");
    $("#pwVerifyMsg").text("");
    $("#pwVerifyInput").val("").focus();
  }

  // =========================
  // update 실행 분리
  // =========================
  function doUpdate(payload) {
    const originalText = $reviseBtn.text();
    $reviseBtn.text("저장 중...").prop("disabled", true);

    requestUpdate(payload)
      .done((res) => {
        if (!res.success) {
          $pwMsg.text(res.message || "저장 실패").removeClass("success");
          setReviseEnabled(false);
          return;
        }

        $updateModalText.text(
          passwordChanged
            ? "회원정보가 수정되었습니다."
            : "회원정보가 수정되었습니다."
        );

        $updateModal.css("display", "flex").attr("aria-hidden", "false");
      })
      .fail((xhr) => {
        const msg =
          (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.detail)) ||
          "저장에 실패했습니다.";
        alert(msg);

        // 비번 확인 필요면 모달 유도
        if (String(msg).includes("비밀번호 확인")) {
          openPwVerifyModal();
        }
      })
      .always(() => {
        $reviseBtn.text(originalText);
        validatePasswordMatch();
      });
  }

  // =========================
  // submit
  // =========================
  $form.on("submit", function (e) {
    e.preventDefault();

    if (!validatePasswordMatch()) {
      $pw2.focus();
      return;
    }

    let payload;
    try {
      payload = buildPayload();
    } catch (err) {
      // verifiedPw가 없어서 생기는 케이스
      pendingPayload = null; // 일단 초기화
      openPwVerifyModal();
      return;
    }

    // verifiedPw가 없어서 buildPayload가 throw 하는 대신,
    // “자동 저장까지 이어서” 하고 싶으면 아래처럼:
    if (!sessionStorage.getItem("verifiedPw") && !passwordChanged) {
      pendingPayload = payload;
      openPwVerifyModal();
      return;
    }

    doUpdate(payload);
  });

  // =========================
  // init: 데이터 로드
  // =========================
  function attemptLoad() {
    requestLoad()
      .done((res) => {
        if (res.success === false) {
          const msg = res.message || "";

          if (msg.includes("로그인")) {
            window.location.href = "/login";
            return;
          }
          if (msg.includes("비밀번호 확인")) {
            // 선택1) 비밀번호 확인 페이지로 보내기
            window.location.href = "/my_page";
            // 선택2) 여기서 모달로 확인받기 원하면 아래로 바꿔:
            // openPwVerifyModal();
            return;
          }

          alert(msg || "접근할 수 없습니다.");
          window.location.href = "/my_page";
          return;
        }

        fillForm(res);
      })
      .fail(() => window.location.href = "/login")
      .always(() => validatePasswordMatch());
  }

  setReviseEnabled(false);
  attemptLoad();
});

// 로그아웃
(function bindLogout() {
  const btn = document.getElementById("btnLogout");
  if (!btn) return;

  function clearCookie(name) {
    // 기본 path
    document.cookie = `${name}=; Max-Age=0; path=/`;
    // 혹시 path가 다르면 추가로 한 번 더(필요시)
    document.cookie = `${name}=; Max-Age=0; path=/;`;
  }

  btn.addEventListener("click", (e) => {
    e.preventDefault();

    // 프로젝트에서 로그인 판단에 쓰는 값들 싹 제거
    localStorage.removeItem("access_token");
    localStorage.removeItem("user_id");
    localStorage.removeItem("refresh_token");

    sessionStorage.removeItem("access_token");
    sessionStorage.removeItem("user_id");
    sessionStorage.removeItem("refresh_token");

    // 체크하는 쿠키들
    clearCookie("loginId");
    clearCookie("access_token");
    clearCookie("user_id");

    // UI 즉시 반영
    location.href = "./home.html";
  });
})();
