import { useEffect, useState } from "react";

const API = "";
const TOKEN_KEY = "ap_token";

const card = {
  background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: "16px 20px",
};
const input = {
  width: "100%", padding: "10px 12px", borderRadius: 8, border: "1px solid #cbd5e1",
  fontSize: 14, marginTop: 4,
};
const btn = {
  background: "#17203a", color: "#fff", border: "none", borderRadius: 8,
  padding: "10px 18px", fontSize: 14, fontWeight: 600, cursor: "pointer",
};

async function api(path, opts = {}) {
  const token = localStorage.getItem(TOKEN_KEY);
  const res = await fetch(`${API}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(opts.headers || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "Request failed");
  return data;
}

export default function App() {
  const [user, setUser] = useState(null);
  const [stages, setStages] = useState([]);
  const [view, setView] = useState("loading"); // loading | auth | reset | home | project
  const [resetToken, setResetToken] = useState("");
  const [verifyToken, setVerifyToken] = useState("");
  const [legalDoc, setLegalDoc] = useState("");
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);

  useEffect(() => {
    fetch("/api/stages").then((r) => r.json()).then(setStages).catch(() => {});
    const path = window.location.pathname.replace(/^\//, "");
    if (["privacy", "terms", "security"].includes(path)) {
      setLegalDoc(path); setView("legal"); return;
    }
    if (path === "guides") { setView("guides"); return; }
    const params = new URLSearchParams(window.location.search);
    const reset = params.get("reset");
    if (reset) { setResetToken(reset); setView("reset"); return; }
    const verify = params.get("verify");
    if (verify) { setVerifyToken(verify); setView("verify"); return; }
    if (path === "admin") setView("admin_pending"); // resolved after /me
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return setView("auth");
    api("/api/auth/me")
      .then((u) => {
        setUser(u);
        setView((v) => v === "admin_pending" ? (u.is_admin ? "admin" : "home") : "home");
        loadProjects();
      })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setView("auth"); });
  }, []);

  const loadProjects = () =>
    api("/api/projects").then(setProjects).catch(() => {});

  const openProject = (id) =>
    api(`/api/projects/${id}`).then((p) => { setProject(p); setView("project"); });

  if (view === "loading") return null;
  if (view === "legal") return <LegalPage docKey={legalDoc} />;
  if (view === "guides") return <GuidesPage />;
  if (view === "verify")
    return <VerifyEmail token={verifyToken} onDone={() => {
      window.history.replaceState({}, "", "/"); setVerifyToken(""); setView("auth");
    }} />;
  if (view === "admin" && user?.is_admin) return <AdminPage />;
  if (view === "auth") return <Auth onDone={(u) => { setUser(u); setView("home"); loadProjects(); }} />;
  if (view === "reset")
    return <ResetPassword token={resetToken} onDone={() => {
      window.history.replaceState({}, "", "/");
      setResetToken(""); setView("auth");
    }} />;
  if (view === "project" && project)
    return (
      <ProjectView
        project={project}
        stages={stages}
        onBack={() => { setProject(null); setView("home"); loadProjects(); }}
        onSaved={(p) => setProject(p)}
      />
    );
  return (
    <Home
      user={user}
      projects={projects}
      stages={stages}
      onOpen={openProject}
      onCreated={(p) => { setProject(p); setView("project"); }}
      onChanged={loadProjects}
      onLogout={async () => {
        try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch {}
        localStorage.removeItem(TOKEN_KEY); setUser(null); setView("auth");
      }}
    />
  );
}

/* ---------- Auth ---------- */

function Auth({ onDone }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [credits, setCredits] = useState(15);
  const [agreed, setAgreed] = useState(false);
  useEffect(() => {
    fetch("/api/config").then((r) => r.json())
      .then((c) => setCredits(c.signup_credits ?? 15)).catch(() => {});
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr(""); setSent(false);
    try {
      if (mode === "forgot") {
        await api("/api/auth/forgot", { method: "POST", body: JSON.stringify({ email }) });
        setSent(true);
      } else {
        const data = await api(`/api/auth/${mode}`, {
          method: "POST",
          body: JSON.stringify({ email, password, name, agreed }),
        });
        localStorage.setItem(TOKEN_KEY, data.token);
        onDone(data.user);
      }
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-brand">
        <div className="auth-logo"><span className="auth-logo-dot">▲</span> AppPilot</div>
        <div>
          <div className="auth-headline">Learn to build your first app — <em>the right way.</em></div>
          <p className="auth-sub">AppPilot doesn't write code. It's the instructor that teaches you the professional process — what to ask your AI builder next, and how to check its work before you move on.</p>

          {/* product preview — the "image": tilted card + ghost + mentor bubble */}
          <div className="auth-visual">
            <div className="auth-preview-ghost" />
            <div className="auth-preview">
              <div className="auth-preview-title">Your build journey</div>
              <div className="auth-step done"><span className="d">✓</span> Define — what, who, what NOT <span className="tag">passed</span></div>
              <div className="auth-step now"><span className="d">2</span> Architect — the decisions that cost <span className="tag">in progress</span></div>
              <div className="auth-step"><span className="d">3</span> Foundation — repo, deploy, live URL <span className="tag">locked</span></div>
              <div className="auth-step"><span className="d">4</span> First Slice — one real feature <span className="tag">locked</span></div>
              <div className="auth-step"><span className="d">·</span> + 4 more stages to launch</div>
            </div>
            <div className="auth-bubble">"Before you build, answer this: who is the first real user?"</div>
          </div>

          <div className="auth-proof">
            <div><span className="n">1</span> Learn the process professionals use — stage by stage</div>
            <div><span className="n">2</span> Know exactly what to ask your AI builder next</div>
            <div><span className="n">3</span> Check its work — even if you can't read code</div>
            <div><span className="n">4</span> Gates keep you honest — no skipping ahead</div>
          </div>
        </div>
        <div className="auth-foot">Built by a novice who got lost — so you don't have to.</div>
      </div>

      <div className="auth-panel">
        <form onSubmit={submit} className="auth-card">
          <h2>{mode === "login" ? "Welcome back" : mode === "signup" ? "Create your account" : "Reset password"}</h2>
          <p className="hint">
            {mode === "login" ? "Pick up where you left off"
             : mode === "signup" ? "Start your first guided build"
             : "We'll email you a reset link"}
          </p>
          {mode === "signup" && (
            <>
              <label>Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" />
            </>
          )}
          <label>Email</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          {mode !== "forgot" && (
            <>
              <label>Password</label>
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder={mode === "signup" ? "8+ characters" : "Your password"} />
            </>
          )}
          {mode === "signup" && (
            <label style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12, color: "#64748b", marginBottom: 14, cursor: "pointer" }}>
              <input type="checkbox" style={{ marginTop: 2, width: "auto" }} checked={agreed}
                onChange={(e) => setAgreed(e.target.checked)} />
              <span>I agree to the <a href="/terms" target="_blank" style={{ color: "#8a6d2b" }}>Terms</a> and <a href="/privacy" target="_blank" style={{ color: "#8a6d2b" }}>Privacy Policy</a></span>
            </label>
          )}
          {err && <p className="auth-err">{err}</p>}
          {sent && mode === "forgot" && (
            <p style={{ color: "#15803d", fontSize: 13, marginBottom: 12 }}>
              If that account exists, a reset link is on its way. Check your email — and spam.
            </p>
          )}
          <button className="auth-cta" disabled={busy}>
            {busy ? "…" : mode === "login" ? "Log in →" : mode === "signup" ? "Create account →" : "Send reset link"}
          </button>
          {mode === "login" && (
            <div className="auth-swap" style={{ marginTop: 10 }}>
              <button type="button" onClick={() => { setMode("forgot"); setErr(""); setSent(false); }}>
                Forgot password?
              </button>
            </div>
          )}
          <div className="auth-swap">
            {mode === "login" ? "New here? " : "Back to "}
            <button type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setErr(""); setSent(false); }}>
              {mode === "login" ? "Create an account" : "log in"}
            </button>
          </div>
          {mode !== "forgot" && (
            <div className="auth-free"><b>{credits} free credits</b> · stages 1–2 free · no card required</div>
          )}
        </form>
      </div>
    </div>
  );
}

/* ---------- Home: projects ---------- */

function Home({ user, projects, stages, onOpen, onCreated, onLogout, onChanged }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackText, setFeedbackText] = useState("");
  const [feedbackSent, setFeedbackSent] = useState(false);
  const [resent, setResent] = useState(false);

  const sendFeedback = async () => {
    await api("/api/feedback", { method: "POST", body: JSON.stringify({ message: feedbackText }) }).catch(() => {});
    setFeedbackSent(true); setFeedbackText("");
  };

  const deleteAccount = async () => {
    const pw = window.prompt("Delete your account and ALL projects permanently? Type your password to confirm:");
    if (!pw) return;
    try {
      await api("/api/auth/account", { method: "DELETE", body: JSON.stringify({ password: pw }) });
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = "/";
    } catch (e) { alert(e.message); }
  };

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await api("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
      onCreated(p);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ maxWidth: 720, margin: "48px auto", padding: "0 20px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 24 }}>
        <div>
          <p style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a6d2b", fontWeight: 700 }}>AppPilot</p>
          <h1 style={{ fontSize: 26 }}>Your projects</h1>
        </div>
        <div style={{ marginLeft: "auto", textAlign: "right", fontSize: 13, color: "#64748b" }}>
          <div>{user.name || user.email}</div>
          <div>{user.credits_balance} credits · {user.plan} plan</div>
          <div>
            {user.is_admin && <a href="/admin" style={{ color: "#8a6d2b", fontSize: 12, textDecoration: "none", marginRight: 12 }}>Admin</a>}
            <a href="/guides" style={{ color: "#8a6d2b", fontSize: 12, textDecoration: "none", marginRight: 12 }}>Guides</a>
            <button onClick={() => setFeedbackOpen(!feedbackOpen)} style={{ background: "none", border: "none", color: "#8a6d2b", cursor: "pointer", fontSize: 12, padding: 0, marginRight: 12 }}>Feedback</button>
            <button onClick={onLogout} style={{ background: "none", border: "none", color: "#8a6d2b", cursor: "pointer", fontSize: 12, padding: 0 }}>Log out</button>
          </div>
        </div>
      </div>

      {!user.email_verified && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#92400e" }}>
          📧 Verify your email — check your inbox for a confirmation link.{" "}
          <button onClick={async () => { await api("/api/auth/resend-verify", { method: "POST", body: "{}" }).catch(() => {}); setResent(true); }}
            disabled={resent}
            style={{ background: "none", border: "none", color: "#8a6d2b", fontWeight: 700, cursor: "pointer", fontSize: 12, padding: 0 }}>
            {resent ? "Sent ✓" : "Resend"}
          </button>
        </div>
      )}

      {feedbackOpen && (
        <div style={{ ...card, marginBottom: 16, background: "#f8fafc" }}>
          <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>What's confusing, broken, or missing?</p>
          <textarea style={{ ...input, minHeight: 70, resize: "vertical" }} value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="Tell us — this is how the product gets better" />
          {feedbackSent
            ? <p style={{ fontSize: 12, color: "#15803d", marginTop: 6 }}>Thanks — sent ✓</p>
            : <button style={{ ...btn, marginTop: 8, padding: "7px 14px", fontSize: 13 }} onClick={sendFeedback} disabled={!feedbackText.trim()}>Send feedback</button>}
        </div>
      )}

      <form onSubmit={create} style={{ display: "flex", gap: 8, marginBottom: 24 }}>
        <input style={{ ...input, marginTop: 0, flex: 1 }} placeholder="New app idea — e.g. 'Dog walking tracker'"
          value={name} onChange={(e) => setName(e.target.value)} />
        <button style={btn} disabled={busy || !name.trim()}>Start</button>
      </form>

      {projects.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: 14 }}>No projects yet — name your first app idea above.</p>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {projects.map((p) => (
            <button key={p.id} onClick={() => onOpen(p.id)}
              style={{ ...card, cursor: "pointer", textAlign: "left", display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>
                  {(p.current_stage ?? 0) >= stages.length
                    ? "All stages complete 🎉"
                    : `Stage ${(p.current_stage ?? 0) + 1} of ${stages.length} — ${stages[p.current_stage]?.title || ""}`}
                </div>
                <div style={{ height: 4, background: "#e2e8f0", borderRadius: 2, marginTop: 6 }}>
                  <div style={{ height: 4, borderRadius: 2, background: "#2563eb", width: `${Math.round(((p.current_stage ?? 0) / stages.length) * 100)}%` }} />
                </div>
              </div>
              <span
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${p.name}"? This can't be undone.`)) {
                    await api(`/api/projects/${p.id}`, { method: "DELETE" });
                    onChanged();
                  }
                }}
                style={{ color: "#cbd5e1", fontSize: 16, padding: "0 4px" }} title="Delete project">✕</span>
              <span style={{ color: "#94a3b8" }}>›</span>
            </button>
          ))}
        </div>
      )}

      <div style={{ marginTop: 48, paddingTop: 16, borderTop: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", fontSize: 12, color: "#94a3b8" }}>
        <span>
          <a href="/privacy" style={{ color: "#94a3b8", marginRight: 12 }}>Privacy</a>
          <a href="/terms" style={{ color: "#94a3b8", marginRight: 12 }}>Terms</a>
          <a href="/security" style={{ color: "#94a3b8" }}>Security</a>
        </span>
        <button onClick={deleteAccount} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 12, cursor: "pointer", padding: 0 }}>
          Delete account
        </button>
      </div>
    </div>
  );
}

