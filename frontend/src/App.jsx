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
  const [view, setView] = useState("loading"); // loading | auth | home | project
  const [projects, setProjects] = useState([]);
  const [project, setProject] = useState(null);

  useEffect(() => {
    fetch("/api/stages").then((r) => r.json()).then(setStages).catch(() => {});
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return setView("auth");
    api("/api/auth/me")
      .then((u) => { setUser(u); setView("home"); loadProjects(); })
      .catch(() => { localStorage.removeItem(TOKEN_KEY); setView("auth"); });
  }, []);

  const loadProjects = () =>
    api("/api/projects").then(setProjects).catch(() => {});

  const openProject = (id) =>
    api(`/api/projects/${id}`).then((p) => { setProject(p); setView("project"); });

  if (view === "loading") return null;
  if (view === "auth") return <Auth onDone={(u) => { setUser(u); setView("home"); loadProjects(); }} />;
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
      onLogout={() => { localStorage.removeItem(TOKEN_KEY); setUser(null); setView("auth"); }}
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

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try {
      const data = await api(`/api/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({ email, password, name }),
      });
      localStorage.setItem(TOKEN_KEY, data.token);
      onDone(data.user);
    } catch (e2) {
      setErr(e2.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "80px auto", padding: "0 20px" }}>
      <p style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a6d2b", fontWeight: 700 }}>AppPilot</p>
      <h1 style={{ fontSize: 28, margin: "8px 0 20px" }}>Build your app the right way.</h1>
      <form onSubmit={submit} style={{ ...card, display: "flex", flexDirection: "column", gap: 12 }}>
        {mode === "signup" && (
          <label style={{ fontSize: 13, fontWeight: 600 }}>Your name
            <input style={input} value={name} onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        <label style={{ fontSize: 13, fontWeight: 600 }}>Email
          <input style={input} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label style={{ fontSize: 13, fontWeight: 600 }}>Password {mode === "signup" && <span style={{ fontWeight: 400, color: "#64748b" }}>(8+ characters)</span>}
          <input style={input} type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        {err && <p style={{ color: "#b91c1c", fontSize: 13 }}>{err}</p>}
        <button style={btn} disabled={busy}>{busy ? "…" : mode === "login" ? "Log in" : "Create account"}</button>
        <button type="button" onClick={() => setMode(mode === "login" ? "signup" : "login")}
          style={{ background: "none", border: "none", color: "#8a6d2b", fontSize: 13, cursor: "pointer" }}>
          {mode === "login" ? "New here? Create an account — 50 free credits" : "Already have an account? Log in"}
        </button>
      </form>
    </div>
  );
}

/* ---------- Home: projects ---------- */

function Home({ user, projects, stages, onOpen, onCreated, onLogout }) {
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

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
          <button onClick={onLogout} style={{ background: "none", border: "none", color: "#8a6d2b", cursor: "pointer", fontSize: 12, padding: 0 }}>Log out</button>
        </div>
      </div>

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
                  Stage {p.current_stage} — {stages[p.current_stage]?.title || ""}
                </div>
              </div>
              <span
                onClick={async (e) => {
                  e.stopPropagation();
                  if (window.confirm(`Delete "${p.name}"? This can't be undone.`)) {
                    await api(`/api/projects/${p.id}`, { method: "DELETE" });
                    loadProjects();
                  }
                }}
                style={{ color: "#cbd5e1", fontSize: 16, padding: "0 4px" }} title="Delete project">✕</span>
              <span style={{ color: "#94a3b8" }}>›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ---------- Project: stages + interview ---------- */

function ProjectView({ project, stages, onBack, onSaved }) {
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
        <button onClick={exportLog}
          style={{ ...btn, marginLeft: "auto", background: "#fff", color: "#17203a", border: "1px solid #cbd5e1", fontSize: 13 }}>
          ⬇ Export build log
        </button>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stages.map((s) => (
          <StageCard key={s.key} stage={s} project={project} onSaved={onSaved} />
        ))}
      </div>
    </div>
  );
}

function StageCard({ stage, project, onSaved }) {
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
            onDraft={(a) => setAnswers((prev) => ({ ...prev, ...a }))} />
        </div>
      )}
    </div>
  );
}

/* ---------- Mentor chat ---------- */

function MentorChat({ projectId, stageKey, hasQuestions, onDraft }) {
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
