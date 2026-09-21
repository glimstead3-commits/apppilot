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
  const [activeStage, setActiveStage] = useState(null);
  const [fb, setFb] = useState({ open: false, seed: "" });

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
    api(`/api/projects/${id}`).then((p) => {
      setProject(p);
      const cur = stages.find((s) => s.order === p.current_stage) || stages[stages.length - 1];
      setActiveStage(cur?.key);
      setView("project");
    });

  const logout = async () => {
    try { await api("/api/auth/logout", { method: "POST", body: "{}" }); } catch {}
    localStorage.removeItem(TOKEN_KEY); setUser(null); setProject(null); setView("auth");
  };

  const openFeedback = (seed = "") => setFb({ open: true, seed });
  const goHome = () => { setProject(null); setView("home"); loadProjects(); };

  const shell = (children) => (
    <Shell user={user} stages={stages}
      project={view === "project" ? project : null}
      activeStage={activeStage} onSelectStage={setActiveStage}
      onHome={goHome} onLogout={logout}
      fb={{ open: fb.open, seed: fb.seed, show: openFeedback, close: () => setFb({ open: false, seed: "" }) }}>
      {children}
    </Shell>
  );

  if (view === "loading" || view === "admin_pending") return null;
  if (view === "legal") return <LegalPage docKey={legalDoc} />;
  if (view === "verify")
    return <VerifyEmail token={verifyToken} onDone={() => {
      window.history.replaceState({}, "", "/"); setVerifyToken(""); setView("auth");
    }} />;
  if (view === "reset")
    return <ResetPassword token={resetToken} onDone={() => {
      window.history.replaceState({}, "", "/");
      setResetToken(""); setView("auth");
    }} />;
  if (view === "auth") return <Auth onDone={(u) => { setUser(u); setView("home"); loadProjects(); }} />;
  if (view === "guides") return user ? shell(<GuidesPage />) : <GuidesPage />;
  if (view === "admin" && user?.is_admin) return shell(<AdminPage />);
  if (view === "project" && project)
    return shell(
      <ProjectView
        project={project}
        stages={stages}
        activeStage={activeStage}
        onSelectStage={setActiveStage}
        onSaved={(p) => setProject(p)}
      />
    );
  return shell(
    <Home
      user={user}
      projects={projects}
      stages={stages}
      onOpen={openProject}
      onCreated={(p) => openProject(p.id)}
      onChanged={loadProjects}
      onUpgrade={() => openFeedback("Hi — I'd like to upgrade to the full journey")}
    />
  );
}

/* ---------- Shell: sidebar frame for everything logged-in ---------- */

function FeedbackBox({ seed, onClose }) {
  const [text, setText] = useState(seed || "");
  const [sent, setSent] = useState(false);
  const send = async () => {
    await api("/api/feedback", { method: "POST", body: JSON.stringify({ message: text }) }).catch(() => {});
    setSent(true);
  };
  return (
    <div style={{ ...card, marginBottom: 18, background: "#f8fafc", maxWidth: 880 }}>
      <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 6 }}>What's confusing, broken, or missing?</p>
      <textarea style={{ ...input, minHeight: 70, resize: "vertical", background: "#fff" }} value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Tell us — this is how the product gets better" />
      <div style={{ display: "flex", gap: 10, marginTop: 8, alignItems: "center" }}>
        {sent
          ? <p style={{ fontSize: 12, color: "#15803d" }}>Thanks — sent ✓</p>
          : <button style={{ ...btn, padding: "7px 14px", fontSize: 13 }} onClick={send} disabled={!text.trim()}>Send feedback</button>}
        <button onClick={onClose} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>close</button>
      </div>
    </div>
  );
}

