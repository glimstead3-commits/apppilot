import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";

// Last-resort catch: a render bug shows this instead of a white screen.
class CrashGuard extends React.Component {
  state = { err: null };
  static getDerivedStateFromError(err) { return { err }; }
  render() {
    if (!this.state.err) return this.props.children;
    return (
      <div style={{ maxWidth: 420, margin: "120px auto", textAlign: "center", fontFamily: "-apple-system, sans-serif", color: "#17203a" }}>
        <h1 style={{ fontSize: 20, marginBottom: 8 }}>Something went wrong</h1>
        <p style={{ fontSize: 14, color: "#64748b", marginBottom: 20 }}>
          Refresh the page — if it keeps happening, please tell us via the Feedback link after logging in.
        </p>
        <button onClick={() => window.location.reload()}
          style={{ background: "#17203a", color: "#fff", border: "none", borderRadius: 8, padding: "10px 18px", fontWeight: 700, cursor: "pointer" }}>
          Refresh
        </button>
      </div>
    );
  }
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <CrashGuard>
      <App />
    </CrashGuard>
  </React.StrictMode>
);
