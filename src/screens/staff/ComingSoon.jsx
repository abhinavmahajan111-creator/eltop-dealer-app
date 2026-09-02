import { useNavigate, useParams } from "react-router-dom";
import { FEATURE_CATALOG } from "../../utils/staffFeatures";

// Generic placeholder screen every "coming soon" tile on the Sales
// dashboard opens into. Static for now — per the 2 Sep 2026 scope
// decision, these get built out for real one at a time, later. Having a
// real clickable page (rather than just an inert card) is what makes the
// dashboard read like a complete app today.

export default function ComingSoon() {
  const { key } = useParams();
  const navigate = useNavigate();
  const feature = FEATURE_CATALOG[key];

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 24px 60px", color: "#fff" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
          ← Back
        </button>
      </div>

      <div style={{ maxWidth: 480, margin: "-36px auto 0", padding: "0 20px 60px", position: "relative", zIndex: 2 }}>
        <div style={{
          background: "#fff", borderRadius: 18, padding: "36px 24px", textAlign: "center",
          boxShadow: "0 4px 18px rgba(0,0,0,0.08)",
        }}>
          <div style={{
            width: 64, height: 64, borderRadius: "50%", background: "#f3e6f6",
            display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 30, margin: "0 auto 16px",
          }}>
            {feature?.icon || "🚧"}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800 }}>{feature?.title || "Feature"}</div>
          <span style={{
            display: "inline-block", marginTop: 10, fontSize: 11, fontWeight: 700, color: "#7B2D8B",
            background: "#f3e6f6", borderRadius: 999, padding: "4px 12px", textTransform: "uppercase", letterSpacing: 0.4,
          }}>
            Coming soon
          </span>
          <div style={{ fontSize: 13, color: "#888", lineHeight: 1.6, marginTop: 16 }}>
            {feature?.description || "This section isn't built yet."}
          </div>
          <div style={{ fontSize: 12, color: "#bbb", lineHeight: 1.6, marginTop: 18, borderTop: "1px solid #f2f2f2", paddingTop: 16 }}>
            We're building the Sales dashboard step by step — this one's on the list. Check back soon!
          </div>
        </div>
      </div>
    </div>
  );
}
