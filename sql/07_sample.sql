/* =========================================================
  TrendScope FIXED SEED SQL
  - 대상 테이블: users, roles, user_roles, login_log
  - FK 고려 순서: users -> roles -> user_roles -> login_log
========================================================= */

USE trendscope;

/* ---------------------------------------------------------
  0) (권장) 리셋: 기존 데이터 삭제 + AUTO_INCREMENT 초기화
  - TRUNCATE는 AUTO_INCREMENT를 보통 리셋함 :contentReference[oaicite:1]{index=1}
--------------------------------------------------------- */
SET FOREIGN_KEY_CHECKS = 0;  -- FK 검사 잠시 끄기 :contentReference[oaicite:2]{index=2}

TRUNCATE TABLE login_log;
TRUNCATE TABLE user_roles;
TRUNCATE TABLE roles;
TRUNCATE TABLE users;

SET FOREIGN_KEY_CHECKS = 1;

/* ---------------------------------------------------------
  1) [02_users.sql] users 시드
  컬럼 순서(DDL): user_id, password_hash, email, name, birthday,
                 phone, eco_state, gender, created_at(DEFAULT)
--------------------------------------------------------- */
INSERT INTO users
(user_id, password_hash, email, name, birthday, phone, eco_state, gender, created_at)
VALUES
('admin01', 'hash_admin01', 'admin01@trendscope.test', '관리자', '1998-03-21', '010-1000-0001', '상',   'M', DATE_SUB(NOW(), INTERVAL 10 DAY)),
('user01',  'hash_user01',  'user01@trendscope.test',  '지은',   '1999-07-14', '010-1000-0002', '중',   'F', DATE_SUB(NOW(), INTERVAL 7 DAY)),
('user02',  'hash_user02',  'user02@trendscope.test',  '민수',   '1997-11-02', NULL,            '중하', 'M', DATE_SUB(NOW(), INTERVAL 3 DAY)),
('user03',  'hash_user03',  'user03@trendscope.test',  '하나',   '2000-01-30', '010-1000-0003', NULL,  'F', NOW());

/* ---------------------------------------------------------
  2) [05_user_roles_and_roles.sql] roles 시드
  컬럼 순서(DDL): role_id(AI), role_name
  - role_id를 고정(1=user, 2=admin)으로 넣어서 이후 매핑이 100% 예측 가능
--------------------------------------------------------- */
INSERT INTO roles (role_id, role_name)
VALUES
(1, 'user'),
(2, 'admin');

/* ---------------------------------------------------------
  3) [05_user_roles_and_roles.sql] user_roles 시드
  컬럼 순서(DDL): user_role_id(AI), user_id(FK), role_id(FK), assigned_at(DEFAULT)
--------------------------------------------------------- */
INSERT INTO user_roles (user_id, role_id, assigned_at)
VALUES
('admin01', 2, DATE_SUB(NOW(), INTERVAL 9 DAY)),  -- admin01 = admin
('admin01', 1, DATE_SUB(NOW(), INTERVAL 9 DAY)),  -- admin01 = user도 같이 부여
('user01',  1, DATE_SUB(NOW(), INTERVAL 6 DAY)),
('user02',  1, DATE_SUB(NOW(), INTERVAL 2 DAY)),
('user03',  1, NOW());

/* ---------------------------------------------------------
  4) [03_login_log.sql] login_log 시드
  컬럼 순서(DDL): log_id(AI), user_id(FK), result(VARCHAR10), create_at(DEFAULT)
  - result는 파일 주석(성공=1, 실패=0)에 맞춰 '1'/'0' 문자열로 저장
--------------------------------------------------------- */
INSERT INTO login_log (user_id, result, create_at)
VALUES
('admin01', '1', DATE_SUB(NOW(), INTERVAL 1 DAY)),
('admin01', '1', DATE_SUB(NOW(), INTERVAL 3 HOUR)),
('user01',  '0', DATE_SUB(NOW(), INTERVAL 10 HOUR)),
('user01',  '0', DATE_SUB(NOW(), INTERVAL 9 HOUR)),
('user01',  '1', DATE_SUB(NOW(), INTERVAL 8 HOUR)),
('user02',  '0', DATE_SUB(NOW(), INTERVAL 2 DAY)),
('user02',  '0', DATE_SUB(NOW(), INTERVAL 1 HOUR)),
('user03',  '1', DATE_SUB(NOW(), INTERVAL 30 MINUTE));

/* ---------------------------------------------------------
  5) 확인 쿼리
--------------------------------------------------------- */
SELECT 'users'      AS tbl, COUNT(*) AS cnt FROM users
UNION ALL
SELECT 'roles'      AS tbl, COUNT(*) AS cnt FROM roles
UNION ALL
SELECT 'user_roles' AS tbl, COUNT(*) AS cnt FROM user_roles
UNION ALL
SELECT 'login_log'  AS tbl, COUNT(*) AS cnt FROM login_log;

SELECT * FROM roles ORDER BY role_id;
SELECT * FROM users ORDER BY created_at;
SELECT * FROM user_roles ORDER BY user_role_id;
SELECT * FROM login_log ORDER BY log_id;
