(function () {
    const cards = Array.from(document.querySelectorAll(".feature-row .mini-card"));
    const track = document.querySelector(".product-slider__track");
    const slides = Array.from(document.querySelectorAll(".product-slider__slide"));

    if (!cards.length || !track || !slides.length) return;

    function setActive(index) {
        const max = slides.length - 1;
        const i = Math.max(0, Math.min(index, max));

        // 슬라이드 이동
        track.style.transform = `translateX(-${i * 100}%)`;

        // ✅ 슬라이드(이미지)에도 활성 클래스 토글
        slides.forEach((s, idx) => s.classList.toggle("is-active", idx === i));

        // 카드 활성 표시
        cards.forEach((c, idx) => {
            const active = idx === i;
            c.classList.toggle("is-active", active);
            c.setAttribute("aria-pressed", active ? "true" : "false");
        });
    }

    // 기본값: 첫 카드 active면 그걸로, 아니면 0
    const initial = Math.max(0, cards.findIndex(c => c.classList.contains("is-active")));
    setActive(initial >= 0 ? initial : 0);

    cards.forEach((card) => {
        const slideIndex = Number(card.dataset.slide);

        // 클릭
        card.addEventListener("click", () => setActive(slideIndex));

        // 키보드 접근성 (Enter/Space)
        card.addEventListener("keydown", (e) => {
            if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setActive(slideIndex);
            }
        });
    });
})();