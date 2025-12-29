-- screen ID: home-1 (소개/랜딩 + 로그인/회원가입 이동)

-- (A) 특정 유저(:user_id)가 가진 권한 이름 목록을 가져오기
--     예: ['user', 'admin'] 
SELECT
  r.role_name -- roles 테이블에 있는 권한 이름(예: 'user', 'admin')
FROM user_roles ur -- user_roles(유저-권한 매핑 테이블)을 ur 이라는 별명으로 부른다
JOIN roles r -- roles(권한 마스터 테이블)을 r 이라는 별명으로 부른다
  ON r.role_id = ur.role_id   -- 매핑 테이블의 role_id와 "권한 마스터의 role_id를 연결(조인)
WHERE ur.user_id = :user_id;  

-- (B) 특정 유저(:user_id)가 admin 권한을 가지고 있는지만 확인
--     결과는 1/0 (DB에 따라 true/false처럼 취급) 로 나온다.
SELECT EXISTS ( -- EXISTS는 조건에 맞는 행이 하나라도 있으면 TRUE(1)를 반환
  SELECT 1  -- 실제 데이터가 필요 없고 존재 여부만 필요하니 1을 선택(관례라고 홤)
  FROM user_roles ur -- 유저-권한 매핑 테이블
  JOIN roles r -- 권한 마스터 테이블
    ON r.role_id = ur.role_id -- role_id로 연결
  WHERE ur.user_id = :user_id -- 검사 대상 유저
    AND r.role_name = 'admin' -- 그 유저에게 admin 역할이 있는지 조건
) AS is_admin; -- 결과 컬럼 이름을 is_admin 으로 붙여서 받기 좋게 만든다

-- ----------------------------------------------------------------------------------------------

-- screen ID: login (로그인, 오류횟수, 24시간 락)
-- 1) 로그인 시도 전: 유저 존재 + 비밀번호 해시 가져오기
SELECT user_id, password_hash
FROM users
WHERE user_id = :user_id;

-- 2) 24시간 락 판단용: 최근 실패 5회 기준 시각 찾기
-- UI 요구사항: 5번째 실패 시점부터 24시간 동안 잠금
-- 가장 최근 실패 5개 중에서 5번째(=가장 오래된 것)의 시간을 구하면 끝.
-- 최근 실패 5개 중 '5번째 실패 시각' (없으면 NULL)
SELECT
  t.create_at AS fifth_fail_at -- 최종 결과: 5번째 실패 시각을 fifth_fail_at 이라는 이름으로 반환
FROM (
  -- (서브쿼리) 실패 기록을 최신순으로 최대 5개만 뽑는다
  SELECT
    create_at -- 실패한 시각만 필요하니 create_at만 선택
  FROM login_log
  WHERE user_id = :user_id -- 특정 유저의 로그만 대상으로
    AND result = 'FAIL' -- 실패한 기록만 대상으로
  ORDER BY create_at desc -- 최신 실패가 위로 오게(내림차순)
  LIMIT 5 -- 최근 실패 5개까지만 자른다
) t  -- 서브쿼리 결과를 t 라는 임시 테이블처럼 사용
ORDER BY t.create_at asc -- 그 5개를 이번엔 오래된 순으로 정렬
LIMIT 1; -- 그중 가장 오래된 1개 = 최근 5개 중 5번째 실패

-- 서버 로직 예시:
-- fifth_fail_at이 NULL이면 → 아직 5회 미만 실패 → 로그인 시도 허용
-- 값이 있으면 → NOW() < fifth_fail_at + INTERVAL 24 HOUR 인지 검사 → 잠금 여부 결정

-- 3) 로그인 시도 결과를 login_log에 기록 (성공/실패 공통)
-- 목적:
--   사용자가 로그인 시도할 때마다 성공/실패/잠금 같은 결과를 로그로 남겨서
--   - 24시간 내 실패 횟수 계산
--   - 보안/감사(언제 몇 번 실패했는지 추적)에 활용한다.
INSERT INTO login_log (user_id, result, create_at)
VALUES (
  :user_id, -- 서버에서 바인딩: 지금 로그인 시도한 아이디
  :result, -- 서버에서 바인딩: 'SUCCESS' / 'FAIL' / (선택) 'LOCKED' 같은 문자열로 통일 추천
  CURRENT_TIMESTAMP    -- 현재 시각(로그 찍는 시각)
);
-- 같은 의미(더 깔끔)
INSERT INTO login_log (user_id, result)
VALUES (:user_id, :result);

