import { useNavigate } from "react-router-dom";

const TIMELINE = [
  { title: "Order Placed", time: "24 Jun, 10:15 AM", done: true },
  { title: "Order Confirmed", time: "24 Jun, 11:40 AM", done: true },
  { title: "Dispatched from Delhi Warehouse", time: "25 Jun, 09:05 AM", done: true },
  { title: "Out for Delivery", time: "Expected 27 Jun", done: false },
  { title: "Delivered", time: "Pending", done: false },
];

export default function OrderTracking() {
  const navigate = useNavigate();
  return (
    <div className="screen" id="screen-tracking">
      <div className="topbar">
        <span className="back" onClick={() => navigate("/dashboard")}>&#8592;</span>
        <h1>Order Tracking</h1>
      </div>
      <div className="content">
        <div className="order-summary-card">
          <div style={{ fontWeight: 700, fontSize: 15 }}>ORD-10234</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>5 items - Rs. 42,300</div>
          <div style={{ fontSize: 12, color: "var(--muted)" }}>Delivery to: Karol Bagh, Delhi</div>
        </div>
        <div className="timeline">
          {TIMELINE.map((t) => (
            <div className={`tl-item${t.done ? "" : " pending"}`} key={t.title}>
              <div className="tl-dot">{t.done ? "✓" : "●"}</div>
              <div className="tl-line"></div>
              <div className="tl-title">{t.title}</div>
              <div className="tl-time">{t.time}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
