"""AI mentor — per-stage guidance chat.

Spends 1 credit per message via the credit ledger. When no AI_API_KEY is
configured the mentor falls back to the stage's static guidance so the app
still works offline/free.

Env vars: AI_PROVIDER ("anthropic"|"openai"|"gemini", default anthropic),
AI_API_KEY, AI_MODEL (optional per provider).
"""
import os
from datetime import datetime, timezone
from collections import defaultdict
import time

# Tiny in-memory rate limiter — good enough for one Render instance.
# (On multiple instances, move to MongoDB/Redis.)
_buckets = defaultdict(list)

def _rate_limit(key: str, max_calls: int, window_s: int):
    now = time.time()
    hits = [t for t in _buckets[key] if now - t < window_s]
    _buckets[key] = hits
    if len(hits) >= max_calls:
        raise HTTPException(status_code=429, detail="Slow down — too many requests, try again in a minute")
    hits.append(now)

import requests
from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from utils.auth import get_current_user
from utils.database import get_db

router = APIRouter(prefix="/api/projects")

MENTOR_COST = 1

# Last AI error, surfaced via /api/health — diagnosing "mentor is offline"
# shouldn't require digging through platform logs.
LAST_AI_ERROR = ""

PROVIDERS = {
    "anthropic": {
        "url": "https://api.anthropic.com/v1/messages",
        "model": os.environ.get("AI_MODEL", "claude-haiku-4-5-20251001"),
    },
    "openai": {
        "url": "https://api.openai.com/v1/chat/completions",
        "model": os.environ.get("AI_MODEL", "gpt-4o-mini"),
    },
    # Free tier available at aistudio.google.com — good for v1 validation.
    "gemini": {
        "url": "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
        "model": os.environ.get("AI_MODEL", "gemini-2.0-flash"),
    },
}


class MentorMessage(BaseModel):
    message: str


def _db():
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return db


def _stage_defs():
    import json
    from pathlib import Path
    return json.loads(
        (Path(__file__).resolve().parent.parent / "data" / "stage_definitions.json").read_text()
    )["stages"]


def _system_prompt(stage: dict, project: dict) -> str:
    answers = (project.get("stages") or {}).get(stage["key"], {}).get("answers") or {}
    answers_txt = "\n".join(f"- {k}: {v}" for k, v in answers.items()
                            if not k.startswith("check:") and str(v).strip())
    traps_txt = ""
    if stage.get("traps"):
        traps_txt = "Traps novices hit at this stage (warn them when relevant):\n" + "\n".join(
            f"- {t['trap']}: {t['story']}" for t in stage["traps"])
    return f"""You are AppPilot's mentor — a patient senior developer guiding a complete novice through building their app "{project.get('name', '')}".

They are on Stage {stage['order']} — {stage['title']}.
What this stage is: {stage.get('plain', '')}
Why it matters: {stage.get('why', '')}
Gate to pass: {stage.get('gate', '')}
{traps_txt}
{f"Their answers so far:{chr(10)}{answers_txt}" if answers_txt else ""}

Rules:
- Plain English only. No jargon — explain terms when you must use them.
- Never write code. You guide; their AI coding tool does the building.
- One idea per reply. End with ONE clear question or action for them.
- Keep replies under 120 words.
- If they seem lost, give them the exact next click/action.
- If they ask something off-topic for this stage, answer briefly then steer back.
"""


def _call_ai(system: str, history: list) -> str:
    provider = os.environ.get("AI_PROVIDER", "anthropic").lower()
    cfg = PROVIDERS.get(provider)
    # strip(): pasted keys often carry a trailing newline/space → bad header
    key = os.environ.get("AI_API_KEY", "").strip()
    if not cfg or not key:
        return ""
    if provider == "gemini":
        url = cfg["url"].format(model=cfg["model"])
        r = requests.post(url, timeout=30,
                          headers={"x-goog-api-key": key, "content-type": "application/json"},
                          json={
                              "system_instruction": {"parts": [{"text": system}]},
                              "contents": [
                                  {"role": "user" if h["role"] == "user" else "model",
                                   "parts": [{"text": h["content"]}]}
                                  for h in history
                              ],
                              "generationConfig": {"maxOutputTokens": 400},
                          })
        r.raise_for_status()
        return r.json()["candidates"][0]["content"]["parts"][0]["text"]
    if provider == "anthropic":
        r = requests.post(cfg["url"], timeout=30, headers={
            "x-api-key": key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        }, json={
            "model": cfg["model"],
            "max_tokens": 400,
            "system": system,
            "messages": history,
        })
        r.raise_for_status()
        return r.json()["content"][0]["text"]
    r = requests.post(cfg["url"], timeout=30, headers={
        "Authorization": f"Bearer {key}",
        "content-type": "application/json",
    }, json={
        "model": cfg["model"],
        "max_tokens": 400,
        "messages": [{"role": "system", "content": system}] + history,
    })
    r.raise_for_status()
    return r.json()["choices"][0]["message"]["content"]