-- 4) 화면에 로그인 오류 횟수(최근 24시간 FAIL 횟수) 보여주기
-- 목적:
--   UI에 현재 24시간 내 실패 횟수를 표시하고,
--   5회 이상이면 잠금/차단 로직에 활용한다.
SELECT COUNT(*) AS fail_count_24h
FROM login_log
WHERE user_id = :user_id
  AND result = 'FAIL'                       -- 실패만 카운트
  AND create_at >= (NOW() - INTERVAL 24 HOUR);  -- 최근 24시간 범위만

-- 5) 로그인 성공 시, 유저 기본정보 + 권한(role)까지 같이 가져오기
-- 목적:
--   - 상단 메뉴(관리자 탭 노출 여부) 결정
--   - 세션/토큰에 role을 넣어서 이후 접근제어에 사용
SELECT
  u.user_id,
  r.role_name
FROM users u
LEFT JOIN user_roles ur
  ON ur.user_id = u.user_id          -- 유저와 권한매핑 연결
LEFT JOIN roles r
  ON r.role_id = ur.role_id          -- 매핑된 role_id를 roles에서 이름으로 변환
WHERE u.user_id = :user_id;          -- 로그인한 유저만

-- login 화면 전체 쿼리 호출 흐름 (서버 관점)
-- 1.	(1번) users에서 password_hash 가져오기 (아이디 존재 확인 포함)
-- 2.	(2번) fifth_fail_at 계산 → NOW() < fifth_fail_at + 24시간이면 잠금 처리(로그인 차단)
-- 3.	비번 검증(서버에서 해시 비교)
-- 4.	(3번) 결과를 login_log에 INSERT
-- o	성공이면 :result='SUCCESS'
-- o	실패면 :result='FAIL'
-- o	잠금 상태에서 시도한 걸 남기고 싶으면 :result='LOCKED'
-- 5.	(4번) 다시 fail_count_24h 조회 → UI에 “오류 횟수” 표시
-- 6.	성공일 때만 (5번) role까지 조회해서 세션/메뉴 구성

-- ----------------------------------------------------------------------------------------------

-- screen ID: signup (회원가입 + 아이디 중복확인 + 가입 완료 후 로그인 이동)
-- 트랜잭션이 필요한 이유
-- users는 들어갔는데 user_roles가 실패하면 → 권한 없는 유저같은 반쪽 데이터가 생김
-- 그래서 둘 다 성공하면 COMMIT, 하나라도 실패하면 ROLLBACK으로 되돌리는 구조

-- 1) 아이디 중복확인
-- 목적:
--   회원가입 전에 이 user_id가 이미 존재하는지 빠르게 검사한다.
-- 결과:
--   - 행이 나오면(1이 반환되면) → 이미 존재(중복)
--   - 아무 행도 안 나오면 → 사용 가능

SELECT 1                -- 실제 컬럼이 필요 없고 존재 여부만 필요하니 1만 선택(관례)
FROM users
WHERE user_id = :user_id  -- 가입하려는 아이디로 검색
LIMIT 1;                 -- 하나만 찾으면 충분하니 1개만 가져온다

-- 2) 회원가입 INSERT (트랜잭션 밖 버전) —  이건 (4) 쓰면 필요 없음
-- 목적:
--   users 테이블에 회원 기본 정보를 저장한다.
-- 주의:
--   이걸 실행한 다음 (3)에서 권한 매핑이 실패하면
--   users만 생성된 "권한 없는 유저"가 생길 수 있다 → 그래서 트랜잭션이 필요

INSERT INTO users
(user_id, password_hash, email, name, birthday, phone, eco_state, gender)
VALUES
(:user_id, :password_hash, :email, :name, :birthday, :phone, :eco_state, :gender);

-- 3) 기본 권한 부여 (트랜잭션 밖 버전) — ⚠️ 이 역시 (5) 쓰면 필요 없음
-- 3-A) 'user' 권한의 role_id 조회
-- 목적:
--   user_roles에 넣으려면 숫자 role_id가 필요하니,
--   roles 테이블에서 'user' 권한의 id를 찾아온다.

SELECT role_id
FROM roles
WHERE role_name = 'user';

-- 3-B) 유저-권한 매핑 추가
-- 목적:
--   방금 만든 유저에게 기본 권한(user)을 붙인다.
--   user_roles = "이 유저는 이 권한을 가진다"를 저장하는 매핑 테이블

INSERT INTO user_roles (user_id, role_id)
VALUES (:user_id, :role_id);


-- 4) 실무형(추천): 회원가입을 트랜잭션으로 묶기 (??????????)
-- 목적:
--   users 생성 + 기본 권한 매핑(user_roles)을 한 묶음으로 처리한다.
--   둘 중 하나라도 실패하면 전체를 되돌려서(ROLLBACK) 반쪽 데이터가 남지 않게 한다.

