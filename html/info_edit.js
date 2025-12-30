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

// 탈퇴 모달
const modal = document.getElementById('withdrawModal');
function openModal() { modal.style.display = 'flex'; }
function closeModal() { modal.style.display = 'none'; }
function confirmWithdraw() { window.location.href = './home.html'; }

// 수정 모달
const editForm = document.getElementById('editForm');
const updateModal = document.getElementById('updateModal');

function openUpdateModal() {
    updateModal.style.display = 'flex';
    updateModal.setAttribute('aria-hidden', 'false');
}

function closeUpdateModal() {
    updateModal.style.display = 'none';
    updateModal.setAttribute('aria-hidden', 'true');
    window.location.href = './my_page.html';
}

// submit 시 모달 띄우기
editForm.addEventListener('submit', (e) => {
    e.preventDefault();
    openUpdateModal();
});