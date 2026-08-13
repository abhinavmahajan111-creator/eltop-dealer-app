import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function OrderConfirm() {
  const navigate = useNavigate();
  const { orderId } = useParams();
  const [order, setOrder] = useState(null);
  const [itemCount, setItemCount] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!orderId) { setLoading(false); return; }
    Promise.all([
      supabase.from("orders").select("id, total, created_at, status").eq("id", orderId).single(),
      supabase.from("order_items").select("id", { count: "exact", head: true }).eq("order_id", orderId),
    ]).then(([orderRes, countRes]) => {
      if (!orderRes.error && orderRes.data) setOrder(orderRes.data);
      if (!countRes.error) setItemCount(countRes.count ?? 0);
      setLoading(false);
    });
  }, [orderId]);

  if (loading) {
    return (
      <div className="screen" id="screen-confirm">
        <div className="confirm-wrap">
          <div style={{ color: "var(--muted)", paddingTop: 60 }}>Loading…</div>
        </div>
      </div>
    );
  }

  if (!orderId || !order) {
    return (
      <div className="screen" id="screen-confirm">
        <div className="confirm-wrap">
          <div style={{ fontSize: 36, marginBottom: 12 }}>⚠️</div>
          <div className="confirm-title">Order Not Found</div>
          <div className="confirm-sub">This order link is invalid or has expired.</div>
          <button className="btn" style={{ marginTop: 20 }} onClick={() => navigate("/dashboard")}>
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  const shortId = order.id.slice(-8).toUpperCase();
  const dateStr = new Date(order.created_at).toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit",
  });

  return (
    <div className="screen" id="screen-confirm">
      <div className="confirm-wrap">
        <div className="check-circle">&#10003;</div>
        <div className="confirm-title">Order Placed Successfully!</div>
        <div className="confirm-sub">Your order has been sent to Eltop for processing.</div>
        <div className="confirm-id">#{shortId}</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 4 }}>
          {itemCount !== null ? `${itemCount} item${itemCount !== 1 ? "s" : ""}` : ""}
          {itemCount !== null && " · "}
          Rs. {Math.round(order.total).toLocaleString()}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 20 }}>{dateStr}</div>
        <button className="btn" style={{ marginBottom: 10 }} onClick={() => navigate(`/tracking/${order.id}`)}>
          Track Order
        </button>
        <button className="btn outline" onClick={() => navigate("/dashboard")}>
          Back to Home
        </button>
      </div>
    </div>
  );
}
