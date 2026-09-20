"""Project routes — create/list/get + save stage answers with gate checks."""
from datetime import datetime, timezone

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from utils.auth import get_current_user
from utils.database import get_db

router = APIRouter(prefix="/api/projects")


class NewProject(BaseModel):
    name: str


class StageAnswers(BaseModel):
    answers: dict


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

    import json
    from pathlib import Path
    defs = json.loads(
        (Path(__file__).resolve().parent.parent / "data" / "stage_definitions.json").read_text()
    )["stages"]
    by_key = {s["key"]: s for s in defs}
    if stage_key not in by_key:
        raise HTTPException(status_code=404, detail="Unknown stage")

    stage = by_key[stage_key]
    if stage["order"] > p.get("current_stage", 0):
        raise HTTPException(status_code=403, detail="Complete earlier stages first")

    # All questions must have a non-empty answer to pass the stage.
    required = [q["key"] for q in stage.get("questions", [])]
    missing = [k for k in required if not str(body.answers.get(k, "")).strip()]
    completed = not missing

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
