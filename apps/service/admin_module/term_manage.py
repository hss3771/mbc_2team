from __future__ import annotations

import uuid
from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException, Request

from apps.common.db import get_db
from apps.common.repositories import economic_term_repo
from .admin_deps import admin_required

router = APIRouter(prefix="/admin/terms", tags=["admin"])


@router.get("/")
def list_terms(
    request: Request,
    group: str = "KOR",              # UI: 한글/영문/숫자 필터(KOR/ENG/NUM)
    query: str = "",                 # 검색(용어/설명)
    page: int = 1,                   # UI: 페이징(기본 20)
    size: int = 20,
    include_disabled: bool = False,  # 필요시 비활성 포함
    _: None = Depends(admin_required),
):
    db = get_db()
    try:
        return economic_term_repo.list_terms(
            db,
            group=group,
            query=query,
            page=page,
            size=size,
            include_disabled=include_disabled,
        )
    finally:
        db.close()


@router.get("/{term_id}")
def term_detail(
    request: Request,
    term_id: str,
    _: None = Depends(admin_required),
):
    db = get_db()
    try:
        row = economic_term_repo.get_term(db, term_id=term_id)
        if not row:
            raise HTTPException(status_code=404, detail="term not found")
        return row
    finally:
        db.close()


@router.post("/")
def add_term(
    request: Request,
    payload: Dict[str, Any],
    _: None = Depends(admin_required),
):
    term = str(payload.get("term", "")).strip()
    description = str(payload.get("description", "")).strip()

    # UI 설계서: 신규 용어/설명 입력 필수
    if not term:
        raise HTTPException(status_code=400, detail="term required")
    if not description:
        raise HTTPException(status_code=400, detail="description required")

    # term_id: UI에서 주면 사용, 없으면 서버 생성(UUID)
    term_id = str(payload.get("term_id", "")).strip() or uuid.uuid4().hex

    db = get_db()
    try:
        economic_term_repo.insert_term(
            db,
            term_id=term_id,
            term=term,
            description=description,
            state="ADD",
        )
        db.commit()
        return {"ok": True, "item": economic_term_repo.get_term(db, term_id)}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.put("/{term_id}")
def update_term(
    request: Request,
    term_id: str,
    payload: Dict[str, Any],
    _: None = Depends(admin_required),
):
    term = payload.get("term")
    description = payload.get("description")
    state = str(payload.get("state", "UPDATE")).strip() or "UPDATE"

    if term is not None:
        term = str(term).strip()
        if not term:
            raise HTTPException(status_code=400, detail="term cannot be empty")
    if description is not None:
        description = str(description).strip()
        if not description:
            raise HTTPException(status_code=400, detail="description cannot be empty")

    db = get_db()
    try:
        exists = economic_term_repo.get_term(db, term_id)
        if not exists:
            raise HTTPException(status_code=404, detail="term not found")

        economic_term_repo.update_term(
            db,
            term_id=term_id,
            term=term,
            description=description,
            state=state,
        )
        db.commit()
        return {"ok": True, "item": economic_term_repo.get_term(db, term_id)}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.delete("/{term_id}")
def disable_term(
    request: Request,
    term_id: str,
    _: None = Depends(admin_required),
):
    # UI 설계서: 삭제 = 비활성(복구 가능), 실제 삭제 X
    db = get_db()
    try:
        exists = economic_term_repo.get_term(db, term_id)
        if not exists:
            raise HTTPException(status_code=404, detail="term not found")

        economic_term_repo.disable_term(db, term_id)
        db.commit()
        return {"ok": True}
    except HTTPException:
        db.rollback()
        raise
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()


@router.post("/save")
def bulk_save(
    request: Request,
    payload: Dict[str, Any],
    _: None = Depends(admin_required),
):
    """
    UI 설계서 manager3_edit/manager3_add:
      - 편집/추가 내용은 화면에 임시 반영
      - 저장 클릭 시 최종 반영

    프론트가 items 배열을 보내면 upsert로 반영.
    items: [{term_id, term, description, state}, ...]
    """
    items = payload.get("items")
    if not isinstance(items, list):
        raise HTTPException(status_code=400, detail="items(list) required")

    db = get_db()
    try:
        n = economic_term_repo.bulk_upsert(db, items)
        db.commit()
        return {"ok": True, "count": n}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=str(e))
    finally:
        db.close()
