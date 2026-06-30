import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const STATUSES = ["pending", "confirmed", "dispatched", "delivered"];

function dealerLabel(profile) {
  if (!profile) return "—";
  // "New Dealer" is the DB default — treat it as unset
  const name = profile.name && profile.name !== "New Dealer" ? profile.name : null;
  return name || profile.email || profile.dealer_code || "Unknown";
}

export default function AdminOrders() {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  const [itemsCache, setItemsCache] = useState({});
  const [itemsLoading, setItemsLoading] = useState(false);

  const loadOrders = () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("orders")
      .select("id, status, total, subtotal, tax, delivery_address, created_at, dealer_id, profiles(name, email, dealer_code, address)")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setOrders(data);
        setLoading(false);
      });
  };

  useEffect(() => { loadOrders(); }, []);

  const handleStatusChange = async (orderId, status, e) => {
    e.stopPropagation();
    setSavingId(orderId);
    await supabase.from("orders").update({ status }).eq("id", orderId);
    setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
    setSavingId(null);
  };

  const handleRowClick = async (orderId) => {
    if (expandedId === orderId) { setExpandedId(null); return; }
    setExpandedId(orderId);
    if (itemsCache[orderId]) return;
    setItemsLoading(true);
    const { data } = await supabase
      .from("order_items")
      .select("id, name, price, qty")
      .eq("order_id", orderId);
    setItemsCache((prev) => ({ ...prev, [orderId]: data || [] }));
    setItemsLoading(false);
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
                <th></th>
                <th>Order ID</th>
                <th>Dealer</th>
                <th>Total</th>
                <th>Placed</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => {
                const isOpen = expandedId === o.id;
                const items = itemsCache[o.id] || [];
                const profile = o.profiles;

                return [
                  <tr
                    key={o.id}
                    className={`admin-order-row${isOpen ? " expanded" : ""}`}
                    onClick={() => handleRowClick(o.id)}
                    style={{ cursor: "pointer" }}
                  >
                    <td style={{ width: 24, color: "var(--muted)", fontSize: 11 }}>
                      {isOpen ? "▼" : "▶"}
                    </td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>
                      {o.id.slice(0, 8)}…
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{dealerLabel(profile)}</div>
                      {profile?.email && (
                        <div style={{ fontSize: 11, color: "var(--muted)" }}>{profile.email}</div>
                      )}
                    </td>
                    <td>Rs. {Number(o.total).toLocaleString()}</td>
                    <td>{new Date(o.created_at).toLocaleDateString()}</td>
                    <td onClick={(e) => e.stopPropagation()} style={{ whiteSpace: "nowrap" }}>
                      <select
                        className="admin-select"
                        value={o.status}
                        disabled={savingId === o.id}
                        onChange={(e) => handleStatusChange(o.id, e.target.value, e)}
                      >
                        {STATUSES.map((s) => (
                          <option key={s} value={s}>
                            {s.charAt(0).toUpperCase() + s.slice(1)}
                          </option>
                        ))}
                      </select>
                      <button
                        className="admin-link"
                        style={{ marginLeft: 10 }}
                        onClick={() => window.open(`/admin/orders/${o.id}/print`, "_blank")}
                      >
                        🖨
                      </button>
                    </td>
                  </tr>,

                  isOpen && (
                    <tr key={`${o.id}-detail`} className="admin-order-detail-row">
                      <td colSpan={6} style={{ padding: 0 }}>
                        <div className="admin-order-detail">
                          {/* Dealer info */}
                          <div className="admin-order-detail-section">
                            <div className="admin-order-detail-heading">Dealer Info</div>
                            <div className="admin-order-detail-grid">
                              <span className="od-label">Name</span>
                              <span>{profile?.name || "—"}</span>
                              <span className="od-label">Email</span>
                              <span>{profile?.email || "—"}</span>
                              <span className="od-label">Dealer Code</span>
                              <span>{profile?.dealer_code || "—"}</span>
                              <span className="od-label">Address</span>
                              <span>{o.delivery_address || profile?.address || "—"}</span>
                            </div>
                          </div>

                          {/* Order items */}
                          <div className="admin-order-detail-section">
                            <div className="admin-order-detail-heading">Order Items</div>
                            {itemsLoading && !itemsCache[o.id] ? (
                              <div className="admin-loading" style={{ padding: "8px 0" }}>Loading items…</div>
                            ) : items.length === 0 ? (
                              <div className="admin-empty" style={{ padding: "8px 0" }}>No items found.</div>
                            ) : (
                              <table className="admin-table od-items-table">
                                <thead>
                                  <tr>
                                    <th>Product</th>
                                    <th>Price</th>
                                    <th>Qty</th>
                                    <th>Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {items.map((item) => (
                                    <tr key={item.id}>
                                      <td>{item.name}</td>
                                      <td>Rs. {Number(item.price).toLocaleString()}</td>
                                      <td>{item.qty}</td>
                                      <td>Rs. {(Number(item.price) * item.qty).toLocaleString()}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>

                          {/* Print button */}
                          <div style={{ width: "100%", paddingTop: 4 }}>
                            <button
                              className="btn small"
                              onClick={() => window.open(`/admin/orders/${o.id}/print`, "_blank")}
                            >
                              🖨 Print Sales Order
                            </button>
                          </div>

                          {/* Order totals */}
                          <div className="admin-order-detail-section od-totals">
                            <span>Subtotal</span><span>Rs. {Number(o.subtotal).toLocaleString()}</span>
                            <span>Tax</span><span>Rs. {Number(o.tax).toLocaleString()}</span>
                            <span className="od-total-label">Total</span>
                            <span className="od-total-value">Rs. {Number(o.total).toLocaleString()}</span>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