@router.post("/{project_id}/stages/{stage_key}/mentor")
def mentor_chat(project_id: str, stage_key: str, body: MentorMessage,
                user=Depends(get_current_user)):
    _rate_limit(f"mentor:{user['_id']}", 20, 60)
    db = _db()
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project id")
    p = db.projects.find_one({"_id": oid, "user_id": user["_id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")

    stage = next((s for s in _stage_defs() if s["key"] == stage_key), None)
    if not stage:
        raise HTTPException(status_code=404, detail="Unknown stage")
    if user.get("plan") == "free" and stage.get("order", 0) >= 2:
        raise HTTPException(status_code=402,
                            detail="Upgrade to unlock the mentor for this stage")

    msg = body.message.strip()
    if not msg:
        raise HTTPException(status_code=400, detail="Empty message")

    # --- Credit pre-check (spend happens only if the AI actually answers) ---
    ai_on = bool(os.environ.get("AI_API_KEY", "").strip())
    if ai_on and (user.get("credits_balance") or 0) < MENTOR_COST:
        raise HTTPException(status_code=402,
                            detail="Out of credits — top up to keep chatting with the mentor")

    # --- History (per project+stage) ---
    hist_docs = list(
        db.mentor_messages.find({"project_id": oid, "stage_key": stage_key})
        .sort("created_at", 1).limit(40)
    )
    history = [{"role": h["role"], "content": h["content"]} for h in hist_docs]
    history.append({"role": "user", "content": msg})

    now = datetime.now(timezone.utc).isoformat()
    db.mentor_messages.insert_one({
        "project_id": oid, "stage_key": stage_key, "role": "user",
        "content": msg, "created_at": now,
    })

    ai_reply = ""
    global LAST_AI_ERROR
    if ai_on:
        try:
            ai_reply = _call_ai(_system_prompt(stage, p), history)
            LAST_AI_ERROR = ""
        except Exception as e:
            LAST_AI_ERROR = f"{os.environ.get('AI_PROVIDER','anthropic')}: {e}"
            print(f"[mentor] AI call failed: {LAST_AI_ERROR}")
            ai_reply = ""

    if ai_reply:
        # Charge only on a successful AI answer — never for the fallback.
        db.users.update_one({"_id": user["_id"]}, {"$inc": {"credits_balance": -MENTOR_COST}})
        db.credit_transactions.insert_one({
            "user_id": user["_id"],
            "amount": -MENTOR_COST,
            "kind": "spend",
            "reason": f"mentor:{stage_key}",
            "created_at": datetime.now(timezone.utc).isoformat(),
        })
        reply = ai_reply
    else:
        reply = (
            "Mentor's offline right now, so here's the stage guide instead:\n\n"
            f"{stage.get('plain', '')}\n\n"
            f"To pass this gate: {stage.get('gate', '')}"
        )

    db.mentor_messages.insert_one({
        "project_id": oid, "stage_key": stage_key, "role": "assistant",
        "content": reply, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"reply": reply, "ai": bool(ai_reply)}


@router.post("/{project_id}/stages/{stage_key}/draft")
def mentor_draft(project_id: str, stage_key: str, user=Depends(get_current_user)):
    """Turn the mentor chat into draft answers for the stage's questions.
    Spends 1 credit. Returns an answers dict the frontend fills in."""
    _rate_limit(f"mentor:{user['_id']}", 20, 60)
    db = _db()
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project id")
    p = db.projects.find_one({"_id": oid, "user_id": user["_id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    stage = next((s for s in _stage_defs() if s["key"] == stage_key), None)
    if not stage:
        raise HTTPException(status_code=404, detail="Unknown stage")
    if user.get("plan") == "free" and stage.get("order", 0) >= 2:
        raise HTTPException(status_code=402,
                            detail="Upgrade to unlock the mentor for this stage")
    questions = stage.get("questions") or []
    if not questions:
        raise HTTPException(status_code=400, detail="This stage has no questions to draft")

    if not os.environ.get("AI_API_KEY", "").strip():
        raise HTTPException(status_code=503, detail="Mentor is not configured")
    if (user.get("credits_balance") or 0) < MENTOR_COST:
        raise HTTPException(status_code=402, detail="Out of credits")

    hist = list(db.mentor_messages.find({"project_id": oid, "stage_key": stage_key})
                .sort("created_at", 1).limit(40))
    if not hist:
        raise HTTPException(status_code=400, detail="Chat with the mentor first")
    convo = "\n".join(f"{h['role']}: {h['content']}" for h in hist)

    keys = ", ".join(f'"{q["key"]}"' for q in questions)
    asks = "\n".join(f'- "{q["key"]}": {q["ask"]}' for q in questions)
    prompt = (
        f"Based on this conversation about the app idea \"{p.get('name','')}\",\n"
        f"draft concise answers for each question. Output ONLY a JSON object\n"
        f"with exactly these keys: {keys}\n\nQuestions:\n{asks}\n\n"
        f"Conversation:\n{convo}\n\nJSON:"
    )
    reply = _call_ai(
        "You convert mentoring chats into structured answers. Output raw JSON only — no markdown fences, no commentary.",
        [{"role": "user", "content": prompt}],
    )
    import json as _json, re as _re
    m = _re.search(r"\{.*\}", reply, _re.S)
    answers = _json.loads(m.group(0)) if m else {}
    answers = {k: str(v) for k, v in answers.items() if k in {q["key"] for q in questions}}
    if not answers:
        raise HTTPException(status_code=502, detail="Mentor couldn't draft answers — try again")

    db.users.update_one({"_id": user["_id"]}, {"$inc": {"credits_balance": -MENTOR_COST}})
    db.credit_transactions.insert_one({
        "user_id": user["_id"], "amount": -MENTOR_COST, "kind": "spend",
        "reason": f"mentor_draft:{stage_key}",
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"answers": answers}


@router.get("/{project_id}/stages/{stage_key}/mentor")
def mentor_history(project_id: str, stage_key: str, user=Depends(get_current_user)):
    db = _db()
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project id")
    if not db.projects.find_one({"_id": oid, "user_id": user["_id"]}):
        raise HTTPException(status_code=404, detail="Project not found")
    msgs = [
        {"role": m["role"], "content": m["content"]}
        for m in db.mentor_messages.find({"project_id": oid, "stage_key": stage_key})
        .sort("created_at", 1)
    ]
    return {"messages": msgs, "ai": bool(os.environ.get("AI_API_KEY", "").strip())}
