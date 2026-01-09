from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

# 용어 북마크: 내 목록(ADD만)
# 해당 사용자가 북마크한 목록만 가져온다
def get_my_term_bookmarks(db, user_id: str) -> list[str]:
    sql = text("""
        SELECT term_id
        FROM user_term_bookmarks
        WHERE user_id = :user_id
          AND state = 'ADD'
        ORDER BY event_at DESC
    """)
    rows = db.execute(sql, {"user_id": user_id}).fetchall()
    return [r[0] for r in rows] # 형태: ["kdi_123", "kdi_456", "kdi_789"...]


# 용어 북마크: state(ADD/CANCEL) insert or update
# UNIQUE(user_id, term_id) 덕분에 upsert 가능
# 해당 사용자의 특정 단어 북마크 상태를 ADD 또는 CANCEL 로 바꾼다
def toggle_term_bookmark(db, user_id: str, term_id: str, state: str) -> dict:
    # 상태값 검증: 잘못된 값이 DB 에 들어가는 걸 사전 차단
    if state not in ("ADD", "CANCEL"):
        raise ValueError("state must be 'ADD' or 'CANCEL'")
    # 없으면 새로 만들고(insert), 있으면 state 만 update (add -> cancel)
    sql = text("""
        INSERT INTO user_term_bookmarks (user_id, term_id, state, event_at)
        VALUES (:user_id, :term_id, :state, NOW())
        ON DUPLICATE KEY UPDATE
          state = VALUES(state),
          event_at = NOW()
    """)

    try:
        db.execute(sql, {"user_id": user_id, "term_id": term_id, "state": state})
        db.commit()
        return {"ok": True, "user_id": user_id, "term_id": term_id, "state": state}
    except IntegrityError as e:
        db.rollback()
        # UNIQUE나 FK 위반 등
        return {"ok": False, "error": "INTEGRITY_ERROR", "detail": str(e)}
    except Exception as e:
        db.rollback()
        return {"ok": False, "error": "DB_ERROR", "detail": str(e)}


# 용어 북마크 : 전체 삭제 (해당 user_id 의 ADD -> CANCEL)
# 해당 사용자의 북마크를 모두 해제(CANCEL) 처리
# 실제 row 삭제가 아니라 state를 CANCEL로 업데이트
def clear_term_bookmarks(db, user_id: str) -> dict:
    sql = text("""
        UPDATE user_term_bookmarks
        SET state = 'CANCEL',
            event_at = NOW()
        WHERE user_id = :user_id
          AND state = 'ADD'
    """)

    try:
        r = db.execute(sql, {"user_id": user_id})
        db.commit()
        return {
            "ok": True,
            "user_id": user_id,
            "cleared": int(r.rowcount or 0)  # 몇 개 해제됐는지
        }
    except Exception as e:
        db.rollback()
        return {"ok": False, "error": "DB_ERROR", "detail": str(e)}