START TRANSACTION;  -- 지금부터 COMMIT 전까지는 임시 저장 상태 (확정 아님)

-- 4-1) users 생성
INSERT INTO users
(user_id, password_hash, email, name, birthday, phone, eco_state, gender)
VALUES
(:user_id, :password_hash, :email, :name, :birthday, :phone, :eco_state, :gender);

-- 4-2) user_roles에 기본 권한 매핑
-- 포인트:
--   role_id를 서버로 가져와서 다시 넣는 방식(3-A/3-B) 대신
--   INSERT 안에서 roles를 조회해서 role_id를 바로 가져온다.
-- 장점:
--   쿼리 1번 줄고, 서버 변수 전달 실수 줄고, 더 안전한 패턴

INSERT INTO user_roles (user_id, role_id)
SELECT :user_id, role_id
FROM roles
WHERE role_name = 'user';

COMMIT;  -- 여기까지 전부 성공했을 때만 최종 확정 저장

-- signup 쿼리 흐름(서버 실행 순서) 정리
-- 회원가입 버튼을 눌렀을 때, 서버는 보통 이렇게 움직여:
-- 1.	아이디 중복확인
-- o	결과 있으면 → “이미 사용 중” 반환하고 종료
-- 2.	START TRANSACTION
-- 3.	users INSERT
-- o	실패하면 → ROLLBACK → 종료(중복/형식 오류 등)
-- 4.	user_roles INSERT(SELECT로 role_id 가져와서 삽입)
-- o	실패하면 → ROLLBACK → 종료(roles에 'user'가 없다 등)
-- 5.	COMMIT
-- 6.	가입 성공 응답 → 보통 로그인 페이지로 이동 또는 자동 로그인


-- ----------------------------------------------------------------------------------------------

-- screen ID: find_id_result (아이디 찾기 결과)
-- 패턴 A) email + name
SELECT user_id
FROM users
WHERE email = :email
  AND name  = :name;

-- ----------------------------------------------------------------------------------------------

-- screen ID: find_pw (비밀번호 찾기 → pw_change로 이동)
-- 1) 본인 확인(아이디/이름/이메일 일치 확인)
SELECT 1
FROM users
WHERE user_id = :user_id
  AND name    = :name
  AND email   = :email
LIMIT 1;

-- ----------------------------------------------------------------------------------------------

-- screen ID: pw_change (새 비밀번호 저장)
-- 1) 비밀번호 해시 업데이트
UPDATE users
SET password_hash = :new_password_hash
WHERE user_id = :user_id;
-- (선택) 성공 확인:
SELECT ROW_COUNT() AS affected_rows;

-- ----------------------------------------------------------------------------------------------

-- screen ID: my_page (마이페이지 진입 전 비밀번호 확인 + 정보 조회)
-- 1) 마이페이지 조회 전 확인(비밀번호 확인)용 해시 조회
SELECT password_hash
FROM users
WHERE user_id = :user_id;
-- 2) 마이페이지 정보 조회
SELECT user_id, email, name, birthday, phone, eco_state, gender, created_at
FROM users
WHERE user_id = :user_id;
-- 3) (권한 표시/관리자 메뉴 노출용) role 같이 조회
SELECT r.role_name
FROM user_roles ur
JOIN roles r ON r.role_id = ur.role_id
WHERE ur.user_id = :user_id;

-- ----------------------------------------------------------------------------------------------

-- screen ID: info_edit (회원정보 수정 + 탈퇴)
-- 1) 수정 화면에 현재 내 정보 채우기
SELECT user_id, email, name, birthday, phone, eco_state, gender
FROM users
WHERE user_id = :user_id;

-- 2) 수정 시 이메일 중복 체크(내 이메일 제외) -> 없었던 기능
-- SELECT 1
-- FROM users
-- WHERE email = :email
--   AND user_id <> :user_id
-- LIMIT 1;

-- 3) 회원정보 업데이트
UPDATE users
SET email     = :email,
    name      = :name,
    birthday  = :birthday,
    phone     = :phone,
    eco_state = :eco_state,
    gender    = :gender
WHERE user_id = :user_id;
-- 4) 탈퇴 처리
-- 하드 삭제(진짜로 row 삭제)
-- FK가 ON DELETE RESTRICT라서 부모(users)부터는 못 지우고, 자식부터 지워야 가능
-- 단점: login_log(감사/보안 로그)가 사라짐.
START TRANSACTION;

DELETE FROM user_roles
WHERE user_id = :user_id;

DELETE FROM login_log
WHERE user_id = :user_id;

DELETE FROM users
WHERE user_id = :user_id;

COMMIT;
