function Shell({ user, project, stages, activeStage, onSelectStage, onHome, onLogout, fb, children }) {
  const deleteAccount = async () => {
    const pw = window.prompt("Delete your account and ALL projects permanently? Type your password to confirm:");
    if (!pw) return;
    try {
      await api("/api/auth/account", { method: "DELETE", body: JSON.stringify({ password: pw }) });
      localStorage.removeItem(TOKEN_KEY);
      window.location.href = "/";
    } catch (e) { alert(e.message); }
  };

  const initials = (user.name || user.email || "?").slice(0, 2).toUpperCase();
  const projLabel = project && (project.name.length > 20 ? project.name.slice(0, 20) + "…" : project.name);

  return (
    <div className="shell">
      <aside className="side">
        <div className="side-logo"><span className="side-logo-dot">A</span>AppPilot</div>

        <div className="nav-label">Build</div>
        <button className={`nav-item ${!project ? "on" : ""}`} onClick={onHome}>
          <span className="ico">▦</span>Projects
        </button>

        {project && (
          <>
            <div className="nav-label" title={project.name}>Stages — {projLabel}</div>
            {stages.map((s) => {
              const done = project.stages?.[s.key]?.completed;
              const unlocked = s.order <= project.current_stage;
              return (
                <button key={s.key}
                  className={`stage-nav ${done ? "done" : unlocked ? "now" : "locked"} ${s.key === activeStage ? "on" : ""}`}
                  onClick={() => onSelectStage(s.key)}>
                  <span className="sdot">{done ? "✓" : s.order + 1}</span>
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.title}</span>
                </button>
              );
            })}
          </>
        )}

        <div className="nav-label">Help</div>
        <a className="nav-item" href="/guides"><span className="ico">?</span>Guides</a>
        <button className="nav-item" onClick={() => fb.show()}><span className="ico">✉</span>Feedback</button>

        {user.is_admin && (
          <>
            <div className="nav-label">You</div>
            <a className="nav-item" href="/admin"><span className="ico">⚙</span>Admin</a>
          </>
        )}

        <div className="side-cred">
          {user.credits_balance} credits
          <small>{user.plan} plan{user.plan === "free" ? " · stages 1–2 unlocked" : ""}</small>
        </div>
        <div className="side-user">
          <span className="avatar">{initials}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{user.name || user.email}</div>
            <button onClick={onLogout} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 11, cursor: "pointer", padding: 0 }}>Log out</button>
          </div>
        </div>
        <div className="side-legal">
          <a href="/privacy">Privacy</a><a href="/terms">Terms</a><a href="/security">Security</a>
          <button onClick={deleteAccount} style={{ background: "none", border: "none", color: "#dc2626", fontSize: 11, cursor: "pointer", padding: 0, marginLeft: "auto" }}>Delete</button>
        </div>
      </aside>

      <main className="main">
        <div className="mobile-top">
          <span className="side-logo-dot" style={{ width: 24, height: 24, fontSize: 12 }}>A</span>
          {project
            ? <button onClick={onHome} style={{ background: "none", border: "none", color: "#8a6d2b", fontSize: 13, cursor: "pointer" }}>← Projects</button>
            : <span>AppPilot</span>}
          <span className="right">
            <a href="/guides" style={{ color: "#8a6d2b", textDecoration: "none" }}>Guides</a>
            <span style={{ color: "#8a6d2b", fontWeight: 700 }}>{user.credits_balance} cr</span>
            <button onClick={onLogout} style={{ background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>Log out</button>
          </span>
        </div>
        {fb.open && <FeedbackBox key={fb.seed} seed={fb.seed} onClose={fb.close} />}
        <div className="main-inner">{children}</div>
      </main>
    </div>
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

function Home({ user, projects, stages, onOpen, onCreated, onChanged, onUpgrade }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [resent, setResent] = useState(false);

  const create = async (e) => {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true);
    try {
      const p = await api("/api/projects", { method: "POST", body: JSON.stringify({ name }) });
      onCreated(p);
    } finally { setBusy(false); }
  };

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  const first = (user.name || "").split(" ")[0] || "there";
  const inProgress = projects.filter((p) => (p.current_stage ?? 0) < stages.length).length;

  return (
    <>
      <div className="main-top">
        <div>
          <h1>{greet}, {first}</h1>
          <div className="sub">
            {projects.length === 0
              ? "Start your first build below"
              : `${inProgress} build${inProgress === 1 ? "" : "s"} in progress`}
          </div>
        </div>
      </div>

      {!user.email_verified && user.email_enabled && (
        <div style={{ background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#92400e" }}>
          📧 Verify your email — check your inbox for a confirmation link.{" "}
          <button onClick={async () => { await api("/api/auth/resend-verify", { method: "POST", body: "{}" }).catch(() => {}); setResent(true); }}
            disabled={resent}
            style={{ background: "none", border: "none", color: "#8a6d2b", fontWeight: 700, cursor: "pointer", fontSize: 12, padding: 0 }}>
            {resent ? "Sent ✓" : "Resend"}
          </button>
        </div>
      )}

      {user.plan === "free" && (
        <div className="banner-upgrade">
          <div>
            <b>Unlock the full journey</b>
            <p>Stages 3–8 — Foundation to Launch — plus unlimited mentor.</p>
          </div>
          <button onClick={onUpgrade}>Upgrade</button>
        </div>
      )}

      <form onSubmit={create} style={{ display: "flex", gap: 10, marginBottom: 26 }}>
        <input style={{ ...input, marginTop: 0, flex: 1 }} placeholder="New app idea — e.g. 'Dog walking tracker'"
          value={name} onChange={(e) => setName(e.target.value)} />
        <button className="newbtn" disabled={busy || !name.trim()}>{busy ? "…" : "Start build →"}</button>
      </form>

      {projects.length === 0 ? (
        <p style={{ color: "#64748b", fontSize: 14 }}>No projects yet — name your first app idea above.</p>
      ) : (
        projects.map((p) => {
          const done = (p.current_stage ?? 0) >= stages.length;
          return (
            <button key={p.id} className="proj-row" onClick={() => onOpen(p.id)}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="nm">{p.name}</div>
                <div className="st">
                  {done
                    ? "All stages complete 🎉"
                    : `Stage ${(p.current_stage ?? 0) + 1} of ${stages.length} — ${stages[p.current_stage]?.title || ""}`}
                </div>
                <div className="segs">
                  {stages.map((s) => (
                    <span key={s.key}
                      className={`seg ${s.order < (p.current_stage ?? 0) ? "done" : s.order === (p.current_stage ?? 0) ? "now" : ""}`} />
                  ))}
                </div>
              </div>
              <span className={`pill ${done ? "green" : "gold"}`}>{done ? "LAUNCHED" : "IN PROGRESS"}</span>
              <span
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${p.name}"? This can't be undone.`)) {
                    await api(`/api/projects/${p.id}`, { method: "DELETE" });
                    onChanged();
                  }
                }}
                style={{ color: "#cbd5e1", fontSize: 16, padding: "0 4px" }} title="Delete project">✕</span>
              <span className="go">›</span>
            </button>
          );
        })
      )}
    </>
  );
}

