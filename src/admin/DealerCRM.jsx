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

  // Application status
  const [appStatusBusy, setAppStatusBusy] = useState(false);
  const handleAction = async (action) => {
    const updates = {
      approve:   { is_dealer: true,  dealer_application_status: 'approved' },
      reject:    { is_dealer: false, dealer_application_status: 'rejected' },
      downgrade: { is_dealer: false, dealer_application_status: '' },
      block:     { is_blocked: true },
      unblock:   { is_blocked: false },
    };
    const base = updates[action];
    if (!base) return;
    let update = base;
    if (action === 'downgrade') {
      const name = dealer?.name;
      if (!name || name === 'New Dealer' || name === 'New Customer') update = { ...base, name: '' };
    }
    setAppStatusBusy(true);
    const { error } = await supabase.from('profiles').update(update).eq('id', dealerId);
    if (error) { alert('Failed: ' + error.message); }
    else { setDealer(prev => ({ ...prev, ...update })); }
    setAppStatusBusy(false);
  };

  // Activity form
  const [actForm, setActForm] = useState({ type: "call", notes: "", date: new Date().toISOString().slice(0, 10) });
  const [actOpen, setActOpen] = useState(false);
  const [actSaving, setActSaving] = useState(false);

  // Ledger
  const [ledPeriod, setLedPeriod] = useState({ from: '', to: '' });
  const [ledVoucherMode, setLedVoucherMode] = useState(null); // null | 'picker' | voucher-type string
  const [ledVoucherForm, setLedVoucherForm] = useState({});
  const [ledSaving, setLedSaving] = useState(false);
  const [expandedLedgerId, setExpandedLedgerId] = useState(null);

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

  const rawDealerName = dealer.name && dealer.name !== 'New Dealer' ? dealer.name : null;
  const dealerAvatarInitials = (rawDealerName || dealer.email || '?').split(/\s+/).slice(0, 2).map(w => w[0]).join('').toUpperCase();

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

  // ── Ledger computed values ─────────────────────────────────────────────────
  const isDealerAccount = (name) => {
    if (!name) return false;
    const n = name.toLowerCase().trim();
    const targets = [dealer.shop_name, dealer.owner_name, dealer.name, dealer.dealer_code]
      .filter(Boolean).map(s => s.toLowerCase().trim());
    return targets.some(t => t && (n === t || n.includes(t) || t.includes(n)));
  };

  const entryDr = (row) => row.type === "order" || (row.type === "journal" && row.dr_dealer);
  const entryCr = (row) => row.type === "payment" || row.type === "credit_note" || (row.type === "journal" && row.cr_dealer);

  // All-time outstanding (independent of period filter)
  const outstanding = ledger.reduce((s, row) => {
    if (entryDr(row)) return s + Number(row.amount);
    if (entryCr(row)) return s - Number(row.amount);
    return s;
  }, 0);

  // Period filter
  const periodFrom = ledPeriod.from ? new Date(ledPeriod.from) : null;
  const periodTo   = ledPeriod.to   ? new Date(ledPeriod.to + 'T23:59:59') : null;

  const entryDate = (row) => new Date(row.voucher_date || row.created_at);

  // Opening balance = all entries BEFORE the From date
  const openingBalance = periodFrom
    ? ledger.reduce((s, row) => {
        if (entryDate(row) >= periodFrom) return s;
        if (entryDr(row)) return s + Number(row.amount);
        if (entryCr(row)) return s - Number(row.amount);
        return s;
      }, 0)
    : 0;

  const filteredLedger = ledger.filter(row => {
    const d = entryDate(row);
    if (periodFrom && d < periodFrom) return false;
    if (periodTo   && d > periodTo)   return false;
    return true;
  });

  // Running balance oldest→newest, then flip for display (newest first)
  let runBal = openingBalance;
  const filteredWithBalance = [...filteredLedger].reverse().map(row => {
    const drAmt = entryDr(row) ? Number(row.amount) : 0;
    const crAmt = entryCr(row) ? Number(row.amount) : 0;
    runBal += drAmt - crAmt;
    return { ...row, balance: runBal, drAmt, crAmt };
  }).reverse();
  const closingBalance = runBal;

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

  // ── Ledger voucher actions ─────────────────────────────────────────────────
  const generateVoucherNo = async (vType) => {
    const prefixes = { sales_invoice: 'SI', payment_received: 'PR', credit_note: 'CN', journal: 'JV' };
    const prefix = prefixes[vType] || 'VCH';
    const dbType = vType === 'sales_invoice' ? 'order' : vType === 'payment_received' ? 'payment' : vType;
    const { count } = await supabase.from('dealer_ledger')
      .select('id', { count: 'exact', head: true })
      .eq('dealer_id', dealerId).eq('type', dbType);
    const seq = String((count || 0) + 1).padStart(4, '0');
    return `EEIPL/${prefix}/${seq}`;
  };

  const saveLedgerVoucher = async () => {
    setLedSaving(true);
    const f = ledVoucherForm;
    const vType = ledVoucherMode;
    const voucherNo = await generateVoucherNo(vType);
    const row = {
      dealer_id:    dealerId,
      voucher_no:   voucherNo,
      voucher_type: vType,
      voucher_date: f.date || new Date().toISOString().slice(0, 10),
      narration:    f.narration || '',
      amount:       Number(f.amount || 0),
    };
    if (vType === 'sales_invoice') {
      row.type = 'order';
    } else if (vType === 'payment_received') {
      row.type = 'payment';
      row.method = f.method || 'Cash';
      row.reference_no = f.reference_no || '';
    } else if (vType === 'credit_note') {
      row.type = 'credit_note';
      row.reason = f.reason || '';
    } else if (vType === 'journal') {
      row.type = 'journal';
      row.dr_account = f.dr_account || '';
      row.cr_account = f.cr_account || '';
      row.dr_dealer  = isDealerAccount(f.dr_account);
      row.cr_dealer  = isDealerAccount(f.cr_account);
    }
    const { data, error } = await supabase.from('dealer_ledger').insert(row).select().single();
    if (error) { alert('Save failed: ' + error.message); }
    else { setLedger(prev => [data, ...prev]); }
    setLedSaving(false);
    setLedVoucherMode(null);
    setLedVoucherForm({});
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

  const systemPrompt = `You are an expert sales CRM assistant for Eltop by Embassy Electricals, an electrical products dealer management system. You help the sales team understand and manage their dealer relationships. Always be specific, actionable, and concise. Here is the full context for the dealer you are analyzing:\n\n${dealerContext}`;

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
    // Keep messages up to (not including) the edited index, replace with new user msg
    const newMessages = [...messages.slice(0, idx), { role: "user", content: trimmed }];
    setMessages(newMessages);
    setEditingMsgIdx(null);
    setEditingText("");
    await callAI(newMessages);
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
    <div style={{ fontFamily: "Arial, sans-serif", position: "fixed", inset: 0, zIndex: 1000, overflowY: "auto", background: "#f5f0f5", color: "#222" }}>
      {/* ── Header ── */}
      <div style={{ background: "var(--red-dark)", color: "#fff", padding: "16px 24px", display: "flex", alignItems: "center", gap: 16, flexWrap: "wrap" }}>
        <button
          onClick={() => navigate("/admin/dealers")}
          style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "6px 14px", cursor: "pointer", fontWeight: 600, fontSize: 13 }}
        >
          ← Dealers
        </button>
        <div style={{
          width: 44, height: 44, borderRadius: "50%", background: "rgba(255,255,255,0.2)",
          border: "2px solid rgba(255,255,255,0.5)", color: "#fff",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: 16, fontWeight: 800, flexShrink: 0, letterSpacing: "0.5px",
        }}>{dealerAvatarInitials}</div>
        <div style={{ flex: 1, minWidth: 160, overflowWrap: 'break-word' }}>
          <div style={{ fontWeight: 700, fontSize: 17 }}>
            {rawDealerName
              ? rawDealerName
              : <span style={{ fontStyle: "italic", opacity: 0.7, fontWeight: 400 }}>Unnamed dealer</span>}
          </div>
          <div style={{ fontSize: 12, opacity: 0.8 }}>{dealer.dealer_code || "No Code"} · {dealer.email}</div>
        </div>
        <div style={{ background: health.bg, color: health.color, padding: "4px 12px", borderRadius: 20, fontSize: 12, fontWeight: 700 }}>
          {health.label}
        </div>
        {/* Status badge + context-aware action buttons */}
        {(() => {
          const { is_blocked, dealer_application_status: das } = dealer;
          const isPending = das === 'pending_details' || das === 'under_review';
          const btn = (action, label, style) => (
            <button key={action} disabled={appStatusBusy} onClick={() => handleAction(action)}
              style={{ border: 'none', color: '#fff', borderRadius: 8, padding: '5px 12px', fontSize: 12, fontWeight: 700, cursor: appStatusBusy ? 'wait' : 'pointer', opacity: appStatusBusy ? 0.6 : 1, ...style }}>
              {label}
            </button>
          );
          let badge = null;
          const actions = [];
          if (is_blocked) {
            badge = { text: '🚫 Blocked', bg: '#fee2e2', color: '#991b1b', border: '#fca5a5' };
            actions.push(btn('unblock', 'Unblock', { background: '#16a34a' }));
          } else if (isPending) {
            badge = das === 'under_review'
              ? { text: 'Under Review', bg: '#dbeafe', color: '#1e40af', border: '#93c5fd' }
              : { text: 'Pending',      bg: '#fef9c3', color: '#854d0e', border: '#fde047' };
            actions.push(btn('approve', '✓ Approve', { background: '#16a34a' }));
            actions.push(btn('reject',  '✕ Reject',  { background: '#dc2626' }));
          } else {
            badge = { text: 'Approved ✓', bg: '#dcfce7', color: '#166534', border: '#86efac' };
            actions.push(btn('downgrade', 'Downgrade to Customer', { background: 'none', border: '1.5px solid rgba(255,255,255,0.4)', color: '#fff' }));
            actions.push(btn('block',     'Block Dealer',           { background: '#dc2626' }));
          }
          return (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', width: '100%' }}>
              <span style={{ background: badge.bg, color: badge.color, border: `1.5px solid ${badge.border}`, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700 }}>
                {badge.text}
              </span>
              {actions}
            </div>
          );
        })()}
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
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, marginBottom: 20 }}>
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
        {tab === 3 && (() => {
          const iStyle = { width: "100%", boxSizing: "border-box", padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, fontFamily: "inherit", marginBottom: 0 };
          const fld = (lbl, children) => (
            <div key={lbl}>
              <div style={label}>{lbl}</div>
              {children}
            </div>
          );
          const vf = ledVoucherForm;
          const setVf = (patch) => setLedVoucherForm(p => ({ ...p, ...patch }));

          const VOUCHER_TYPES = [
            { key: 'sales_invoice',    icon: '🧾', title: 'Sales Invoice',     desc: 'Record a sale / bill to dealer' },
            { key: 'payment_received', icon: '💰', title: 'Payment Received',  desc: 'Record cash, UPI, cheque, NEFT' },
            { key: 'credit_note',      icon: '📋', title: 'Credit Note',       desc: 'Deduct from outstanding balance' },
            { key: 'journal',          icon: '📒', title: 'Journal Voucher',   desc: 'Free Dr/Cr double-entry posting' },
          ];

          const voucherTypeLabel = { sales_invoice: 'Sales Invoice', payment_received: 'Payment Received', credit_note: 'Credit Note', journal: 'Journal Voucher' };
          const voucherTypeBadgeStyle = {
            sales_invoice:    { bg: '#fdecea', color: '#c0392b' },
            payment_received: { bg: '#eafaf1', color: '#27ae60' },
            credit_note:      { bg: '#fef9e7', color: '#e67e22' },
            journal:          { bg: '#eef2ff', color: '#3730a3' },
            order:            { bg: '#fdecea', color: '#c0392b' },
            payment:          { bg: '#eafaf1', color: '#27ae60' },
          };

          const effectiveType = (row) => row.voucher_type || (row.type === 'order' ? 'sales_invoice' : row.type === 'payment' ? 'payment_received' : row.type);
          const badgeStyle = (row) => voucherTypeBadgeStyle[effectiveType(row)] || { bg: '#f3f4f6', color: '#555' };

          const thS = { textAlign: "left", padding: "7px 10px", color: "var(--muted)", fontWeight: 600, fontSize: 11, textTransform: "uppercase", borderBottom: "2px solid var(--border)", whiteSpace: "nowrap" };
          const tdS = { padding: "9px 10px", fontSize: 13, borderBottom: "1px solid var(--border)", verticalAlign: "middle" };
          const amtTdS = { ...tdS, fontWeight: 700, textAlign: "right" };
          const balStyle = (bal) => ({ ...amtTdS, color: bal > 0 ? "#c0392b" : "#27ae60", whiteSpace: "nowrap" });

          return (
            <>
              {/* ── Voucher overlay ── */}
              {ledVoucherMode && ledVoucherMode !== 'picker' && (
                <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                  <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 560, maxHeight: "90vh", overflowY: "auto", boxShadow: "0 8px 40px rgba(0,0,0,.18)" }}>
                    {/* Voucher header */}
                    <div style={{ background: "var(--red-dark)", color: "#fff", borderRadius: "16px 16px 0 0", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div>
                        <div style={{ fontWeight: 800, fontSize: 15 }}>{voucherTypeLabel[ledVoucherMode]}</div>
                        <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                          {vf.voucher_no_preview || 'EEIPL/…/…'} · {vf.date || new Date().toISOString().slice(0, 10)}
                        </div>
                      </div>
                      <button onClick={() => { setLedVoucherMode(null); setLedVoucherForm({}); }}
                        style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: 8, padding: "5px 12px", cursor: "pointer", fontSize: 13, fontWeight: 600 }}>
                        Cancel
                      </button>
                    </div>

                    <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 14 }}>
                      {/* Date — common */}
                      {fld("Voucher Date",
                        <input type="date" value={vf.date || new Date().toISOString().slice(0, 10)}
                          onChange={e => setVf({ date: e.target.value })} style={iStyle} />
                      )}

                      {/* Sales Invoice */}
                      {ledVoucherMode === 'sales_invoice' && (<>
                        <div style={{ background: "#fdf4ff", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4, color: "var(--red-dark)" }}>Particulars</div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>{dealer.shop_name || dealer.owner_name || dealer.name} A/c</span>
                            <span style={{ fontWeight: 700, color: "#c0392b" }}>Dr</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>To Sales A/c</div>
                        </div>
                        {fld("Amount (₹)", <input type="number" placeholder="0" value={vf.amount || ''} onChange={e => setVf({ amount: e.target.value })} style={iStyle} />)}
                        {fld("Narration", <input placeholder="e.g. Invoice for fans — batch May 2026" value={vf.narration || ''} onChange={e => setVf({ narration: e.target.value })} style={iStyle} />)}
                      </>)}

                      {/* Payment Received */}
                      {ledVoucherMode === 'payment_received' && (<>
                        <div style={{ background: "#f0fdf4", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4, color: "#27ae60" }}>Particulars</div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Cash / Bank A/c</span>
                            <span style={{ fontWeight: 700, color: "#27ae60" }}>Dr</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>To {dealer.shop_name || dealer.owner_name || dealer.name} A/c (Cr)</div>
                        </div>
                        {fld("Method",
                          <select value={vf.method || 'Cash'} onChange={e => setVf({ method: e.target.value })} style={iStyle}>
                            {["Cash", "UPI", "Cheque", "RTGS-NEFT"].map(m => <option key={m}>{m}</option>)}
                          </select>
                        )}
                        {fld("Amount (₹)", <input type="number" placeholder="0" value={vf.amount || ''} onChange={e => setVf({ amount: e.target.value })} style={iStyle} />)}
                        {fld("Reference No.", <input placeholder="Cheque no. / UTR / UPI ref" value={vf.reference_no || ''} onChange={e => setVf({ reference_no: e.target.value })} style={iStyle} />)}
                        {fld("Narration", <input placeholder="e.g. Payment received via NEFT" value={vf.narration || ''} onChange={e => setVf({ narration: e.target.value })} style={iStyle} />)}
                      </>)}

                      {/* Credit Note */}
                      {ledVoucherMode === 'credit_note' && (<>
                        <div style={{ background: "#fef9e7", borderRadius: 10, padding: "10px 14px", fontSize: 13 }}>
                          <div style={{ fontWeight: 700, marginBottom: 4, color: "#e67e22" }}>Particulars</div>
                          <div style={{ display: "flex", justifyContent: "space-between" }}>
                            <span>Sales Returns / Allowance A/c</span>
                            <span style={{ fontWeight: 700, color: "#e67e22" }}>Dr</span>
                          </div>
                          <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>To {dealer.shop_name || dealer.owner_name || dealer.name} A/c (Cr)</div>
                        </div>
                        {fld("Reason", <input placeholder="e.g. Goods returned — damaged in transit" value={vf.reason || ''} onChange={e => setVf({ reason: e.target.value })} style={iStyle} />)}
                        {fld("Amount (₹)", <input type="number" placeholder="0" value={vf.amount || ''} onChange={e => setVf({ amount: e.target.value })} style={iStyle} />)}
                        {fld("Narration", <input placeholder="Optional note" value={vf.narration || ''} onChange={e => setVf({ narration: e.target.value })} style={iStyle} />)}
                      </>)}

                      {/* Journal Voucher */}
                      {ledVoucherMode === 'journal' && (<>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          {fld("Dr Account (Debit)",
                            <input placeholder="Account name (e.g. dealer name or 'Bad Debts')" value={vf.dr_account || ''} onChange={e => setVf({ dr_account: e.target.value })} style={iStyle} />
                          )}
                          {fld("Cr Account (Credit)",
                            <input placeholder="Account name" value={vf.cr_account || ''} onChange={e => setVf({ cr_account: e.target.value })} style={iStyle} />
                          )}
                        </div>
                        {fld("Amount (₹)", <input type="number" placeholder="0" value={vf.amount || ''} onChange={e => setVf({ amount: e.target.value })} style={iStyle} />)}

                        {/* Live Dr/Cr preview table */}
                        {(vf.dr_account || vf.cr_account) && Number(vf.amount) > 0 && (
                          <div style={{ borderRadius: 10, border: "1.5px solid #c7d2fe", overflow: "hidden" }}>
                            <div style={{ background: "#eef2ff", padding: "7px 12px", fontSize: 11, fontWeight: 700, color: "#3730a3" }}>Journal Entry Preview</div>
                            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                              <thead>
                                <tr style={{ borderBottom: "1px solid #c7d2fe" }}>
                                  {["Particulars", "Debit (Dr)", "Credit (Cr)"].map(h => (
                                    <th key={h} style={{ padding: "6px 12px", textAlign: h === "Particulars" ? "left" : "right", fontSize: 11, color: "#555", fontWeight: 600 }}>{h}</th>
                                  ))}
                                </tr>
                              </thead>
                              <tbody>
                                <tr>
                                  <td style={{ padding: "7px 12px" }}>{vf.dr_account || "—"} A/c {isDealerAccount(vf.dr_account) && <span style={{ fontSize: 10, color: "var(--red-dark)", fontWeight: 700 }}>★ Dealer</span>}</td>
                                  <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: "#c0392b" }}>₹{fmt(vf.amount)}</td>
                                  <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--muted)" }}>—</td>
                                </tr>
                                <tr style={{ borderTop: "1px solid #e0e7ff" }}>
                                  <td style={{ padding: "7px 12px 7px 24px", color: "var(--muted)" }}>To {vf.cr_account || "—"} A/c {isDealerAccount(vf.cr_account) && <span style={{ fontSize: 10, color: "var(--red-dark)", fontWeight: 700 }}>★ Dealer</span>}</td>
                                  <td style={{ padding: "7px 12px", textAlign: "right", color: "var(--muted)" }}>—</td>
                                  <td style={{ padding: "7px 12px", textAlign: "right", fontWeight: 700, color: "#27ae60" }}>₹{fmt(vf.amount)}</td>
                                </tr>
                                <tr style={{ borderTop: "2px solid #c7d2fe", background: "#f5f7ff" }}>
                                  <td style={{ padding: "6px 12px", fontSize: 11, color: "#555", fontWeight: 600 }}>Balance Effect on Dealer</td>
                                  <td style={{ padding: "6px 12px", textAlign: "right", fontSize: 11, color: "#c0392b", fontWeight: 700 }}>
                                    {isDealerAccount(vf.dr_account) ? `+₹${fmt(vf.amount)} Dr` : "—"}
                                  </td>
                                  <td style={{ padding: "6px 12px", textAlign: "right", fontSize: 11, color: "#27ae60", fontWeight: 700 }}>
                                    {isDealerAccount(vf.cr_account) ? `−₹${fmt(vf.amount)} Cr` : "—"}
                                  </td>
                                </tr>
                              </tbody>
                            </table>
                          </div>
                        )}
                        {fld("Narration", <input placeholder="e.g. Adjustment for excess billing" value={vf.narration || ''} onChange={e => setVf({ narration: e.target.value })} style={iStyle} />)}
                      </>)}

                      {/* Accept button */}
                      <div style={{ display: "flex", gap: 10, paddingTop: 4 }}>
                        <button className="btn small"
                          disabled={ledSaving || !Number(vf.amount)}
                          onClick={saveLedgerVoucher}
                          style={{ flex: 1, background: "var(--red-dark)", color: "#fff", border: "none" }}>
                          {ledSaving ? "Saving…" : "✓ Accept"}
                        </button>
                        <button className="btn small outline" onClick={() => { setLedVoucherMode(null); setLedVoucherForm({}); }}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Type picker overlay ── */}
              {ledVoucherMode === 'picker' && (
                <div style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(0,0,0,0.55)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
                  <div style={{ background: "#fff", borderRadius: 16, width: "100%", maxWidth: 400, boxShadow: "0 8px 40px rgba(0,0,0,.18)" }}>
                    <div style={{ padding: "16px 20px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 800, fontSize: 15 }}>Select Voucher Type</div>
                      <button onClick={() => setLedVoucherMode(null)} style={{ background: "none", border: "none", fontSize: 18, cursor: "pointer", color: "var(--muted)" }}>✕</button>
                    </div>
                    <div style={{ padding: 16, display: "flex", flexDirection: "column", gap: 10 }}>
                      {VOUCHER_TYPES.map(v => (
                        <button key={v.key} onClick={() => setLedVoucherMode(v.key)}
                          style={{ display: "flex", alignItems: "center", gap: 14, padding: "12px 16px", background: "#fdf8fd", border: "1.5px solid var(--border)", borderRadius: 10, cursor: "pointer", textAlign: "left", fontFamily: "inherit" }}>
                          <span style={{ fontSize: 24 }}>{v.icon}</span>
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{v.title}</div>
                            <div style={{ fontSize: 12, color: "var(--muted)" }}>{v.desc}</div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* ── Controls row ── */}
              <div style={{ display: "flex", alignItems: "flex-end", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <div>
                  <div style={{ ...label, marginBottom: 4 }}>From</div>
                  <input type="date" value={ledPeriod.from} onChange={e => setLedPeriod(p => ({ ...p, from: e.target.value }))}
                    style={{ padding: "7px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
                </div>
                <div>
                  <div style={{ ...label, marginBottom: 4 }}>To</div>
                  <input type="date" value={ledPeriod.to} onChange={e => setLedPeriod(p => ({ ...p, to: e.target.value }))}
                    style={{ padding: "7px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, fontFamily: "inherit" }} />
                </div>
                {(ledPeriod.from || ledPeriod.to) && (
                  <button className="btn small outline" onClick={() => setLedPeriod({ from: '', to: '' })}>Clear</button>
                )}
                <div style={{ marginLeft: "auto" }}>
                  <button className="btn small" onClick={() => setLedVoucherMode('picker')}
                    style={{ background: "var(--red-dark)", color: "#fff", border: "none" }}>
                    + Add Voucher
                  </button>
                </div>
              </div>

              {/* ── All-time Total Due ── */}
              <div style={{ display: "flex", gap: 12, marginBottom: 16, flexWrap: "wrap" }}>
                <StatCard label="Total Due (all-time)" value={`₹${fmt(Math.abs(outstanding))}`}
                  sub={outstanding > 0 ? "Dr — balance payable" : outstanding < 0 ? "Cr — overpaid" : "Nil"} />
                {(ledPeriod.from || ledPeriod.to) && (
                  <StatCard label="Period Opening" value={`₹${fmt(Math.abs(openingBalance))}`}
                    sub={openingBalance > 0 ? "Dr" : openingBalance < 0 ? "Cr" : "Nil"} />
                )}
              </div>

              {/* ── Ledger table ── */}
              <div style={card}>
                {ledger.length === 0 ? (
                  <div style={{ textAlign: "center", color: "var(--muted)", padding: 24 }}>No vouchers yet — click "+ Add Voucher" to begin.</div>
                ) : (
                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                    <thead>
                      <tr>
                        <th style={thS}>Date</th>
                        <th style={thS}>Vch No.</th>
                        <th style={thS}>Type</th>
                        <th style={thS}>Particulars</th>
                        <th style={{ ...thS, textAlign: "right" }}>Dr (₹)</th>
                        <th style={{ ...thS, textAlign: "right" }}>Cr (₹)</th>
                        <th style={{ ...thS, textAlign: "right" }}>Balance</th>
                      </tr>
                    </thead>
                    <tbody>
                      {/* Opening balance row */}
                      {(ledPeriod.from || ledPeriod.to) && (
                        <tr style={{ background: "#f8f4f8" }}>
                          <td style={tdS}>{ledPeriod.from ? fmtDateOnly(ledPeriod.from) : "—"}</td>
                          <td colSpan={3} style={{ ...tdS, fontWeight: 700, color: "var(--muted)", fontStyle: "italic" }}>Opening Balance b/f</td>
                          <td style={amtTdS}>{openingBalance > 0 ? `₹${fmt(openingBalance)}` : "—"}</td>
                          <td style={amtTdS}>{openingBalance < 0 ? `₹${fmt(Math.abs(openingBalance))}` : "—"}</td>
                          <td style={balStyle(openingBalance)}>₹{fmt(Math.abs(openingBalance))} {openingBalance > 0 ? "Dr" : openingBalance < 0 ? "Cr" : "Nil"}</td>
                        </tr>
                      )}

                      {filteredWithBalance.length === 0 && (ledPeriod.from || ledPeriod.to) && (
                        <tr><td colSpan={7} style={{ ...tdS, textAlign: "center", color: "var(--muted)" }}>No vouchers in this period.</td></tr>
                      )}

                      {filteredWithBalance.map(row => {
                        const isExpanded = expandedLedgerId === row.id;
                        const bs = badgeStyle(row);
                        const typeLabel = voucherTypeLabel[effectiveType(row)] || row.type;
                        const particulars = row.type === "journal"
                          ? `${row.dr_account || "?"} A/c Dr / To ${row.cr_account || "?"} A/c`
                          : row.narration || row.notes || (row.type === "payment" ? `${row.method || "Cash"} · ${row.reference_no || ""}` : "—");
                        return [
                          <tr key={row.id} onClick={() => setExpandedLedgerId(isExpanded ? null : row.id)}
                            style={{ borderBottom: isExpanded ? "none" : "1px solid var(--border)", cursor: "pointer", background: isExpanded ? "#fdf8fd" : undefined }}
                            className="admin-dealer-row">
                            <td style={tdS}>{fmtDateOnly(row.voucher_date || row.created_at)}</td>
                            <td style={{ ...tdS, fontFamily: "monospace", fontSize: 11, color: "var(--muted)" }}>{row.voucher_no || "—"}</td>
                            <td style={tdS}>
                              <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 10, background: bs.bg, color: bs.color }}>
                                {typeLabel}
                              </span>
                            </td>
                            <td style={{ ...tdS, color: "var(--muted)", maxWidth: 180, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{particulars}</td>
                            <td style={amtTdS}>{row.drAmt > 0 ? `₹${fmt(row.drAmt)}` : "—"}</td>
                            <td style={amtTdS}>{row.crAmt > 0 ? `₹${fmt(row.crAmt)}` : "—"}</td>
                            <td style={balStyle(row.balance)}>₹{fmt(Math.abs(row.balance))} {row.balance > 0 ? "Dr" : row.balance < 0 ? "Cr" : "Nil"}</td>
                          </tr>,
                          isExpanded && (
                            <tr key={`${row.id}-detail`} style={{ borderBottom: "1px solid var(--border)", background: "#fdf8fd" }}>
                              <td colSpan={7} style={{ padding: "12px 16px" }}>
                                {row.type === "journal" ? (
                                  <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                                    <thead>
                                      <tr style={{ borderBottom: "1px solid var(--border)" }}>
                                        {["Particulars", "Dr (₹)", "Cr (₹)"].map(h => (
                                          <th key={h} style={{ padding: "4px 8px", textAlign: h === "Particulars" ? "left" : "right", fontWeight: 600, color: "var(--muted)" }}>{h}</th>
                                        ))}
                                      </tr>
                                    </thead>
                                    <tbody>
                                      <tr>
                                        <td style={{ padding: "5px 8px" }}>{row.dr_account} A/c {row.dr_dealer && <span style={{ fontSize: 10, color: "var(--red-dark)", fontWeight: 700 }}>★ Dealer</span>}</td>
                                        <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "#c0392b" }}>₹{fmt(row.amount)}</td>
                                        <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>—</td>
                                      </tr>
                                      <tr>
                                        <td style={{ padding: "5px 8px 5px 20px", color: "var(--muted)" }}>To {row.cr_account} A/c {row.cr_dealer && <span style={{ fontSize: 10, color: "var(--red-dark)", fontWeight: 700 }}>★ Dealer</span>}</td>
                                        <td style={{ padding: "5px 8px", textAlign: "right", color: "var(--muted)" }}>—</td>
                                        <td style={{ padding: "5px 8px", textAlign: "right", fontWeight: 700, color: "#27ae60" }}>₹{fmt(row.amount)}</td>
                                      </tr>
                                    </tbody>
                                  </table>
                                ) : (
                                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "6px 24px", fontSize: 12 }}>
                                    {row.voucher_no   && <div><span style={{ color: "var(--muted)" }}>Vch No: </span>{row.voucher_no}</div>}
                                    {row.method       && <div><span style={{ color: "var(--muted)" }}>Method: </span>{row.method}</div>}
                                    {row.reference_no && <div><span style={{ color: "var(--muted)" }}>Ref: </span>{row.reference_no}</div>}
                                    {row.reason       && <div><span style={{ color: "var(--muted)" }}>Reason: </span>{row.reason}</div>}
                                    {(row.narration || row.notes) && <div style={{ gridColumn: "1/-1" }}><span style={{ color: "var(--muted)" }}>Narration: </span>{row.narration || row.notes}</div>}
                                  </div>
                                )}
                              </td>
                            </tr>
                          ),
                        ];
                      })}

                      {/* Closing balance row */}
                      <tr style={{ background: "#f8f4f8", borderTop: "2px solid var(--border)" }}>
                        <td style={tdS}>{ledPeriod.to ? fmtDateOnly(ledPeriod.to) : "—"}</td>
                        <td colSpan={3} style={{ ...tdS, fontWeight: 700, color: "var(--muted)", fontStyle: "italic" }}>Closing Balance c/f</td>
                        <td style={amtTdS}>—</td>
                        <td style={amtTdS}>—</td>
                        <td style={balStyle(closingBalance)}>₹{fmt(Math.abs(closingBalance))} {closingBalance > 0 ? "Dr" : closingBalance < 0 ? "Cr" : "Nil"}</td>
                      </tr>
                    </tbody>
                  </table>
                )}
              </div>
            </>
          );
        })()}

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
                <div key={i} style={{ alignSelf: m.role === "user" ? "flex-end" : "flex-start", maxWidth: "82%", display: "flex", flexDirection: "column", alignItems: m.role === "user" ? "flex-end" : "flex-start" }}>
                  {m.role === "user" && editingMsgIdx === i ? (
                    /* ── Edit mode ── */
                    <div style={{ width: "100%" }}>
                      <textarea
                        autoFocus
                        value={editingText}
                        onChange={e => setEditingText(e.target.value)}
                        onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); submitEdit(i); } }}
                        rows={3}
                        style={{
                          width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13,
                          padding: "10px 14px", borderRadius: 12, border: "2px solid var(--red-dark)",
                          resize: "vertical", background: "#fff",
                        }}
                      />
                      <div style={{ display: "flex", gap: 8, marginTop: 6, justifyContent: "flex-end" }}>
                        <button className="btn small" disabled={aiLoading || !editingText.trim()} onClick={() => submitEdit(i)}>Send</button>
                        <button className="btn small outline" onClick={() => { setEditingMsgIdx(null); setEditingText(""); }}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    /* ── Display mode ── */
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
                          style={{
                            position: "absolute", top: 6, left: -30,
                            background: "none", border: "none", cursor: "pointer",
                            fontSize: 14, opacity: 0, transition: "opacity 0.15s", padding: 4,
                          }}
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
