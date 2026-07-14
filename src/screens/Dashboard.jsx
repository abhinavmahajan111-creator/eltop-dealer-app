import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useApp } from "../context/AppContext";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

// ── Tier config ────────────────────────────────────────────────────────────────
const TIERS = [
  { name: "Silver",   min: 0,       max: 500000,  color: "#64748b", bg: "#f1f5f9", emoji: "🥈" },
  { name: "Gold",     min: 500000,  max: 1000000, color: "#b45309", bg: "#fef3c7", emoji: "🥇" },
  { name: "Platinum", min: 1000000, max: Infinity, color: "#7B2D8B", bg: "#f3e8ff", emoji: "💎" },
];

function getTier(tv) {
  return TIERS.find(t => tv >= t.min && tv < t.max) || TIERS[TIERS.length - 1];
}

function getTierProgress(tv) {
  const idx = TIERS.findIndex(t => tv >= t.min && tv < t.max);
  if (idx === -1 || idx === TIERS.length - 1) return null; // Platinum — no next tier
  const current = TIERS[idx];
  const next = TIERS[idx + 1];
  const pct = Math.round(((tv - current.min) / (next.min - current.min)) * 100);
  const needed = next.min - tv;
  return { pct, nextName: next.name, nextEmoji: next.emoji, needed };
}

// ── Badge helpers ───────────────────────────────────────────────────────────────
function computeStreak(orders) {
  // Consecutive months ending now (or most recent month with an order)
  const months = new Set(orders.map(o => o.created_at.slice(0, 7)));
  let streak = 0;
  const now = new Date();
  for (let i = 0; i < 48; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (months.has(key)) streak++;
    else break;
  }
  return streak;
}

function computeTopCategory(items) {
  const counts = {};
  for (const item of items) {
    const cat = item.products?.category;
    if (cat) counts[cat] = (counts[cat] || 0) + 1;
  }
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  // Descending count, then ascending alpha to break ties deterministically
  entries.sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return entries[0][0];
}

// ── Shared formatters ──────────────────────────────────────────────────────────
function fmt(n) {
  if (!n && n !== 0) return "—";
  return Number(n).toLocaleString("en-IN");
}

function fmtRs(n) {
  if (!n) return "Rs. 0";
  if (n >= 100000) return `Rs. ${(n / 100000).toFixed(1)}L`;
  return `Rs. ${fmt(n)}`;
}

function statusLabel(status) {
  const map = {
    pending:    { label: "Pending",    badge: "pending" },
    confirmed:  { label: "Confirmed",  badge: "transit" },
    processing: { label: "Processing", badge: "transit" },
    shipped:    { label: "Shipped",    badge: "transit" },
    delivered:  { label: "Delivered",  badge: "delivered" },
    cancelled:  { label: "Cancelled",  badge: "cancelled" },
  };
  return map[status] || { label: status || "Unknown", badge: "pending" };
}

