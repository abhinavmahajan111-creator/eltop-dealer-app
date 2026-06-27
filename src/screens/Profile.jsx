import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useApp } from "../context/AppContext";

export default function Profile() {
  const navigate = useNavigate();
  const { dealer } = useApp();
  const initials = dealer.name
    .split(" ")
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();

  return (
    <div className="screen" id="screen-profile">
      <div className="topbar">
        <span className="back" onClick={() => navigate("/dashboard")}>&#8592;</span>
        <h1>Profile</h1>
      </div>
      <div className="content">
        <div className="profile-head">
          <div className="avatar">{initials}</div>
          <div className="profile-name">{dealer.name}</div>
          <div className="profile-sub">Dealer ID: {dealer.dealerId}</div>
        </div>
        <div className="list-card">
          <div className="list-row"><span className="ic">&#128222;</span><span>+91 98765 43210</span></div>
          <div className="list-row"><span className="ic">&#128205;</span><span>{dealer.address}</span></div>
          <div className="list-row"><span className="ic">&#127970;</span><span>GSTIN: {dealer.gstin}</span></div>
        </div>
        <div className="list-card">
          <div className="list-row" onClick={() => navigate("/ledger")}>
            <span className="ic">&#128203;</span><span>My Ledger</span><span className="arrow">&#8250;</span>
          </div>
          <div className="list-row" onClick={() => navigate("/tracking")}>
            <span className="ic">&#128666;</span><span>Order History</span><span className="arrow">&#8250;</span>
          </div>
          <div className="list-row">
            <span className="ic">&#127991;</span><span>Schemes &amp; Offers</span><span className="arrow">&#8250;</span>
          </div>
          <div className="list-row">
            <span className="ic">&#9742;</span><span>Support</span><span className="arrow">&#8250;</span>
          </div>
        </div>
        <button className="btn outline" onClick={() => navigate("/login")}>Logout</button>
      </div>
      <BottomNav />
    </div>
  );
}
