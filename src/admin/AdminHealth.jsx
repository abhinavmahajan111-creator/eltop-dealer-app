import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }
function fmtDate(s) {
  return new Date(s).toLocaleDateString("en-IN", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function AdminHealth() {
  const [loading,              setLoading]              = useState(true);
  const [lastChecked,          setLastChecked]          = useState(null);
  const [orphaned,             setOrphaned]             = useState([]);
  const [missingPaymentId,     setMissingPaymentId]     = useState([]);
  const [duplicatePaymentIds,  setDuplicatePaymentIds]  = useState([]);
  const [totalOrders,          setTotalOrders]          = useState(0);
  const [totalRevenue,         setTotalRevenue]         = useState(0);
  const [fetchError,           setFetchError]           = useState("");

  const runCheck = async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setFetchError("");

    const { data, error } = await supabase
      .from("orders")
      .select("id, total, payment_id, payment_status, created_at, customer_name, order_items(id)");

    if (error || !data) {
      console.error("[AdminHealth]", error);
      setFetchError(error?.message || "Failed to load orders.");
      setLoading(false);
      return;
    }

    // Orphaned orders — saved order row but zero items
    setOrphaned(data.filter(o => !o.order_items || o.order_items.length === 0));

    // Paid status but no payment_id recorded
    setMissingPaymentId(data.filter(o => o.payment_status === "paid" && !o.payment_id));

    // Duplicate payment_ids (same Razorpay ID on multiple orders — manual recovery duplicate)
    const pidMap = {};
    data.forEach(o => {
      if (o.payment_id) {
        if (!pidMap[o.payment_id]) pidMap[o.payment_id] = [];
        pidMap[o.payment_id].push(o);
      }
    });
    setDuplicatePaymentIds(
      Object.entries(pidMap)
        .filter(([, orders]) => orders.length > 1)
        .map(([pid, orders]) => ({ pid, orders }))
    );

    setTotalOrders(data.length);
    setTotalRevenue(data.reduce((s, o) => s + Number(o.total || 0), 0));
    setLastChecked(new Date());
    setLoading(false);
  };

  useEffect(() => { runCheck(); }, []);

  const issueCount =
    orphaned.length + missingPaymentId.length + duplicatePaymentIds.length;
  const allClear = !loading && issueCount === 0 && !fetchError;

  return (
    <div className="admin-page">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", flexWrap: "wrap", gap: 8 }}>
        <h1 className="admin-title">Health Check</h1>
        <button className="admin-link" onClick={runCheck} disabled={loading} style={{ fontSize: 14, fontWeight: 700 }}>
          {loading ? "Checking…" : "↻ Refresh"}
        </button>
      </div>

      {lastChecked && (
        <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 20 }}>
          Last checked: {lastChecked.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true })}
        </div>
      )}

      {fetchError && (
        <div style={{ background: "#fff1f2", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 20, color: "#be123c", fontSize: 13 }}>
          ⚠️ Query failed: {fetchError}
        </div>
      )}

      {/* ── Status banner ── */}
      {!loading && !fetchError && (
        <div style={{
          background: allClear ? "#f0fdf4" : "#fff1f2",
          border: `2px solid ${allClear ? "#86efac" : "#fca5a5"}`,
          borderRadius: 10, padding: "14px 18px", marginBottom: 24,
          color: allClear ? "#15803d" : "#be123c",
          fontWeight: 700, fontSize: 15,
        }}>
          {allClear
            ? "✅ All checks passed — no issues found."
            : `⚠️ ${issueCount} issue${issueCount === 1 ? "" : "s"} need attention — see details below.`}
        </div>
      )}

      {/* ── Stats grid ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 14, marginBottom: 32 }}>
        <StatCard label="Total Orders"           value={loading ? "…" : totalOrders} />
        <StatCard label="Total Revenue"          value={loading ? "…" : `Rs. ${fmt(totalRevenue)}`} />
        <StatCard label="Orphaned Orders"        value={loading ? "…" : orphaned.length}            alert={orphaned.length > 0} />
        <StatCard label="Duplicate Payment IDs"  value={loading ? "…" : duplicatePaymentIds.length} alert={duplicatePaymentIds.length > 0} />
        <StatCard label="Paid / No Payment ID"   value={loading ? "…" : missingPaymentId.length}    alert={missingPaymentId.length > 0} />
      </div>

      {/* ── Issue tables ── */}
      {orphaned.length > 0 && (
        <IssueSection title="⚠️ Orphaned Orders — order saved, items missing" hint="Payment was captured but order_items insert failed or capturedItems was empty. Each needs manual item recovery.">
          <IssueTable rows={orphaned} />
        </IssueSection>
      )}

      {duplicatePaymentIds.length > 0 && (
        <IssueSection title="🔴 Duplicate Payment IDs — same Razorpay ID on multiple orders" hint="Usually caused by a manual recovery INSERT creating a second row for an already-saved payment. Verify which row is correct and delete the duplicate.">
          {duplicatePaymentIds.map(({ pid, orders }) => (
            <div key={pid} style={{ marginBottom: 20 }}>
              <div style={{ fontFamily: "monospace", fontWeight: 700, fontSize: 13, color: "#be123c", marginBottom: 8 }}>
                {pid}
              </div>
              <IssueTable rows={orders} />
            </div>
          ))}
        </IssueSection>
      )}

      {missingPaymentId.length > 0 && (
        <IssueSection title="🟡 Paid Orders Missing Payment ID" hint="payment_status = 'paid' but no payment_id recorded. May indicate the order was created outside the Razorpay flow or payment_id was not persisted correctly.">
          <IssueTable rows={missingPaymentId} />
        </IssueSection>
      )}

      {allClear && (
        <div style={{ textAlign: "center", color: "var(--muted)", padding: "40px 0", fontSize: 14 }}>
          No orphaned orders, no duplicate payment IDs, no paid orders with missing payment reference.
        </div>
      )}

      <div style={{ marginTop: 32, padding: "14px 18px", background: "#f8f4f8", borderRadius: 8, fontSize: 12, color: "var(--muted)", lineHeight: 1.7 }}>
        <strong style={{ color: "var(--red-dark)" }}>What to do when issues are flagged</strong><br />
        <strong>Orphaned order:</strong> find the matching Razorpay payment in the dashboard, then manually INSERT the missing order_items rows via Supabase SQL Editor.<br />
        <strong>Duplicate payment ID:</strong> one of the two order rows is a manual recovery duplicate — verify items on both, keep the one with correct items, DELETE the other.<br />
        <strong>Paid / no payment ID:</strong> check Razorpay dashboard by amount + time, update the order row with the correct payment_id via SQL.
      </div>
    </div>
  );
}

