// ===== 샘플 데이터 =====
const KEYWORDS = [
    { rank: 1, keyword: "주식", count: 223, rate: +94, move: "NEW" },
    { rank: 2, keyword: "부동산", count: 201, rate: -22, move: "▼2" },
    { rank: 3, keyword: "고용", count: 189, rate: +10, move: "▲1" },
    { rank: 4, keyword: "경기침체", count: 173, rate: -7, move: "▼1" },
    { rank: 5, keyword: "유가", count: 162, rate: +18, move: "▲1" },
    { rank: 6, keyword: "반도체", count: 155, rate: +50, move: "▲3" },
    { rank: 7, keyword: "수출", count: 149, rate: -12, move: "▼2" },
    { rank: 8, keyword: "노동", count: 130, rate: -42, move: "▼3" },
    { rank: 9, keyword: "경제", count: 121, rate: +8, move: "▲1" },
    { rank: 10, keyword: "현금", count: 108, rate: -13, move: "▼1" },
];

const SUMMARY_MAP = {
    "주식": [
        "키워드 관련 기사 목록 조회(2~06건)",
        "전체 요약 생성(기사 내용 기반, 800~1200자)",
        "요약 API 호출 및 저장(예: summary_all 필드)",
        "사용자 선택 시점에 요약 제공(드롭다운/행 클릭)",
        "키워드별 요약/메타정보(언급량, 증감률, 변동) 함께 표시"
    ],
    "부동산": [
        "부동산 정책/금리/거래량 관련 기사 우선 수집",
        "기간별 비교(전주/전월) 기반 증감률 계산",
        "중복 기사/유사 기사 제거 후 요약 생성",
        "요약 결과를 키워드별 캐싱하여 빠르게 제공",
        "핵심 지표(거래, 대출, 가격) 중심으로 요약 구성"
    ],
    "고용": [
        "고용지표/실업률/채용시장 관련 기사 분류",
        "산업별 이슈 키워드(제조/서비스 등) 태깅",
        "요약 생성 후 핵심 문장 3~5개로 정리",
        "기간 단위(일/주/월/연) 변경 시 재집계",
        "요약과 함께 관련 기사 링크/제목 리스트 확장 가능"
    ]
};

// dropdownApi는 selectKeyword에서 쓰므로 위에 선언 (TDZ 방지)
let dropdownApi = null;

// ===== DOM =====
const rankListEl = document.getElementById("rankList");
const summaryKeywordEl = document.getElementById("summaryKeyword");
const summaryListEl = document.getElementById("summaryList");
const segmentedBtns = Array.from(document.querySelectorAll(".seg-btn"));

function fmtRate(n) {
    const sign = n > 0 ? "+" : "";
    return `${sign}${n}%`;
}
function rateClass(n) {
    if (n > 0) return "is-up";
    if (n < 0) return "is-down";
    return "is-flat";
}
function moveClass(move) {
    if (move === "NEW") return "is-new";
    if (String(move).includes("▲")) return "is-up";
    if (String(move).includes("▼")) return "is-down";
    return "is-flat";
}

function renderRanking(selectedKeyword) {
    if (!rankListEl) return;
    rankListEl.innerHTML = "";

    KEYWORDS.slice(0, 10).forEach((k) => {
        const row = document.createElement("button");
        row.type = "button";
        row.className = "rank-row rank-item" + (k.keyword === selectedKeyword ? " is-selected" : "");
        row.setAttribute("role", "listitem");

        row.innerHTML = `
          <div class="c-rank"><span class="rank-badge">${k.rank}</span></div>
          <div class="c-keyword">${k.keyword}</div>
          <div class="c-count">${k.count}</div>
          <div class="c-rate ${rateClass(k.rate)}">${fmtRate(k.rate)}</div>
          <div class="c-move ${moveClass(k.move)}">${k.move}</div>
        `;

        // 랭킹 클릭하면 selectKeyword 실행 (드롭다운도 같이 동기화)
        row.addEventListener("click", () => selectKeyword(k.keyword));
        rankListEl.appendChild(row);
    });
}

function renderSummary(keyword) {
    if (!summaryKeywordEl || !summaryListEl) return;

    summaryKeywordEl.textContent = keyword;
    summaryListEl.innerHTML = "";

    const items = SUMMARY_MAP[keyword] || SUMMARY_MAP["주식"];
    items.forEach((txt) => {
        const li = document.createElement("li");
        li.textContent = txt;
        summaryListEl.appendChild(li);
    });
}

function selectKeyword(keyword) {
    renderRanking(keyword);
    renderSummary(keyword);
    dropdownApi?.setValue(keyword); // 랭킹 클릭 시 드롭다운도 변경
    window.ts2Api?.setKeyword(keyword);
    window.ts3Api?.setKeyword(keyword);
}
window.selectKeyword = selectKeyword;

// ===== 커스텀 드롭다운 =====
(function () {
    const root = document.getElementById('keywordDropdown');
    if (!root) return;

    const btn = root.querySelector('.cselect__btn');
    const valueEl = root.querySelector('.cselect__value');
    const hidden = root.querySelector('input[type="hidden"]');
    const options = Array.from(root.querySelectorAll('.cselect__opt'));

    if (!btn || !list || !valueEl || options.length === 0) return;

    function close() {
        root.classList.remove('is-open');
        btn.setAttribute('aria-expanded', 'false');
    }
    function toggle() {
        root.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', root.classList.contains('is-open') ? 'true' : 'false');
    }

    function applyValue(v) {
        options.forEach(o => {
            const isMatch = (o.dataset.value ?? o.textContent.trim()) === v;
            o.classList.toggle('is-selected', isMatch);
            if (isMatch) o.setAttribute('aria-selected', 'true');
            else o.removeAttribute('aria-selected');
        });

        valueEl.textContent = v;
        if (hidden) hidden.value = v;

        const idx = options.findIndex(o => (o.dataset.value ?? o.textContent.trim()) === v);
        if (idx >= 0) activeIndex = idx;
    }

    options.forEach(opt => {
        opt.addEventListener('click', () => {
            const v = opt.dataset.value ?? opt.textContent.trim();
            applyValue(v);
            close();
            selectKeyword(v); // 드롭다운 선택 -> 랭킹/요약 변경
        });
    });

    btn.addEventListener('click', (e) => {
        e.preventDefault();
        toggle();
    });

    document.addEventListener('click', (e) => {
        if (!root.contains(e.target)) close();
    });

    dropdownApi = {
        setValue(v) { applyValue(v); }
    };

    // 드롭다운 초기값 반영만 해둠 (렌더는 아래 boot에서 무조건 1회)
    const initial = (hidden?.value || valueEl.textContent || "주식").trim();
    applyValue(initial);
})();

