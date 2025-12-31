$(function () {
  // ====== refs ======
  const $form = $("#editForm");
  const $reviseBtn = $("button.revise");

  const $pw = $("#password");              // (변경 시에만 입력)
  const $pw2 = $("#confirmPassword");
  const $pwMsg = $("#passwordError");

  const $updateModal = $("#updateModal");
  const $updateModalText = $("#updateModal .modal-content p");

  const $withdrawModal = $("#withdrawModal");

  // ✅ main.py 기준
  const ENDPOINT_LOAD = "/my_page_load/data";
  const ENDPOINT_UPDATE = "/info_update";

  // ✅ main.py 그대로면, 비번확인은 이 엔드포인트를 써야 함 (성공 시 RedirectResponse)
  const ENDPOINT_VERIFY_PW = "/mypage/password_check";

  let passwordChanged = false;

  // =========================
  // 모달 전역 (update)
  // =========================
  window.closeUpdateModal = () => {
    $updateModal.hide().attr("aria-hidden", "true");

    if (passwordChanged) {
      // 예전에 저장해둔 "현재 비번"은 이제 의미 없으니 삭제
      sessionStorage.removeItem("verifiedPw");

      // 로그아웃은 하지 않고, 마이페이지(비밀번호 확인 화면)로 보내기
      window.location.href = "/view/my_page.html";
      return;
    }

    window.location.href = "/view/my_page.html";
  };

  // =========================
  // 모달 전역 (withdraw)
  // =========================
  window.openModal = () => { $withdrawModal.css("display", "flex"); };
  window.closeModal = () => { $withdrawModal.hide(); };

  window.confirmWithdraw = () => {
    alert("현재 백엔드에 '탈퇴 처리(API/DB 삭제)'가 없어 실제 탈퇴는 불가능합니다.\n(원하면 main.py에 탈퇴 API 추가해줄게요)");
    closeModal();
  };

  // =========================
  // 버튼 enable/disable
  // =========================
  function setReviseEnabled(enabled) {
    $reviseBtn.prop("disabled", !enabled).attr("aria-disabled", String(!enabled));
  }

  // 비번 일치 검사(변경 시에만)
  function validatePasswordMatch() {
    const pw = $pw.val().trim();
    const confirm = $pw2.val().trim();

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
  // AJAX
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

  // ✅ RedirectResponse(성공) 때문에 text로 받는 게 안전
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
    const data = res.data || res;

    $form[0].elements.name.value = data.name ?? "";
    $form[0].elements.email.value = data.email ?? "";
    $form[0].elements.birthday.value = data.birthday ?? "";
    $form[0].elements.phone.value = data.phone ?? "";

    const $g = $form.find(`input[name="gender"][value="${data.gender}"]`);
    if ($g.length) $g.prop("checked", true);

    const $e = $form.find(`input[name="eco_state"][value="${data.eco_state}"]`);
    if ($e.length) $e.prop("checked", true);
  }

  function buildPayload() {
    const payload = {
      email: $form.find('input[name="email"]').val().trim(),
      name: $form.find('input[name="name"]').val().trim(),
      birthday: $form.find('input[name="birthday"]').val(),
      phone: $form.find('input[name="phone"]').val().trim(),
      eco_state: $form.find('input[name="eco_state"]:checked').val(),
      gender: $form.find('input[name="gender"]:checked').val(),
    };

    const newPw = $pw.val().trim();
    const newPw2 = $pw2.val().trim();

    // main.py는 pw/pw_confirm 필수라서:
    // - 비번 변경 안 하면 verifiedPw(비번확인에서 입력했던 비번)로 채워서 보냄
    if (newPw === "" && newPw2 === "") {
      const verifiedPw = sessionStorage.getItem("verifiedPw") || "";
      if (!verifiedPw) {
        throw new Error("비밀번호 확인이 필요합니다. 다시 확인 후 진행해 주세요.");
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
      alert(err.message || "비밀번호 확인이 필요합니다.");
      // ✅ info_edit에서 직접 비번확인 모달을 띄울 거라 여기서는 모달로 유도
      openPwVerifyModal();
      return;
    }

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
            ? "회원정보가 수정되었습니다. 비밀번호가 변경되어 로그아웃됩니다."
            : "회원정보가 수정되었습니다."
        );
        openUpdateModal();
      })
      .fail((xhr) => {
        const msg =
          (xhr.responseJSON && (xhr.responseJSON.message || xhr.responseJSON.detail)) ||
          "저장에 실패했습니다.";
        alert(msg);

        if (String(msg).includes("비밀번호 확인")) {
          openPwVerifyModal();
        }
      })
      .always(() => {
        $reviseBtn.text(originalText);
        validatePasswordMatch();
      });
  });

  // =========================================================
  // ✅ 여기부터: "info_edit에서 비밀번호 확인 모달" (main.py 변경 없이)
  // =========================================================

  function isLikelyHtml(text) {
    return /<!doctype html>|<html/i.test(text || "");
  }

  function tryParseJson(text) {
    try {
      return JSON.parse(text);
    } catch (_) {
      return null;
    }
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
      window.location.href = "/view/my_page.html";
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
        .done((text, _status, jqXHR) => {
          // 실패면 JSON({success:false,...})가 올 수 있음
          const asJson = tryParseJson(text);

          if (asJson && asJson.success === false) {
            $("#pwVerifyMsg").text(asJson.message || "비밀번호가 올바르지 않습니다.");
            return;
          }

          // 성공이면 RedirectResponse를 따라가서 HTML을 받는 경우가 대부분
          const finalUrl = jqXHR && jqXHR.responseURL ? String(jqXHR.responseURL) : "";
          const ok =
            finalUrl.includes("/view/info_edit.html") ||
            isLikelyHtml(text);

          if (!ok) {
            $("#pwVerifyMsg").text("비밀번호 확인에 실패했습니다. 다시 시도해 주세요.");
            return;
          }

          // ✅ 성공: 세션에 my_page_verified가 서버에서 세팅됨
          // ✅ 그리고 현재 백엔드는 /info_update가 pw 필수라서, 여기서만 pw 저장(불가피)
          sessionStorage.setItem("verifiedPw", pw);

          $("#pwVerifyModal").hide().attr("aria-hidden", "true");
          $("#pwVerifyInput").val("");

          // 다시 로드 시도
          attemptLoad();
        })
        .fail(() => {
          $("#pwVerifyMsg").text("서버 오류가 발생했습니다.");
        })
        .always(() => {
          $("#pwVerifyOk").prop("disabled", false).text("확인");
        });
    });

    // Enter로 확인
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
  // init: 로드 실패 시 "비번확인 모달"로 처리
  // =========================
  // function attemptLoad() {
  //   requestLoad()
  //     .done((res) => {
  //       if (res.success === false) {
  //         const msg = res.message || "";

  //         if (msg.includes("로그인")) {
  //           alert(msg);
  //           window.location.href = "/view/login.html";
  //           return;
  //         }

  //         if (msg.includes("비밀번호 확인")) {
  //           openPwVerifyModal();
  //           return;
  //         }

  //         alert(msg || "접근할 수 없습니다.");
  //         window.location.href = "/view/my_page.html";
  //         return;
  //       }

  //       fillForm(res);
  //     })
  //     .fail(() => window.location.href = "/view/login.html")
  //     .always(() => validatePasswordMatch());
  // }

  setReviseEnabled(false);
  attemptLoad();
});
