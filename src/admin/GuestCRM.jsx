import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const TABS = ["Overview", "Orders"];

function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }
function fmtDate(s) {
  return new Date(s).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", hour12: true });
}
function fmtDateOnly(s) {
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function healthBadge(orders) {
  if (!orders.length) return { label: "No Orders", color: "#888", bg: "#f0f0f0" };
  const now = Date.now();
  const msMonth = 30 * 24 * 3600 * 1000;
  const last = new Date(orders[0].created_at).getTime();
  const daysSince = (now - last) / (1000 * 3600 * 24);
  const monthsSpan = Math.max(1, (now - new Date(orders[orders.length - 1].created_at).getTime()) / msMonth);
  const freq = orders.length / monthsSpan;
  if (daysSince <= 30 && freq >= 2) return { label: "Returning", color: "#27ae60", bg: "#eafaf1" };
  if (daysSince <= 60 && freq >= 0.5) return { label: "Occasional", color: "#e67e22", bg: "#fef9e7" };
  return { label: "Dormant", color: "#e74c3c", bg: "#fdedec" };
}

function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--red-dark)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

export default function GuestCRM() {
  const { guestKey } = useParams();
  const navigate = useNavigate();
  const key = decodeURIComponent(guestKey);

  const [tab, setTab] = useState(0);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderItemsCache, setOrderItemsCache] = useState({});

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    supabase
      .from("orders")
      .select("id, customer_name, customer_phone, customer_email, total, created_at, status, delivery_address, email_verified")
      .or(`customer_phone.eq.${key},customer_email.eq.${key}`)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setOrders(data || []);
        setLoading(false);
      });
  }, [key]);

  const toggleOrder = async (orderId) => {
    if (expandedOrderId === orderId) { setExpandedOrderId(null); return; }
    setExpandedOrderId(orderId);
    if (orderItemsCache[orderId]) return;
    const { data } = await supabase.from("order_items").select("id, name, qty, price").eq("order_id", orderId);
    setOrderItemsCache(prev => ({ ...prev, [orderId]: data || [] }));
  };

  if (loading) return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#f5f0f5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif", color: "var(--muted)" }}>
      Loading…
    </div>
  );

  // Derived info from orders
  const firstName = orders[0];
  const guestName  = firstName?.customer_name  || "—";
  const guestPhone = firstName?.customer_phone || "";
  const guestEmail = firstName?.customer_email || "";

  const totalRevenue = orders.reduce((s, o) => s + Number(o.total || 0), 0);
  const avgOrder = orders.length ? totalRevenue / orders.length : 0;
  const lastOrder = orders[0] ? fmtDateOnly(orders[0].created_at) : "Never";
  const health = healthBadge(orders);

  const now = Date.now();
  const msMonth = 30 * 24 * 3600 * 1000;
  const monthsSpan = orders.length > 1
    ? Math.max(1, (now - new Date(orders[orders.length - 1].created_at).getTime()) / msMonth)
    : 1;
  const freq = (orders.length / monthsSpan).toFixed(1);

  const card = { background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 16 };
  const lbl  = { fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 };
  const val  = { fontSize: 14, fontWeight: 500 };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", position: "fixed", inset: 0, zIndex: 1000, overflowY: "auto", background: "#f5f0f5", color: "#222" }}>

      {/* ── Header ── */}
      <div style={{ background: "var(--red-dark)", color: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
        >
          ← Back
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{guestName}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>
            Guest Customer
            {guestPhone && ` · ${guestPhone}`}
            {guestEmail && ` · ${guestEmail}`}
          </div>
        </div>
        <div style={{ background: health.bg, color: health.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
          {health.label}
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", display: "flex", paddingLeft: 16 }}>
        {TABS.map((t, i) => (
          <button key={t} onClick={() => setTab(i)} style={{
            padding: "12px 20px", border: "none", background: "none", cursor: "pointer",
            fontWeight: tab === i ? 700 : 400, fontSize: 13,
            color: tab === i ? "var(--red-dark)" : "#555",
            borderBottom: tab === i ? "2px solid var(--red-dark)" : "2px solid transparent",
            whiteSpace: "nowrap",
          }}>{t}</button>
        ))}
      </div>

      {/* ── Tab Content ── */}
      <div style={{ padding: "20px 24px", maxWidth: 900, margin: "0 auto" }}>

        {/* ══ TAB 0: OVERVIEW ══ */}
        {tab === 0 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))", gap: 12, marginBottom: 20 }}>
              <StatCard label="Total Orders"     value={orders.length} />
              <StatCard label="Total Spent"      value={`₹${fmt(totalRevenue)}`} />
              <StatCard label="Avg Order Value"  value={`₹${fmt(avgOrder)}`} />
              <StatCard label="Last Order"       value={lastOrder} />
              <StatCard label="Order Frequency"  value={`${freq}/mo`} />
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Customer Information</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>
                {[
                  ["Name",  guestName],
                  ["Phone", guestPhone || "—"],
                  ["Email", guestEmail || "—"],
                  ["First Order", orders.length ? fmtDateOnly(orders[orders.length - 1].created_at) : "—"],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={lbl}>{l}</div>
                    <div style={val}>{v}</div>
                  </div>
                ))}
                {orders[0]?.delivery_address && (
                  <div style={{ gridColumn: "1 / -1" }}>
                    <div style={lbl}>Last Delivery Address</div>
                    <div style={val}>{orders[0].delivery_address}</div>
                  </div>
                )}
              </div>
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Engagement — {health.label}</div>
              <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
                {health.label === "Returning"  && "This customer orders frequently and placed an order recently. High engagement — ideal candidate for loyalty offers or dealer onboarding."}
                {health.label === "Occasional" && "Orders occasionally but not consistently. A targeted promotion or follow-up could increase order frequency."}
                {health.label === "Dormant"    && "No order in 60+ days or very low frequency. Consider a win-back campaign."}
                {health.label === "No Orders"  && "No orders found for this customer."}
              </div>
            </div>
          </>
        )}

        {/* ══ TAB 1: ORDERS ══ */}
        {tab === 1 && (
          <>
            {(() => {
              const now2 = new Date();
              const thisMonth = orders.filter(o => {
                const d = new Date(o.created_at);
                return d.getMonth() === now2.getMonth() && d.getFullYear() === now2.getFullYear();
              });
              const last3 = orders.filter(o => new Date(o.created_at) >= new Date(Date.now() - 90 * 24 * 3600 * 1000));
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                  <StatCard label="This Month"   value={thisMonth.length} sub={`₹${fmt(thisMonth.reduce((s, o) => s + Number(o.total), 0))}`} />
                  <StatCard label="Last 3 Months" value={last3.length}    sub={`₹${fmt(last3.reduce((s, o) => s + Number(o.total), 0))}`} />
                  <StatCard label="Lifetime"     value={orders.length}    sub={`₹${fmt(totalRevenue)}`} />
                </div>
              );
            })()}

            <div style={card}>
              {orders.length === 0 ? (
                <div style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>No orders found.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      {["", "Order ID", "Date", "Total", "Status", ""].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => [
                      <tr key={o.id} onClick={() => toggleOrder(o.id)}
                        style={{ borderBottom: "1px solid var(--border)", cursor: "pointer" }}
                        className="admin-dealer-row">
                        <td style={{ padding: "8px", color: "var(--muted)", fontSize: 11, width: 20 }}>{expandedOrderId === o.id ? "▼" : "▶"}</td>
                        <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11 }}>{o.id.slice(0, 8)}…</td>
                        <td style={{ padding: "8px", whiteSpace: "nowrap" }}>{fmtDate(o.created_at)}</td>
                        <td style={{ padding: "8px", fontWeight: 600 }}>₹{fmt(o.total)}</td>
                        <td style={{ padding: "8px" }}>
                          <span className={`badge ${o.status === "delivered" ? "delivered" : o.status === "pending" ? "pending" : "confirmed"}`}>
                            {o.status}
                          </span>
                        </td>
                        <td style={{ padding: "8px" }}>
                          {o.email_verified && (
                            <span style={{ fontSize: 10, fontWeight: 700, color: '#27ae60', background: '#eafaf1', borderRadius: 4, padding: '2px 7px', whiteSpace: 'nowrap' }}>✓ verified</span>
                          )}
                        </td>
                      </tr>,
                      expandedOrderId === o.id && (
                        <tr key={`${o.id}-d`}>
                          <td colSpan={6} style={{ background: "#f8f4f8", padding: "12px 16px" }}>
                            {!orderItemsCache[o.id] ? (
                              <div style={{ color: "var(--muted)" }}>Loading…</div>
                            ) : orderItemsCache[o.id].length === 0 ? (
                              <div style={{ color: "var(--muted)" }}>No items.</div>
                            ) : (
                              <table style={{ width: "100%", fontSize: 12 }}>
                                <thead><tr><th style={{ textAlign: "left" }}>Product</th><th>Qty</th><th>Price</th><th>Subtotal</th></tr></thead>
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
      </div>
    </div>
  );
}
