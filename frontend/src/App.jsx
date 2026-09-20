import { useEffect, useState } from "react";

const STAGES = [
  "Define", "Architect", "Foundation", "First Slice",
  "Feature Slices", "Harden", "Launch", "Operate",
];

export default function App() {
  const [health, setHealth] = useState(null);

  useEffect(() => {
    fetch("/api/health").then((r) => r.json()).then(setHealth).catch(() => setHealth({ ok: false }));
  }, []);

  return (
    <div style={{ maxWidth: 720, margin: "60px auto", padding: "0 20px" }}>
      <p style={{ fontSize: 12, letterSpacing: "0.15em", textTransform: "uppercase", color: "#8a6d2b", fontWeight: 700 }}>
        AppPilot
      </p>
      <h1 style={{ fontSize: 34, margin: "8px 0 4px" }}>Build your app the right way.</h1>
      <p style={{ color: "#64748b", marginBottom: 32 }}>
        A stage-gated wizard with an AI mentor — for novices building with AI tools.
      </p>

      <div style={{ background: "#fff", border: "1px solid #e2e8f0", borderRadius: 12, padding: 20 }}>
        {STAGES.map((s, i) => (
          <div key={s} style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 4px", borderBottom: i < STAGES.length - 1 ? "1px solid #f1f5f9" : "none" }}>
            <span style={{
              width: 26, height: 26, borderRadius: "50%", fontSize: 12, fontWeight: 700,
              display: "flex", alignItems: "center", justifyContent: "center",
              background: i === 0 ? "#c9a227" : "#eef1f6", color: i === 0 ? "#fff" : "#64748b",
            }}>{i}</span>
            <span style={{ fontWeight: i === 0 ? 600 : 400 }}>{s}</span>
            {i > 0 && <span style={{ marginLeft: "auto", fontSize: 11, color: "#94a3b8" }}>locked</span>}
          </div>
        ))}
      </div>

      <p style={{ marginTop: 24, fontSize: 12, color: "#94a3b8" }}>
        API: {health ? (health.ok ? `ok · db ${health.db}` : "down") : "…"}
      </p>
    </div>
  );
}
