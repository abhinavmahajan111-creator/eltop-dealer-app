import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";

function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }
function fmtDate(s) {
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtDateOnly(s) {
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}
function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "#DC2626" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

const TABS = ["My Orders", "Overview"];

export default function MyAccount() {
  const navigate = useNavigate();
  const { session, signOut } = useApp();

  const [tab, setTab] = useState(0);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderItemsCache, setOrderItemsCache] = useState({});

  const email = session?.user?.email || "";

  useEffect(() => {
    if (!isSupabaseConfigured || !email) { setLoading(false); return; }
    supabase
      .from("orders")
      .select("id, customer_name, customer_phone, customer_email, total, created_at, status, delivery_address, email_verified")
      .ilike("customer_email", email)
      .is("dealer_id", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders(data || []);
        setLoading(false);
      });
  }, [email]);

  const toggleOrder = async (orderId) => {
    if (expandedOrderId === orderId) { setExpandedOrderId(null); return; }
    setExpandedOrderId(orderId);
    if (orderItemsCache[orderId]) return;
    const { data } = await supabase.from("order_items").select("id, name, qty, price").eq("order_id", orderId);
    setOrderItemsCache(prev => ({ ...prev, [orderId]: data || [] }));
  };

  const customerName = orders[0]?.customer_name || email;
  const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const avgOrder = orders.length ? totalRevenue / orders.length : 0;
  const lastOrder = orders[0] ? fmtDateOnly(orders[0].created_at) : "Never";

  const card = { background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 16 };
  const lbl  = { fontSize: 11, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 };
  const val  = { fontSize: 14, fontWeight: 500 };

  if (loading) return (
    <div style={{ position: "fixed", inset: 0, background: "#f8f4f8", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, color: "#94a3b8" }}>
      Loading…
    </div>
  );

  return (
    <div style={{ fontFamily: "inherit", minHeight: "100vh", background: "#f8f4f8", color: "#222" }}>

      {/* Header */}
      <div style={{ background: "#7B2D8B", color: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={() => navigate("/store")}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
        >
          ← Back to Store
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{customerName}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{email}</div>
        </div>
        <button
          onClick={async () => { await signOut(); navigate("/store"); }}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
        >
          Logout
        </button>
      </div>

      {/* Tabs */}
      <div style={{ background: "#fff", borderBottom: "1px solid #e2e8f0", display: "flex", paddingLeft: 16, overflowX: "auto" }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            padding: "12px 20px", border: "none", background: "none", cursor: "pointer",
            fontWeight: tab === i ? 700 : 400, fontSize: 13,
            color: tab === i ? "#7B2D8B" : "#555",
            borderBottom: tab === i ? "2px solid #7B2D8B" : "2px solid transparent",
            whiteSpace: "nowrap",
          }}>{t}</button>
        ))}
      </div>

      <div style={{ padding: "20px 24px", maxWidth: 900, margin: "0 auto" }}>

        {/* TAB 0: MY ORDERS */}
        {tab === 0 && (
          <>
            {(() => {
              const now = new Date();
              const thisMonth = orders.filter(o => {
                const d = new Date(o.created_at);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
              });
              const last3 = orders.filter(o => new Date(o.created_at) >= new Date(Date.now() - 90 * 24 * 3600 * 1000));
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                  <StatCard label="This Month"    value={thisMonth.length} sub={`₹${fmt(thisMonth.reduce((s, o) => s + Number(o.total), 0))}`} />
                  <StatCard label="Last 3 Months" value={last3.length}     sub={`₹${fmt(last3.reduce((s, o) => s + Number(o.total), 0))}`} />
                  <StatCard label="Lifetime"      value={orders.length}    sub={`₹${fmt(totalRevenue)}`} />
                </div>
              );
            })()}
            <div style={card}>
              {orders.length === 0 ? (
                <div style={{ color: "#94a3b8", textAlign: "center", padding: 32 }}>
                  <div style={{ fontSize: 32, marginBottom: 8 }}>📦</div>
                  No orders yet.{" "}
                  <button onClick={() => navigate("/store")} style={{ background: "none", border: "none", color: "#7B2D8B", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>
                    Shop now →
                  </button>
                </div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid #e2e8f0" }}>
                      {["", "Order ID", "Date", "Total", "Status"].map((h, i) => (
                        <th key={i} style={{ textAlign: "left", padding: "6px 8px", color: "#94a3b8", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => [
                      <tr key={o.id} onClick={() => toggleOrder(o.id)} style={{ borderBottom: "1px solid #e2e8f0", cursor: "pointer" }}>
                        <td style={{ padding: "8px", color: "#94a3b8", fontSize: 11, width: 20 }}>{expandedOrderId === o.id ? "▼" : "▶"}</td>
                        <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11 }}>{o.id.slice(0, 8)}…</td>
                        <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{fmtDate(o.created_at)}</td>
                        <td style={{ padding: "8px", fontWeight: 600 }}>₹{fmt(o.total)}</td>
                        <td style={{ padding: "8px" }}>
                          <span style={{
                            fontSize: 11, fontWeight: 700, borderRadius: 4, padding: "2px 8px",
                            background: o.status === "delivered" ? "#eafaf1" : o.status === "pending" ? "#fef9e7" : "#f0f4ff",
                            color:      o.status === "delivered" ? "#27ae60" : o.status === "pending" ? "#e67e22" : "#2563eb",
                          }}>{o.status}</span>
                        </td>
                      </tr>,
                      expandedOrderId === o.id && (
                        <tr key={`${o.id}-d`}>
                          <td colSpan={5} style={{ background: "#f8f4f8", padding: "12px 16px" }}>
                            {!orderItemsCache[o.id] ? (
                              <div style={{ color: "#94a3b8" }}>Loading…</div>
                            ) : orderItemsCache[o.id].length === 0 ? (
                              <div style={{ color: "#94a3b8" }}>No items.</div>
                            ) : (
                              <table style={{ width: "100%", fontSize: 12 }}>
                                <thead>
                                  <tr>
                                    <th style={{ textAlign: "left" }}>Product</th>
                                    <th style={{ textAlign: "center" }}>Qty</th>
                                    <th style={{ textAlign: "right" }}>Price</th>
                                    <th style={{ textAlign: "right" }}>Subtotal</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {orderItemsCache[o.id].map(it => (
                                    <tr key={it.id}>
                                      <td style={{ padding: "4px 0" }}>{it.name}</td>
                                      <td style={{ textAlign: "center" }}>{it.qty}</td>
                                      <td style={{ textAlign: "right" }}>₹{fmt(it.price)}</td>
                                      <td style={{ textAlign: "right" }}>₹{fmt(Number(it.price) * it.qty)}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      ),
                    ])}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* TAB 1: OVERVIEW */}
        {tab === 1 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
              <StatCard label="Total Orders"    value={orders.length} />
              <StatCard label="Total Spent"     value={`₹${fmt(totalRevenue)}`} />
              <StatCard label="Avg Order Value" value={`₹${fmt(avgOrder)}`} />
              <StatCard label="Last Order"      value={lastOrder} />
            </div>
            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Account Details</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>
                {[
                  ["Name",         customerName],
                  ["Email",        email || "—"],
                  ["Account Type", "Verified Customer"],
                  ["Payment",      "Prepaid (Razorpay)"],
                  ["First Order",  orders.length ? fmtDateOnly(orders[orders.length - 1].created_at) : "—"],
                  ["Member Since", orders.length ? fmtDateOnly(orders[orders.length - 1].created_at) : "—"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={lbl}>{l}</div>
                    <div style={val}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
