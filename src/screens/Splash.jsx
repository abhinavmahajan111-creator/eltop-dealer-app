import { useEffect } from "react";
import { useNavigate } from "react-router-dom";

export default function Splash() {
  const navigate = useNavigate();

  useEffect(() => {
    const t = setTimeout(() => navigate("/login"), 2200);
    return () => clearTimeout(t);
  }, [navigate]);

  return (
    <>
      <style>{`
        .splash-root {
          min-height: 100vh;
          min-height: 100dvh;
          background: linear-gradient(160deg, #96559E, #3D0A2C);
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          color: #fff;
          text-align: center;
          font-family: 'Segoe UI', Arial, sans-serif;
          width: 100%;
        }
        @media (max-width: 639px) {
          .splash-root {
            border: 5px solid #E8A800;
            border-radius: 24px;
          }
        }
      `}</style>
      <div className="splash-root">
        <div className="logo-circle">ET</div>
        <div className="splash-title">ELTOP</div>
        <div className="splash-sub">Dealer Ordering Platform</div>
        <div className="spinner"></div>
      </div>
    </>
  );
}