/* ---------- Project: stages + interview ---------- */

function ProjectView({ project, stages, onBack, onSaved }) {
  const [me, setMe] = useState(null);
  const refreshMe = () => api("/api/auth/me").then(setMe).catch(() => {});
  useEffect(() => { refreshMe(); }, []);

  const exportLog = async () => {
    const data = await api(`/api/projects/${project.id}/export`);
    const blob = new Blob([data.markdown], { type: "text/markdown" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = data.filename;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <div style={{ maxWidth: 720, margin: "48px auto", padding: "0 20px" }}>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#8a6d2b", cursor: "pointer", fontSize: 13, padding: 0, marginBottom: 12 }}>
        ← All projects
      </button>
      <div style={{ display: "flex", alignItems: "center", marginBottom: 20 }}>
        <h1 style={{ fontSize: 26 }}>{project.name}</h1>
        {me && (
          <span style={{ marginLeft: "auto", marginRight: 10, fontSize: 12, color: "#8a6d2b", fontWeight: 700, background: "#fdf6e3", border: "1px solid #e8d48b", borderRadius: 999, padding: "4px 10px" }}>
            {me.credits_balance} credits
          </span>
        )}
        <button onClick={exportLog}
          style={{ ...btn, marginLeft: "auto", background: "#fff", color: "#17203a", border: "1px solid #cbd5e1", fontSize: 13 }}>
          ⬇ Export build log
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stages.map((s) => (
          <StageCard key={s.key} stage={s} project={project} onSaved={onSaved} onSpent={refreshMe}
            planLocked={(me?.plan ?? "free") === "free" && s.order >= 2} />
        ))}
      </div>
    </div>
  );
}

function StageCard({ stage, project, onSaved, onSpent, planLocked }) {
  const done = project.stages?.[stage.key]?.completed;
  const unlocked = stage.order <= project.current_stage;
  const [open, setOpen] = useState(stage.order === project.current_stage);
  const [answers, setAnswers] = useState(project.stages?.[stage.key]?.answers || {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const save = async () => {
    setBusy(true); setErr("");
    try {
      const p = await api(`/api/projects/${project.id}/stages/${stage.key}`, {
        method: "POST",
        body: JSON.stringify({ answers }),
      });
      onSaved(p);
    } catch (e) {
      setErr(e.message);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ ...card, opacity: unlocked ? 1 : 0.55 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: "pointer" }}
        onClick={() => unlocked && setOpen(!open)}>
        <span style={{
          width: 26, height: 26, borderRadius: "50%", fontSize: 12, fontWeight: 700, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: done ? "#16a34a" : unlocked ? "#c9a227" : "#eef1f6",
          color: done || unlocked ? "#fff" : "#64748b",
        }}>{done ? "✓" : stage.order}</span>
        <span style={{ fontWeight: 700 }}>Stage {stage.order} — {stage.title}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>
          {done ? "passed" : unlocked ? (open ? "tap to close" : "tap to open") : "locked"}
        </span>
      </div>

      {open && unlocked && (
        <div style={{ marginTop: 12 }}>
          <p style={{ fontSize: 14, color: "#334155", lineHeight: 1.5 }}>{stage.plain}</p>
          <p style={{ marginTop: 6, fontSize: 12, color: "#8a6d2b" }}><strong>Why:</strong> {stage.why}</p>

          {stage.guided_steps?.length > 0 && (
            <div style={{ marginTop: 12, background: "#f8fafc", borderRadius: 8, padding: "10px 14px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>How to do it:</p>
              <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
                {stage.guided_steps.map((step, i) => <li key={i}>{step}</li>)}
              </ol>
            </div>
          )}

          {planLocked && !done ? (
            <div style={{ marginTop: 12, background: "#fdf6e3", border: "1px solid #e8d48b", borderRadius: 8, padding: "12px 14px" }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: "#8a6d2b", marginBottom: 4 }}>🔒 This stage is part of the full journey</p>
              <p style={{ fontSize: 13, color: "#6b5a1e", lineHeight: 1.5, margin: 0 }}>
                Your free plan covers Define &amp; Architect. Upgrade to unlock the mentor and all
                remaining stages — everything above is exactly what you'd be guided through.
              </p>
            </div>
          ) : (<>
          {stage.questions?.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 12 }}>
              {stage.questions.map((q) => (
                <label key={q.key} style={{ fontSize: 13, fontWeight: 600, color: "#17203a" }}>
                  {q.ask}
                  <textarea
                    style={{ ...input, minHeight: 60, resize: "vertical" }}
                    value={answers[q.key] || ""}
                    onChange={(e) => setAnswers({ ...answers, [q.key]: e.target.value })}
                  />
                </label>
              ))}
            </div>
          )}

          {stage.checklist?.length > 0 && (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 8 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#475569" }}>Tick each when it's actually true:</p>
              {stage.checklist.map((item, i) => (
                <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13, color: "#334155", cursor: "pointer" }}>
                  <input type="checkbox" style={{ marginTop: 2 }}
                    checked={answers[`check:${i}`] === true}
                    onChange={(e) => setAnswers({ ...answers, [`check:${i}`]: e.target.checked })} />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          )}

          {(stage.questions?.length > 0 || stage.checklist?.length > 0) && (
            <div style={{ marginTop: 12 }}>
              {err && <p style={{ color: "#b91c1c", fontSize: 13, marginBottom: 6 }}>{err}</p>}
              <button style={btn} onClick={save} disabled={busy}>
                {busy ? "Saving…" : done ? "Update" : "Save — pass this gate"}
              </button>
            </div>
          )}

          <p style={{ marginTop: 10, fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
            Gate: {stage.gate}
          </p>

          <MentorChat projectId={project.id} stageKey={stage.key}
            hasQuestions={(stage.questions || []).length > 0}
            onSpent={onSpent}
            onDraft={(a) => setAnswers((prev) => ({ ...prev, ...a }))} />
          </>)}
        </div>
      )}
    </div>
  );
}

/* ---------- Mentor chat ---------- */

function MentorChat({ projectId, stageKey, hasQuestions, onDraft, onSpent }) {
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [err, setErr] = useState("");

  const load = () =>
    api(`/api/projects/${projectId}/stages/${stageKey}/mentor`)
      .then((d) => setMsgs(d.messages)).catch(() => {});

  const send = async () => {
    const message = text.trim();
    if (!message) return;
    setBusy(true); setErr(""); setText("");
    setMsgs((m) => [...m, { role: "user", content: message }]);
    try {
      const d = await api(`/api/projects/${projectId}/stages/${stageKey}/mentor`, {
        method: "POST", body: JSON.stringify({ message }),
      });
      setMsgs((m) => [...m, { role: "assistant", content: d.reply }]);
      onSpent?.();
    } catch (e) {
      setErr(e.message);
      setMsgs((m) => m.slice(0, -1));
      setText(message);
    } finally { setBusy(false); }
  };

  return (
    <div style={{ marginTop: 12, borderTop: "1px solid #f1f5f9", paddingTop: 10 }}>
      {!open ? (
        <button onClick={() => { setOpen(true); load(); }}
          style={{ background: "none", border: "none", color: "#8a6d2b", fontSize: 13, fontWeight: 600, cursor: "pointer", padding: 0 }}>
          💬 Ask the mentor about this stage
        </button>
      ) : (
        <div>
          <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            {msgs.length === 0 && (
              <p style={{ fontSize: 12, color: "#94a3b8" }}>
                Stuck? Ask anything — e.g. "I don't understand what a database is" or "what do I ask my AI tool to build next?"
              </p>
            )}
            {msgs.map((m, i) => (
              <div key={i} style={{
                alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                background: m.role === "user" ? "#17203a" : "#f1f5f9",
                color: m.role === "user" ? "#fff" : "#1e293b",
                borderRadius: 10, padding: "8px 12px", fontSize: 13, maxWidth: "85%",
                whiteSpace: "pre-wrap", lineHeight: 1.5,
              }}>
                {m.content}
              </div>
            ))}
            {busy && <div style={{ fontSize: 12, color: "#94a3b8" }}>mentor is typing…</div>}
          </div>
          {msgs.length === 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 8 }}>
              {["Explain this stage in one line", "What should I ask my AI builder first?", "Help me answer the questions below"].map((s) => (
                <button key={s}
                  onClick={() => { setText(s); }}
                  style={{ fontSize: 12, background: "#eef2ff", color: "#3730a3", border: "1px solid #c7d2fe", borderRadius: 999, padding: "4px 10px", cursor: "pointer" }}>
                  {s}
                </button>
              ))}
            </div>
          )}
          {err && <p style={{ color: "#b91c1c", fontSize: 12, marginBottom: 6 }}>{err}</p>}
          <div style={{ display: "flex", gap: 8 }}>
            <input style={{ ...input, marginTop: 0, flex: 1 }} placeholder="Ask the mentor… (1 credit)"
              value={text} onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && send()} />
            <button style={{ ...btn, padding: "8px 14px", fontSize: 13 }} onClick={send} disabled={busy || !text.trim()}>Send</button>
          </div>
          {hasQuestions && msgs.length > 0 && (
            <button
              onClick={async () => {
                setDrafting(true); setErr("");
                try {
                  const d = await api(`/api/projects/${projectId}/stages/${stageKey}/draft`, { method: "POST", body: "{}" });
                  onDraft(d.answers);
                  onSpent?.();
                } catch (e) { setErr(e.message); }
                finally { setDrafting(false); }
              }}
              disabled={drafting}
              style={{ marginTop: 8, background: "#fdf6e3", border: "1px solid #e8d48b", color: "#8a6d2b", borderRadius: 8, padding: "7px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}>
              {drafting ? "Drafting…" : "✨ Draft my answers from this chat (1 credit)"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ---------- Reset password (via emailed link) ---------- */

function ResetPassword({ token, onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [err, setErr] = useState("");
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setErr("");
    if (password !== confirm) return setErr("Passwords don't match");
    setBusy(true);
    try {
      await api("/api/auth/reset", { method: "POST", body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (e2) { setErr(e2.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="auth-wrap">
      <div className="auth-panel" style={{ flex: "none", width: "100%" }}>
        <form onSubmit={submit} className="auth-card">
          <h2>Choose a new password</h2>
          <p className="hint">This link expires in 1 hour</p>
          {done ? (
            <>
              <p style={{ color: "#15803d", fontSize: 14, marginBottom: 16 }}>
                Password updated — log in with your new password.
              </p>
              <button type="button" className="auth-cta" onClick={onDone}>Log in →</button>
            </>
          ) : (
            <>
              <label>New password</label>
              <input type="password" required minLength={8} value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="8+ characters" />
              <label>Confirm password</label>
              <input type="password" required minLength={8} value={confirm}
                onChange={(e) => setConfirm(e.target.value)} placeholder="Type it again" />
              {err && <p className="auth-err">{err}</p>}
              <button className="auth-cta" disabled={busy}>{busy ? "…" : "Set new password"}</button>
              <div className="auth-swap">
                <button type="button" onClick={onDone}>Back to log in</button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}

/* ---------- Legal pages (/privacy /terms /security) ---------- */

function LegalPage({ docKey }) {
  const [doc, setDoc] = useState(null);
  useEffect(() => {
    fetch(`/api/legal/${docKey}`).then((r) => r.json()).then(setDoc).catch(() => {});
  }, [docKey]);
  if (!doc) return <div style={{ padding: 60, textAlign: "center", color: "#64748b" }}>Loading…</div>;
  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "48px 20px" }}>
      <a href="/" style={{ fontSize: 13, color: "#8a6d2b", textDecoration: "none" }}>← AppPilot</a>
      <h1 style={{ fontSize: 28, margin: "16px 0 4px" }}>{doc.title}</h1>
      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 28 }}>Last updated: {doc.updated}</p>
      {doc.sections.map((s, i) => (
        <div key={i} style={{ marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, marginBottom: 6, color: "#17203a" }}>{s.h}</h3>
          <p style={{ fontSize: 14, color: "#475569", lineHeight: 1.65 }}>{s.body}</p>
        </div>
      ))}
      <div style={{ marginTop: 40, paddingTop: 20, borderTop: "1px solid #e2e8f0", fontSize: 12, color: "#94a3b8" }}>
        <a href="/privacy" style={{ color: "#8a6d2b", marginRight: 16 }}>Privacy</a>
        <a href="/terms" style={{ color: "#8a6d2b", marginRight: 16 }}>Terms</a>
        <a href="/security" style={{ color: "#8a6d2b" }}>Security</a>
      </div>
    </div>
  );
}

/* ---------- Integration guides (/guides) ---------- */

function GuidesPage() {
  const [guides, setGuides] = useState([]);
  const [open, setOpen] = useState(null);
  useEffect(() => {
    fetch("/api/guides").then((r) => r.json()).then(setGuides).catch(() => {});
  }, []);
  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "40px 20px" }}>
      <a href="/" style={{ fontSize: 13, color: "#8a6d2b", textDecoration: "none" }}>← AppPilot</a>
      <h1 style={{ fontSize: 26, margin: "14px 0 6px" }}>Integration guides</h1>
      <p style={{ fontSize: 14, color: "#64748b", marginBottom: 24, lineHeight: 1.6 }}>
        Third-party services — email, payments, AI, files — all set up the same way.
        Start with "The universal pattern", then open whichever you need.
      </p>
      {guides.map((g) => (
        <div key={g.key} style={{ ...card, marginBottom: 12, padding: 0, overflow: "hidden" }}>
          <button onClick={() => setOpen(open === g.key ? null : g.key)}
            style={{ width: "100%", textAlign: "left", background: "none", border: "none", padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{g.title}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>{g.tagline}</div>
            </div>
            <span style={{ color: "#94a3b8" }}>{open === g.key ? "▾" : "▸"}</span>
          </button>
          {open === g.key && (
            <div style={{ padding: "0 20px 18px" }}>
              <p style={{ fontSize: 13, color: "#475569", lineHeight: 1.6, marginBottom: 12 }}>{g.intro}</p>
              <div style={{ background: "#f8fafc", borderRadius: 8, padding: "12px 14px", marginBottom: 12 }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#475569", marginBottom: 6 }}>How to set it up:</p>
                <ol style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: "#334155", lineHeight: 1.7 }}>
                  {g.steps.map((s, i) => <li key={i}>{s}</li>)}
                </ol>
              </div>
              <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px" }}>
                <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>⚠ Traps:</p>
                <ul style={{ margin: 0, paddingLeft: 18, fontSize: 12, color: "#92400e", lineHeight: 1.65 }}>
                  {g.traps.map((t, i) => <li key={i}>{t}</li>)}
                </ul>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

/* ---------- Email verification (via emailed link) ---------- */

function VerifyEmail({ token, onDone }) {
  const [state, setState] = useState("checking");
  useEffect(() => {
    api(`/api/auth/verify?token=${encodeURIComponent(token)}`)
      .then(() => setState("ok"))
      .catch(() => setState("bad"));
  }, [token]);
  return (
    <div className="auth-wrap">
      <div className="auth-panel" style={{ flex: "none", width: "100%" }}>
        <div className="auth-card" style={{ textAlign: "center" }}>
          <h2>{state === "checking" ? "Verifying…" : state === "ok" ? "Email verified ✓" : "Link invalid"}</h2>
          <p className="hint" style={{ marginBottom: 20 }}>
            {state === "ok" ? "You're all set." : state === "bad" ? "This link is invalid or already used." : ""}
          </p>
          <button className="auth-cta" onClick={onDone}>Continue →</button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Admin (/admin — is_admin accounts only) ---------- */

function AdminPage() {
  const [users, setUsers] = useState([]);
  const [fb, setFb] = useState([]);
  const [err, setErr] = useState("");

  const load = () => {
    api("/api/admin/users").then((d) => setUsers(d.users)).catch((e) => setErr(e.message));
    api("/api/admin/feedback").then((d) => setFb(d.feedback)).catch(() => {});
  };
  useEffect(load, []);

  const act = async (path, body) => {
    try { await api(`/api/admin${path}`, { method: "POST", body: JSON.stringify(body) }); load(); }
    catch (e) { alert(e.message); }
  };

  return (
    <div style={{ maxWidth: 860, margin: "0 auto", padding: "40px 20px" }}>
      <a href="/" style={{ fontSize: 13, color: "#8a6d2b", textDecoration: "none" }}>← Back to app</a>
      <h1 style={{ fontSize: 24, margin: "14px 0 18px" }}>Admin</h1>
      {err && <p style={{ color: "#b91c1c" }}>{err}</p>}

      <h3 style={{ fontSize: 14, color: "#475569", marginBottom: 8 }}>Users ({users.length})</h3>
      <div style={{ ...card, padding: 0, overflow: "hidden", marginBottom: 28 }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
          <thead>
            <tr style={{ background: "#f8fafc", textAlign: "left" }}>
              <th style={{ padding: "8px 12px" }}>User</th>
              <th style={{ padding: "8px 12px" }}>Plan</th>
              <th style={{ padding: "8px 12px" }}>Credits</th>
              <th style={{ padding: "8px 12px" }}>Projects</th>
              <th style={{ padding: "8px 12px" }}>Verified</th>
              <th style={{ padding: "8px 12px" }}></th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.email} style={{ borderTop: "1px solid #eef1f6" }}>
                <td style={{ padding: "8px 12px" }}>{u.name || "—"}<br /><span style={{ color: "#94a3b8", fontSize: 12 }}>{u.email}</span></td>
                <td style={{ padding: "8px 12px" }}>{u.plan}</td>
                <td style={{ padding: "8px 12px" }}>{u.credits_balance}</td>
                <td style={{ padding: "8px 12px" }}>{u.projects}</td>
                <td style={{ padding: "8px 12px" }}>{u.email_verified ? "✓" : "—"}</td>
                <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>
                  <button onClick={() => act(`/users/${u.email}/plan`, { plan: u.plan === "paid" ? "free" : "paid" })}
                    style={{ fontSize: 11, cursor: "pointer", marginRight: 6 }}>
                    {u.plan === "paid" ? "→ free" : "→ paid"}
                  </button>
                  <button onClick={() => { const n = window.prompt("Grant how many credits?", "25"); if (n) act(`/users/${u.email}/credits`, { amount: parseInt(n) || 0, reason: "admin_ui" }); }}
                    style={{ fontSize: 11, cursor: "pointer" }}>+credits</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, color: "#475569", marginBottom: 8 }}>Feedback ({fb.length})</h3>
      {fb.length === 0
        ? <p style={{ fontSize: 13, color: "#94a3b8" }}>No feedback yet.</p>
        : fb.map((f, i) => (
            <div key={i} style={{ ...card, marginBottom: 8, padding: "10px 14px" }}>
              <div style={{ fontSize: 11, color: "#94a3b8" }}>{f.email} · {(f.created_at || "").slice(0, 10)}</div>
              <div style={{ fontSize: 13, marginTop: 4 }}>{f.message}</div>
            </div>
          ))}
    </div>
  );
}
