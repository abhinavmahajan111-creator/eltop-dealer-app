import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const TABS = ["Overview", "Orders", "Activity", "Ledger", "AI Assistant"];

const ACTIVITY_ICONS = { call: "📞", whatsapp: "💬", visit: "🤝", note: "📝" };

// ── Helpers ──────────────────────────────────────────────────────────────────
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
  if (daysSince <= 30 && freq >= 2) return { label: "Healthy", color: "#27ae60", bg: "#eafaf1" };
  if (daysSince <= 60 && freq >= 0.5) return { label: "Moderate", color: "#e67e22", bg: "#fef9e7" };
  return { label: "At Risk", color: "#e74c3c", bg: "#fdedec" };
}

// ── Sub-components ────────────────────────────────────────────────────────────
function StatCard({ label, value, sub }) {
  return (
    <div style={{ background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", minWidth: 130 }}>
      <div style={{ fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: "var(--red-dark)" }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────
export default function DealerCRM() {
  const { dealerId } = useParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState(0);

  const [dealer, setDealer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [activities, setActivities] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedOrderId, setExpandedOrderId] = useState(null);
  const [orderItemsCache, setOrderItemsCache] = useState({});
  const [allOrderItems, setAllOrderItems] = useState([]); // for AI context

  // Activity form
  const [actForm, setActForm] = useState({ type: "call", notes: "", date: new Date().toISOString().slice(0, 10) });
  const [actOpen, setActOpen] = useState(false);
  const [actSaving, setActSaving] = useState(false);

  // Ledger form
  const [ledForm, setLedForm] = useState({ type: "payment", amount: "", notes: "", reference_no: "" });
  const [ledOpen, setLedOpen] = useState(false);
  const [ledSaving, setLedSaving] = useState(false);

  // AI chat
  const [messages, setMessages] = useState([]);
  const [aiInput, setAiInput] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const chatEndRef = useRef(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    Promise.all([
      supabase.from("profiles").select("*").eq("id", dealerId).single(),
      supabase.from("orders").select("id, status, total, created_at, delivery_address").eq("dealer_id", dealerId).order("created_at", { ascending: false }),
      supabase.from("dealer_activities").select("*").eq("dealer_id", dealerId).order("created_at", { ascending: false }),
      supabase.from("dealer_ledger").select("*").eq("dealer_id", dealerId).order("created_at", { ascending: false }),
    ]).then(async ([d, o, a, l]) => {
      if (d.data) setDealer(d.data);
      const fetchedOrders = o.data || [];
      setOrders(fetchedOrders);
      setActivities(a.data || []);
      setLedger(l.data || []);

      // Fetch all order items for AI context
      if (fetchedOrders.length > 0) {
        const orderIds = fetchedOrders.map(ord => ord.id);
        const { data: items } = await supabase
          .from("order_items")
          .select("order_id, name, qty, price")
          .in("order_id", orderIds);
        setAllOrderItems(items || []);
      }

      setLoading(false);
    });
  }, [dealerId]);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  if (loading) return <div style={{ padding: 40, textAlign: "center", fontFamily: "Arial, sans-serif" }}>Loading CRM…</div>;
  if (!dealer) return <div style={{ padding: 40, color: "red", fontFamily: "Arial, sans-serif" }}>Dealer not found.</div>;

  // ── Computed stats ──
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
  const d1 = Number(dealer.discount1 || 0);
  const d2 = Number(dealer.discount2 || 0);
  const netPct = ((1 - d1 / 100) * (1 - d2 / 100) * 100).toFixed(2);

  // Ledger totals
  const totalBilled = ledger.filter(l => l.type === "order").reduce((s, l) => s + Number(l.amount), 0);
  const totalPaid = ledger.filter(l => l.type === "payment").reduce((s, l) => s + Number(l.amount), 0);
  const outstanding = totalBilled - totalPaid;

  // Running balance for ledger table
  let runBalance = 0;
  const ledgerWithBalance = [...ledger].reverse().map(row => {
    if (row.type === "payment") runBalance -= Number(row.amount);
    else runBalance += Number(row.amount);
    return { ...row, balance: runBalance };
  }).reverse();

  // ── Activity actions ──
  const saveActivity = async () => {
    setActSaving(true);
    const { data } = await supabase.from("dealer_activities").insert({
      dealer_id: dealerId, type: actForm.type, notes: actForm.notes,
      created_at: new Date(actForm.date).toISOString(),
    }).select().single();
    if (data) setActivities(prev => [data, ...prev]);
    setActSaving(false);
    setActOpen(false);
    setActForm({ type: "call", notes: "", date: new Date().toISOString().slice(0, 10) });
  };

  // ── Ledger actions ──
  const saveLedger = async () => {
    setLedSaving(true);
    const { data } = await supabase.from("dealer_ledger").insert({
      dealer_id: dealerId, type: ledForm.type,
      amount: Number(ledForm.amount), notes: ledForm.notes, reference_no: ledForm.reference_no,
    }).select().single();
    if (data) setLedger(prev => [data, ...prev]);
    setLedSaving(false);
    setLedOpen(false);
    setLedForm({ type: "payment", amount: "", notes: "", reference_no: "" });
  };

  // ── Order expand ──
  const toggleOrder = async (orderId) => {
    if (expandedOrderId === orderId) { setExpandedOrderId(null); return; }
    setExpandedOrderId(orderId);
    if (orderItemsCache[orderId]) return;
    const { data } = await supabase.from("order_items").select("id, name, qty, price").eq("order_id", orderId);
    setOrderItemsCache(prev => ({ ...prev, [orderId]: data || [] }));
  };

  // ── AI Chat context ──
  // Build product frequency map across all orders
  const productFreq = {};
  allOrderItems.forEach(it => {
    if (!productFreq[it.name]) productFreq[it.name] = 0;
    productFreq[it.name] += it.qty;
  });
  const topProducts = Object.entries(productFreq)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10)
    .map(([name, qty]) => `${name} (${qty} units)`)
    .join(", ") || "None";

  // Build items map by order_id for quick lookup
  const itemsByOrder = {};
  allOrderItems.forEach(it => {
    if (!itemsByOrder[it.order_id]) itemsByOrder[it.order_id] = [];
    itemsByOrder[it.order_id].push(it);
  });

  // Last 5 orders with items
  const last5 = orders.slice(0, 5).map((o, i) => {
    const items = (itemsByOrder[o.id] || [])
      .map(it => `${it.name} ×${it.qty} @ ₹${fmt(it.price)}`)
      .join(", ") || "Items not loaded";
    return `  Order ${i + 1} (${fmtDateOnly(o.created_at)}, ₹${fmt(o.total)}, ${o.status}): ${items}`;
  }).join("\n");

  const dealerContext = `
DEALER PROFILE:
Name: ${dealer.name || dealer.email} | Code: ${dealer.dealer_code || "N/A"} | Email: ${dealer.email}
Phone: ${dealer.phone || "N/A"} | GSTIN: ${dealer.gstin || "N/A"}
Address: ${dealer.address || "N/A"}
Discounts: ${d1}% + ${d2}% → Net Rate = DLP × ${netPct}%
Payment Terms: ${dealer.payment_terms || "Credit"} — ${dealer.credit_days || 30} days | Credit Limit: ₹${fmt(dealer.credit_limit)}

ACCOUNT SUMMARY:
Total Orders: ${orders.length} | Total Revenue: ₹${fmt(totalRevenue)} | Avg Order Value: ₹${fmt(avgOrder)}
Last Order: ${lastOrder} | Order Frequency: ${freq}/month | Account Health: ${health.label}
Outstanding Balance: ₹${fmt(outstanding)}

MOST ORDERED PRODUCTS (by units):
${topProducts}

LAST 5 ORDERS WITH ITEMS:
${last5 || "No orders yet"}

RECENT ACTIVITIES:
${activities.slice(0, 5).map(a => `  ${a.type} on ${fmtDateOnly(a.created_at)}: ${a.notes || "—"}`).join("\n") || "  None logged"}
`.trim();

  const sendAI = async (userMsg) => {
    const msg = userMsg || aiInput.trim();
    if (!msg) return;
    const newMessages = [...messages, { role: "user", content: msg }];
    setMessages(newMessages);
    setAiInput("");
    setAiLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
          system: `You are an expert sales CRM assistant for Eltop by Embassy Electricals, an electrical products dealer management system. You help the sales team understand and manage their dealer relationships. Always be specific, actionable, and concise. Here is the full context for the dealer you are analyzing:\n\n${dealerContext}`,
          messages: newMessages.map(m => ({ role: m.role, content: m.content })),
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

  const SUGGESTED = [
    "Summarize this dealer's account",
    "Is this dealer at risk of churning?",
    "What should I offer this dealer next?",
    "Draft a WhatsApp follow-up message",
    "Best time to call based on order history?",
  ];

  // ── Styles ──
  const card = { background: "#fff", borderRadius: 12, padding: "16px 18px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 16 };
  const label = { fontSize: 11, color: "var(--muted)", textTransform: "uppercase", letterSpacing: "0.4px", marginBottom: 2 };
  const val = { fontSize: 14, fontWeight: 500 };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", minHeight: "100vh", background: "#f5f0f5", color: "#222" }}>
      {/* ── Header ── */}
      <div style={{ background: "var(--red-dark)", color: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16 }}>
        <button
          onClick={() => navigate("/admin/dealers")}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
        >
          ← Dealers
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>{dealer.name && dealer.name !== "New Dealer" ? dealer.name : dealer.email}</div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{dealer.dealer_code || "No Code"} · {dealer.email}</div>
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
              <StatCard label="Total Orders" value={orders.length} />
              <StatCard label="Total Revenue" value={`₹${fmt(totalRevenue)}`} />
              <StatCard label="Avg Order Value" value={`₹${fmt(avgOrder)}`} />
              <StatCard label="Last Order" value={lastOrder} />
              <StatCard label="Order Frequency" value={`${freq}/mo`} />
              <StatCard label="Outstanding" value={`₹${fmt(outstanding)}`} sub={outstanding > 0 ? "Balance due" : "Cleared"} />
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 12, fontSize: 14 }}>Dealer Information</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "8px 24px" }}>
                {[
                  ["Email", dealer.email],
                  ["Dealer Code", dealer.dealer_code || "—"],
                  ["GSTIN", dealer.gstin || "—"],
                  ["Phone", dealer.phone || "—"],
                  ["Payment Terms", `${dealer.payment_terms || "Credit"} — ${dealer.credit_days || 30} days`],
                  ["Credit Limit", `₹${fmt(dealer.credit_limit)}`],
                  ["Discounts", `${d1}% + ${d2}% → Net ${netPct}%`],
                  ["Member Since", fmtDateOnly(dealer.created_at)],
                ].map(([l, v]) => (
                  <div key={l}>
                    <div style={label}>{l}</div>
                    <div style={val}>{v}</div>
                  </div>
                ))}
                <div style={{ gridColumn: "1 / -1" }}>
                  <div style={label}>Address</div>
                  <div style={val}>{dealer.address || "—"}</div>
                </div>
              </div>
            </div>

            <div style={card}>
              <div style={{ fontWeight: 700, marginBottom: 8, fontSize: 14 }}>Account Health — {health.label}</div>
              <div style={{ fontSize: 13, color: "#555", lineHeight: 1.6 }}>
                {health.label === "Healthy" && "This dealer orders regularly (≥2×/month) and placed an order within the last 30 days. Maintain relationship with regular product updates."}
                {health.label === "Moderate" && "Order frequency is acceptable but has slowed. Last order was 30–60 days ago. Consider a proactive follow-up call."}
                {health.label === "At Risk" && "No order in 60+ days or very low order frequency. Immediate outreach recommended — check if there's a competitor issue or service problem."}
                {health.label === "No Orders" && "This dealer has never placed an order. Prioritize an introductory call or visit."}
              </div>
            </div>
          </>
        )}

        {/* ══ TAB 1: ORDERS ══ */}
        {tab === 1 && (
          <>
            {/* Quick stats */}
            {(() => {
              const now = new Date();
              const thisMonth = orders.filter(o => {
                const d = new Date(o.created_at);
                return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
              });
              const last3 = orders.filter(o => new Date(o.created_at) >= new Date(now - 90 * 24 * 3600 * 1000));
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 16 }}>
                  <StatCard label="This Month" value={thisMonth.length} sub={`₹${fmt(thisMonth.reduce((s,o)=>s+Number(o.total),0))}`} />
                  <StatCard label="Last 3 Months" value={last3.length} sub={`₹${fmt(last3.reduce((s,o)=>s+Number(o.total),0))}`} />
                  <StatCard label="Lifetime" value={orders.length} sub={`₹${fmt(totalRevenue)}`} />
                </div>
              );
            })()}

            <div style={card}>
              {orders.length === 0 ? (
                <div style={{ color: "var(--muted)", textAlign: "center", padding: 24 }}>No orders yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      {["", "Order ID", "Date", "Total", "Status"].map(h => (
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
                      </tr>,
                      expandedOrderId === o.id && (
                        <tr key={`${o.id}-d`}>
                          <td colSpan={5} style={{ background: "#f8f4f8", padding: "12px 16px" }}>
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
                    <div style={label}>Type</div>
                    <select value={actForm.type} onChange={e => setActForm(p => ({ ...p, type: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
                      {["call", "whatsapp", "visit", "note"].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={label}>Date</div>
                    <input type="date" value={actForm.date} onChange={e => setActForm(p => ({ ...p, date: e.target.value }))}
                      style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>
                </div>
                <div style={{ marginBottom: 10 }}>
                  <div style={label}>Notes</div>
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
              <StatCard label="Total Billed" value={`₹${fmt(totalBilled)}`} />
              <StatCard label="Total Paid" value={`₹${fmt(totalPaid)}`} />
              <StatCard label="Outstanding" value={`₹${fmt(outstanding)}`}
                sub={outstanding > 0 ? "Balance due" : "Fully paid"} />
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
              <button className="btn small" onClick={() => setLedOpen(v => !v)}>+ Add Entry</button>
            </div>

            {ledOpen && (
              <div style={{ ...card, border: "1.5px solid var(--red-light)" }}>
                <div style={{ fontWeight: 700, marginBottom: 12 }}>New Ledger Entry</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 10 }}>
                  <div>
                    <div style={label}>Type</div>
                    <select value={ledForm.type} onChange={e => setLedForm(p => ({ ...p, type: e.target.value }))}
                      style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
                      {["payment", "order", "credit_note"].map(t => <option key={t} value={t}>{t.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                    </select>
                  </div>
                  <div>
                    <div style={label}>Amount (₹)</div>
                    <input type="number" value={ledForm.amount} onChange={e => setLedForm(p => ({ ...p, amount: e.target.value }))}
                      placeholder="0" style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>
                  <div>
                    <div style={label}>Reference No.</div>
                    <input value={ledForm.reference_no} onChange={e => setLedForm(p => ({ ...p, reference_no: e.target.value }))}
                      placeholder="Cheque / UPI ref" style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>
                  <div>
                    <div style={label}>Notes</div>
                    <input value={ledForm.notes} onChange={e => setLedForm(p => ({ ...p, notes: e.target.value }))}
                      placeholder="Optional" style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="btn small" disabled={ledSaving || !ledForm.amount} onClick={saveLedger}>{ledSaving ? "Saving…" : "Save"}</button>
                  <button className="btn small outline" onClick={() => setLedOpen(false)}>Cancel</button>
                </div>
              </div>
            )}

            <div style={card}>
              {ledger.length === 0 ? (
                <div style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No ledger entries yet.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr style={{ borderBottom: "2px solid var(--border)" }}>
                      {["Date", "Type", "Reference", "Amount", "Balance"].map(h => (
                        <th key={h} style={{ textAlign: "left", padding: "6px 8px", color: "var(--muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase" }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {ledgerWithBalance.map(row => (
                      <tr key={row.id} style={{ borderBottom: "1px solid var(--border)" }}>
                        <td style={{ padding: "8px" }}>{fmtDateOnly(row.created_at)}</td>
                        <td style={{ padding: "8px" }}>
                          <span style={{
                            fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10,
                            background: row.type === "payment" ? "#eafaf1" : row.type === "credit_note" ? "#fef9e7" : "#fdecea",
                            color: row.type === "payment" ? "#27ae60" : row.type === "credit_note" ? "#e67e22" : "#c0392b",
                          }}>
                            {row.type.replace("_", " ")}
                          </span>
                        </td>
                        <td style={{ padding: "8px", color: "var(--muted)", fontSize: 12 }}>{row.reference_no || "—"}</td>
                        <td style={{ padding: "8px", fontWeight: 600, color: row.type === "payment" ? "#27ae60" : "#c0392b" }}>
                          {row.type === "payment" ? "−" : "+"}₹{fmt(row.amount)}
                        </td>
                        <td style={{ padding: "8px", fontWeight: 700, color: row.balance > 0 ? "#c0392b" : "#27ae60" }}>
                          ₹{fmt(Math.abs(row.balance))} {row.balance > 0 ? "DR" : "CR"}
                        </td>
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
            {/* Context pill */}
            <div style={{ background: "#f8f4f8", borderRadius: 8, padding: "8px 14px", fontSize: 11, color: "var(--red-dark)", marginBottom: 12 }}>
              🤖 AI has full context: {dealer.name || dealer.email} · {orders.length} orders · ₹{fmt(totalRevenue)} revenue · {Object.keys(productFreq).length} products · {health.label}
            </div>

            {/* Chat messages */}
            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, marginBottom: 12 }}>
              {messages.length === 0 && (
                <div style={{ textAlign: "center", color: "var(--muted)", padding: "30px 0", fontSize: 13 }}>
                  Ask anything about this dealer, or choose a suggested prompt below.
                </div>
              )}
              {messages.map((m, i) => (
                <div key={i} style={{
                  alignSelf: m.role === "user" ? "flex-end" : "flex-start",
                  maxWidth: "80%", padding: "10px 14px", borderRadius: 14,
                  background: m.role === "user" ? "var(--red-dark)" : "#fff",
                  color: m.role === "user" ? "#fff" : "#222",
                  boxShadow: "0 2px 6px rgba(0,0,0,.08)",
                  fontSize: 13, lineHeight: 1.6, whiteSpace: "pre-wrap",
                }}>
                  {m.content}
                </div>
              ))}
              {aiLoading && (
                <div style={{ alignSelf: "flex-start", padding: "10px 14px", background: "#fff", borderRadius: 14, boxShadow: "0 2px 6px rgba(0,0,0,.08)", color: "var(--muted)", fontSize: 13 }}>
                  Thinking…
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Suggested prompts */}
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

            {/* Input */}
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={aiInput}
                onChange={e => setAiInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && !e.shiftKey && sendAI()}
                placeholder="Ask about this dealer…"
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