// ── Badge card component ───────────────────────────────────────────────────────
function BadgeCard({ emoji, title, subtitle, unlocked }) {
  return (
    <div style={{
      background: unlocked ? "#fff" : "#f8fafc",
      border: `1.5px solid ${unlocked ? "#7B2D8B" : "#e2e8f0"}`,
      borderRadius: 12,
      padding: "14px 10px",
      textAlign: "center",
      opacity: unlocked ? 1 : 0.6,
      minWidth: 0,
    }}>
      <div style={{ fontSize: 28, marginBottom: 5, lineHeight: 1 }}>
        {unlocked ? emoji : "🔒"}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: unlocked ? "#1e293b" : "#94a3b8", lineHeight: 1.3 }}>
        {title}
      </div>
      {subtitle && (
        <div style={{ fontSize: 10, color: "#94a3b8", marginTop: 3, lineHeight: 1.3 }}>
          {subtitle}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────
export default function Dashboard() {
  const navigate = useNavigate();
  const { dealer, session } = useApp();

  const [loading, setLoading]             = useState(true);
  const [outstanding, setOutstanding]     = useState(null);
  const [ledgerError, setLedgerError]     = useState(false);
  const [turnoverThis, setTurnoverThis]   = useState(0);
  const [turnoverLast, setTurnoverLast]   = useState(null);
  const [lifetimeTv, setLifetimeTv]       = useState(0);
  const [orderCount, setOrderCount]       = useState(0);
  const [recentOrders, setRecentOrders]   = useState([]);
  const [topCategory, setTopCategory]     = useState(null);
  const [streak, setStreak]               = useState(0);

  useEffect(() => {
    async function load() {
      if (!isSupabaseConfigured || !session?.user?.id) { setLoading(false); return; }
      const uid = session.user.id;
      const now = new Date();
      const thisYearStart = new Date(now.getFullYear(), 0, 1).toISOString();
      const lastYearStart = new Date(now.getFullYear() - 1, 0, 1).toISOString();
      const lastYearEnd   = thisYearStart;

      // ── Batch 1: financial + recent + all-time orders ──
      const [thisYr, lastYr, ledger, recent, allOrders] = await Promise.all([
        supabase.from("orders").select("total")
          .eq("dealer_id", uid).neq("status", "cancelled").gte("created_at", thisYearStart),

        supabase.from("orders").select("total")
          .eq("dealer_id", uid).neq("status", "cancelled")
          .gte("created_at", lastYearStart).lt("created_at", lastYearEnd),

        supabase.from("dealer_ledger").select("type, amount").eq("dealer_id", uid),

        supabase.from("orders").select("id, total, status, created_at")
          .eq("dealer_id", uid).order("created_at", { ascending: false }).limit(5),

        supabase.from("orders").select("id, total, created_at")
          .eq("dealer_id", uid).neq("status", "cancelled")
          .order("created_at", { ascending: true }),
      ]);

      // Turnover
      const ty = (thisYr.data || []).reduce((s, o) => s + Number(o.total || 0), 0);
      const ly = (lastYr.data || []).reduce((s, o) => s + Number(o.total || 0), 0);
      setTurnoverThis(ty);
      setTurnoverLast(ly);

      // Outstanding
      if (ledger.error) {
        console.warn("[Dashboard] dealer_ledger RLS not yet applied:", ledger.error.message);
        setLedgerError(true);
      } else {
        const billed = (ledger.data || []).filter(r => r.type === "order").reduce((s, r) => s + Number(r.amount || 0), 0);
        const paid   = (ledger.data || []).filter(r => r.type === "payment").reduce((s, r) => s + Number(r.amount || 0), 0);
        setOutstanding(billed - paid);
      }

      // Recent orders
      setRecentOrders(recent.data || []);

      // All-time stats
      const ao = allOrders.data || [];
      const ltv = ao.reduce((s, o) => s + Number(o.total || 0), 0);
      setLifetimeTv(ltv);
      setOrderCount(ao.length);
      setStreak(computeStreak(ao));

      // ── Batch 2: top category (needs order IDs from batch 1) ──
      const orderIds = ao.map(o => o.id);
      if (orderIds.length > 0) {
        const { data: items } = await supabase
          .from("order_items")
          .select("products(category)")
          .in("order_id", orderIds);
        setTopCategory(computeTopCategory(items || []));
      }

      setLoading(false);
    }
    load();
  }, [session]);

  // Derived values
  const creditLimit    = Number(dealer?.credit_limit) || 0;
  const outstandingVal = outstanding ?? 0;
  const creditUsedPct  = creditLimit > 0 ? Math.min(100, Math.round((outstandingVal / creditLimit) * 100)) : 0;
  const tier           = getTier(turnoverThis);
  const tierProgress   = getTierProgress(turnoverThis);

  // YoY badge
  let yoyEl = null;
  if (turnoverLast !== null && turnoverLast > 0 && turnoverThis !== null) {
    const pct = Math.round(((turnoverThis - turnoverLast) / turnoverLast) * 100);
    const up = pct >= 0;
    yoyEl = (
      <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#16a34a" : "#dc2626", marginLeft: 6 }}>
        {up ? "▲" : "▼"} {Math.abs(pct)}% vs last year
      </span>
    );
  }

  // Achievement badges config
  const badges = [
    {
      emoji: "🎯",
      title: "Rs 5L Club",
      subtitle: lifetimeTv > 0 ? `All-time: ${fmtRs(lifetimeTv)}` : "Rs 5,00,000 lifetime",
      unlocked: lifetimeTv >= 500000,
    },
    {
      emoji: "🏆",
      title: "Rs 10L Club",
      subtitle: lifetimeTv > 0 ? `All-time: ${fmtRs(lifetimeTv)}` : "Rs 10,00,000 lifetime",
      unlocked: lifetimeTv >= 1000000,
    },
    {
      emoji: "📦",
      title: orderCount > 0 ? `${orderCount} orders` : "0 orders",
      subtitle: "completed",
      unlocked: orderCount > 0,
    },
    {
      emoji: topCategory ? "🌀" : "🌀",
      title: topCategory ? `${topCategory} champ` : "Category champ",
      subtitle: topCategory ? "Top ordered category" : "Place orders to unlock",
      unlocked: topCategory !== null,
    },
    {
      emoji: "🔥",
      title: streak > 0 ? `${streak} month streak` : "No streak yet",
      subtitle: streak > 0 ? "Consecutive months ordering" : "Order every month to build",
      unlocked: streak > 0,
    },
  ];

  return (
    <div className="screen" id="screen-dashboard">
      <div className="topbar">
        <h1 style={{ flex: 1 }}>Eltop Dealer</h1>
        <span onClick={() => navigate("/profile")} style={{ fontSize: 18, cursor: "pointer" }}>&#128100;</span>
      </div>

      <div className="content">
        {/* ── Dealer name + tier badge ── */}
        <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 2, width: "100%" }}>
          <img
            src="/assets/fan%20man%20eltop.png"
            alt="Fanman"
            style={{ height: 64, width: "auto", objectFit: "contain", marginTop: 4, flexShrink: 0 }}
          />
          <div style={{ paddingLeft: 12, textAlign: "right" }}>
            <div className="welcome">Welcome back,</div>
            <div className="dealer-name" style={{ marginBottom: 6 }}>{dealer?.name || "Dealer"}</div>
            {!loading && (
              <span style={{
                display: "inline-flex", alignItems: "center", gap: 5,
                background: tier.bg, color: tier.color,
                fontSize: 12, fontWeight: 700, padding: "3px 10px",
                borderRadius: 20, border: `1.5px solid ${tier.color}`,
              }}>
                {tier.emoji} {tier.name} Dealer
              </span>
            )}
          </div>
        </div>

        {loading ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {/* ── Tier progress bar ── */}
            {tierProgress ? (
              <div style={{ background: "#fff", border: "1px solid #7B2D8B", borderRadius: 10, padding: "10px 14px", marginTop: 10, marginBottom: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#64748b", marginBottom: 6 }}>
                  <span>{tier.emoji} {tier.name}</span>
                  <span style={{ color: "#7B2D8B", fontWeight: 600 }}>
                    {fmtRs(tierProgress.needed)} to {tierProgress.nextEmoji} {tierProgress.nextName}
                  </span>
                </div>
                <div style={{ background: "#e2e8f0", borderRadius: 99, height: 7, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${tierProgress.pct}%`, background: "linear-gradient(90deg,#7B2D8B,#a855f7)", borderRadius: 99, transition: "width .4s" }} />
                </div>
              </div>
            ) : (
              <div style={{ background: tier.bg, border: `1px solid ${tier.color}`, borderRadius: 10, padding: "8px 14px", marginTop: 10, marginBottom: 12, fontSize: 12, color: tier.color, fontWeight: 700, textAlign: "center" }}>
                💎 You are a Platinum Dealer — top tier!
              </div>
            )}

            {/* ── Stat cards — 2-col mobile, 3-col desktop ── */}
            <div className="stat-cards">
              <div className="stat-card">
                <div className="stat-label">Outstanding</div>
                {ledgerError ? (
                  <div className="stat-value" style={{ fontSize: 13, color: "#94a3b8" }}>Unavailable</div>
                ) : (
                  <div className="stat-value red">Rs. {fmt(outstandingVal)}</div>
                )}
              </div>
              <div className="stat-card">
                <div className="stat-label">Credit Limit</div>
                {creditLimit > 0 ? (
                  <>
                    <div className="stat-value">Rs. {fmt(creditLimit)}</div>
                    <div className="credit-bar-bg">
                      <div className="credit-bar-fill" style={{ width: `${creditUsedPct}%` }} />
                    </div>
                  </>
                ) : (
                  <div className="stat-value" style={{ fontSize: 13, color: "#94a3b8" }}>Not set</div>
                )}
              </div>
              <div className="stat-card stat-full">
                <div className="stat-label">Turnover — {new Date().getFullYear()}</div>
                <div className="stat-value" style={{ color: "#1e293b" }}>
                  Rs. {fmt(turnoverThis)}
                  {yoyEl}
                </div>
              </div>
            </div>

            {/* ── Achievements ── */}
            <div className="section-title" style={{ marginTop: 4 }}>Achievements</div>
            <div style={{ border: "1px solid #7B2D8B", borderRadius: 12, padding: 12, marginBottom: 14, background: "#fff" }}>
              {orderCount === 0 ? (
                <div style={{ textAlign: "center", padding: "6px 0", color: "#64748b", fontSize: 13 }}>
                  <div style={{ fontSize: 28, marginBottom: 6 }}>🎯</div>
                  Place your first order to start earning badges!
                </div>
              ) : (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 8 }}>
                  {badges.map((b, i) => <BadgeCard key={i} {...b} />)}
                </div>
              )}
            </div>

            {/* ── Schemes banner ── */}
            <div className="banner" onClick={() => navigate("/schemes")}>
              <h3>Schemes &amp; Offers</h3>
              <p>Tap to view exclusive dealer schemes →</p>
            </div>

            {/* ── Quick actions ── */}
            <div className="quick-grid">
              <div className="quick-item" onClick={() => navigate("/catalogue")}>
                <div className="ic">&#128218;</div><div className="lb">Catalogue</div>
              </div>
              <div className="quick-item" onClick={() => navigate("/cart")}>
                <div className="ic">&#128722;</div><div className="lb">Cart</div>
              </div>
              <div className="quick-item" onClick={() => navigate("/ledger")}>
                <div className="ic">&#128203;</div><div className="lb">Ledger</div>
              </div>
              <div className="quick-item" onClick={() => navigate("/tracking")}>
                <div className="ic">&#128666;</div><div className="lb">Track</div>
              </div>
            </div>

            {/* ── Recent orders ── */}
            <div className="section-title">Recent Orders</div>
            {recentOrders.length === 0 ? (
              <div style={{ textAlign: "center", padding: "20px 0", color: "#94a3b8", fontSize: 13 }}>
                No orders yet —{" "}
                <span style={{ color: "#7B2D8B", cursor: "pointer", fontWeight: 600 }} onClick={() => navigate("/catalogue")}>
                  browse the catalogue
                </span>
              </div>
            ) : (
              recentOrders.map((o) => {
                const { label, badge } = statusLabel(o.status);
                const date = new Date(o.created_at).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
                return (
                  <div className="order-row" key={o.id} onClick={() => navigate("/tracking")}>
                    <div>
                      <div className="oid">{o.id}</div>
                      <div className="osub">Rs. {fmt(o.total)} · {date}</div>
                    </div>
                    <span className={`badge ${badge}`}>{label}</span>
                  </div>
                );
              })
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