function StatCard({ label, value, alert }) {
  return (
    <div style={{
      background: alert ? "#fff1f2" : "#fff",
      border: `1.5px solid ${alert ? "#fca5a5" : "var(--border)"}`,
      borderRadius: 10, padding: "14px 18px",
    }}>
      <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 800, color: alert ? "#be123c" : "#1e293b" }}>
        {value}
      </div>
    </div>
  );
}

function IssueSection({ title, hint, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <div style={{ fontWeight: 700, fontSize: 14, color: "#1e293b", marginBottom: 4 }}>{title}</div>
      {hint && <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 10, lineHeight: 1.5 }}>{hint}</div>}
      {children}
    </div>
  );
}

function IssueTable({ rows }) {
  return (
    <div style={{ background: "#fff", border: "1px solid #fca5a5", borderRadius: 8, overflow: "auto" }}>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, minWidth: 520 }}>
        <thead>
          <tr style={{ background: "#fff1f2" }}>
            {["Order ID", "Customer", "Payment ID", "Total", "Date"].map(h => (
              <th key={h} style={{ padding: "8px 12px", textAlign: "left", fontWeight: 700, whiteSpace: "nowrap" }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(o => (
            <tr key={o.id} style={{ borderTop: "1px solid #fee2e2" }}>
              <td style={{ padding: "8px 12px", fontFamily: "monospace", color: "#7B2D8B", fontWeight: 700 }}>
                {o.id.slice(0, 8).toUpperCase()}
              </td>
              <td style={{ padding: "8px 12px" }}>{o.customer_name || "—"}</td>
              <td style={{ padding: "8px 12px", fontFamily: "monospace", color: o.payment_id ? "#15803d" : "#94a3b8" }}>
                {o.payment_id || "MISSING"}
              </td>
              <td style={{ padding: "8px 12px", whiteSpace: "nowrap" }}>Rs. {fmt(o.total)}</td>
              <td style={{ padding: "8px 12px", color: "#64748b", whiteSpace: "nowrap" }}>{fmtDate(o.created_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
