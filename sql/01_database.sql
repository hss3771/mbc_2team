show databases;

-- 1) 데이터베이스 생성
CREATE DATABASE IF NOT EXISTS trendscope
-- DB 안의 문자열을 저장할 때 사용할 기본 문자 인코딩
-- utf8mb4 = 이모지(😀) 포함한 대부분의 유니코드 문자를 안전하게 저장 가능  
DEFAULT CHARACTER SET utf8mb4   
  -- 문자열 비교/정렬 규칙(콜레이션, collation)
  -- utf8mb4_uca1400_ai_ci:
  --   - UCA 14.0(유니코드 표준) 기준으로 정렬/비교 규칙을 적용
  --   - ai = accent-insensitive : 악센트 차이를 무시(예: é 와 e를 유사하게 취급)
  --   - ci = case-insensitive   : 대소문자 차이를 무시(예: A 와 a를 같게 취급)
  --     정렬/검색/비교에서 사람이 느끼는 자연스러운 규칙에 가깝게 동작시키려는 선택
  COLLATE utf8mb4_uca1400_ai_ci;

-- 2) 앞으로 실행할 테이블 생성/조회 쿼리들이 어느 DB를 대상으로 할지 선택
-- CREATE TABLE, SELECT ... 같은 쿼리가 trendscope DB에 적용
USE trendscope;
