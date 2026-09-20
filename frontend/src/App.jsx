import { useEffect, useState } from "react";

export default function App() {
  const [health, setHealth] = useState(null);
  const [stages, setStages] = useState([]);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
    fetch("/api/stages").then((r) => r.json()).then(setStages).catch(() => {});
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "60px auto", padding: "0 20px" }}>
      <p style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a6d2b", fontWeight: 700 }}>
        AppPilot
      </p>
      <h1 style={{ fontSize: 34, margin: "8px 0 4px" }}>Build your app the right way.</h1>
      <p style={{ color: "#64748b", marginBottom: 32 }}>
        A stage-gated wizard with an AI mentor — for novices building with AI tools.
        Finish each stage's checklist to unlock the next.
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {stages.map((s, i) => (
          <div key={s.key} style={{
            background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12,
            padding: "16px 20px", opacity: i === 0 ? 1 : 0.75,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span style={{
                width: 26, height: 26, borderRadius: "50%", fontSize: 12, fontWeight: 700, flexShrink: 0,
                display: "flex", alignItems: "center", justifyContent: "center",
                background: i === 0 ? "#c9a227" : "#eef1f6", color: i === 0 ? "#fff" : "#64748b",
              }}>{i}</span>
              <span style={{ fontWeight: 700, fontSize: 15 }}>
                Stage {i} — {s.title}
              </span>
              {i > 0 && <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>locked</span>}
            </div>
            <p style={{ marginTop: 8, fontSize: 14, color: "#334155", lineHeight: 1.5 }}>{s.plain}</p>
            <p style={{ marginTop: 6, fontSize: 12, color: "#8a6d2b", lineHeight: 1.5 }}>
              <strong>Why:</strong> {s.why}
            </p>
            <p style={{ marginTop: 6, fontSize: 12, color: "#64748b", fontStyle: "italic" }}>
              Gate: {s.gate}
            </p>
          </div>
        ))}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: "#94a3b8" }}>
        API: {health ? (health.ok ? `ok · db ${health.db}` : "down") : "…"}
      </p>
    </div>
  );
}
