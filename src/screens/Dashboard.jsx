import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useApp } from "../context/AppContext";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

function fmt(n) {
  if (!n && n !== 0) return "—";
  return Number(n).toLocaleString("en-IN");
}

function statusLabel(status) {
  const map = {
    pending:   { label: "Pending",    badge: "pending" },
    confirmed: { label: "Confirmed",  badge: "transit" },
    processing:{ label: "Processing", badge: "transit" },
    shipped:   { label: "Shipped",    badge: "transit" },
    delivered: { label: "Delivered",  badge: "delivered" },
    cancelled: { label: "Cancelled",  badge: "cancelled" },
  };
  return map[status] || { label: status || "Unknown", badge: "pending" };
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { dealer, session } = useApp();

  const [loading, setLoading] = useState(true);
  const [outstanding, setOutstanding] = useState(null);
  const [turnoverThis, setTurnoverThis] = useState(null);
  const [turnoverLast, setTurnoverLast] = useState(null);
  const [recentOrders, setRecentOrders] = useState([]);
  const [ledgerError, setLedgerError] = useState(false);

  useEffect(() => {
    if (!isSupabaseConfigured || !session?.user?.id) {
      setLoading(false);
      return;
    }
    const uid = session.user.id;
    const now = new Date();
    const thisYearStart = new Date(now.getFullYear(), 0, 1).toISOString();
    const lastYearStart = new Date(now.getFullYear() - 1, 0, 1).toISOString();
    const lastYearEnd   = new Date(now.getFullYear(), 0, 1).toISOString();

    Promise.all([
      // 1. Turnover this year (non-cancelled orders)
      supabase
        .from("orders")
        .select("total")
        .eq("dealer_id", uid)
        .neq("status", "cancelled")
        .gte("created_at", thisYearStart),

      // 2. Turnover last year
      supabase
        .from("orders")
        .select("total")
        .eq("dealer_id", uid)
        .neq("status", "cancelled")
        .gte("created_at", lastYearStart)
        .lt("created_at", lastYearEnd),

      // 3. Outstanding from dealer_ledger
      supabase
        .from("dealer_ledger")
        .select("type, amount")
        .eq("dealer_id", uid),

      // 4. Recent orders (last 5)
      supabase
        .from("orders")
        .select("id, total, status, created_at")
        .eq("dealer_id", uid)
        .order("created_at", { ascending: false })
        .limit(5),
    ]).then(([thisYr, lastYr, ledger, recent]) => {
      // Turnover this year
      const ty = (thisYr.data || []).reduce((s, o) => s + Number(o.total || 0), 0);
      setTurnoverThis(ty);

      // Turnover last year
      const ly = (lastYr.data || []).reduce((s, o) => s + Number(o.total || 0), 0);
      setTurnoverLast(ly);

      // Outstanding — if RLS policy not yet applied, ledger.error will be set
      if (ledger.error) {
        console.warn("[Dashboard] dealer_ledger RLS not yet applied:", ledger.error.message);
        setLedgerError(true);
        setOutstanding(null);
      } else {
        const billed  = (ledger.data || []).filter(r => r.type === "order")  .reduce((s, r) => s + Number(r.amount || 0), 0);
        const paid    = (ledger.data || []).filter(r => r.type === "payment").reduce((s, r) => s + Number(r.amount || 0), 0);
        setOutstanding(billed - paid);
      }

      // Recent orders
      setRecentOrders(recent.data || []);
      setLoading(false);
    });
  }, [session]);

  const creditLimit = Number(dealer?.credit_limit) || 0;
  const outstandingVal = outstanding ?? 0;
  const creditUsedPct = creditLimit > 0 ? Math.min(100, Math.round((outstandingVal / creditLimit) * 100)) : 0;

  // YoY
  let yoyEl = null;
  if (turnoverThis !== null && turnoverLast !== null && turnoverLast > 0) {
    const pct = Math.round(((turnoverThis - turnoverLast) / turnoverLast) * 100);
    const up = pct >= 0;
    yoyEl = (
      <span style={{ fontSize: 11, fontWeight: 700, color: up ? "#16a34a" : "#dc2626", marginLeft: 6 }}>
        {up ? "▲" : "▼"} {Math.abs(pct)}% vs last year
      </span>
    );
  }

  return (
    <div className="screen" id="screen-dashboard">
      <div className="topbar">
        <h1 style={{ flex: 1 }}>Eltop Dealer</h1>
        <span onClick={() => navigate("/profile")} style={{ fontSize: 18, cursor: "pointer" }}>&#128100;</span>
      </div>

      <div className="content">
        <div className="welcome">Welcome back,</div>
        <div className="dealer-name">{dealer?.name || "Dealer"}</div>

        {loading ? (
          <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>Loading…</div>
        ) : (
          <>
            {/* ── Stat cards ── */}
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
            </div>

            {/* ── Turnover this year ── */}
            <div className="stat-card" style={{ marginBottom: 12 }}>
              <div className="stat-label">Turnover — {new Date().getFullYear()}</div>
              <div className="stat-value" style={{ color: "#1e293b" }}>
                Rs. {fmt(turnoverThis)}
                {yoyEl}
              </div>
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
                No orders yet — <span style={{ color: "#7B2D8B", cursor: "pointer", fontWeight: 600 }} onClick={() => navigate("/catalogue")}>browse the catalogue</span>
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
