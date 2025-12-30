show databases;

USE trendscope;


  -- IF NOT EXISTS:
  --   같은 이름의 테이블(login_log)이 이미 있으면 "새로 만들지 않고" 넘어감.
  --   (배포/초기화 스크립트를 여러 번 실행해도 안전) :contentReference[oaicite:0]{index=0}
CREATE TABLE login_log (
  -- log_id: 로그인 시도 로그의 고유번호 (PK)
  -- UNSIGNED: 음수가 필요 없으니(로그 id는 -1 같은 게 없음) 0부터 쓰게 해서 범위를 더 넓게 씀.
  -- AUTO_INCREMENT: INSERT 할 때 log_id를 안 넣어도 DB가 자동으로 1씩 증가시켜 넣어줌.
  log_id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- user_id: 어떤 사용자가 로그인 시도했는지 (users 테이블의 user_id와 연결)
  -- VARCHAR(50): 아이디가 문자로 구성되니까 문자열 타입 사용.
  user_id VARCHAR(50) NOT NULL,

  -- result: 로그인 결과 (성공=1, 실패=0)
  -- BOOLEAN: MariaDB에서는 BOOLEAN이 실제로는 TINYINT(1)과 동의어(0=false, 1=true)로 처리됨.
  result VARCHAR(10) NOT NULL,
  
  -- create_at: 로그가 기록된 시각 (24시간 제한 계산의 기준)
  -- DATETIME: 날짜+시간 저장.
  -- DEFAULT CURRENT_TIMESTAMP: INSERT 시 create_at을 안 넣으면 현재 시각을 자동 저장.
  create_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  
  
  -- PRIMARY KEY:
  --   테이블에서 한 행을 유일하게 식별하는 대표 키.
  --   PK는 기본적으로 유니크 + NOT NULL이며, InnoDB에서 매우 중요(클러스터링의 기준이 됨).
  PRIMARY KEY (log_id),

  -- KEY (인덱스):
  --   user_id로 특정 사용자의 로그를 찾고,
  --   create_at으로 (최근 것부터/최근 24시간) 같은 조건을 자주 걸 거라면 성능에 큰 도움.
  --   (user_id, create_at) 순서는 "user_id로 먼저 좁히고 → 시간으로 범위" 잡을 때 특히 유리.
  KEY idx_login_log_user_time (user_id, create_at)
   
  -- ENGINE=InnoDB:
  --   트랜잭션/외래키(FOREIGN KEY) 같은 기능을 안정적으로 쓰는 대표 엔진.
  -- DEFAULT CHARSET=utf8mb4:
  --   이모지까지 포함한 유니코드 문자열 저장에 널리 쓰는 문자셋.  
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- login_log 테이블에 외래키(Foreign Key) 제약조건을 추가하는 SQL
ALTER TABLE login_log
  -- ADD CONSTRAINT = 제약조건(규칙)을 새로 추가
  -- fk_login_log_user = 제약조건 이름
  ADD CONSTRAINT fk_login_log_user

  -- FOREIGN KEY (user_id)
  -- login_log 테이블의 user_id 컬럼은 다른 테이블의 값만 넣을 수 있게 하겠다
  FOREIGN KEY (user_id)

  -- REFERENCES users(user_id)
  -- 그 다른 테이블은 users 테이블이고,
  -- users 테이블의 user_id 값을 기준(부모키/참조대상)으로 삼겠다
  REFERENCES users(user_id);
  
select * from login_log;
describe login_log;

select * from login_log;
describe login_log;


-- -----------------------------------------------------------------

-- 5회 실패/24시간 제한을 login_log 기반으로 구현하는 쿼리
-- 전체 순서(한 번의 로그인 시도 기준):
--    1) (A) 최근 24시간 FAIL 횟수 조회
--    2) fail_24h >= 5면 → (B) LOCKED 로그 남기고 차단
--    3) 아니라면 → 비번 검사
--       - 맞으면 (C-성공) SUCCESS 로그 + users.last_login_at 업데이트
--       - 틀리면 (C-실패) FAIL 로그(누적 실패 횟수 저장)

