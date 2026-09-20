"""Auth routes — signup/login/me. Signup grants free credits via the ledger."""
import secrets
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, EmailStr

from utils.auth import (
    SIGNUP_CREDITS, create_session, get_current_user, hash_password, public_user,
)
from utils.database import get_db

router = APIRouter(prefix="/api/auth")


class Credentials(BaseModel):
    email: EmailStr
    password: str
    name: str = ""


def _db():
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return db


@router.post("/signup")
def signup(body: Credentials):
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
def login(body: Credentials):
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
