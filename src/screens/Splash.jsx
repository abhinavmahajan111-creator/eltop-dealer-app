import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate("/login"), 2200);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div style={{
      minHeight: "100vh", minHeight: "100dvh",
      background: "linear-gradient(160deg, #96559E, #3D0A2C)",
      display: "flex", flexDirection: "column",
      alignItems: "center", justifyContent: "center",
      color: "#fff", textAlign: "center",
      fontFamily: "'Segoe UI', Arial, sans-serif",
      border: "2px solid #E8A800",
    }}>
      <div className="logo-circle">ET</div>
      <div className="splash-title">ELTOP</div>
      <div className="splash-sub">Dealer Ordering Platform</div>
      <div className="spinner"></div>
    </div>
  );
}
