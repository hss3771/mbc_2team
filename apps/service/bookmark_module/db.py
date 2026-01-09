from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

class BookmarkRepository:
    def __init__(self, db):
        self.db = db

    # 특정 단어를 북마크 하거나 취소했을 때 그 상태를 DB에 저장함
    def toggle_term_bookmark(self, user_id: str, term_id: str, state: str):
        sql = text("""
            INSERT INTO user_term_bookmarks (user_id, term_id, state, event_at)
            VALUES (:user_id, :term_id, :state, CURRENT_TIMESTAMP)
            ON DUPLICATE KEY UPDATE 
                state = :state, 
                event_at = CURRENT_TIMESTAMP
        """)
        try:
            self.db.execute(sql, {"user_id": user_id, "term_id": term_id, "state": state})
            self.db.commit()
            return True
        except Exception as e:
            print(f"Error: {e}")
            self.db.rollback()
            return False


    # economic_terms 테이블에서 데이터 가져오는 함수
    def get_economic_terms(db) -> list:
        sql = text("""
            SELECT term_id, term, description, event_at
            FROM economic_terms
        """)
        rows = db.execute(sql).fetchall()
        terms = [{"term_id": row[0], "term": row[1], "description": row[2], "event_at": row[3]} for row in rows]
        return terms

    # 용어 북마크: 내 목록(ADD만)
    # 해당 사용자가 북마크한 목록만 가져온다
    def get_my_term_bookmarks(self, user_id: str):
        sql = text("""
            SELECT utb.term_id, et.term
            FROM user_term_bookmarks utb
            JOIN economic_terms et ON utb.term_id = et.term_id
            WHERE utb.user_id = :user_id
              AND utb.state = 'ADD'
            ORDER BY utb.event_at DESC
        """)
        rows = self.db.execute(sql, {"user_id": user_id}).fetchall()
        return [dict(row._mapping) for row in rows] # 형태: ["kdi_123", "kdi_456", "kdi_789"...]


    # 용어 북마크: state(ADD/CANCEL) insert or update
    # UNIQUE(user_id, term_id) 덕분에 upsert 가능
    # 해당 사용자의 특정 단어 북마크 상태를 ADD 또는 CANCEL 로 바꾼다
    def toggle_term_bookmark(self, user_id: str, term_id: str, state: str):
        if state not in ("ADD", "CANCEL"):
            raise ValueError("state must be 'ADD' or 'CANCEL'")

        sql = text("""
            INSERT INTO user_term_bookmarks (user_id, term_id, state, event_at)
            VALUES (:user_id, :term_id, :state, NOW())
            ON DUPLICATE KEY UPDATE
              state = VALUES(state),
              event_at = NOW()
        """)

        try:
            self.db.execute(sql, {"user_id": user_id, "term_id": term_id, "state": state})
            self.db.commit()
            return {"ok": True, "state": state}
        except Exception as e:
            self.db.rollback()
            return {"ok": False, "error": str(e)}


    # 용어 북마크 : 전체 삭제 (해당 user_id 의 ADD -> CANCEL)
    # 해당 사용자의 북마크를 모두 해제(CANCEL) 처리
    # 실제 row 삭제가 아니라 state를 CANCEL로 업데이트
    def clear_all_bookmarks(self, user_id: str):
        sql = text("""
            UPDATE user_term_bookmarks
            SET state = 'CANCEL', event_at = NOW()
            WHERE user_id = :user_id AND state = 'ADD'
        """)
        try:
            self.db.execute(sql, {"user_id": user_id})
            self.db.commit()
            return {"status": "success", "message": "모든 북마크가 해제되었습니다."}
        except Exception as e:
            self.db.rollback()
            return {"status": "fail", "message": str(e)}

