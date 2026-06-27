import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useApp } from "../context/AppContext";

export default function Ledger() {
  const navigate = useNavigate();
  const { invoices } = useApp();

  return (
    <div className="screen" id="screen-ledger">
      <div className="topbar">
        <span className="back" onClick={() => navigate("/dashboard")}>&#8592;</span>
        <h1>Ledger / Invoices</h1>
      </div>
      <div className="content">
        <div className="stat-cards">
          <div className="stat-card">
            <div className="stat-label">Total Due</div>
            <div className="stat-value red">Rs. 1,25,000</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">This Month Paid</div>
            <div className="stat-value">Rs. 80,000</div>
          </div>
        </div>
        <div className="section-title">Invoices</div>
        {invoices.map((inv) => (
          <div className="ledger-row" key={inv.inv}>
            <div>
              <div className="ledger-inv">{inv.inv}</div>
              <div className="ledger-date">{inv.date}</div>
            </div>
            <div className={`ledger-amt ${inv.status}`}>
              Rs. {inv.amt.toLocaleString()}
              <br />
              <span style={{ fontSize: 10, fontWeight: 400 }}>
                {inv.status === "due" ? "Due" : "Paid"}
              </span>
            </div>
          </div>
        ))}
      </div>
      <BottomNav />
    </div>
  );
}
