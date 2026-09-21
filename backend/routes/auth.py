"""Auth routes — signup/login/me/forgot/reset. Signup grants free credits."""
import os
import secrets
import time

import requests
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
    agreed: bool = False  # terms/privacy acceptance — required on signup


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
    if not body.agreed:
        raise HTTPException(status_code=400, detail="Please accept the Terms and Privacy Policy")
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
        "email_verified": False,
        "terms_accepted_at": datetime.now(timezone.utc).isoformat(),
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    _send_verify_email(db, res.inserted_id, email)
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


class ForgotRequest(BaseModel):
    email: EmailStr


class ResetRequest(BaseModel):
    token: str
    password: str


@router.post("/forgot")
def forgot(body: ForgotRequest, request: Request):
    """Request a password reset. Always returns ok — never reveal whether
    the email exists (that's account-enumeration info for attackers)."""
    _rate_limit(f"forgot:{request.client.host}", 10, 3600)
    db = _db()
    email = body.email.strip().lower()
    user = db.users.find_one({"email": email})
    if user:
        token = secrets.token_urlsafe(32)
        db.password_resets.insert_one({
            "user_id": user["_id"], "token": token,
            "expires_at": (datetime.now(timezone.utc).timestamp() + 3600),
            "created_at": datetime.now(timezone.utc).isoformat(),
            "used": False,
        })
        _send_reset_email(email, token)
    return {"ok": True}


def _send_email(email: str, subject: str, text: str):
    """Optional email delivery via Resend — silently skips if not configured.
    Without RESEND_API_KEY, tokens stay in the DB and admins can hand out
    links manually via /api/admin endpoints."""
    key = os.environ.get("RESEND_API_KEY", "").strip()
    if not key:
        return False
    try:
        requests.post("https://api.resend.com/emails", timeout=15,
            headers={"Authorization": f"Bearer {key}"},
            json={
                "from": os.environ.get("EMAIL_FROM", "AppPilot <onboarding@resend.dev>"),
                "to": [email], "subject": subject, "text": text,
            })
        return True
    except Exception as e:
        print(f"[auth] email send failed: {e}")
        return False


def _base_url() -> str:
    return os.environ.get("APP_BASE_URL", "").rstrip("/")


def _send_reset_email(email: str, token: str):
    link = f"{_base_url()}/?reset={token}"
    _send_email(email, "Reset your AppPilot password",
                f"Reset your password (link valid 1 hour):\n\n{link}\n\n"
                "If you didn't ask for this, ignore it.")


def _send_verify_email(db, user_id, email: str):
    token = secrets.token_urlsafe(32)
    db.email_verifications.insert_one({
        "user_id": user_id, "token": token,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    link = f"{_base_url()}/?verify={token}"
    _send_email(email, "Verify your AppPilot email",
                f"Confirm this is your email:\n\n{link}\n\n"
                "If you didn't sign up, ignore this.")


@router.post("/reset")
def reset(body: ResetRequest):
    db = _db()
    if len(body.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    doc = db.password_resets.find_one({"token": body.token.strip(), "used": False})
    if not doc or doc["expires_at"] < datetime.now(timezone.utc).timestamp():
        raise HTTPException(status_code=400, detail="Reset link is invalid or expired — request a new one")
    salt = secrets.token_hex(16)
    db.users.update_one({"_id": doc["user_id"]},
                        {"$set": {"password_hash": hash_password(body.password, salt), "salt": salt}})
    db.password_resets.update_one({"_id": doc["_id"]}, {"$set": {"used": True}})
    # Invalidate all existing sessions — stolen-session risk ends here.
    db.sessions.delete_many({"user_id": doc["user_id"]})
    return {"ok": True}


@router.get("/verify")
def verify_email(token: str):
    """Clicked from the verification email — marks the address verified."""
    db = _db()
    doc = db.email_verifications.find_one({"token": token.strip()})
    if not doc:
        raise HTTPException(status_code=400, detail="Invalid or already-used link")
    db.users.update_one({"_id": doc["user_id"]}, {"$set": {"email_verified": True}})
    db.email_verifications.delete_one({"_id": doc["_id"]})
    return {"ok": True, "verified": True}


@router.post("/resend-verify")
def resend_verify(user=Depends(get_current_user)):
    db = _db()
    if user.get("email_verified"):
        return {"ok": True, "already": True}
    _send_verify_email(db, user["_id"], user["email"])
    return {"ok": True}


class DeleteAccount(BaseModel):
    password: str


@router.delete("/account")
def delete_account(body: DeleteAccount, user=Depends(get_current_user)):
    """Self-serve account deletion — requires password confirm. Removes the
    user and everything attached to them."""
    db = _db()
    if hash_password(body.password, user.get("salt", "")) != user.get("password_hash"):
        raise HTTPException(status_code=401, detail="Wrong password")
    uid = user["_id"]
    pids = [p["_id"] for p in db.projects.find({"user_id": uid}, {"_id": 1})]
    db.mentor_messages.delete_many({"project_id": {"$in": pids}})
    for coll in ("projects", "sessions", "credit_transactions",
                 "password_resets", "email_verifications", "feedback"):
        getattr(db, coll).delete_many({"user_id": uid})
    db.users.delete_one({"_id": uid})
    return {"deleted": True}


@router.post("/logout")
def logout(user=Depends(get_current_user), creds=Depends(_bearer_dep)):
    db = _db()
    db.sessions.delete_one({"token": creds.credentials})
    return {"ok": True}
