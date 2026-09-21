"""Auth helpers — stdlib only: pbkdf2 password hashing + DB session tokens."""
import hashlib
import os
import secrets
from datetime import datetime, timezone

from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from utils.database import get_db

_bearer = HTTPBearer(auto_error=False)

# Free-taste sizing: enough mentor chats to feel the value in stages 0-1,
# not enough to never need to pay. Override via env without a redeploy.
SIGNUP_CREDITS = int(os.environ.get("SIGNUP_CREDITS", "15"))

# Bootstrap admin via env — "make my account admin" becomes a config step,
# not a Mongo edit. Comma-separated emails, e.g. ADMIN_EMAILS=me@x.com,bob@y.com
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.environ.get("ADMIN_EMAILS", "").split(",")
    if e.strip()
}


def hash_password(password: str, salt: str) -> str:
    return hashlib.pbkdf2_hmac("sha256", password.encode(), salt.encode(), 100_000).hex()


def create_session(db, user_id) -> str:
    token = secrets.token_urlsafe(32)
    db.sessions.insert_one({
        "token": token,
        "user_id": user_id,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return token


SESSION_DAYS = 30  # sessions expire — stale tokens shouldn't live forever


def get_current_user(creds: HTTPAuthorizationCredentials = Depends(_bearer)):
    if not creds:
        raise HTTPException(status_code=401, detail="Not authenticated")
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    sess = db.sessions.find_one({"token": creds.credentials})
    if not sess:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    created = sess.get("created_at", "")
    try:
        age_s = (datetime.now(timezone.utc) - datetime.fromisoformat(created)).total_seconds()
    except Exception:
        age_s = SESSION_DAYS * 86400 + 1  # unparseable → treat as expired
    if age_s > SESSION_DAYS * 86400:
        db.sessions.delete_one({"_id": sess["_id"]})
        raise HTTPException(status_code=401, detail="Session expired — log in again")
    user = db.users.find_one({"_id": sess["user_id"]})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    if user.get("email", "").lower() in ADMIN_EMAILS:
        user["is_admin"] = True
    return user


def public_user(u: dict) -> dict:
    return {
        "id": str(u["_id"]),
        "email": u.get("email", ""),
        "name": u.get("name", ""),
        "plan": u.get("plan", "free"),
        "credits_balance": u.get("credits_balance", 0),
        "is_admin": bool(u.get("is_admin")),
        "email_verified": bool(u.get("email_verified")),
    }
