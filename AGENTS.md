# AppPilot

Stage-gated wizard that walks novices through building an app with AI —
with an AI mentor at each stage. See `docs/BUILD-LOG.md` for the full
definition and architecture decisions (it follows
`docs/APP-BUILD-PLAYBOOK.md` from the MCEFC CRM repo).

## Stack

- Backend: FastAPI + MongoDB (`backend/server.py`), `MONGO_URL` env var,
  DB name `apppilot` (override with `DB_NAME`)
- Frontend: React + Vite (`frontend/`), served by the backend from
  `frontend/dist` in production
- Single Render service deploys both

## Commands

- Local backend: `cd backend && pip install -r requirements.txt && python3 -m uvicorn server:app --reload --port 8000`
- Local frontend dev: `cd frontend && npm run dev` (proxies /api → :8000)
- Frontend build: `cd frontend && npm install && npx vite build`
- Backend check: `cd backend && python3 -c "import ast; ast.parse(open('server.py').read())"`
- Health: `GET /api/health`

## Deploy (Render)

- Build: `cd frontend && npm install && npx vite build && cd ../backend && pip install -r requirements.txt`
- Start: `cd backend && uvicorn server:app --host 0.0.0.0 --port $PORT`
- Env vars: `MONGO_URL`, `DB_NAME=apppilot` (later: `AI_API_KEY`, `JWT_SECRET`)
- Local dev only: `DEV_ALL_ACCESS=1` unlocks plan gates + credit checks for
  every account — never set it in production

## Rules

- No secrets in the repo — env vars only
- Every record carries `user_id` (multi-user from day one)
- Credit ledger (`credit_transactions`) — never just a counter
- Stage definitions live as data, not code
