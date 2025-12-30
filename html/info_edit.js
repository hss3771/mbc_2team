document.addEventListener('DOMContentLoaded', () => {
  // ====== 사이드바 active ======
  const alias = { 'info_edit.html': 'my_page.html' };

  function setSidebarActive() {
    const curFileRaw = (location.pathname.split('/').pop() || '').split('?')[0];
    const curFile = alias[curFileRaw] || curFileRaw;
    const curHash = location.hash || '';

    document.querySelectorAll('.menu li').forEach(li => li.classList.remove('active'));
    const links = Array.from(document.querySelectorAll('.menu a'));

    if (curFile === 'main.html' && (curHash === '#main2' || curHash === '#main3')) {
      const hashTarget = links.find(a => {
        const href = a.getAttribute('href') || '';
        const parts = href.split('#');
        const file = (parts[0].split('/').pop() || '').split('?')[0];
        const hash = parts[1] ? ('#' + parts[1]) : '';
        return file === 'main.html' && hash === curHash;
      });
      if (hashTarget) {
        hashTarget.closest('li')?.classList.add('active');
        return;
      }
    }

    const fileTarget = links.find(a => {
      const href = a.getAttribute('href') || '';
      const file = (href.split('#')[0].split('/').pop() || '').split('?')[0];
      return file === curFile;
    });

    fileTarget?.closest('li')?.classList.add('active');
  }

  setSidebarActive();
  window.addEventListener('hashchange', setSidebarActive);

  // ====== DOM refs ======
  const editForm = document.getElementById('editForm');
  const reviseBtn = document.querySelector('button.revise');

  const pwInput = document.getElementById('password');
  const pwConfirmInput = document.getElementById('confirmPassword');
  const pwMsg = document.getElementById('passwordError');

  const withdrawModal = document.getElementById('withdrawModal');
  const updateModal = document.getElementById('updateModal');

  // ====== inline onclick에서 쓰는 함수들을 전역(window)에 걸어주기 ======
  window.openModal = () => { withdrawModal.style.display = 'flex'; };
  window.closeModal = () => { withdrawModal.style.display = 'none'; };
  window.confirmWithdraw = () => { window.location.href = './home.html'; };

  window.openUpdateModal = () => {
    updateModal.style.display = 'flex';
    updateModal.setAttribute('aria-hidden', 'false');
  };

  window.closeUpdateModal = () => {
    updateModal.style.display = 'none';
    updateModal.setAttribute('aria-hidden', 'true');
    window.location.href = './my_page.html';
  };

  // ====== 비밀번호 일치 여부에 따라 버튼 disable ======
  function setReviseEnabled(enabled) {
    reviseBtn.disabled = !enabled;
    reviseBtn.setAttribute('aria-disabled', String(!enabled));
  }

  function validatePasswordMatch() {
    const pw = pwInput.value;
    const confirm = pwConfirmInput.value;

    // 확인란 비어있으면: 메시지 숨기고 버튼 비활성
    if (confirm === '') {
      pwMsg.textContent = '';
      pwMsg.classList.remove('success');
      setReviseEnabled(false);
      return false;
    }

    // 확인란만 입력되어도(비번이 비어도) 불일치로 계속 표시 + 버튼 비활성
    if (pw !== confirm) {
      pwMsg.textContent = '비밀번호가 일치하지 않습니다.';
      pwMsg.classList.remove('success');
      setReviseEnabled(false);
      return false;
    }

    // 일치
    pwMsg.textContent = '비밀번호가 일치합니다.';
    pwMsg.classList.add('success');
    setReviseEnabled(true);
    return true;
  }

  pwInput.addEventListener('input', validatePasswordMatch);
  pwConfirmInput.addEventListener('input', validatePasswordMatch);

  // 시작 시 버튼 비활성(둘 다 입력 + 일치해야 활성)
  setReviseEnabled(false);

  // ====== (백엔드 연결용) payload 만들고 서버에 보내는 함수 ======
  async function submitProfileUpdate() {
    const fd = new FormData(editForm);
    const payload = Object.fromEntries(fd.entries());

    // confirmPassword는 서버로 보낼 필요 없으면 제거
    delete payload.confirmPassword;

    // 나중에 실제 API로 변경하기!!!!!!
    const res = await fetch('/api/users/me', {
      method: 'PUT', // 또는 PATCH
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      credentials: 'include', // 쿠키 세션 기반이면 유지
    });

    if (!res.ok) {
      // 서버가 에러 메시지를 주면 읽어서 던짐
      const text = await res.text().catch(() => '');
      throw new Error(text || `HTTP ${res.status}`);
    }

    // 서버가 JSON 주면 받기(없어도 OK)
    return res.json().catch(() => ({}));
  }

  // ====== submit: 일치 안하면 아예 제출 X, 일치면 저장 후 모달 ======
  editForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    if (!validatePasswordMatch()) {
      pwConfirmInput.focus();
      return;
    }

    // 백엔드 아직 없으면 아래 2줄만 쓰면 됨:!!!!!!!!!!!!!!!!!!!
    openUpdateModal();
    return;

    const originalText = reviseBtn.textContent;
    reviseBtn.textContent = '저장 중...';
    reviseBtn.disabled = true;

    try {
      await submitProfileUpdate();
      openUpdateModal();
    } catch (err) {
      console.error(err);
      pwMsg.textContent = '저장에 실패했습니다. 다시 시도해 주세요.';
      pwMsg.classList.remove('success');
      setReviseEnabled(false);
    } finally {
      reviseBtn.textContent = originalText;
      // 현재 입력값 기준으로 버튼 상태 재평가
      validatePasswordMatch();
    }
  });
});