/* ---------- Project: stages + interview ---------- */

function ProjectView({ project, stages, activeStage, onSelectStage, onSaved }) {
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

  const stage = stages.find((s) => s.key === activeStage)
    || stages.find((s) => s.order === project.current_stage)
    || stages[0];

  return (
    <>
      <div className="main-top">
        <div>
          <h1>{project.name}</h1>
          {stage && <div className="sub">Stage {stage.order + 1} of {stages.length} — {stage.title}</div>}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {me && <span className="pill gold" style={{ marginLeft: 0 }}>{me.credits_balance} credits</span>}
          <button onClick={exportLog}
            className="newbtn" style={{ background: "#fff", color: "#17203a", border: "1px solid #cbd5e1" }}>
            ⬇ Build log
          </button>
        </div>
      </div>

      <div className="stage-strip">
        {stages.map((s) => {
          const done = project.stages?.[s.key]?.completed;
          const unlocked = s.order <= project.current_stage;
          return (
            <button key={s.key}
              className={`chip ${s.key === activeStage ? "on" : ""} ${done ? "done" : ""} ${unlocked ? "" : "locked"}`}
              onClick={() => onSelectStage(s.key)}>
              {done ? "✓" : s.order + 1} {s.title}
            </button>
          );
        })}
      </div>

      {stage && (
        <StageCard key={stage.key} stage={stage} project={project} solo
          onSaved={(p) => {
            onSaved(p);
            const next = stages.find((s) => s.order === stage.order + 1);
            if (p.stages?.[stage.key]?.completed && next) onSelectStage(next.key);
          }}
          onSpent={refreshMe}
          planLocked={(me?.plan ?? "free") === "free" && stage.order >= 2} />
      )}
    </>
  );
}

