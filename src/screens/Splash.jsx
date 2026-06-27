import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate("/login"), 2200);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <div className="screen" id="screen-splash">
      <div className="logo-circle">ET</div>
      <div className="splash-title">ELTOP</div>
      <div className="splash-sub">Dealer Ordering Platform</div>
      <div className="spinner"></div>
    </div>
  );
}
