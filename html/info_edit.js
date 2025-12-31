$(function () {
  // ====== refs ======
  const $form = $("#editForm");
  const $reviseBtn = $("button.revise");

  const $pw = $("#password");              // (변경 시에만 입력)
  const $pw2 = $("#confirmPassword");
  const $pwMsg = $("#passwordError");

  const $updateModal = $("#updateModal");
  const $updateModalText = $("#updateModal .modal-content p");

  const $withdrawModal = $("#withdrawModal"); // ✅ 추가

  // ✅ main.py 최종 기준으로 변경
  const ENDPOINT_LOAD = "/my_page_load/data"; // ✅ 여기 바뀜!!
  const ENDPOINT_UPDATE = "/info_update";

  let passwordChanged = false;

  // =========================
  // 모달 전역 (update)
  // =========================
  window.openUpdateModal = () => {
    $updateModal.css("display", "flex").attr("aria-hidden", "false");
  };
  window.closeUpdateModal = () => {
    $updateModal.hide().attr("aria-hidden", "true");

    // ✅ 비번을 바꿨으면 "변경 확인"을 위해 로그아웃 → 새 비번으로 재로그인 유도
    if (passwordChanged) {
      sessionStorage.removeItem("verifiedPw");
      window.location.href = "/logout";
      return;
    }

    window.location.href = "./my_page.html";
  };

  // =========================
  // 모달 전역 (withdraw)  ✅ 추가
  // =========================
  window.openModal = () => { $withdrawModal.css("display", "flex"); };
  window.closeModal = () => { $withdrawModal.hide(); };

  // ❗ 백엔드에 "탈퇴" API가 없어서 실제 DB 삭제는 불가
  // 지금은 동작만 하게 안내/로그아웃 처리로 대체
  window.confirmWithdraw = () => {
    alert("현재 백엔드에 '탈퇴 처리(API/DB 삭제)'가 없어 실제 탈퇴는 불가능합니다.\n(원하면 main.py에 탈퇴 API 추가해줄게요)");
    closeModal();
    // 원하면 로그아웃으로 보내기:
    // window.location.href = "/logout";
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
      data: payload, // ✅ Form 전송 (FastAPI Form(...) 호환)
      timeout: 10000,
      xhrFields: { withCredentials: true }
    });
  }

  function fillForm(res) {
    // 서버가 {success, data} 형태로 줄 가능성 고려
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

    // main.py는 pw/pw_confirm을 Form(...) 필수로 요구함 ❗
    const newPw = $pw.val().trim();
    const newPw2 = $pw2.val().trim();

    if (newPw === "" && newPw2 === "") {
      const verifiedPw = sessionStorage.getItem("verifiedPw") || "";
      if (!verifiedPw) {
        throw new Error("비밀번호 확인이 필요합니다. 마이페이지에서 비밀번호 확인 후 다시 시도해 주세요.");
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
      window.location.href = "/view/my_page.html";
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
          window.location.href = "/view/my_page.html";
        }
      })
      .always(() => {
        $reviseBtn.text(originalText);
        validatePasswordMatch();
      });
  });

  // =========================
  // init
  // =========================
  setReviseEnabled(false);
  requestLoad()
    .done((res) => {
      if (res.success === false) {
        alert(res.message || "접근할 수 없습니다.");
        if ((res.message || "").includes("로그인")) window.location.href = "/view/login.html";
        else window.location.href = "/view/my_page.html";
        return;
      }
      fillForm(res);
    })
    .fail(() => window.location.href = "/view/login.html")
    .always(() => validatePasswordMatch());
});