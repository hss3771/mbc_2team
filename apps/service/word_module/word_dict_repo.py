from sqlalchemy import text
# 만약 파일명이 database.py 라면 아래와 같이 임포트합니다.

class WordSowRepository:
    def __init__(self, db):
        # 여기서 db는 get_db()를 통해 생성된 session 객체가 들어올 예정
        self.db = db

    # 1. 사용자의 북마크 정보와 용어 목록을 조인합니다.
    # 2. state가 'ADD'인 경우만 북마크된 것으로 판단합니다.
    def get_terms_with_bookmark_status(self, user_id: str):
        sql = text("""
            SELECT t.term_id, t.term,
                   CASE WHEN b.state = 'ADD' THEN 1 ELSE 0 END as is_bookmarked
            FROM economic_terms t
            LEFT JOIN user_term_bookmarks b ON t.term_id = b.term_id 
                 AND b.user_id = :user_id AND b.state = 'ADD'
            WHERE t.state != 'DELETED'
            ORDER BY t.term ASC
        """)
        result = self.db.execute(sql, {"user_id": user_id}).fetchall()

        # 결과가 있으면 리스트로 변환, 없으면 빈 리스트 [] 반환
        return [dict(row._mapping) for row in result] if result else []

    # 상세 내용과 날짜를 가져옵니다.
    def get_term_detail(self, term_id: str):
        sql = text("""
            SELECT term_id, term, description, event_at
            FROM economic_terms
            WHERE term_id = :term_id AND state != 'DELETED'
        """)
        result = self.db.execute(sql, {"term_id": term_id}).fetchone()
        return dict(result._mapping) if result else None

# 초성 필터링 (ㄱ, ㄴ, ㄷ... 클릭 시 해당 범위 데이터 조회)
    def get_terms_by_initial(self, start_char, end_char):
        query = text("""
            SELECT term_id, term 
            FROM economic_terms 
            WHERE term >= :start AND term < :end
            AND state != 'DELETED'
            ORDER BY term ASC
        """)
        result = self.db.execute(query, {"start": start_char, "end": end_char})
        return result.fetchall()