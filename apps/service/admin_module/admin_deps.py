from fastapi import Request, HTTPException


def admin_required(request: Request) -> None:
    """Raise if not logged-in admin.

    Session contract (already used by /api/session):
      - user_id: logged-in marker
      - user_role == 'admin': admin marker
    """
    if not request.session.get("user_id"):
        raise HTTPException(status_code=401, detail="Login required")
    if request.session.get("user_role") != "admin":
        raise HTTPException(status_code=403, detail="Admin only")