// 초기 렌더는 무조건 1번 실행 (TOP10 첫 로드부터 보이게)
const bootKeyword =
    (document.querySelector('#keywordDropdown input[type="hidden"]')?.value ||
        document.querySelector('#keywordDropdown .cselect__value')?.textContent ||
        '주식').trim();

selectKeyword(bootKeyword);

// ===== 증감률/변동 안내 툴팁 (각 has-tip 안에서만 토글) =====
(function () {
    const wraps = document.querySelectorAll('.has-tip');
    if (!wraps.length) return;

    function closeAll() {
        wraps.forEach(w => {
            const btn = w.querySelector('.info-btn');
            const tip = w.querySelector('.tooltip');
            if (!btn || !tip) return;
            tip.hidden = true;
            btn.setAttribute('aria-expanded', 'false');
        });
    }

    wraps.forEach(w => {
        const btn = w.querySelector('.info-btn');
        const tip = w.querySelector('.tooltip');
        if (!btn || !tip) return;

        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const willOpen = tip.hidden; // true면 열기
            closeAll();
            tip.hidden = !willOpen;
            btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
        });

        tip.addEventListener('click', (e) => e.stopPropagation());
    });

    document.addEventListener('click', closeAll);
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') closeAll();
    });
})();

(function TS2() {
    function toDateNum(iso) { return Number(String(iso || "").replaceAll("-", "")) || 0; }

    function isInRange(iso, startISO, endISO) {
        const n = toDateNum(iso);
        let s = toDateNum(startISO);
        let e = toDateNum(endISO);
        if (!n || !s || !e) return true;

        // ✅ start > end면 스왑
        if (s > e) [s, e] = [e, s];

        return s <= n && n <= e;
    }

    const allData = [
        /* ===================== 주식 ===================== */
        { keyword: '주식', sent: 'pos', source: '매일경제', flag: '정상', date: '2025-12-18', popular: 46, title: '코스피 반등…외국인 매수세 유입', desc: '대형주 중심으로 매수세가 유입되며 지수가 반등했습니다. 환율 안정과 실적 기대가 투자심리를 지지했다는 분석입니다…' },
        { keyword: '주식', sent: 'pos', source: '머니투데이', flag: '정상', date: '2025-12-16', popular: 31, title: '배당 확대 기대…가치주 재평가 움직임', desc: '연말 배당 시즌을 앞두고 가치주로 수급이 이동하는 모습입니다. 일부 종목은 자사주 매입 기대도 반영됐습니다…' },
        { keyword: '주식', sent: 'pos', source: '매일경제', flag: '정상', date: '2025-12-18', popular: 46, title: '코스피 반등…외국인 매수세 유입', desc: '대형주 중심으로 매수세가 유입되며 지수가 반등했습니다. 환율 안정과 실적 기대가 투자심리를 지지했다는 분석입니다…' },
        { keyword: '주식', sent: 'pos', source: '머니투데이', flag: '정상', date: '2025-12-16', popular: 31, title: '배당 확대 기대…가치주 재평가 움직임', desc: '연말 배당 시즌을 앞두고 가치주로 수급이 이동하는 모습입니다. 일부 종목은 자사주 매입 기대도 반영됐습니다…' },
        { keyword: '주식', sent: 'pos', source: '매일경제', flag: '정상', date: '2025-12-18', popular: 46, title: '코스피 반등…외국인 매수세 유입', desc: '대형주 중심으로 매수세가 유입되며 지수가 반등했습니다. 환율 안정과 실적 기대가 투자심리를 지지했다는 분석입니다…' },
        { keyword: '주식', sent: 'pos', source: '머니투데이', flag: '정상', date: '2025-12-16', popular: 31, title: '배당 확대 기대…가치주 재평가 움직임', desc: '연말 배당 시즌을 앞두고 가치주로 수급이 이동하는 모습입니다. 일부 종목은 자사주 매입 기대도 반영됐습니다…' },
        { keyword: '주식', sent: 'neu', source: '연합뉴스', flag: '정상', date: '2025-12-18', popular: 28, title: '증시 혼조…업종별 차별화 지속', desc: '지수는 방향성을 찾지 못한 채 업종별로 등락이 엇갈렸습니다. 금리 전망과 수급 변화가 변수로 거론됩니다…' },
        { keyword: '주식', sent: 'neu', source: '서울경제', flag: '정상', date: '2025-12-15', popular: 17, title: '기관 수급 관망…거래대금 감소', desc: '변동성 확대 우려로 기관 수급이 관망세를 보이며 거래대금이 줄었습니다. 이벤트 대기 심리가 강해졌습니다…' },
        { keyword: '주식', sent: 'neg', source: '한국경제', flag: '의심', date: '2025-12-14', popular: 34, title: '급등주 경고…단기 과열 신호', desc: '일부 테마주가 단기간 급등하며 과열 논란이 커지고 있습니다. 변동성 관리가 필요하다는 경고가 나옵니다…' },
        { keyword: '주식', sent: 'neg', source: '조선비즈', flag: '위험', date: '2025-12-12', popular: 22, title: '대외 변수 부담…투심 위축', desc: '글로벌 금리·환율 변수에 대한 우려가 커지며 투자심리가 위축되는 모습입니다. 방어주 선호가 강화됐습니다…' },

        /* ===================== 부동산 ===================== */
        { keyword: '부동산', sent: 'pos', source: '한국경제', flag: '정상', date: '2025-12-18', popular: 39, title: '규제 완화 기대…매수 문의 소폭 증가', desc: '일부 지역에서 규제 완화 기대감이 확산되며 매수 문의가 늘었습니다. 다만 실제 거래로 이어지는지는 지켜봐야 합니다…' },
        { keyword: '부동산', sent: 'pos', source: '이데일리', flag: '정상', date: '2025-12-16', popular: 24, title: '전세 시장 안정…가격 상승세 둔화', desc: '전세 매물 증가와 수요 분산으로 가격 상승세가 둔화됐습니다. 지역별로는 차별화가 이어졌습니다…' },
        { keyword: '부동산', sent: 'neu', source: '연합뉴스', flag: '정상', date: '2025-12-17', popular: 21, title: '거래량 정체…관망세 지속', desc: '금리와 정책 불확실성이 겹치며 시장은 관망세가 이어지고 있습니다. 단기 반등 재료는 제한적이라는 평가입니다…' },
        { keyword: '부동산', sent: 'neu', source: '서울경제', flag: '정상', date: '2025-12-14', popular: 16, title: '분양 시장, 청약 경쟁률 지역별 엇갈려', desc: '대도시는 경쟁률이 견조한 반면 외곽은 미달이 발생했습니다. 수요 양극화가 뚜렷해졌다는 분석입니다…' },
        { keyword: '부동산', sent: 'neg', source: '매일경제', flag: '의심', date: '2025-12-15', popular: 29, title: '대출 규제 여파…매수심리 위축', desc: '대출 규제 강화가 체감되며 실수요자의 매수 결정이 지연되고 있습니다. 거래절벽 우려가 재점화됐습니다…' },
        { keyword: '부동산', sent: 'neg', source: '조선비즈', flag: '위험', date: '2025-12-12', popular: 26, title: '미분양 부담 확대…건설사 재무 우려', desc: '일부 지역에서 미분양이 늘며 건설사 유동성에 대한 우려가 제기됩니다. 자금 조달 비용도 부담으로 작용합니다…' },

        /* ===================== 고용 ===================== */
        { keyword: '고용', sent: 'pos', source: '연합뉴스', flag: '정상', date: '2025-12-18', popular: 33, title: '취업자 증가…서비스업 채용 확대', desc: '서비스업을 중심으로 채용이 늘며 고용 지표가 개선됐습니다. 다만 질적 개선 여부는 추가 확인이 필요합니다…' },
        { keyword: '고용', sent: 'pos', source: '서울경제', flag: '정상', date: '2025-12-16', popular: 19, title: '청년 고용 지원 확대…정책 효과 기대', desc: '청년층을 겨냥한 고용 지원이 확대되며 고용 개선 기대가 커지고 있습니다. 기업 인센티브 강화도 검토됩니다…' },
        { keyword: '고용', sent: 'neu', source: '한국경제', flag: '정상', date: '2025-12-17', popular: 18, title: '임금 상승세 유지…업종별 격차 지속', desc: '임금 상승세는 이어졌지만 업종별로 격차가 확대되는 모습입니다. 기업은 인건비 부담을 우려하고 있습니다…' },
        { keyword: '고용', sent: 'neu', source: '머니투데이', flag: '정상', date: '2025-12-13', popular: 12, title: '비정규직 비중 변동…통계 해석 엇갈려', desc: '지표 변동 폭은 크지 않지만 표본과 계절요인에 대한 해석이 엇갈립니다. 추세 확인이 필요합니다…' },
        { keyword: '고용', sent: 'neg', source: '매일경제', flag: '의심', date: '2025-12-14', popular: 23, title: '제조업 고용 둔화…수주 감소 영향', desc: '수주 감소와 투자 축소로 제조업 고용이 둔화됐습니다. 구조조정 우려까지 거론되며 경계감이 커졌습니다…' },
        { keyword: '고용', sent: 'neg', source: '조선비즈', flag: '위험', date: '2025-12-12', popular: 20, title: '체감실업 증가…구직기간 장기화', desc: '체감실업과 장기 구직 비중이 늘고 있다는 지적이 나옵니다. 고용의 질을 둘러싼 논의가 확대되고 있습니다…' },

        /* ===================== 경기침체 ===================== */
        { keyword: '경기침체', sent: 'pos', source: '이데일리', flag: '정상', date: '2025-12-18', popular: 22, title: '연착륙 기대…선행지표 일부 개선', desc: '일부 선행지표가 개선되며 연착륙 기대가 확산됐습니다. 다만 소비 회복은 아직 제한적이라는 평가입니다…' },
        { keyword: '경기침체', sent: 'pos', source: '머니투데이', flag: '정상', date: '2025-12-15', popular: 15, title: '재정 집행 속도↑…경기 하방 완충 기대', desc: '재정 집행이 빨라지며 단기 경기 하방을 일부 완충할 수 있다는 기대가 나옵니다. 효과는 시차가 있습니다…' },
        { keyword: '경기침체', sent: 'neu', source: '연합뉴스', flag: '정상', date: '2025-12-17', popular: 19, title: '경기 전망 혼재…민간·공공 지표 엇갈려', desc: '민간 지표는 둔화 신호가, 공공 지표는 방어 신호가 나타나며 전망이 엇갈립니다. 정책 판단이 어려워졌습니다…' },
        { keyword: '경기침체', sent: 'neu', source: '서울경제', flag: '정상', date: '2025-12-13', popular: 11, title: '소비 회복 지연…서비스 물가 변수', desc: '소비 회복이 더디고 서비스 물가가 변수로 남아있습니다. 금리 경로에 따라 체감 경기에도 영향이 예상됩니다…' },
        { keyword: '경기침체', sent: 'neg', source: '한국경제', flag: '의심', date: '2025-12-14', popular: 27, title: '침체 우려 재점화…기업 투자 보수화', desc: '수요 둔화 우려가 커지며 기업 투자 계획이 보수적으로 바뀌고 있습니다. 설비투자 감소가 부담으로 거론됩니다…' },
        { keyword: '경기침체', sent: 'neg', source: '조선비즈', flag: '위험', date: '2025-12-12', popular: 30, title: '글로벌 둔화 충격…수출 의존도 리스크', desc: '글로벌 수요 둔화가 수출에 영향을 주며 하방 리스크가 확대됐습니다. 업종별로 타격 정도는 다를 수 있습니다…' },

        /* ===================== 유가 ===================== */
        { keyword: '유가', sent: 'pos', source: '연합뉴스', flag: '정상', date: '2025-12-18', popular: 26, title: '유가 안정세…물가 부담 완화 기대', desc: '국제유가가 안정세를 보이며 물가 부담 완화 기대가 커졌습니다. 운송비·원가 압력이 다소 줄 수 있습니다…' },
        { keyword: '유가', sent: 'pos', source: '서울경제', flag: '정상', date: '2025-12-16', popular: 14, title: '정제마진 개선…정유업종 실적 기대', desc: '정제마진이 개선되며 정유업종 실적 기대가 확대됐습니다. 다만 수요 불확실성은 변수로 남아있습니다…' },
        { keyword: '유가', sent: 'neu', source: '매일경제', flag: '정상', date: '2025-12-17', popular: 18, title: '산유국 회의 앞두고 관망…유가 횡보', desc: '산유국 회의를 앞두고 유가는 좁은 범위에서 횡보했습니다. 공급 조절 메시지에 시장이 민감하게 반응하고 있습니다…' },
        { keyword: '유가', sent: 'neu', source: '머니투데이', flag: '정상', date: '2025-12-13', popular: 10, title: '원유 재고 발표…단기 변동성 확대', desc: '재고 발표 이후 단기 변동성이 확대됐습니다. 환율과 함께 에너지 수입단가에 영향을 주는 요인입니다…' },
        { keyword: '유가', sent: 'neg', source: '한국경제', flag: '의심', date: '2025-12-14', popular: 25, title: '중동 리스크 부각…유가 급등 경계', desc: '지정학 리스크가 부각되며 유가 급등 가능성에 대한 경계가 커졌습니다. 항공·운송 업종 부담이 커질 수 있습니다…' },
        { keyword: '유가', sent: 'neg', source: '조선비즈', flag: '위험', date: '2025-12-12', popular: 21, title: '연료비 부담 재확대…기업 원가 압박', desc: '유가 반등 시 기업 원가 압박이 재확대될 수 있다는 우려가 나옵니다. 가격 전가 여부가 업종별로 갈립니다…' },

        /* ===================== 반도체 ===================== */
        { keyword: '반도체', sent: 'pos', source: '한국경제', flag: '정상', date: '2025-12-18', popular: 52, title: '메모리 가격 반등 조짐…업황 개선 기대', desc: '메모리 가격이 반등 조짐을 보이며 업황 개선 기대가 커지고 있습니다. 재고 조정이 마무리 단계라는 평가도 나옵니다…' },
        { keyword: '반도체', sent: 'pos', source: '매일경제', flag: '정상', date: '2025-12-16', popular: 37, title: 'AI 서버 수요 확대…고부가 제품 비중↑', desc: 'AI 서버 수요가 확대되며 고부가 제품 비중이 늘고 있습니다. 설비 투자 재개 신호도 일부 포착됐습니다…' },
        { keyword: '반도체', sent: 'neu', source: '연합뉴스', flag: '정상', date: '2025-12-17', popular: 24, title: '반도체 수출 회복세…지역별 편차', desc: '수출은 회복세를 보였지만 지역별 편차가 이어졌습니다. 환율·물류 비용 영향도 함께 고려해야 합니다…' },
        { keyword: '반도체', sent: 'neu', source: '이데일리', flag: '정상', date: '2025-12-13', popular: 13, title: '파운드리 경쟁 심화…가격·수율 이슈', desc: '파운드리 경쟁이 심화되며 가격과 수율 이슈가 부각됩니다. 고객사 다변화가 관건이라는 분석입니다…' },
        { keyword: '반도체', sent: 'neg', source: '조선비즈', flag: '의심', date: '2025-12-14', popular: 29, title: '규제 변수 상존…공급망 불확실성', desc: '대외 규제와 공급망 변수로 불확실성이 남아있습니다. 단기 수요 반등에도 변동성 확대 가능성이 거론됩니다…' },
        { keyword: '반도체', sent: 'neg', source: '서울경제', flag: '위험', date: '2025-12-12', popular: 22, title: '설비투자 지연…회복 시점 논쟁', desc: '설비투자 지연으로 회복 시점을 두고 논쟁이 이어지고 있습니다. 소비 전자 수요 둔화도 부담으로 지적됩니다…' },

        /* ===================== 수출 ===================== */
        { keyword: '수출', sent: 'pos', source: '연합뉴스', flag: '정상', date: '2025-12-18', popular: 28, title: '수출 증가 전환…주력 품목 견조', desc: '주력 품목을 중심으로 수출이 증가 전환했습니다. 환율 효과와 재고 조정 마무리도 긍정 요인으로 거론됩니다…' },
        { keyword: '수출', sent: 'pos', source: '서울경제', flag: '정상', date: '2025-12-16', popular: 16, title: '신흥국 수요 회복…수출 다변화 기대', desc: '신흥국 수요 회복이 관측되며 수출 다변화 기대가 커지고 있습니다. 지역 분산이 리스크 완화에 도움될 수 있습니다…' },
        { keyword: '수출', sent: 'neu', source: '머니투데이', flag: '정상', date: '2025-12-17', popular: 14, title: '물류비 안정…마진 개선 여지', desc: '물류비가 안정되며 수출기업 마진 개선 여지가 생겼습니다. 다만 원자재 가격 변동은 계속 체크가 필요합니다…' },
        { keyword: '수출', sent: 'neu', source: '이데일리', flag: '정상', date: '2025-12-13', popular: 9, title: '환율 영향 혼재…업종별 유불리', desc: '환율 변동이 업종별로 유불리를 갈랐습니다. 단가 인상 여력과 계약 구조에 따라 체감이 다릅니다…' },
        { keyword: '수출', sent: 'neg', source: '한국경제', flag: '의심', date: '2025-12-14', popular: 23, title: '주요국 수요 둔화…수출 모멘텀 약화 우려', desc: '주요국 수요 둔화로 수출 모멘텀이 약화될 수 있다는 우려가 나옵니다. 재고 조정 지연 가능성도 변수입니다…' },
        { keyword: '수출', sent: 'neg', source: '조선비즈', flag: '위험', date: '2025-12-12', popular: 20, title: '무역분쟁 재점화 가능성…통상 리스크 확대', desc: '통상 리스크가 확대될 수 있다는 전망이 나오며 기업 대응이 중요해졌습니다. 공급망 재편 비용도 부담입니다…' },

        /* ===================== 노동 ===================== */
        { keyword: '노동', sent: 'pos', source: '서울경제', flag: '정상', date: '2025-12-18', popular: 17, title: '노사 협의 진전…파업 리스크 완화', desc: '노사 협의가 진전되며 파업 리스크가 완화되는 분위기입니다. 생산 차질 우려가 일부 해소됐습니다…' },
        { keyword: '노동', sent: 'pos', source: '연합뉴스', flag: '정상', date: '2025-12-16', popular: 12, title: '근로시간 유연화 논의…현장 수용성 확대', desc: '현장 수요를 반영한 근로시간 유연화 논의가 이어지고 있습니다. 제도 설계에 따라 효과가 달라질 수 있습니다…' },
        { keyword: '노동', sent: 'neu', source: '머니투데이', flag: '정상', date: '2025-12-17', popular: 11, title: '최저임금 이슈 재부각…업계 의견 분분', desc: '최저임금 관련 논의가 재부각되며 업계 의견이 분분합니다. 자영업 부담과 소득 개선 효과를 함께 봐야 합니다…' },
        { keyword: '노동', sent: 'neu', source: '이데일리', flag: '정상', date: '2025-12-13', popular: 8, title: '노동시장 미스매치…구인·구직 격차', desc: '구인·구직 미스매치가 지속되며 직무 전환과 재교육 필요성이 커지고 있습니다. 지역 격차도 과제로 남습니다…' },
        { keyword: '노동', sent: 'neg', source: '매일경제', flag: '의심', date: '2025-12-14', popular: 18, title: '임단협 난항…생산차질 우려', desc: '임단협이 난항을 겪으며 생산 차질 우려가 커지고 있습니다. 협상 장기화 시 비용 부담이 확대될 수 있습니다…' },
        { keyword: '노동', sent: 'neg', source: '조선비즈', flag: '위험', date: '2025-12-12', popular: 16, title: '노사 갈등 확산…투자심리 위축 가능성', desc: '노사 갈등이 확산될 경우 투자심리가 위축될 수 있다는 우려가 나옵니다. 공급 일정 불확실성이 부담입니다…' },

        /* ===================== 경제 ===================== */
        { keyword: '경제', sent: 'pos', source: '한국경제', flag: '정상', date: '2025-12-18', popular: 25, title: '물가 둔화 신호…실질소득 개선 기대', desc: '물가 상승 압력이 완화되며 실질소득 개선 기대가 커졌습니다. 소비 회복으로 이어질지 주목됩니다…' },
        { keyword: '경제', sent: 'pos', source: '연합뉴스', flag: '정상', date: '2025-12-15', popular: 14, title: '경기 부양책 논의…시장 안정 기대', desc: '정책 당국의 경기 대응 논의가 이어지며 시장 안정 기대가 확산됐습니다. 다만 재정 여력 논쟁도 존재합니다…' },
        { keyword: '경제', sent: 'neu', source: '이데일리', flag: '정상', date: '2025-12-17', popular: 13, title: '성장률 전망 유지…불확실성은 상존', desc: '성장률 전망은 유지됐지만 대외 변수 불확실성은 여전합니다. 수출·소비 흐름이 핵심 변수로 꼽힙니다…' },
        { keyword: '경제', sent: 'neu', source: '서울경제', flag: '정상', date: '2025-12-13', popular: 9, title: '가계부채 관리…정책 기조 유지', desc: '가계부채 관리 기조가 이어지는 가운데 금융권 규제가 지속될 전망입니다. 시장 영향은 점진적으로 나타날 수 있습니다…' },
        { keyword: '경제', sent: 'neg', source: '매일경제', flag: '의심', date: '2025-12-14', popular: 19, title: '내수 부진 장기화…자영업 부담', desc: '내수 부진이 장기화되며 자영업과 소상공인 부담이 커졌습니다. 비용 상승과 매출 감소가 동시에 나타났습니다…' },
        { keyword: '경제', sent: 'neg', source: '조선비즈', flag: '위험', date: '2025-12-12', popular: 18, title: '금리 고착 우려…이자 부담 확대', desc: '금리 고착 우려가 커지며 가계·기업 이자 부담이 확대될 수 있다는 전망입니다. 투자 위축 가능성도 거론됩니다…' },

        /* ===================== 현금 ===================== */
        { keyword: '현금', sent: 'pos', source: '머니투데이', flag: '정상', date: '2025-12-18', popular: 20, title: '현금성 자산 선호↑…안전자산 수요 확대', desc: '변동성 장세에서 현금성 자산 선호가 확대되는 흐름입니다. 단기 금리 상품으로 자금 이동이 관측됩니다…' },
        { keyword: '현금', sent: 'pos', source: '서울경제', flag: '정상', date: '2025-12-16', popular: 12, title: '기업 현금흐름 개선…유동성 우려 완화', desc: '일부 업종에서 현금흐름이 개선되며 유동성 우려가 완화됐습니다. 비용 절감과 재고 관리가 배경으로 꼽힙니다…' },
        { keyword: '현금', sent: 'neu', source: '연합뉴스', flag: '정상', date: '2025-12-17', popular: 10, title: '현금 보유 전략 확산…투자 타이밍 관망', desc: '투자 타이밍을 기다리며 현금 보유 전략이 확산되는 모습입니다. 변동성 지표가 안정되면 재진입이 예상됩니다…' },
        { keyword: '현금', sent: 'neu', source: '이데일리', flag: '정상', date: '2025-12-13', popular: 7, title: '가계 저축률 변동…소비 성향 변화', desc: '가계 저축률이 소폭 변동하며 소비 성향 변화가 관측됩니다. 금리 수준과 고용 흐름이 영향을 줍니다…' },
        { keyword: '현금', sent: 'neg', source: '한국경제', flag: '의심', date: '2025-12-14', popular: 14, title: '현금 부족 기업 증가…단기 차입 확대', desc: '일부 기업에서 운영자금 확보를 위해 단기 차입을 늘리는 움직임이 나타났습니다. 금리 부담이 리스크입니다…' },
        { keyword: '현금', sent: 'neg', source: '조선비즈', flag: '위험', date: '2025-12-12', popular: 12, title: '유동성 경색 우려…신용 스프레드 확대', desc: '시장 변동성 확대로 신용 스프레드가 확대되며 유동성 경색 우려가 제기됩니다. 차환 리스크 점검이 필요합니다…' },
    ];


    let currentKeyword = '주식';
    const sortMode = { pos: 'recent', neu: 'recent', neg: 'recent' };

    const els = {
        pos: document.getElementById('ts2ListPos'),
        neu: document.getElementById('ts2ListNeu'),
        neg: document.getElementById('ts2ListNeg'),
    };

    function parseDate(s) { return new Date(s + 'T00:00:00'); }

    function sortItems(items, mode) {
        const arr = [...items];

        if (mode === 'recent') arr.sort((a, b) => parseDate(b.date) - parseDate(a.date));
        if (mode === 'old') arr.sort((a, b) => parseDate(a.date) - parseDate(b.date));
        if (mode === 'popular') arr.sort((a, b) => (b.popular || 0) - (a.popular || 0));

        if (mode === 'trust_high') {
            arr.sort((a, b) =>
                (trustScore(b.flag) - trustScore(a.flag)) ||
                (parseDate(b.date) - parseDate(a.date))
            );
        }

        if (mode === 'trust_low') {
            arr.sort((a, b) =>
                (trustScore(a.flag) - trustScore(b.flag)) ||
                (parseDate(b.date) - parseDate(a.date))
            );
        }

        return arr;
    }

    function cardHTML(it) {
        return `
      <article class="ts2-card" tabindex="0">
        <div class="ts2-card__top">
          <span class="ts2-src">${it.source}</span>
          <span class="ts2-mini">${it.flag}</span>
        </div>
        <h4 class="ts2-title">${it.title}</h4>
        <p class="ts2-desc">${it.desc}</p>
        <div class="ts2-meta">
          <span class="ts2-chip ts2-chip--date">${it.date}</span>
          <button type="button" class="ts2-chip ts2-chip--btn">기사 요약</button>
        </div>
      </article>
    `;
    }

    function getDataBySent(sent) {
        const { start, end } = window.getAppRange?.() || {};
        return allData.filter(d =>
            d.keyword === currentKeyword &&
            d.sent === sent &&
            isInRange(d.date, start, end)
        );
    }

    function px(v) {
        const n = parseFloat(v);
        return Number.isFinite(n) ? n : 0;
    }

    function applyFourCardScroll(listEl, visibleCount = 5) {
        if (!listEl) return;

        const cards = Array.from(listEl.querySelectorAll('.ts2-card'));
        const colbody = listEl.closest('.ts2-colbody');
        const pager = colbody?.querySelector('.ts2-pager');

        // 4개 미만이면 스크롤/높이 동기화 해제
        if (cards.length < visibleCount) {
            listEl.classList.remove('is-vscroll');
            listEl.style.removeProperty('--ts2-list-max');
            if (colbody) colbody.style.height = '';
            return;
        }

        // 현재(열린 카드 포함) 상태의 "앞 5개" 높이 계산
        const cs = getComputedStyle(listEl);
        const gap = px(cs.rowGap || cs.gap); // flex gap
        const pt = px(cs.paddingTop);
        const pb = px(cs.paddingBottom);

        let h = pt + pb;
        for (let i = 0; i < visibleCount; i++) {
            h += cards[i].offsetHeight;
            if (i < visibleCount - 1) h += gap;
        }
        h = Math.ceil(h);

        // list에 적용 (CSS 변수로 max-height 제어)
        listEl.classList.add('is-vscroll');
        listEl.style.setProperty('--ts2-list-max', `${h}px`);

        // colbody 길이도 list(4개 높이) + pager 높이만큼 딱 맞춤
        if (colbody) {
            const pagerH = pager ? pager.offsetHeight : 0;
            const bt = px(getComputedStyle(colbody).borderTopWidth);
            colbody.style.height = `${h + pagerH + bt}px`;
        }
    }


    function render(sent) {
        const target = els[sent];
        if (!target) return;

        const items = sortItems(getDataBySent(sent), sortMode[sent]);
        target.innerHTML = items.map(cardHTML).join('');

        const first = target.querySelector('.ts2-card');
        if (first) first.classList.add('is-open');

        requestAnimationFrame(() => applyFourCardScroll(target, 5));

        target.querySelectorAll('.ts2-card').forEach(card => {
            card.addEventListener('click', () => {
                target.querySelectorAll('.ts2-card').forEach(c => c.classList.remove('is-open'));
                card.classList.add('is-open');

                requestAnimationFrame(() => applyFourCardScroll(target, 5));
            });
        });

        target.querySelectorAll('.ts2-chip--btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                alert('기사 요약(샘플)');
            });
        });
    }

    function renderAll() {
        render('pos'); render('neu'); render('neg');
    }

    // 외부에서 키워드 바꿀 수 있게
    function setKeyword(keyword) {
        currentKeyword = keyword;
        renderAll();
    }

    function trustScore(flag) {
        // 정상 > 의심 > 위험
        if (flag === '정상') return 2;
        if (flag === '의심') return 1;
        if (flag === '위험') return 0;
        return 0;
    }

    // cselect 초기화 함수
    function initCSelect(root, onPick) {
        const btn = root.querySelector('.cselect__btn');
        const valueEl = root.querySelector('.cselect__value');
        const opts = Array.from(root.querySelectorAll('.cselect__opt'));
        if (!btn || !valueEl || !opts.length) return;

        function close() {
            root.classList.remove('is-open');
            btn.setAttribute('aria-expanded', 'false');
        }
        function toggle() {
            root.classList.toggle('is-open');
            btn.setAttribute('aria-expanded', root.classList.contains('is-open') ? 'true' : 'false');
        }

        function applyValue(v) {
            opts.forEach(o => {
                const isMatch = (o.dataset.value ?? o.textContent.trim()) === v;
                o.classList.toggle('is-selected', isMatch);
                if (isMatch) o.setAttribute('aria-selected', 'true');
                else o.removeAttribute('aria-selected');
            });

            const picked = opts.find(o => (o.dataset.value ?? o.textContent.trim()) === v);
            valueEl.textContent = picked ? picked.textContent.trim() : v;
        }

        // 초기 선택값
        const initOpt = opts.find(o => o.classList.contains('is-selected')) || opts[0];
        const initVal = initOpt.dataset.value ?? initOpt.textContent.trim();
        applyValue(initVal);

        btn.addEventListener('click', (e) => {
            e.preventDefault();
            toggle();
        });

        opts.forEach(opt => {
            opt.addEventListener('click', () => {
                const v = opt.dataset.value ?? opt.textContent.trim();
                applyValue(v);
                close();
                onPick?.(v);
            });
        });

        document.addEventListener('click', (e) => {
            if (!root.contains(e.target)) close();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape') close();
        });

        return { setValue: (v) => applyValue(v) };
    }

    // TS2 정렬 드롭다운 3개(pos/neu/neg) 연결
    document.querySelectorAll('.ts2-sort[data-sort]').forEach(root => {
        const sent = root.getAttribute('data-sort'); // pos/neu/neg
        initCSelect(root, (mode) => {
            sortMode[sent] = mode;
            render(sent);
        });
    });


    // 전역 API로 노출
    window.ts2Api = { setKeyword };

    // 초기 렌더
    renderAll();

    document.addEventListener("app:rangechange", () => {
        renderAll();
    });
})();

