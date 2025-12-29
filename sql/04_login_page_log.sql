SHOW DATABASES;

USE trendscope;
show tables;

/* 
 [login_page_log 테이블이 무엇인지?]
 - 사용자가 페이지를 이동한 흔적을 쌓는 테이블.
 - 예: 한 번 이동할 때마다(예: 로그인페이지 → 마이페이지) 로그가 1행 추가.
 - 나중에 이런 걸 볼 수 있음:
   1) 이 유저가 최근에 어떤 화면을 밟았는지(사용자 동선)
   2) 어떤 페이지로 유입이 많은지(페이지 인기도/유입 분석)
 */
CREATE TABLE login_page_log (
	-- page_log_id: 이 로그 행의 고유 번호(기본키)
    -- UNSIGNED: 음수 필요 없으니 0 이상만 쓰게 해서 범위를 더 넓힘.
    -- AUTO_INCREMENT: INSERT할 때 값을 안 줘도 DB가 자동으로 1씩 증가.
	page_log_id INT UNSIGNED NOT NULL AUTO_INCREMENT,
	
	-- user_id: 누가 이동했는지
    -- users(user_id)를 참조하는 FK를 걸어서,
    -- users에 없는 아이디로 로그가 쌓이는 실수를 DB에서 차단.
	user_id VARCHAR(50) NOT NULL,
	
	-- prev_page: 어디에서 왔는지
    -- NULL 허용 이유: 첫 진입(예: 외부에서 로그인 페이지로 바로 들어온 경우)은 이전 페이지가 애매할 수 있어서.
    prev_page VARCHAR(255) null,
    
    -- current_page: 어디로 갔는지(현재 페이지)
    -- NOT NULL 이유: 로그에서 현재 페이지는 핵심 정보.
    current_page VARCHAR(255) NOT NULL,
	
    -- event_at: 이동이 발생한 시각
    -- DEFAULT CURRENT_TIMESTAMP:
    --   INSERT 시 event_at을 안 넣으면 DB가 지금 시각을 자동으로 기록. 
    event_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    
    -- PRIMARY KEY: 이 테이블에서 각 행을 유일하게 식별하는 대표 키
   PRIMARY KEY (page_log_id),
   
   /* 
     [인덱스는 거는 이유]
     - 인덱스는 찾기(조회)를 빠르게 해주는 목차 역할.
     - 로그 테이블은 데이터가 계속 늘어나서, 조회 패턴에 맞는 인덱스가 없으면 점점 느려지기 쉬움.
   */
   
  -- (1) 특정 유저의 최근 이동 기록을 빠르게 조회하기 위한 인덱스
  -- 예: WHERE user_id=? ORDER BY event_at DESC LIMIT 50
  -- 복합 인덱스 순서가 중요, (user_id, event_at)로 잡으면 유저로 먼저 좁히고 -> 시간으로 정렬/범위가 잘 먹힘.
  KEY idx_login_page_log_user_time (user_id, event_at),
  
  -- (2) 특정 페이지(current_page)로 언제 유입이 많았나 분석용 인덱스(선택)
  -- 예: WHERE current_page=? AND event_at BETWEEN ... (기간별 유입)
  KEY idx_login_page_log_current_page (current_page, event_at),
  
  /*
     [FK(외래키) 설정]
     - login_page_log.user_id는 users.user_id에 반드시 존재해야 한다는 규칙
     - ON UPDATE CASCADE: users.user_id가 바뀌면 로그 쪽 user_id도 같이 자동 변경
     - ON DELETE RESTRICT: 로그가 남아있으면 users 삭제를 막음(로그 보존을 강제)
  */
  CONSTRAINT fk_login_page_log_user FOREIGN KEY (user_id) 
  	REFERENCES users(user_id) 
  		ON UPDATE cascade
  			ON DELETE restrict
  			
  -- InnoDB: 외래키 같은 무결성 기능을 안정적으로 쓰는 엔진 :contentReference[oaicite:2]{index=2}
  -- utf8mb4: 한글/이모지 등 유니코드 저장에 표준적으로 많이 씀
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;	

select * from login_page_log;
describe login_page_log;  
  
