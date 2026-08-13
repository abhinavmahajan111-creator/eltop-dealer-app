import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

const STATUS_ORDER = ["pending", "confirmed", "dispatched", "out_for_delivery", "delivered"];

const STAGES = [
  { key: "placed",           label: "Order Placed",      tsCol: null,                  statusThreshold: "pending"          },
  { key: "confirmed",        label: "Order Confirmed",   tsCol: "confirmed_at",        statusThreshold: "confirmed"        },
  { key: "dispatched",       label: "Dispatched",        tsCol: "dispatched_at",       statusThreshold: "dispatched"       },
  { key: "out_for_delivery", label: "Out for Delivery",  tsCol: "out_for_delivery_at", statusThreshold: "out_for_delivery" },
  { key: "delivered",        label: "Delivered",         tsCol: "delivered_at",        statusThreshold: "delivered"        },
];

function fmtTs(ts) {
  if (!ts) return null;
  return new Date(ts).toLocaleString("en-IN", {
    day: "numeric", month: "short", hour: "2-digit", minute: "2-digit",
  });
}

export default function OrderTracking() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    Promise.all([
      supabase
        .from("orders")
        .select("id, total, status, delivery_address, created_at, confirmed_at, dispatched_at, out_for_delivery_at, delivered_at")
        .eq("id", orderId)
        .single(),
      supabase
        .from("order_items")
        .select("id, name, qty, price")
        .eq("order_id", orderId),
    ]).then(([orderRes, itemsRes]) => {
      if (!orderRes.error && orderRes.data) setOrder(orderRes.data);
      if (!itemsRes.error && itemsRes.data) setItems(itemsRes.data);
      setLoading(false);
    });
  }, [orderId]);

  if (loading) {
    return (
      <div className="screen" id="screen-tracking">
        <div className="topbar">
          <span className="back" onClick={() => navigate(-1)}>&#8592;</span>
          <h1>Order Tracking</h1>
        </div>
        <div className="content" style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
          Loading…
        </div>
      </div>
    );
  }

  if (!orderId || !order) {
    return (
      <div className="screen" id="screen-tracking">
        <div className="topbar">
          <span className="back" onClick={() => navigate("/dashboard")}>&#8592;</span>
          <h1>Order Tracking</h1>
        </div>
        <div className="content" style={{ padding: "40px 20px", textAlign: "center", color: "var(--muted)" }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📦</div>
          <div style={{ fontWeight: 600, marginBottom: 8 }}>No order selected</div>
          <div style={{ fontSize: 13, marginBottom: 20 }}>
            Select an order from your recent orders to track it.
          </div>
          <button className="btn small" onClick={() => navigate("/dashboard")}>Go to Dashboard</button>
        </div>
      </div>
    );
  }

  const shortId = order.id.slice(-8).toUpperCase();
  const currentStatusIdx = STATUS_ORDER.indexOf(order.status ?? "pending");

  const timeline = STAGES.map((stage) => {
    const stageStatusIdx = STATUS_ORDER.indexOf(stage.statusThreshold);
    const isDone = currentStatusIdx >= stageStatusIdx;
    // Order Placed always uses created_at; other stages use their timestamp column
    const ts = stage.tsCol === null ? order.created_at : order[stage.tsCol];
    return { ...stage, isDone, ts };
  });

  return (
    <div className="screen" id="screen-tracking">
      <div className="topbar">
        <span className="back" onClick={() => navigate(-1)}>&#8592;</span>
        <h1>Order Tracking</h1>
      </div>
      <div className="content">
        <div className="order-summary-card">
          <div style={{ fontWeight: 700, fontSize: 15 }}>#{shortId}</div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
            {items.length} item{items.length !== 1 ? "s" : ""} &middot; Rs. {Math.round(order.total).toLocaleString()}
          </div>
          {order.delivery_address && (
            <div style={{ fontSize: 12, color: "var(--muted)" }}>Delivery to: {order.delivery_address}</div>
          )}
        </div>
        <div className="timeline">
          {timeline.map((t) => (
            <div className={`tl-item${t.isDone ? "" : " pending"}`} key={t.key}>
              <div className="tl-dot">{t.isDone ? "✓" : "●"}</div>
              <div className="tl-line" />
              <div className="tl-title">{t.label}</div>
              <div className="tl-time">
                {t.isDone
                  ? (fmtTs(t.ts) || "Completed")
                  : "Pending"}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
