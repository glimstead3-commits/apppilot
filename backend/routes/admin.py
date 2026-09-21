"""Admin routes — manual plan upgrades and credit grants.

Billing is deferred, so "upgrade" is an operator action: mark your own
account is_admin=true in Mongo, then use these endpoints (or curl).
Every grant/upgrade lands in the credit ledger for auditability.
"""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from utils.auth import get_current_user
from utils.database import get_db

router = APIRouter(prefix="/api/admin")


class PlanChange(BaseModel):
    plan: str  # "free" | "paid"


class CreditGrant(BaseModel):
    amount: int
    reason: str = "admin_grant"


def _db():
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return db


def _admin(user=Depends(get_current_user)):
    if not user.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin only")
    return user


def _find_user(db, email: str):
    u = db.users.find_one({"email": email.strip().lower()})
    if not u:
        raise HTTPException(status_code=404, detail="No user with that email")
    return u


@router.post("/users/{email}/plan")
def set_plan(email: str, body: PlanChange, admin=Depends(_admin)):
    if body.plan not in ("free", "paid"):
        raise HTTPException(status_code=400, detail="plan must be 'free' or 'paid'")
    db = _db()
    u = _find_user(db, email)
    db.users.update_one({"_id": u["_id"]}, {"$set": {"plan": body.plan}})
    return {"email": u["email"], "plan": body.plan, "set_by": admin["email"]}


@router.post("/users/{email}/credits")
def grant_credits(email: str, body: CreditGrant, admin=Depends(_admin)):
    db = _db()
    u = _find_user(db, email)
    db.users.update_one({"_id": u["_id"]}, {"$inc": {"credits_balance": body.amount}})
    db.credit_transactions.insert_one({
        "user_id": u["_id"], "amount": body.amount, "kind": "grant",
        "reason": f"{body.reason} (by {admin['email']})",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    u = db.users.find_one({"_id": u["_id"]})
    return {"email": u["email"], "credits_balance": u.get("credits_balance", 0)}


@router.get("/users")
def list_users(admin=Depends(_admin)):
    db = _db()
    out = []
    for u in db.users.find().sort("created_at", -1).limit(200):
        out.append({
            "email": u["email"], "name": u.get("name", ""),
            "plan": u.get("plan", "free"),
            "credits_balance": u.get("credits_balance", 0),
            "email_verified": bool(u.get("email_verified")),
            "projects": db.projects.count_documents({"user_id": u["_id"]}),
            "created_at": u.get("created_at"),
        })
    return {"users": out}


@router.get("/feedback")
def list_feedback(admin=Depends(_admin)):
    db = _db()
    return {"feedback": [
        {"email": f.get("email", ""), "message": f.get("message", ""),
         "created_at": f.get("created_at")}
        for f in db.feedback.find().sort("created_at", -1).limit(100)
    ]}


@router.get("/users/{email}/reset-link")
def get_reset_link(email: str, admin=Depends(_admin)):
    """Manual password reset path: fetch a user's pending reset link so you
    can send it yourself. Used until real email delivery is configured."""
    import os
    db = _db()
    u = _find_user(db, email)
    doc = db.password_resets.find_one(
        {"user_id": u["_id"], "used": False}, sort=[("created_at", -1)])
    if not doc:
        raise HTTPException(status_code=404,
                            detail="No pending reset — user must hit 'Forgot password' first")
    base = os.environ.get("APP_BASE_URL", "").rstrip("/")
    return {"link": f"{base}/?reset={doc['token']}",
            "expires_at": doc["expires_at"]}


@router.get("/users/{email}")
def inspect_user(email: str, admin=Depends(_admin)):
    db = _db()
    u = _find_user(db, email)
    projects = db.projects.count_documents({"user_id": u["_id"]})
    return {
        "email": u["email"], "name": u.get("name", ""),
        "plan": u.get("plan", "free"),
        "credits_balance": u.get("credits_balance", 0),
        "projects": projects,
        "created_at": u.get("created_at"),
    }
