USE trendscope;

/*
   1) roles
   여기 roles는 권한 목록 표.
   예: user, admin 같은 역할을 여기에 정의해두고 실제 유저에게는 role_id를 연결해서 권한을 부여한다.
*/
CREATE TABLE roles (
  -- role_id: 권한(역할) 하나를 식별하는 내부 번호(PK)
  -- - INT UNSIGNED: 권한 종류는 보통 많지 않아서 INT + 음수 불필요
  -- - AUTO_INCREMENT: 새 권한을 추가할 때 DB가 번호를 자동 발급
  role_id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- role_name: 권한의 "코드/이름"
  -- - 예: 'user', 'admin'
  -- - NOT NULL: 권한 코드는 비면 안 됨(권한 판별의 핵심값)
  -- 컬럼명이 role_name이라도, 실제로는 권한 코드처럼 쓰임
  role_name VARCHAR(50)  NOT NULL,

  -- PRIMARY KEY: roles에서 각 권한을 유일하게 구분하는 대표 키
  PRIMARY KEY (role_id),

  -- UNIQUE: role_name은 중복되면 안 됨
  -- 예: 'admin'이 2개면 어떤 게 진짜 admin인지 애매해짐 -> DB에서 중복 입력 자체를 막는다.
  UNIQUE KEY uq_roles_role_name (role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- InnoDB: FK(외래키) 같은 무결성 기능을 쓰기 좋은 엔진
-- utf8mb4: 한글/이모지까지 안전하게 저장 가능한 문자셋

select * from roles;
describe roles;


/* 
   2) 회원-권한 매핑: user_roles
   한 유저가 여러 권한을 가질 수 있게 만들어주는 연결 테이블.
   예)
     users: (user_id=kim)
     roles: (role_id=1, role_name='user'), (role_id=2, role_name='admin')
     user_roles: (kim, 1), (kim, 2)
   이렇게 되면 kim은 user + admin 둘 다 가질 수 있어.
*/
CREATE TABLE user_roles (
  -- user_role_id: 매핑(연결) 행 자체의 고유 번호(PK)
  user_role_id INT UNSIGNED NOT NULL AUTO_INCREMENT,

  -- user_id: 어떤 유저인지 (users.user_id를 참조)
  user_id VARCHAR(50) NOT NULL,

  -- role_id: 어떤 권한인지 (roles.role_id를 참조)
  role_id INT UNSIGNED NOT NULL,

  -- assigned_at: 이 권한을 부여한 시각(감사/추적용)
  -- 값을 안 넣어도 자동으로 현재 시각이 들어간다.
  assigned_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (user_role_id),

  -- 보조 인덱스 (role_id, user_id):
  -- 권한 기준으로 유저를 찾는 조회가 빠르다.
  -- 예: admin 권한 가진 유저 목록 같은 쿼리에서 유리.
  KEY idx_user_roles_role_user (role_id, user_id),

  -- FK: user_roles.user_id는 users.user_id에 반드시 존재해야 함
  -- ON UPDATE CASCADE: users.user_id가 바뀌면 매핑 테이블도 같이 변경
  -- ON DELETE RESTRICT: 매핑이 남아있으면 users 삭제를 막음(데이터 무결성 보호)
  CONSTRAINT fk_user_roles_user FOREIGN KEY (user_id) REFERENCES users(user_id)
    ON UPDATE cascade
    	ON DELETE RESTRICT,

  -- FK: user_roles.role_id는 roles.role_id에 반드시 존재해야 함
  -- 역할(권한) 마스터가 삭제되면 매핑이 붕 뜨는 걸 막기 위해 RESTRICT를 사용
  CONSTRAINT fk_user_roles_role FOREIGN KEY (role_id) REFERENCES roles(role_id)
    ON UPDATE CASCADE
    	ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

select * from user_roles;
describe user_roles;

/* 
   3) 기본 권한 시드(초기 데이터 넣기)
   roles에 'user', 'admin'을 기본으로 넣는다.

   ON DUPLICATE KEY UPDATE는 무슨 의미?
   - 이미 같은 role_name이 들어있어서 UNIQUE에 걸리면,
     에러로 멈추지 말고 UPDATE를 수행해서 스크립트 재실행이 가능하게 해준다.
   - 여기서는 같은 값으로 업데이트하니까 사실상 있으면 그냥 유지 효과.
*/
INSERT INTO roles (role_name)
	VALUES ('user'), ('admin')
		ON DUPLICATE KEY UPDATE role_name = VALUES(role_name);





