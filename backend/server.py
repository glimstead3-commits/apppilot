"""AppPilot backend — FastAPI + MongoDB, serves the built frontend.

Single-service deploy: `npx vite build` outputs frontend/dist, which this
serves as static files with an SPA fallback. API under /api/*.
"""
import os
from pathlib import Path

from fastapi import Depends, FastAPI, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from pymongo import MongoClient

MONGO_URL = os.environ.get("MONGO_URL", "")
DB_NAME = os.environ.get("DB_NAME", "apppilot")

app = FastAPI(title="AppPilot")

from utils.auth import get_current_user  # noqa: E402

from routes import admin as admin_routes  # noqa: E402
from routes import auth as auth_routes  # noqa: E402
from routes import mentor as mentor_routes  # noqa: E402
from routes import projects as project_routes  # noqa: E402

app.include_router(admin_routes.router)
app.include_router(auth_routes.router)
app.include_router(mentor_routes.router)
app.include_router(project_routes.router)

_db = None


def get_db():
    global _db
    if _db is None:
        if not MONGO_URL:
            return None
        _db = MongoClient(MONGO_URL)[DB_NAME]
    return _db


@app.get("/api/stages")
def stages():
    """Playbook stage definitions — served as data so content edits don't
    need code changes."""
    import json
    path = Path(__file__).resolve().parent / "data" / "stage_definitions.json"
    return json.loads(path.read_text())["stages"]


@app.post("/api/feedback")
def feedback(body: dict, user=Depends(get_current_user)):
    """Logged-in user feedback → db.feedback for the operator to read via
    /api/admin/feedback."""
    from datetime import datetime, timezone
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    msg = str(body.get("message", "")).strip()[:2000]
    if not msg:
        raise HTTPException(status_code=400, detail="Empty message")
    db.feedback.insert_one({
        "user_id": user["_id"], "email": user.get("email", ""),
        "message": msg, "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return {"ok": True}


@app.get("/api/guides")
def guides():
    """Third-party integration guides — content as data."""
    import json
    return json.loads(
        (Path(__file__).resolve().parent / "data" / "guides.json").read_text())["guides"]


@app.get("/api/legal/{key}")
def legal(key: str):
    import json
    docs = json.loads(
        (Path(__file__).resolve().parent / "data" / "legal.json").read_text())
    if key not in docs:
        return JSONResponse({"detail": "Not found"}, status_code=404)
    return docs[key]


@app.get("/api/config")
def config():
    """Public config the frontend needs before login — no secrets."""
    from utils.auth import SIGNUP_CREDITS
    return {"signup_credits": SIGNUP_CREDITS}


@app.get("/api/health")
def health():
    db = get_db()
    db_ok = False
    if db is not None:
        try:
            db.command("ping")
            db_ok = True
        except Exception:
            db_ok = False
    return {
        "ok": True,
        "service": "apppilot",
        "db": "connected" if db_ok else "not_configured",
        # Render injects RENDER_GIT_COMMIT — lets us confirm which commit is live.
        "commit": os.environ.get("RENDER_GIT_COMMIT", "local")[:7],
        # Shows whether the mentor is wired up — never exposes the key itself.
        "mentor": os.environ.get("AI_PROVIDER", "anthropic")
                  if os.environ.get("AI_API_KEY", "").strip() else "offline",
    }


# --- Static frontend (built by `npx vite build` in frontend/) ---
DIST = Path(__file__).resolve().parent.parent / "frontend" / "dist"

if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{full_path:path}")
    def spa(full_path: str):
        if full_path.startswith("api/"):
            return JSONResponse({"detail": "Not found"}, status_code=404)
        candidate = DIST / full_path
        if full_path and candidate.is_file():
            return FileResponse(candidate)
        return FileResponse(DIST / "index.html")
