import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useApp } from "../context/AppContext";

const PENDING_ORDERS = [
  { id: "ORD-10234", sub: "5 items - Rs. 42,300", badge: "pending", label: "Pending" },
  { id: "ORD-10221", sub: "3 items - Rs. 18,750", badge: "transit", label: "In Transit" },
  { id: "ORD-10198", sub: "8 items - Rs. 65,400", badge: "delivered", label: "Delivered" },
];

export default function Dashboard() {
  const navigate = useNavigate();
  const { dealer } = useApp();

  return (
    <div className="screen" id="screen-dashboard">
      <div className="topbar">
        <h1 style={{ flex: 1 }}>Eltop Dealer</h1>
        <span
          onClick={() => navigate("/profile")}
          style={{ fontSize: 18, cursor: "pointer" }}
        >
          &#128100;
        </span>
      </div>
      <div className="content">
        <div className="welcome">Welcome back,</div>
        <div className="dealer-name">{dealer.name}</div>

        <div className="stat-cards">
          <div className="stat-card">
            <div className="stat-label">Outstanding</div>
            <div className="stat-value red">Rs. {dealer.outstanding.toLocaleString()}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Credit Limit</div>
            <div className="stat-value">Rs. {dealer.credit_limit.toLocaleString()}</div>
            <div className="credit-bar-bg">
              <div
                className="credit-bar-fill"
                style={{ width: `${Math.min(100, Math.round((dealer.outstanding / dealer.credit_limit) * 100))}%` }}
              ></div>
            </div>
          </div>
        </div>

        <div className="banner" onClick={() => navigate("/catalogue")}>
          <h3>Monsoon Scheme - Flat 12% Off</h3>
          <p>On all Fans &amp; Geysers | Valid till 30 Jun</p>
        </div>

        <div className="quick-grid">
          <div className="quick-item" onClick={() => navigate("/catalogue")}>
            <div className="ic">&#128218;</div>
            <div className="lb">Catalogue</div>
          </div>
          <div className="quick-item" onClick={() => navigate("/cart")}>
            <div className="ic">&#128722;</div>
            <div className="lb">Cart</div>
          </div>
          <div className="quick-item" onClick={() => navigate("/ledger")}>
            <div className="ic">&#128203;</div>
            <div className="lb">Ledger</div>
          </div>
          <div className="quick-item" onClick={() => navigate("/tracking")}>
            <div className="ic">&#128666;</div>
            <div className="lb">Track</div>
          </div>
        </div>

        <div className="section-title">Pending Orders</div>
        {PENDING_ORDERS.map((o) => (
          <div className="order-row" key={o.id} onClick={() => navigate("/tracking")}>
            <div>
              <div className="oid">{o.id}</div>
              <div className="osub">{o.sub}</div>
            </div>
            <span className={`badge ${o.badge}`}>{o.label}</span>
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