// main3
(function TS3() {

    function daysInMonth(y, m) {
        return new Date(y, m + 1, 0).getDate(); // m: 0~11
    }

    function addMonthsClamp(date, deltaMonths) {
        const d = normalize(date);
        const y = d.getFullYear();
        const m = d.getMonth();
        const day = d.getDate();

        const target = new Date(y, m + deltaMonths, 1);
        const ty = target.getFullYear();
        const tm = target.getMonth();
        const last = daysInMonth(ty, tm);

        return new Date(ty, tm, Math.min(day, last));
    }

    function addYearsClamp(date, deltaYears) {
        const d = normalize(date);
        const y = d.getFullYear() + deltaYears;
        const m = d.getMonth();
        const day = d.getDate();

        const last = daysInMonth(y, m);
        return new Date(y, m, Math.min(day, last));
    }


    function makeLabels(startISO, endISO, grain) {
        const labels = [];
        if (!startISO || !endISO) return labels;

        let s = new Date(startISO + "T00:00:00");
        let e = new Date(endISO + "T00:00:00");

        // start > end면 스왑 (사용자가 날짜를 거꾸로 잡아도 동작)
        if (s > e) [s, e] = [e, s];

        const pad2 = (n) => String(n).padStart(2, "0");
        const iso = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

        if (grain === "day") {
            for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 1)) labels.push(iso(d));
            return labels;
        }

        if (grain === "week") {
            // 주 단위: 시작일부터 7일씩
            for (let d = new Date(s); d <= e; d.setDate(d.getDate() + 7)) labels.push(iso(d));
            return labels;
        }

        if (grain === "month") {
            // 월 단위: 매월 1일
            for (let d = new Date(s.getFullYear(), s.getMonth(), 1); d <= e; d.setMonth(d.getMonth() + 1)) {
                labels.push(`${d.getFullYear()}-${pad2(d.getMonth() + 1)}`);
            }
            return labels;
        }

        if (grain === "year") {
            for (let y = s.getFullYear(); y <= e.getFullYear(); y++) labels.push(String(y));
            return labels;
        }

        return labels;
    }

    const root = document.getElementById('main3');
    if (!root) return;

    const btns = Array.from(root.querySelectorAll('.ts3-kbtn'));
    const wordTag = root.querySelector('#ts3WordTag');
    const donutTag = root.querySelector('#ts3DonutTag');
    const donutEl = root.querySelector('#ts3Donut');
    const cloudEl = root.querySelector('#ts3WordCloud');

    const canvas = document.getElementById('ts3LineCanvas');
    const placeholder = root.querySelector('.ts3-placeholder');

    // ===== 상태: 기준키워드 + (추가된)비교키워드들 =====
    let baseKeyword = '주식';
    let compareSet = new Set(); // base 제외한 비교 키워드만

    // 색상 팔레트(키워드별 라인 컬러)
    const COLOR = {
        '주식': '#0462D2',
        '부동산': '#e53935',
        '고용': '#8a97ad',
        '경기침체': '#18a567',
        '유가': '#ff9800',
        '반도체': '#7b61ff',
        '수출': '#00acc1',
        '노동': '#795548',
        '경제': '#2a4f98',
        '현금': '#607d8b',
    };
    const colorFor = (kw) => COLOR[kw] || '#0462D2';

    // ===== (샘플) 워드/감성 =====
    const WORDS = {
        '주식': ['주식', '주식시장', '인상', '물가', '정부', '정책', '대출', '연준', '경기', '부동산', '금리', '인하'],
        '부동산': ['부동산', '전세', '매매', '대출', '금리', '규제', '청약', '거래량', '분양', '전월세', '집값', '정책'],
        '고용': ['고용', '취업자', '실업률', '청년', '임금', '채용', '서비스업', '제조업', '구직', '정책', '경기', '노동'],
    };
    const SENT = {
        '주식': { pos: 40, neu: 30, neg: 30 },
        '부동산': { pos: 35, neu: 40, neg: 25 },
        '고용': { pos: 45, neu: 35, neg: 20 },
    };

    function renderCloud(keyword) {
        const list = WORDS[keyword] || WORDS['주식'];
        const main = list[0] || keyword;
        const rest = list.slice(1).slice(0, 11);

        const colors = ['#1e63ff', '#e53935', '#6a7a93', '#2a4f98', '#8a97ad'];
        const spans = [
            `<span class="ts3-w lg">${main}</span>`,
            `<span class="ts3-w lg" style="color:#1e63ff">${(list[1] || '키워드')}</span>`,
            ...rest.map((w, i) => {
                const cls = i % 3 === 0 ? 'md' : 'sm';
                const c = colors[i % colors.length];
                return `<span class="ts3-w ${cls}" style="--c:${c}">${w}</span>`;
            })
        ].join('');

        cloudEl.innerHTML = `<div class="ts3-cloud-inner">${spans}</div>`;
    }

    function renderDonut(keyword) {
        const v = SENT[keyword] || SENT['주식'];
        const total = (v.pos + v.neu + v.neg) || 1;
        const p1 = Math.round((v.pos / total) * 100);
        const p2 = Math.round((v.neu / total) * 100);
        const p3 = Math.max(0, 100 - p1 - p2);

        donutEl.style.background =
            `conic-gradient(#1e63ff 0 ${p1}%, #8a97ad ${p1}% ${p1 + p2}%, #e53935 ${p1 + p2}% 100%)`;
        donutEl.setAttribute('aria-label', `감성 비율 도넛 차트 (긍정 ${p1}%, 중립 ${p2}%, 부정 ${p3}%)`);
    }

    // ===== 기간 탭 + 날짜 범위(시작일 수동, 종료일은 어제까지만) =====
    const startDateEl = document.getElementById("startDate");
    const endDateEl = document.getElementById("endDate");

    // 날짜 유틸
    function pad2(n) { return String(n).padStart(2, "0"); }
    function toISO(d) { return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; }
    function parseISO(iso) {
        if (!iso) return null;
        const d = new Date(iso + "T00:00:00");
        return Number.isNaN(d.getTime()) ? null : d;
    }
    function normalize(d) {
        const x = new Date(d);
        x.setHours(0, 0, 0, 0);
        return x;
    }
    function addDays(d, days) {
        const x = normalize(d);
        x.setDate(x.getDate() + days);
        return x;
    }

    let __appRange = null;

    function getActiveGrain() {
        return document.querySelector(".seg-btn.is-active")?.dataset.grain || "day";
    }

    // 종료일: "미래만" 금지 (어제까지만), 사용자가 과거로 바꾸는 건 허용
    function clampEndToYesterdayISO(inputISO) {
        const yesterdayISO = toISO(addDays(new Date(), -1));
        return (!inputISO || inputISO > yesterdayISO) ? yesterdayISO : inputISO;
    }


    // (선택) 이전기간 계산: 현재 기간 길이만큼 바로 이전 구간
    function calcPrevSameLength(start, end) {
        const msDay = 24 * 60 * 60 * 1000;
        const diffDays = Math.round((end - start) / msDay); // start==end면 0
        const prevEnd = addDays(start, -1);
        const prevStart = addDays(prevEnd, -diffDays);
        return { prevStart: toISO(prevStart), prevEnd: toISO(prevEnd) };
    }

    function calcStartByGrain(grain, end) {
        // ✅ end 포함해서 "최근 N일" 느낌으로 만들려면 week는 -6 (총 7일)
        //    만약 너가 'start = end-7'을 원하면 -7로 바꿔도 됨.
        if (grain === "day") return new Date(end);
        if (grain === "week") return addDays(end, -6);

        // month/year는 "같은 날짜 기준 1개월/1년 전" (원래 네 코드 스타일)
        if (grain === "month") return addMonthsClamp(end, -1);
        if (grain === "year") return addYearsClamp(end, -1);

        return new Date(end);
    }

    // ✅ preset=true면 탭(day/week/month/year) 기준으로 start 자동 세팅
    function emitRangeChange({ preset = false } = {}) {
        const grain = getActiveGrain();

        // 1) endISO 결정: 사용자 입력 존중 + 미래만 어제까지 제한
        const yesterdayISO = toISO(addDays(new Date(), -1));
        if (endDateEl) endDateEl.max = yesterdayISO;

        const endISO = clampEndToYesterdayISO(endDateEl?.value);
        if (endDateEl) endDateEl.value = endISO;

        let end = normalize(parseISO(endISO) || addDays(new Date(), -1));

        // 2) start 결정
        let start;
        if (preset) {
            start = normalize(calcStartByGrain(grain, end));
            if (startDateEl) startDateEl.value = toISO(start);
        } else {
            start = normalize(parseISO(startDateEl?.value) || end);
        }

        // 3) start > end면 start를 end로 내림 (스왑보다 UX 깔끔)
        if (start > end) {
            start = new Date(end);
            if (startDateEl) startDateEl.value = toISO(start);
        }

        // 4) 서로 제약 걸기 (핵심!!)
        if (startDateEl) startDateEl.max = toISO(end);       // start는 end 이후 선택 불가
        if (endDateEl) endDateEl.min = toISO(start);         // end는 start 이전 선택 불가

        const prev = calcPrevSameLength(start, end);

        __appRange = {
            grain,
            start: toISO(start),
            end: toISO(end),
            prevStart: prev.prevStart,
            prevEnd: prev.prevEnd,
        };

        document.dispatchEvent(new CustomEvent("app:rangechange", { detail: __appRange }));
    }


    // 외부(TS2/TS3 등)에서 범위 읽기
    window.getAppRange = () => __appRange || {
        grain: getActiveGrain(),
        start: startDateEl?.value,
        end: endDateEl?.value,
        prevStart: null,
        prevEnd: null
    };

    // 이벤트
    startDateEl?.addEventListener("input", () => emitRangeChange({ preset: false }));
    startDateEl?.addEventListener("change", () => emitRangeChange({ preset: false }));

    endDateEl?.addEventListener("input", () => emitRangeChange({ preset: false }));
    endDateEl?.addEventListener("change", () => emitRangeChange({ preset: false }));


    // 탭 클릭: 프리셋 기간으로 시작일 자동 세팅
    segmentedBtns.forEach((btn) => {
        btn.addEventListener("click", () => {
            segmentedBtns.forEach((b) => {
                b.classList.remove("is-active");
                b.setAttribute("aria-selected", "false");
            });
            btn.classList.add("is-active");
            btn.setAttribute("aria-selected", "true");

            emitRangeChange({ preset: true }); // 핵심!!
        });
    });

    // 첫 로드도 프리셋으로 시작일 자동 세팅 + 종료일 어제 고정
    emitRangeChange({ preset: true });


    // ===== (임시) 라인차트 시계열 생성기 =====
    // TODO: 나중에 실제 API/DB에서 날짜별 언급량 배열로 교체하면 됨
    function hash32(str) {
        let h = 2166136261;
        for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    // labels(YYYY-MM-DD / YYYY-MM / YYYY) 각각에 대해 "안정적으로" 같은 값이 나오도록 생성
    function makeSeries(keyword, labels) {
        const seed = hash32(keyword);
        const base = (seed % 25) + 15; // 키워드별 기본 레벨
        const len = Math.max(1, labels.length);

        return labels.map((lab, i) => {
            const t = i / len;

            // 완만한 추세 + 파동 + 라벨 기반 노이즈(결정적)
            const drift = t * 8;
            const wave = Math.sin(t * Math.PI * 2) * 6;
            const noise = (hash32(keyword + "|" + lab) % 11) - 5;

            const v = Math.round(base + drift + wave + noise);
            return Math.max(0, v);
        });
    }

    // ===== Chart.js =====
    let chart = null;

    function buildDatasets(labels) {
        const kws = [baseKeyword, ...Array.from(compareSet)];
        return kws.map((kw) => ({
            label: kw,
            data: makeSeries(kw, labels),
            borderColor: colorFor(kw),
            backgroundColor: colorFor(kw),
            borderWidth: kw === baseKeyword ? 3 : 2,
            tension: 0.3,
            pointRadius: 2,
            pointHoverRadius: 4,
        }));
    }

    function renderLineChart() {
        if (!canvas || typeof Chart === 'undefined') return;

        const { start, end, grain } = window.getAppRange?.() || {};
        const labels = makeLabels(start, end, grain || "day");
        const datasets = buildDatasets(labels);

        if (placeholder) placeholder.style.display = 'none';
        canvas.style.display = 'block';

        const ctx = canvas.getContext('2d');

        if (!chart) {
            chart = new Chart(ctx, {
                type: 'line',
                data: { labels, datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: { display: true, position: 'top' },
                        tooltip: { enabled: true },
                    },
                    scales: {
                        x: {
                            title: { display: true, text: '기간' },
                            ticks: { maxRotation: 0 },
                        },
                        y: {
                            title: { display: true, text: '언급량' },
                            beginAtZero: true,
                        }
                    }
                }
            });
        } else {
            chart.data.labels = labels;
            chart.data.datasets = datasets;
            chart.update();
        }
    }

    // ===== 버튼 UI 동기화 (base는 고정 + 비교는 토글) =====
    function syncButtons() {
        btns.forEach(b => {
            const kw = b.dataset.keyword;
            const isBase = kw === baseKeyword;
            const isCompare = compareSet.has(kw);

            // base는 항상 active(잠금 느낌)
            b.classList.toggle('is-active', isBase || isCompare);
            b.classList.toggle('is-base', isBase);
            b.setAttribute('aria-pressed', (isBase || isCompare) ? 'true' : 'false');
        });
    }

    function setBaseKeyword(next) {
        baseKeyword = next;
        compareSet = new Set(); // 기준이 바뀌면 비교는 초기화(원하면 유지하도록 바꿀 수 있어)
        if (wordTag) wordTag.textContent = baseKeyword;
        if (donutTag) donutTag.textContent = baseKeyword;
        renderCloud(baseKeyword);
        renderDonut(baseKeyword);
        syncButtons();
        renderLineChart();
    }

    function toggleCompareKeyword(kw) {
        if (kw === baseKeyword) return; // 기준은 제거 불가

        if (compareSet.has(kw)) compareSet.delete(kw);
        else compareSet.add(kw);

        syncButtons();
        renderLineChart();
    }

    // 버튼 클릭: "추가/삭제"만 수행 (기준 변경은 드롭다운/랭킹)
    btns.forEach(b => {
        b.addEventListener('click', () => {
            const kw = b.dataset.keyword;
            toggleCompareKeyword(kw);
        });
    });

    // 외부에서(=selectKeyword) 기준 키워드 바꾸게 노출
    window.ts3Api = {
        setKeyword: setBaseKeyword,
        toggleCompareKeyword,
        getState: () => ({ baseKeyword, compare: Array.from(compareSet) })
    };

    // 초기값: 상단 드롭다운과 동기화
    const init =
        (document.querySelector('#keywordDropdown input[type="hidden"]')?.value ||
            document.querySelector('#keywordDropdown .cselect__value')?.textContent ||
            '주식').trim();

    setBaseKeyword(init);

    document.addEventListener("app:rangechange", () => {
        renderLineChart();
    });
})();