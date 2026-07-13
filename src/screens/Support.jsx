export default function Support() {
  return (
    <div style={{ minHeight: "100vh", background: "#f8fafc", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: "40px 20px", textAlign: "center" }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🛎️</div>
      <h1 style={{ fontSize: 22, fontWeight: 800, color: "#1e293b", marginBottom: 10 }}>Support</h1>
      <p style={{ fontSize: 15, color: "#64748b", maxWidth: 320 }}>
        Need help? Reach us at{" "}
        <a href="mailto:support@eltopbyembassy.com" style={{ color: "#7B2D8B", fontWeight: 600 }}>
          support@eltopbyembassy.com
        </a>
        . Our team is available Mon–Sat, 10am–6pm.
      </p>
    </div>
  );
}
