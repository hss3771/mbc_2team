show databases;

USE trendscope;

CREATE TABLE users (
  -- user_id: 로그인할 때 쓰는 아이디 자체를 PK로 사용
  -- 로그인 아이디(PK)
  -- VARCHAR(50): 최대 50글자까지 저장
  -- NOT NULL: 반드시 값이 있어야 함
  user_id VARCHAR(50)  NOT NULL,            
  
  -- password_hash: 비밀번호 원문이 아니라 해시(암호화 결과 문자열) 저장
  -- 비밀번호 해시
  -- VARCHAR(255): 해시 문자열(예: bcrypt 등)이 길어질 수 있어 넉넉하게 잡는 편
  password_hash VARCHAR(255) NOT NULL,           
  
  -- email: 이메일(회원 식별/아이디찾기/알림 등 용도)
  email VARCHAR(255) NOT NULL,
  
  -- name: 사용자 이름(성명)
  name VARCHAR(50)  NOT NULL,
  
  -- birthday: 생년월일(날짜만 필요하니 DATE)
  birthday DATE         NOT NULL,
  
  -- phone: 전화번호(선택값)
  -- NULL 허용: 입력 안 해도 가입 가능
  phone VARCHAR(20)  NULL,
  
  -- eco_state: 경제지식수준(상/중상/중/중하/하 등)
  -- VARCHAR로 둬서 값이 문자열로 저장됨(단, UI/서버에서 입력값 통제가 필요)
  -- VARCHAR이므로 값 오염 방지를 UI/서버에서 해주는 게 중요
  -- 예: '상','중상','중','중하','하'
  eco_state VARCHAR(30)  NULL, 
  
  -- gender: 성별(필수)
  -- VARCHAR로 둬서 'M','F' 또는 '남','여' 등 저장 가능
  -- VARCHAR이므로 'M/F' 또는 '남/여' 등 저장 규칙을 하나로 통일 권장
  -- 예: 'M','F' 또는 '남','여'
  gender VARCHAR(10)  NOT NULL,    
  
  -- created_at: 회원가입(레코드 생성) 시각
  -- DEFAULT CURRENT_TIMESTAMP: INSERT 시 현재 시각 자동 저장
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
 -- 키/인덱스(중복 방지 + 조회 성능)

  -- PK: user_id는 유일해야 하며(중복 아이디 방지), PK 인덱스가 자동 생성됨
  PRIMARY KEY (user_id),
  
  -- UNIQUE KEY: 이메일 중복 가입 방지
  -- 같은 이메일로 가입을 못 하게 DB에서 강제
  UNIQUE KEY uq_users_email (email),
  
  -- 일반 인덱스: (email, name) 조합 검색이 빠르게
  -- 아이디 찾기([5-03])에서 email + name으로 조회할 때 도움
  KEY idx_users_email_name (email, name)


) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

select * from users;
describe users;