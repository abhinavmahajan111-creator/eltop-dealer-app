import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useApp } from "../context/AppContext";

export default function Profile() {
  const navigate = useNavigate();
  const { dealer, email, signOut, session, isLoggedIn, dealerApplicationStatus } = useApp();

  // toastKey > 0 means toast is visible. Incrementing restarts animation + dismiss timer.
  const [toastKey, setToastKey] = useState(0);

  useEffect(() => {
    if (isLoggedIn === false) navigate("/login", { replace: true });
  }, [isLoggedIn, navigate]);

  useEffect(() => {
    if (toastKey === 0) return;
    const t = setTimeout(() => setToastKey(0), 2500);
    return () => clearTimeout(t);
  }, [toastKey]);

  if (!session) return null;

  const isPending = dealerApplicationStatus &&
    dealerApplicationStatus !== 'approved' &&
    dealerApplicationStatus !== 'none';

  const initials = (dealer.name || "?")
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  async function handleLogout() {
    await signOut();
    navigate("/login");
  }

  function handleLockedClick() {
    setToastKey(k => k + 1);
  }

  // Chevron used by all unlocked rows.
  const chevron = <span className="arrow">&#8250;</span>;
  // Lock icon used in place of chevron for locked rows.
  const lockIcon = <span style={{ fontSize: 14, color: "#94a3b8" }}>&#128274;</span>;

  return (
    <div className="screen" id="screen-profile">
      <style>{`
        @keyframes pendingToastIn {
          0%   { transform: translateY(18px) scale(0.93); opacity: 0; }
          60%  { transform: translateY(-4px) scale(1.03); opacity: 1; }
          80%  { transform: translateY(2px) scale(0.98); }
          100% { transform: translateY(0) scale(1); opacity: 1; }
        }
        .pending-toast {
          animation: pendingToastIn 400ms cubic-bezier(0.34, 1.56, 0.64, 1) both;
        }
      `}</style>

      <div className="topbar">
        <span className="back" onClick={() => navigate("/dashboard")}>&#8592;</span>
        <h1>Profile</h1>
      </div>

      <div className="content">
        <div className="profile-head">
          <div className="avatar">{initials}</div>
          <div className="profile-name" style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, flexWrap: "wrap" }}>
            {dealer.name}
            {isPending && (
              <span style={{
                display: "inline-flex", alignItems: "center",
                background: "#fef3c7", color: "#b45309",
                fontSize: 11, fontWeight: 700, padding: "2px 9px",
                borderRadius: 20, border: "1.5px solid #b45309",
              }}>
                Application pending
              </span>
            )}
          </div>
          <div className="profile-sub">Dealer ID: {dealer.dealer_code}</div>
        </div>

        <div className="list-card">
          <div className="list-row"><span className="ic">&#128231;</span><span>{email || dealer.email || "dealer@example.com"}</span></div>
          <div className="list-row"><span className="ic">&#128205;</span><span>{dealer.address}</span></div>
          <div className="list-row"><span className="ic">&#127970;</span><span>GSTIN: {dealer.gstin}</span></div>
        </div>

        <div className="list-card" style={{ position: "relative" }}>
          <div
            className="list-row"
            onClick={isPending ? handleLockedClick : () => navigate("/ledger")}
            style={isPending ? { cursor: "default" } : undefined}
          >
            <span className="ic">&#128203;</span><span>My Ledger</span>{isPending ? lockIcon : chevron}
          </div>
          <div
            className="list-row"
            onClick={isPending ? handleLockedClick : () => navigate("/tracking")}
            style={isPending ? { cursor: "default" } : undefined}
          >
            <span className="ic">&#128666;</span><span>Order History</span>{isPending ? lockIcon : chevron}
          </div>
          <div
            className="list-row"
            onClick={isPending ? handleLockedClick : undefined}
            style={isPending ? { cursor: "default" } : undefined}
          >
            <span className="ic">&#127991;</span><span>Schemes &amp; Offers</span>{isPending ? lockIcon : chevron}
          </div>
          <div
            className="list-row"
            onClick={isPending ? handleLockedClick : undefined}
            style={isPending ? { cursor: "default" } : undefined}
          >
            <span className="ic">&#9742;</span><span>Support</span>{isPending ? lockIcon : chevron}
          </div>

          {toastKey > 0 && (
            <div
              key={toastKey}
              className="pending-toast"
              style={{
                position: "absolute", left: 12, right: 12, bottom: -48,
                background: "#fef3c7", color: "#b45309",
                border: "1.5px solid #b45309", borderRadius: 10,
                padding: "9px 14px", fontSize: 13, fontWeight: 600,
                textAlign: "center", pointerEvents: "none",
              }}
            >
              Available once your application is approved.
            </div>
          )}
        </div>

        <button className="btn outline" style={{ marginTop: 56 }} onClick={handleLogout}>Logout</button>
      </div>
      <BottomNav />
    </div>
  );
}
