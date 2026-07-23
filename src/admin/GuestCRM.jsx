import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const TABS = ["Overview", "Orders", "Activity", "Ledger", "AI Assistant"];
const ACTIVITY_ICONS = { call: "📞", whatsapp: "💬", visit: "🤝", note: "📝" };

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
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderItemsCache, setOrderItemsCache] = useState({});
  const [allOrderItems, setAllOrderItems] = useState([]);

  // Activity form
  const [actForm, setActForm] = useState({ type: "call", notes: "", date: new Date().toISOString().slice(0, 10) });
  const [actOpen, setActOpen] = useState(false);
  const [actSaving, setActSaving] = useState(false);

  // AI chat
  const [messages, setMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [editingMsgIdx, setEditingMsgIdx] = useState(null);
  const [editingText, setEditingText] = useState("");
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    Promise.all([
      supabase.from("orders")
        .select("id, customer_name, customer_phone, customer_email, total, created_at, status, delivery_address, email_verified")
        .or(`customer_phone.eq.${key},customer_email.eq.${key}`)
        .order("created_at", { ascending: false }),
      supabase.from("guest_activities")
        .select("*")
        .eq("guest_key", key)
        .order("created_at", { ascending: false }),
    ]).then(async ([ordRes, actRes]) => {
      const fetchedOrders = ordRes.data || [];
      setOrders(fetchedOrders);
      setActivities(actRes.data || []);

      if (fetchedOrders.length > 0) {
        const { data: items } = await supabase
          .from("order_items")
          .select("order_id, name, qty, price")
          .in("order_id", fetchedOrders.map(o => o.id));
        setAllOrderItems(items || []);
      }
      setLoading(false);
    });
  }, [key]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const toggleOrder = async (orderId) => {
    if (expandedOrderId === orderId) { setExpandedOrderId(null); return; }
    setExpandedOrderId(orderId);
    if (orderItemsCache[orderId]) return;
    const { data } = await supabase.from("order_items").select("id, name, qty, price").eq("order_id", orderId);
    setOrderItemsCache(prev => ({ ...prev, [orderId]: data || [] }));
  };

  const saveActivity = async () => {
    setActSaving(true);
    const { data } = await supabase.from("guest_activities").insert({
      guest_key: key, type: actForm.type, notes: actForm.notes,
      created_at: new Date(actForm.date).toISOString(),
    }).select().single();
    if (data) setActivities(prev => [data, ...prev]);
    setActSaving(false);
    setActOpen(false);
    setActForm({ type: "call", notes: "", date: new Date().toISOString().slice(0, 10) });
  };

  if (loading) return (
    <div style={{ position: "fixed", inset: 0, zIndex: 1000, background: "#f5f0f5", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "Arial, sans-serif", color: "var(--muted)" }}>
      Loading…
    </div>
  );

  // ── Derived stats ──
  const firstName = orders[0];
  const guestName  = firstName?.customer_name || "—";
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

  // ── AI context ──
  const productFreq = {};
  allOrderItems.forEach(it => {
    if (!productFreq[it.name]) productFreq[it.name] = 0;
    productFreq[it.name] += it.qty;
  });
  const topProducts = Object.entries(productFreq)
    .sort((a, b) => b[1] - a[1]).slice(0, 10)
    .map(([name, qty]) => `${name} (${qty} units)`).join(", ") || "None";

  const itemsByOrder = {};
  allOrderItems.forEach(it => {
    if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
    itemsByOrder[it.order_id].push(it);
  });
  const last5 = orders.slice(0, 5).map((o, i) => {
    const items = (itemsByOrder[o.id] || []).map(it => `${it.name} ×${it.qty} @ ₹${fmt(it.price)}`).join(", ") || "Items not loaded";
    return `  Order ${i + 1} (${fmtDateOnly(o.created_at)}, ₹${fmt(o.total)}, ${o.status}): ${items}`;
  }).join("\n");

  const guestContext = `
GUEST CUSTOMER PROFILE:
Name: ${guestName} | Phone: ${guestPhone || "N/A"} | Email: ${guestEmail || "N/A"}
Guest Key (identifier): ${key}
Note: Guest customer — orders placed without a dealer account. All orders are prepaid.

ACCOUNT SUMMARY:
Total Orders: ${orders.length} | Total Revenue: ₹${fmt(totalRevenue)} | Avg Order Value: ₹${fmt(avgOrder)}
Last Order: ${lastOrder} | Order Frequency: ${freq}/month | Engagement: ${health.label}
Outstanding Balance: ₹0 (prepaid customer)

MOST ORDERED PRODUCTS (by units):
${topProducts}

LAST 5 ORDERS WITH ITEMS:
${last5 || "No orders yet"}

RECENT ACTIVITIES:
${activities.slice(0, 5).map(a => `  ${a.type} on ${fmtDateOnly(a.created_at)}: ${a.notes || "—"}`).join("\n") || "  None logged"}
`.trim();

  const systemPrompt = `You are an expert sales CRM assistant for Eltop by Embassy Electricals. You help the sales team understand and manage their customer relationships. This is a guest customer (no dealer account). Always be specific, actionable, and concise.\n\n${guestContext}`;

  const callAI = async (history) => {
    setAiLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: systemPrompt,
          messages: history.map(m => ({ role: m.role, content: m.content })),
        }),
      });
      const json = await res.json();
      const reply = json.content?.[0]?.text || "Sorry, I couldn't get a response.";
      setMessages(prev => [...prev, { role: "assistant", content: reply }]);
    } catch {
      setMessages(prev => [...prev, { role: "assistant", content: "Error connecting to AI assistant." }]);
    }
    setAiLoading(false);
  };

  const sendAI = async (userMsg) => {
    const msg = userMsg || aiInput.trim();
    if (!msg) return;
    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setAiInput("");
    await callAI(newMessages);
  };

  const submitEdit = async (idx) => {
    const trimmed = editingText.trim();
    if (!trimmed) return;
    const newMessages = [...messages.slice(0, idx), { role: "user", content: trimmed }];
    setMessages(newMessages);
    setEditingMsgIdx(null);
    setEditingText("");
    await callAI(newMessages);
  };

  const SUGGESTED = [
    "Summarize this customer's order history",
    "Is this customer likely to return?",
    "What products should I recommend next?",
    "Draft a re-engagement WhatsApp message",
    "Should we offer this customer a dealer account?",
  ];

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
        <div style={{ flex: 1, minWidth: 0, overflowWrap: 'break-word', wordBreak: 'break-all' }}>
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
      <div style={{ background: "#fff", borderBottom: "1px solid var(--border)", display: "flex", gap: 0, paddingLeft: 16, overflowX: "auto" }}>
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
              <StatCard label="Total Orders"    value={orders.length} />
              <StatCard label="Total Revenue"   value={`₹${fmt(totalRevenue)}`} />
              <StatCard label="Avg Order Value" value={`₹${fmt(avgOrder)}`} />
              <StatCard label="Last Order"      value={lastOrder} />
              <StatCard label="Order Frequency" value={`${freq}/mo`} />
              <StatCard label="Outstanding"     value="₹0" sub="Prepaid customer" />
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Customer Information</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>
                {[
                  ["Name",        guestName],
                  ["Phone",       guestPhone || "—"],
                  ["Email",       guestEmail || "—"],
                  ["First Order", orders.length ? fmtDateOnly(orders[orders.length - 1].created_at) : "—"],
                  ["Account Type", "Guest — no dealer account"],
                  ["Payment",     "Prepaid (Razorpay)"],
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
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Account Health — {health.label}</div>
              <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
                {health.label === "Returning"  && "This customer orders frequently and placed an order recently. High engagement — ideal candidate for loyalty offers or dealer account onboarding."}
                {health.label === "Occasional" && "Orders occasionally but not consistently. A targeted promotion or re-engagement message could increase order frequency."}
                {health.label === "Dormant"    && "No order in 60+ days or very low frequency. Consider a win-back message or promotion."}
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
                  <StatCard label="This Month"    value={thisMonth.length} sub={`₹${fmt(thisMonth.reduce((s, o) => s + Number(o.total), 0))}`} />
                  <StatCard label="Last 3 Months" value={last3.length}     sub={`₹${fmt(last3.reduce((s, o) => s + Number(o.total), 0))}`} />
                  <StatCard label="Lifetime"      value={orders.length}    sub={`₹${fmt(totalRevenue)}`} />
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
                      {["", "Order ID", "Date", "Total", "Status", ""].map((h, i) => (
                        <th key={i} style={{ textAlign: "left", padding: "6px 8px", color: "var(--muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
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
                            <span style={{ fontSize: 10, fontWeight: 700, color: "#27ae60", background: "#eafaf1", borderRadius: 4, padding: "2px 7px", whiteSpace: "nowrap" }}>✓ verified</span>
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

        {/* ══ TAB 2: ACTIVITY ══ */}
        {tab === 2 && (
          <>
            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button className="btn small" onClick={() => setActOpen(v => !v)}>+ Add Activity</button>
            </div>

            {actOpen && (
              <div style={{ ...card, border: "1.5px solid var(--red-light)" }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>New Activity</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={lbl}>Type</div>
                    <select value={actForm.type} onChange={e => setActForm(p => ({ ...p, type: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
                      {["call", "whatsapp", "visit", "note"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={lbl}>Date</div>
                    <input type="date" value={actForm.date} onChange={e => setActForm(p => ({ ...p, date: e.target.value }))}
                      style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={lbl}>Notes</div>
                  <textarea value={actForm.notes} onChange={e => setActForm(p => ({ ...p, notes: e.target.value }))}
                    placeholder="What happened? Any follow-up needed?" rows={3}
                    style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, resize: "vertical" }} />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn small" disabled={actSaving} onClick={saveActivity}>{actSaving ? "Saving…" : "Save"}</button>
                  <button className="btn small outline" onClick={() => setActOpen(false)}>Cancel</button>
                </div>
              </div>
            )}

            {activities.length === 0 ? (
              <div style={{ ...card, textAlign: "center", color: "var(--muted)", padding: 40 }}>No activities logged yet.</div>
            ) : (
              <div style={{ position: "relative" }}>
                <div style={{ position: "absolute", left: 19, top: 0, bottom: 0, width: 2, background: "var(--red-light)" }} />
                {activities.map(a => (
                  <div key={a.id} style={{ display: "flex", gap: 16, marginBottom: 16, position: "relative" }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: "50%", background: "#fff",
                      border: "2px solid var(--red-light)", display: "flex", alignItems: "center",
                      justifyContent: "center", fontSize: 18, flexShrink: 0, zIndex: 1,
                    }}>
                      {ACTIVITY_ICONS[a.type] || "📝"}
                    </div>
                    <div style={{ ...card, flex: 1, marginBottom: 0, padding: "12px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 13, textTransform: "capitalize" }}>{a.type}</span>
                        <span style={{ fontSize: 11, color: "var(--muted)" }}>{fmtDate(a.created_at)}</span>
                      </div>
                      <div style={{ fontSize: 13, color: "#444" }}>{a.notes || "—"}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ══ TAB 3: LEDGER ══ */}
        {tab === 3 && (
          <>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
              <StatCard label="Total Billed"  value={`₹${fmt(totalRevenue)}`} />
              <StatCard label="Total Paid"    value={`₹${fmt(totalRevenue)}`} />
              <StatCard label="Outstanding"   value="₹0" sub="Fully prepaid" />
            </div>

            <div style={{ ...card, fontSize: 12, color: "var(--muted)", marginBottom: 16, padding: "10px 16px" }}>
              ℹ️ Guest orders are prepaid via Razorpay. There is no credit balance. Each row below corresponds to a paid order.
            </div>

            <div style={card}>
              {orders.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No orders yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      {["Date", "Order ID", "Type", "Amount", "Balance"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {orders.map(o => (
                      <tr key={o.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px" }}>{fmtDateOnly(o.created_at)}</td>
                        <td style={{ padding: "8px", fontFamily: "monospace", fontSize: 11 }}>{o.id.slice(0, 8)}…</td>
                        <td style={{ padding: "8px" }}>
                          <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: "#eafaf1", color: "#27ae60" }}>
                            payment
                          </span>
                        </td>
                        <td style={{ padding: "8px", fontWeight: 600, color: "#27ae60" }}>−₹{fmt(o.total)}</td>
                        <td style={{ padding: "8px", fontWeight: 700, color: "#27ae60" }}>₹0 CR</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {/* ══ TAB 4: AI ASSISTANT ══ */}
        {tab === 4 && (
          <div style={{ display: "flex", flexDirection: "column", height: "calc(100vh - 220px)", minHeight: 400 }}>
            <div style={{ background: "#f8f4f8", borderRadius: 8, padding: "8px 14px", fontSize: 11, color: "var(--red-dark)", marginBottom: 12 }}>
              🤖 AI has full context: {guestName} · {orders.length} orders · ₹{fmt(totalRevenue)} revenue · {Object.keys(productFreq).length} products · {health.label}
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--muted)", padding: "30px 0", fontSize: 13 }}>
                  Ask anything about this customer, or choose a suggested prompt below.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%", display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                  {m.role === "user" && editingMsgIdx === i ? (
                    <div style={{ width: "100%" }}>
                      <textarea
                        autoFocus
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(i); } }}
                        rows={3}
                        style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, padding: "10px 14px", borderRadius: 12, border: "2px solid var(--red-dark)", resize: "vertical", background: "#fff" }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "flex-end" }}>
                        <button className="btn small" disabled={aiLoading || !editingText.trim()} onClick={() => submitEdit(i)}>Send</button>
                        <button className="btn small outline" onClick={() => { setEditingMsgIdx(null); setEditingText(""); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className={m.role === "user" ? "ai-msg-user" : ""}
                      style={{
                        position: "relative", padding: "10px 14px", borderRadius: 14,
                        background: m.role === "user" ? "var(--red-dark)" : "#fff",
                        color: m.role === "user" ? "#fff" : "#222",
                        boxShadow: "0 2px 6px rgba(0,0,0,.08)",
                        fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
                      }}
                    >
                      {m.content}
                      {m.role === "user" && (
                        <button
                          className="ai-edit-btn"
                          onClick={() => { setEditingMsgIdx(i); setEditingText(m.content); }}
                          title="Edit message"
                          style={{ position: "absolute", top: 6, left: -30, background: "none", border: "none", cursor: "pointer", fontSize: 14, opacity: 0, transition: "opacity 0.15s", padding: 4 }}
                        >✏️</button>
                      )}
                    </div>
                  )}
                </div>
              ))}
              {aiLoading && (
                <div style={{ alignSelf: "flex-start", padding: "10px 14px", background: "#fff", borderRadius: 14, boxShadow: "0 2px 6px rgba(0,0,0,.08)", color: "var(--muted)", fontSize: 13 }}>
                  Thinking…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {messages.length === 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
                {SUGGESTED.map(s => (
                  <button key={s} onClick={() => sendAI(s)} style={{
                    background: "#fff", border: "1.5px solid var(--red-light)", color: "var(--red-dark)",
                    borderRadius: 20, padding: "6px 14px", fontSize: 12, cursor: "pointer", fontWeight: 500,
                  }}>{s}</button>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAI()}
                placeholder="Ask about this customer…"
                style={{ flex: 1, marginBottom: 0 }}
                disabled={aiLoading}
              />
              <button className="btn small" onClick={() => sendAI()} disabled={aiLoading || !aiInput.trim()}>Send</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
