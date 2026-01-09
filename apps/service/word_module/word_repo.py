from sqlalchemy import text
import pandas as pd
from apps.common.db import get_db

# CSV 파일을 읽고 삽입하는 함수
def load_data_from_csv(file_path: str) -> dict:
    session = get_db()  # 기존 get_db()를 사용하여 세션을 관리
    try:
        # CSV 파일을 읽어옵니다
        df = pd.read_csv(file_path)

        # 'scraped_at'을 'event_at'으로 변환
        df['event_at'] = pd.to_datetime(df['scraped_at']).dt.strftime('%Y-%m-%d %H:%M:%S')

        # 삽입할 데이터 준비
        insert_sql = """
            INSERT INTO economic_terms (term_id, term, description, event_at)
            VALUES (:term_id, :term, :description, :event_at)
            ON DUPLICATE KEY UPDATE
                term = VALUES(term),
                description = VALUES(description),
                event_at = VALUES(event_at)
        """

        # CSV 데이터 삽입
        for _, row in df.iterrows():
            session.execute(text(insert_sql), {
                'term_id': row['term_id'],
                'term': row['keyword'],
                'description': row['content'],
                'event_at': row['event_at']
            })

        session.commit()
        return {"ok": True, "message": f"{len(df)} records inserted successfully!"}

    except Exception as e:
        session.rollback()  # 에러 발생 시 롤백
        return {"ok": False, "error": "DB_ERROR", "detail": str(e)}

    finally:
        session.close()  # 세션 종료


# 실행을 위한 코드
if __name__ == "__main__":
    # CSV 파일 경로
    file_path = r'D:\훈련생폴더\copy_project\apps\service\static\word_data\kdi_worddic_strict_20251230_165545.csv'

    # CSV 파일에서 데이터 삽입
    result = load_data_from_csv(file_path)

    # 삽입 결과 출력
    if result['ok']:
        print(f"{result['message']}")
    else:
        print(f"Error: {result['error']} - {result['detail']}")
