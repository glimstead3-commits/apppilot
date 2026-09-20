# BUILD LOG — AppPilot

> Built following `APP-BUILD-PLAYBOOK.md` — this project is the playbook's
> first full run-through.

## Stage 0 — Define

- **One sentence:** A website that walks novices through building an app
  with AI — a stage-gated wizard with an AI mentor at each stage: what to
  ask your AI builder, how to check its work, and when you're ready to
  move on.
- **First real user:** Stuart — then other novices (planned paying
  customers, so multi-user from day one).
- **Must-do (3):**
  1. Accounts + create a project → walk the 7 stages with checklists
  2. Gates actually gate — a stage can't unlock until the previous one
     passes
  3. Generate `docs/BUILD-LOG.md` for the new app's repo
- **Not doing (v1):** writing actual app code, GitHub/Render API
  automation, real billing, multi-user collaboration
- **"Launched" means:** a novice runs a real app idea through it
  end-to-end without my help
- [x] GATE 0 PASSED

## Stage 1 — Architecture decisions

- **Data isolation:** shared DB, every record tagged `user_id`. Project
  checklists are low-sensitivity data (unlike the CRM's kids' data, which
  justified per-customer DBs — isolation is a per-app decision driven by
  data sensitivity).
- **Auth:** email/password accounts from day one — retrofitting auth to a
  single-user app is painful.
- **Config:** stage definitions (playbook content) stored as data, not
  code — process changes don't need a redeploy.
- **Secrets:** env vars only — `MONGO_URL`, `AI_API_KEY`, `JWT_SECRET`.
- **AI:** OpenAI/Anthropic via env key. **Usage metered per user from day
  one** — `credit_transactions` ledger (grant/spend rows, auditable) +
  `credits_balance` + `plan` field ready for Stripe later. Free signup
  credits cover the aha moment (Stage 0–1); paywall lands mid-journey.
  Billing deferred — v1 shows "contact us" when credits run out.
- **External deps:** AI API is the only one. Fallback if down: show
  cached stage guidance + "mentor offline" notice — the checklist still
  works without AI.
- **Data model:** `users` (auth, plan, credits_balance),
  `projects` (name, stage, per-stage answers JSON),
  `credit_transactions` (ledger), `stage_definitions` (playbook content).
- [x] GATE 1 PASSED

## Stage 2 — Foundation

- [ ] Auto-deploys (Render ← main)
- [ ] DB connected
- [ ] No secrets in repo
- [ ] Live URL loads
- [ ] GATE 2 PASSED — date:

## Stage 3 — First slice

- The one action: **sign up → create a project → answer Stage 0 questions
  → see them saved**
- [ ] Works end-to-end — date:

## Stage 4 — Feature slices

- [ ] Stages 1–7 wizard screens + checklists
- [ ] Gate enforcement (stage N locked until N-1 complete)
- [ ] AI mentor per stage (interviewer → architect → setup guide → …)
- [ ] Credit ledger UI + free-signup grant
- [ ] Build-log export
- [ ] GATE 4 PASSED — date:

## Stage 5 — Harden

- [ ] Auth/data-isolation tested (user A can't see user B)
- [ ] Secrets audit clean
- [ ] Signup abuse protection (email verify / rate limit — free AI
  credits are a spam target)
- [ ] Backup restore tested
- [ ] GATE 5 PASSED — date:

## Stage 6 — Launch

- First real user: Stuart running a real app idea
- What confused them:
- [ ] GATE 6 PASSED — date:

## Stage 7 — Operate

- Health check at: `/api/health`
- Errors reported via:
