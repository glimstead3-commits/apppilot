# Backup & Restore — AppPilot

Stage 5 gate item: prove you can lose the database and get it back.

## What we back up

One MongoDB database (`apppilot`) on Atlas. Collections that matter:
`users`, `projects`, `mentor_messages`, `credit_transactions`, `sessions`
(sessions are expendable — losing them just logs everyone out).

## Free-tier reality

Atlas M0 (free) has **no automatic snapshots**. Options:

- **Good enough for v1:** periodic `mongodump`/`mongoexport` to local disk
  or cloud storage.
- **When paying customers exist:** move to an M10+ cluster (continuous
  backups + point-in-time restore) — this is a launch blocker for paid
  users, not for dev.

## Backup (manual)

```bash
mongodump --uri="$MONGO_URL" --db=apppilot --out=./backups/$(date +%Y%m%d)
```

Or per-collection JSON:

```bash
mongoexport --uri="$MONGO_URL" --db=apppilot --collection=projects --out=projects.json
```

## Restore (the part you must actually test)

```bash
mongorestore --uri="$MONGO_URL" --db=apppilot_restored ./backups/20260101/apppilot
```

Restore to a **different db name** (`apppilot_restored`), verify counts,
then swap `DB_NAME` — never restore over live data blindly.

## Gate 5 checklist

- [ ] Ran a backup once
- [ ] Restored to a scratch db and verified a project survives
- [ ] Wrote down how long it took (recovery time matters)