function StageCard({ stage, project, onSaved, onSpent, planLocked, solo }) {
  const done = project.stages?.[stage.key]?.completed;
  const unlocked = stage.order <= project.current_stage;
  const [open, setOpen] = useState(solo || stage.order === project.current_stage);
  const [answers, setAnswers] = useState(project.stages?.[stage.key]?.answers || {});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [stepIdx, setStepIdx] = useState(0);

  // One step per question; the checklist becomes the final step.
  const steps = [
    ...(stage.questions || []).map((q) => ({ type: "q", ...q })),
    ...(stage.checklist?.length ? [{ type: "checklist" }] : []),
  ];
  const step = steps[Math.min(stepIdx, steps.length - 1)];

  const save = async () => {
    // Gate feedback — never silently refuse: find what's missing and
    // take the user straight to it before calling the API.
    const questions = stage.questions || [];
    const blank = questions.findIndex((q) => !String(answers[q.key] || "").trim());
    if (blank >= 0) {
      setStepIdx(blank);
      setErr("Answer every question to pass this gate — this one's still blank. (Rough is fine!)");
      return;
    }
    const unticked = (stage.checklist || []).findIndex((_, i) => answers[`check:${i}`] !== true);
    if (unticked >= 0) {
      setStepIdx(steps.length - 1);
      setErr("Tick every check to pass — it's a promise, not a formality.");
      return;
    }
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
    <div className={solo ? "stage-panel solo" : "stage-panel"}
      style={{ opacity: unlocked ? 1 : 0.55 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, cursor: solo ? "default" : "pointer" }}
        onClick={() => !solo && unlocked && setOpen(!open)}>
        <span style={{
          width: 26, height: 26, borderRadius: "50%", fontSize: 12, fontWeight: 700, flexShrink: 0,
          display: "flex", alignItems: "center", justifyContent: "center",
          background: done ? "#16a34a" : unlocked ? "#c9a227" : "#eef1f6",
          color: done || unlocked ? "#fff" : "#64748b",
        }}>{done ? "✓" : stage.order}</span>
        <span style={{ fontWeight: 700 }}>Stage {stage.order + 1} — {stage.title}</span>
        <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>
          {done ? "passed" : unlocked ? (solo ? "" : open ? "tap to close" : "tap to open") : "locked"}
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

          {stage.traps?.length > 0 && (
            <div style={{ marginTop: 12, background: "#fffbeb", border: "1px solid #fde68a", borderRadius: 8, padding: "10px 14px" }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#92400e", marginBottom: 6 }}>⚠ Traps novices hit here:</p>
              {stage.traps.map((t, i) => (
                <p key={i} style={{ fontSize: 12, color: "#92400e", lineHeight: 1.55, marginBottom: 6 }}>
                  <strong>{t.trap}.</strong> {t.story}
                </p>
              ))}
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
          <MentorChat projectId={project.id} stageKey={stage.key}
            hasQuestions={(stage.questions || []).length > 0}
            onSpent={onSpent}
            onDraft={(a) => setAnswers((prev) => ({ ...prev, ...a }))} />

          {steps.length > 0 && (
            <div style={{ marginTop: 18 }}>
              <p style={{ fontSize: 12, fontWeight: 700, color: "#3730a3", textTransform: "uppercase", letterSpacing: ".08em", marginBottom: 10 }}>
                Step 2 · Your answers
              </p>
              {/* step progress */}
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: 11, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: ".08em" }}>
                  {step.type === "checklist" ? "Final checks" : `Question ${stepIdx + 1} of ${steps.length}`}
                </span>
                <div style={{ display: "flex", gap: 4 }}>
                  {steps.map((_, i) => (
                    <span key={i} style={{
                      width: 18, height: 4, borderRadius: 2,
                      background: i < stepIdx ? "#16a34a" : i === stepIdx ? "#f4c95d" : "#e2e8f0",
                    }} />
                  ))}
                </div>
              </div>

              {step.type === "q" && (
                <div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: "#17203a", lineHeight: 1.4, marginBottom: 6 }}>
                    {step.ask}
                  </div>
                  {step.explain && (
                    <p style={{ fontSize: 13, color: "#64748b", lineHeight: 1.6, marginBottom: 10 }}>{step.explain}</p>
                  )}
                  {step.example && (
                    <div style={{ background: "#eef4ff", border: "1px solid #c7d7fe", borderRadius: 8, padding: "10px 14px", marginBottom: 12, fontSize: 13, color: "#3730a3", lineHeight: 1.55 }}>
                      💡 <strong>A real answer looks like:</strong> {step.example}
                    </div>
                  )}
                  <textarea
                    style={{ ...input, minHeight: 90, resize: "vertical", fontSize: 15 }}
                    value={answers[step.key] || ""}
                    onChange={(e) => setAnswers({ ...answers, [step.key]: e.target.value })}
                    placeholder="Your answer — plain words are perfect…"
                  />
                  {step.starter && !String(answers[step.key] || "").trim() && (
                    <button
                      onClick={() => setAnswers({ ...answers, [step.key]: step.starter })}
                      style={{ marginTop: 6, background: "none", border: "1px dashed #cbd5e1", borderRadius: 8, padding: "6px 12px", fontSize: 12, color: "#64748b", cursor: "pointer" }}>
                      📝 Start from a template — just fill the blanks
                    </button>
                  )}
                  {err
                    ? <p style={{ fontSize: 13, color: "#b45309", marginTop: 8 }}>{err}</p>
                    : <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>
                        Stuck? That's normal — ask the mentor below and it can help you draft this answer.
                      </p>}
                </div>
              )}

              {step.type === "checklist" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <p style={{ fontSize: 13, fontWeight: 700, color: "#475569", marginBottom: 2 }}>
                    Tick each only when it's actually true — honesty here is the whole point:
                  </p>
                  {stage.checklist.map((item, i) => (
                    <label key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 13.5, color: "#334155", cursor: "pointer", padding: "6px 8px", borderRadius: 6, background: answers[`check:${i}`] ? "#f0fdf4" : "transparent" }}>
                      <input type="checkbox" style={{ marginTop: 2 }}
                        checked={answers[`check:${i}`] === true}
                        onChange={(e) => setAnswers({ ...answers, [`check:${i}`]: e.target.checked })} />
                      <span>{item}</span>
                    </label>
                  ))}
                </div>
              )}

              {/* step navigation */}
              <div style={{ display: "flex", gap: 10, marginTop: 16, alignItems: "center" }}>
                {stepIdx > 0 && (
                  <button onClick={() => { setStepIdx(stepIdx - 1); setErr(""); }}
                    style={{ background: "#fff", color: "#475569", border: "1px solid #cbd5e1", borderRadius: 8, padding: "9px 16px", fontSize: 13, fontWeight: 600, cursor: "pointer" }}>
                    ← Back
                  </button>
                )}
                {stepIdx < steps.length - 1 ? (
                  <button style={btn} onClick={() => { setStepIdx(stepIdx + 1); setErr(""); }}>
                    Next →
                  </button>
                ) : (
                  <>
                    {err && <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>}
                    <button style={btn} onClick={save} disabled={busy}>
                      {busy ? "Saving…" : done ? "Update answers" : "Save — pass this gate"}
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          <p style={{ marginTop: 10, fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
            Gate: {stage.gate}
          </p>
          </>)}
        </div>
      )}
    </div>
  );
}

