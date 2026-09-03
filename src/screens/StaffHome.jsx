import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { staffRoleLabel, staffRoleDepartment } from "../utils/staffRoles";

// Generic landing page for every staff route that doesn't have a real
// department dashboard built yet. Every /staff/* path in App.jsx currently
// points here — as each department's real panel gets built (Sales and
// After-Sales first, per the architecture doc), that path's <Route element>
// swaps to the real screen without touching login, routing, or this file's
// role/department lookup.
export default function StaffHome() {
  const navigate = useNavigate();
  const { staffProfile, signOut } = useApp();

  const roleLabel = staffRoleLabel(staffProfile?.role);
  const department = staffRoleDepartment(staffProfile?.role) || staffProfile?.department || "";

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "18px 24px", background: "#fff", borderBottom: "1px solid #eee" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <img
            src="/assets/ELTOP%20LOGO.png"
            alt="Eltop"
            style={{ height: 22, width: "auto" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
          <img
            src="/assets/EMBASSY%20LOGO.png"
            alt="Embassy"
            style={{ height: 20, width: "auto" }}
            onError={(e) => { e.target.style.display = "none"; }}
          />
          <div style={{ fontSize: 20, fontWeight: 800, color: "#7B2D8B" }}>Eltop Staff</div>
        </div>
        <button
          onClick={handleLogout}
          style={{ background: "none", border: "1.5px solid #ddd", borderRadius: 8, padding: "8px 16px", fontSize: 13, fontWeight: 700, color: "#555", cursor: "pointer" }}
        >
          Log out
        </button>
      </div>

      <div style={{ maxWidth: 560, margin: "60px auto", padding: "0 24px", textAlign: "center" }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: "#7B2D8B", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 }}>
          {department}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, marginBottom: 12 }}>
          Welcome, {roleLabel}
        </div>
        <div style={{ fontSize: 15, color: "#666", lineHeight: 1.6 }}>
          Your {department ? `${department} ` : ""}dashboard isn't built yet — this is a placeholder
          landing page so login and role routing can be tested end-to-end.
          Real screens for Sales and After-Sales are next in line.
        </div>
      </div>
    </div>
  );
}
