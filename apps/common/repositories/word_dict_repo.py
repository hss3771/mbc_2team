from typing import Optional
from sqlalchemy import text


class WordSowRepository:
    def __init__(self, db):
        # 여기서 db는 get_db()를 통해 생성된 session 객체
        self.db = db

    # 1) 왼쪽 리스트용: 용어 목록 + 북마크 상태
    def get_terms_with_bookmark_status(self, user_id: Optional[str]):
        sql = text("""
            SELECT
                t.term_id,
                t.term,
                CASE WHEN b.state = 'ADD' THEN 1 ELSE 0 END AS is_bookmarked
            FROM economic_terms t
            LEFT JOIN user_term_bookmarks b
              ON t.term_id = b.term_id
             AND b.user_id = :user_id
             AND b.state = 'ADD'
            WHERE t.state NOT IN ('DISABLED', 'DELETED')
            ORDER BY t.term ASC
        """)

        result = self.db.execute(sql, {"user_id": user_id}).fetchall()
        return [dict(row._mapping) for row in result] if result else []

    # 2) 오른쪽 상세용: 특정 용어 상세
    def get_term_detail(self, term_id: str):
        sql = text("""
            SELECT term_id, term, description, event_at
            FROM economic_terms
            WHERE term_id = :term_id
              AND state NOT IN ('DISABLED', 'DELETED')
        """)
        result = self.db.execute(sql, {"term_id": term_id}).fetchone()
        return dict(result._mapping) if result else None

    # 3) 초성 필터용 (ㄱ, ㄴ, ㄷ... 범위 조회)
    def get_terms_by_initial(self, start_char: str, end_char: str):
        sql = text("""
            SELECT term_id, term
            FROM economic_terms
            WHERE term >= :start
              AND term < :end
              AND state NOT IN ('DISABLED', 'DELETED')
            ORDER BY term ASC
        """)
        result = self.db.execute(sql, {"start": start_char, "end": end_char}).fetchall()
        return [dict(row._mapping) for row in result] if result else []
