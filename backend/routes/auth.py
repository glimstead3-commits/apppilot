"""Auth routes — signup/login/me. Signup grants free credits via the ledger."""
import secrets
import time
from collections import defaultdict
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, EmailStr

from utils.auth import (
    SIGNUP_CREDITS, create_session, get_current_user, hash_password, public_user,
)
from utils.database import get_db

router = APIRouter(prefix="/api/auth")

_bearer_dep = HTTPBearer(auto_error=False)


class Credentials(BaseModel):
    email: EmailStr
    password: str
    name: str = ""


def _db():
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return db


# In-memory abuse guard: signup grants free credits, so cap signups per IP.
_buckets = defaultdict(list)

def _rate_limit(key: str, max_calls: int, window_s: int):
    now = time.time()
    hits = [t for t in _buckets[key] if now - t < window_s]
    _buckets[key] = hits
    if len(hits) >= max_calls:
        raise HTTPException(status_code=429, detail="Too many attempts — try again later")
    hits.append(now)


@router.post("/signup")
def signup(body: Credentials, request: Request):
    _rate_limit(f"signup:{request.client.host}", 10, 3600)
    db = _db()
    email = body.email.strip().lower()
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    if db.users.find_one({"email": email}):
        raise HTTPException(status_code=409, detail="An account with this email already exists")

    salt = secrets.token_hex(16)
    res = db.users.insert_one({
        "email": email,
        "name": body.name.strip(),
        "password_hash": hash_password(body.password, salt),
        "salt": salt,
        "plan": "free",
        "credits_balance": SIGNUP_CREDITS,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    # Credit ledger — grants and spends are rows, never just a counter edit.
    db.credit_transactions.insert_one({
        "user_id": res.inserted_id,
        "amount": SIGNUP_CREDITS,
        "kind": "grant",
        "reason": "signup_bonus",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    token = create_session(db, res.inserted_id)
    user = db.users.find_one({"_id": res.inserted_id})
    return {"token": token, "user": public_user(user)}


@router.post("/login")
def login(body: Credentials, request: Request):
    _rate_limit(f"login:{request.client.host}", 30, 3600)
    db = _db()
    email = body.email.strip().lower()
    user = db.users.find_one({"email": email})
    if not user or hash_password(body.password, user.get("salt", "")) != user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_session(db, user["_id"])
    return {"token": token, "user": public_user(user)}


@router.get("/me")
def me(user=Depends(get_current_user)):
    return public_user(user)


@router.post("/logout")
def logout(user=Depends(get_current_user), creds=Depends(_bearer_dep)):
    db = _db()
    db.sessions.delete_one({"token": creds.credentials})
    return {"ok": True}
