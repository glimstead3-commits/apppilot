"""Project routes — create/list/get + save stage answers with gate checks."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from utils.auth import get_current_user
from utils.database import get_db

router = APIRouter(prefix="/api/projects")

# Free plan covers the aha moment (Define + Architect), paid unlocks the rest.
# Billing itself is deferred — upgrade is a manual/admin action for now.
FREE_STAGE_LIMIT = 2


class NewProject(BaseModel):
    name: str


class StageAnswers(BaseModel):
    answers: dict


def _stage_defs():
    import json
    from pathlib import Path
    return json.loads(
        (Path(__file__).resolve().parent.parent / "data" / "stage_definitions.json").read_text()
    )["stages"]


def _db():
    db = get_db()
    if db is None:
        raise HTTPException(status_code=503, detail="Database not configured")
    return db


def _public(p: dict) -> dict:
    return {
        "id": str(p["_id"]),
        "name": p.get("name", ""),
        "stages": p.get("stages", {}),
        "current_stage": p.get("current_stage", 0),
        "created_at": p.get("created_at"),
    }


def _get_owned(db, project_id: str, user) -> dict:
    try:
        oid = ObjectId(project_id)
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid project id")
    p = db.projects.find_one({"_id": oid, "user_id": user["_id"]})
    if not p:
        raise HTTPException(status_code=404, detail="Project not found")
    return p


@router.post("")
def create_project(body: NewProject, user=Depends(get_current_user)):
    db = _db()
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Project name required")
    res = db.projects.insert_one({
        "user_id": user["_id"],
        "name": name,
        "stages": {},
        "current_stage": 0,
        "created_at": datetime.now(timezone.utc).isoformat(),
    })
    return _public(db.projects.find_one({"_id": res.inserted_id}))


@router.get("")
def list_projects(user=Depends(get_current_user)):
    db = _db()
    return [_public(p) for p in db.projects.find({"user_id": user["_id"]}).sort("created_at", -1)]


@router.get("/{project_id}")
def get_project(project_id: str, user=Depends(get_current_user)):
    return _public(_get_owned(_db(), project_id, user))


@router.post("/{project_id}/stages/{stage_key}")
def save_stage(project_id: str, stage_key: str, body: StageAnswers,
               user=Depends(get_current_user)):
    """Save answers for a stage. Gate: stage must be current_stage —
    earlier stages must be complete first."""
    db = _db()
    p = _get_owned(db, project_id, user)

    defs = _stage_defs()
    by_key = {s["key"]: s for s in defs}
    if stage_key not in by_key:
        raise HTTPException(status_code=404, detail="Unknown stage")

    stage = by_key[stage_key]
    if stage["order"] > p.get("current_stage", 0):
        raise HTTPException(status_code=403, detail="Complete earlier stages first")
    if user.get("plan") == "free" and stage["order"] >= FREE_STAGE_LIMIT:
        raise HTTPException(
            status_code=402,
            detail="Free plan covers Define & Architect — upgrade to unlock the full journey",
        )

    # Gate = every question answered AND every checklist item ticked.
    missing = [q["key"] for q in stage.get("questions", [])
               if not str(body.answers.get(q["key"], "")).strip()]
    unticked = [f"check:{i}" for i in range(len(stage.get("checklist", [])))
                if body.answers.get(f"check:{i}") is not True]
    completed = not missing and not unticked

    db.projects.update_one(
        {"_id": p["_id"]},
        {"$set": {
            f"stages.{stage_key}": {
                "answers": body.answers,
                "completed": completed,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
        }},
    )
    # Gate: completing the current stage unlocks the next.
    update = {}
    if completed and stage["order"] == p.get("current_stage", 0):
        update["current_stage"] = min(stage["order"] + 1, len(defs) - 1)
    if update:
        db.projects.update_one({"_id": p["_id"]}, {"$set": update})
    return _public(db.projects.find_one({"_id": p["_id"]}))


@router.delete("/{project_id}")
def delete_project(project_id: str, user=Depends(get_current_user)):
    db = _db()
    p = _get_owned(db, project_id, user)
    db.projects.delete_one({"_id": p["_id"]})
    db.mentor_messages.delete_many({"project_id": p["_id"]})
    return {"deleted": True}


@router.get("/{project_id}/export")
def export_build_log(project_id: str, user=Depends(get_current_user)):
    """Generate docs/BUILD-LOG.md for the new app's repo — the filled-in
    playbook checklist with this project's answers."""
    p = _get_owned(_db(), project_id, user)
    lines = [
        f"# BUILD LOG — {p.get('name', 'Untitled')}",
        "",
        "> Generated by AppPilot — the stage-gated app-building playbook.",
        "",
    ]
    for s in _stage_defs():
        st = (p.get("stages") or {}).get(s["key"], {})
        answers = st.get("answers") or {}
        passed = "x" if st.get("completed") else " "
        lines.append(f"## Stage {s['order']} — {s['title']}  [{passed}]")
        lines.append("")
        for q in s.get("questions", []):
            a = str(answers.get(q["key"], "")).strip()
            lines.append(f"- **{q['ask']}**")
            lines.append(f"  {a or '—'}")
        for i, item in enumerate(s.get("checklist", [])):
            tick = "x" if answers.get(f"check:{i}") is True else " "
            lines.append(f"- [{tick}] {item}")
        lines.append(f"- Gate: {s.get('gate', '')}")
        lines.append("")
    return {"filename": "BUILD-LOG.md", "markdown": "\n".join(lines)}