/* ---------- Mentor chat ---------- */

function MentorChat({ projectId, stageKey, hasQuestions, onDraft, onSpent }) {
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [drafting, setDrafting] = useState(false);
  const [err, setErr] = useState("");

  const load = () =>
    api(`/api/projects/${projectId}/stages/${stageKey}/mentor`)
      .then((d) => setMsgs(d.messages)).catch(() => {});

  useEffect(() => { load(); }, [stageKey]);

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
    <div style={{ marginTop: 14, background: "#fafbff", border: "1px solid #dbe4f5", borderRadius: 10, padding: "14px 16px" }}>
      <div style={{ display: "flex", alignItems: "center", marginBottom: open ? 10 : 0 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: "#3730a3", textTransform: "uppercase", letterSpacing: ".08em" }}>
          Step 1 · Chat it through with the mentor
        </p>
        <button onClick={() => setOpen(!open)}
          style={{ marginLeft: "auto", background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer" }}>
          {open ? "hide" : "show"}
        </button>
      </div>
      {!open ? null : (
        <div>
          <p style={{ fontSize: 12.5, color: "#64748b", marginBottom: 10, lineHeight: 1.5 }}>
            Easiest way to do this stage: just tell the mentor about your idea in plain words.
            It'll ask the right questions — then it can fill in the answers below for you.
          </p>
          <div style={{ maxHeight: 240, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, marginBottom: 8 }}>
            {msgs.length === 0 && (
              <div style={{
                alignSelf: "flex-start", background: "#f1f5f9", color: "#1e293b",
                borderRadius: 10, padding: "8px 12px", fontSize: 13, maxWidth: "85%", lineHeight: 1.5,
              }}>
                👋 Hi — I'm your mentor for this stage. Forget the questions for now — just tell me: what's the app idea, in your own words?
              </div>
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
              {["Here's my app idea: ", "I'm not sure where to start", "Help me answer the questions below"].map((s) => (
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
            <input style={{ ...input, marginTop: 0, flex: 1 }} placeholder="Tell the mentor about your idea… (1 credit)"
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
