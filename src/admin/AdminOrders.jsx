import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const STATUSES = ["pending", "confirmed", "dispatched", "delivered"];

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const loadOrders = () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("orders")
      .select("id, status, total, created_at, dealer_id, profiles(name, dealer_code)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setOrders(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadOrders();
  }, []);

  const handleStatusChange = async (orderId, status) => {
    setSavingId(orderId);
    await supabase.from("orders").update({ status }).eq("id", orderId);
    setOrders((prev) =>
      prev.map((o) => (o.id === orderId ? { ...o, status } : o))
    );
    setSavingId(null);
  };

  return (
    <div className="admin-page">
      <h1 className="admin-title">Orders</h1>
      {loading ? (
        <div className="admin-loading">Loading&hellip;</div>
      ) : orders.length === 0 ? (
        <div className="admin-empty">No orders yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Dealer</th>
                <th>Total</th>
                <th>Placed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o.id}>
                  <td>{o.id.slice(0, 8)}</td>
                  <td>{o.profiles?.name || "—"}</td>
                  <td>Rs. {Number(o.total).toLocaleString()}</td>
                  <td>{new Date(o.created_at).toLocaleDateString()}</td>
                  <td>
                    <select
                      className="admin-select"
                      value={o.status}
                      disabled={savingId === o.id}
                      onChange={(e) => handleStatusChange(o.id, e.target.value)}
                    >
                      {STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {s.charAt(0).toUpperCase() + s.slice(1)}
                        </option>
                      ))}
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