-- (A) 최근 24시간 실패(FAIL) 횟수
-- 결과는 예를 들어:
--   - fail_24h = 0  -> 최근 24시간 동안 실패 기록이 없음
--   - fail_24h = 3  -> 최근 24시간 동안 3번 틀림
--   - fail_24h = 5  -> 최근 24시간 동안 5번 틀림(잠금 대상)
SELECT COUNT(*) AS fail_24h FROM login_log 
	WHERE user_id = :user_id 										-- 1) user_id가 지금 로그인 시도한 사람인지 
		AND state = 'FAIL' 												-- 2) state가 FAIL인 것만(진짜 비번 틀린 실패만)
		AND create_at >= (NOW() - INTERVAL 24 HOUR);	-- 3) create_at이 '지금 시각 기준 24시간 안'에 들어오는 것만

-- (B) 잠금 상태일 때 기록(LOCKED)
-- fail_24h가 이미 5 이상이면 로그인 차단 + state='LOCKED' 로 로그 1줄 추가
/*
  (A)에서 fail_24h를 얻음.
  서버 로직이 판단:

    if (fail_24h >= 5) {
        "이미 5번 이상 틀렸네? 그럼 지금 시도는 차단"
        그리고 'LOCKED'라는 로그를 한 줄 남기자.
    }

  왜 LOCKED 로그를 남기냐?
  - FAIL은 비밀번호을 틀린 것
  - LOCKED는 잠긴 상태에서 시도해서 차단당한 것
  이 두 가지를 나중에 분석/운영에서 구분하려는 목적.

  INSERT하는 이유?
  - log_id는 AUTO_INCREMENT라서 자동으로 들어가고,
  - create_at은 DEFAULT CURRENT_TIMESTAMP라서 자동으로 현재 시각이 들어감.

  여기서는:
  - result = 0  (성공이 아니니까 0)
  - fail_count = 5 (UI에서 '5회 실패로 잠김' 같은 의미로 고정)
  - state = 'LOCKED'
*/
INSERT INTO login_log (user_id, result, fail_count, state) 
	VALUES (:user_id, 0, 5, 'LOCKED');

-- (C) 비밀번호 검증 결과에 따라 기록
-- 성공이면 count=0으로 저장 
-- 실패면 fail_24h+1 값을 저장 (최대 5까지 UI에 표시) 

-- 성공(SUCCESS)
/*
  비밀번호가 맞았다면:
  - result = 1 (성공)
  - fail_count = 0 (성공했으니 실패 누적을 0으로 리셋했다는 의미)
  - state = 'SUCCESS'
*/
INSERT INTO login_log (user_id, result, fail_count, state)
	VALUES (:user_id, 1, 0, 'SUCCESS');

-- 그리고 users.last_login_at 업데이트(성공 시)
/*
  성공했으면 마지막 로그인 성공 시각도 남겨야함.
  그래서 users 테이블의 last_login_at을 NOW()로 갱신.

  WHERE user_id = :user_id를 안 쓰면 안되는 이유는?
  그러면 users 전체 행의 last_login_at이 다 바뀌어버리거든.
  그래서 꼭 특정 유저만 딱 찍어서 업데이트한다.
*/
UPDATE users SET last_login_at = NOW()
	WHERE user_id = :user_id;

-- 실패(FAIL) : fail_24h + 1 계산해서 넣기(서버에서 계산 후 동기화 추천)
/*
  비밀번호가 틀렸다면:
  - result = 0
  - state = 'FAIL'
  - fail_count는 이번 실패까지 포함한 누적 실패 횟수를 넣는다.
  - :new_fail_count는 보통 서버 코드에서 계산해서 동기화하는 걸 추천. 예) new_fail_count = MIN(fail_24h + 1, 5)

  왜 서버에서 계산하냐?
  - 로직을 한 곳(서버)에서 통제하기 쉽고,
  - 최대 5로 고정 같은 정책도 명확히 적용할 수 있어.
*/
INSERT INTO login_log (user_id, result, fail_count, state)
	VALUES (:user_id, 0, :new_fail_count, 'FAIL');




