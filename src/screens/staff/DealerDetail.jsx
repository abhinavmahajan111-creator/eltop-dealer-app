import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

// Dealer detail screen for Sales staff — reached by tapping a dealer in
// "My Dealers / Parties" on the Sales dashboard. Everything a rep needs
// before/during a call: contact info, credit terms, and recent order
// history, all in one place. Both RPCs (get_dealer_detail,
// get_dealer_orders) re-check that this dealer is within the caller's own
// scope server-side — a rep can't view another rep's dealer just by
// knowing/guessing its id.

const CARD_STYLE = {
  background: "#fff",
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatDate(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function StatusBadge({ status }) {
  const label = (status || "unknown").replace(/_/g, " ");
  const colors = {
    delivered: { bg: "#e6f7ec", fg: "#2fa84f" },
    dispatched: { bg: "#e6f0fb", fg: "#3564c9" },
    out_for_delivery: { bg: "#e6f0fb", fg: "#3564c9" },
    confirmed: { bg: "#fff4e0", fg: "#c98400" },
    pending: { bg: "#f3f3f3", fg: "#888" },
    cancelled: { bg: "#fdeaea", fg: "#d64545" },
  };
  const c = colors[status] || { bg: "#f3f3f3", fg: "#888" };
  return (
    <span style={{
      fontSize: 10.5, fontWeight: 700, textTransform: "capitalize",
      background: c.bg, color: c.fg, borderRadius: 999, padding: "3px 10px", whiteSpace: "nowrap",
    }}>
      {label}
    </span>
  );
}

export default function DealerDetail() {
  const { id } = useParams();
  const navigate = useNavigate();

  const [dealer, setDealer] = useState(null);
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured || !id) { setLoading(false); return; }
    let cancelled = false;
    Promise.all([
      supabase.rpc("get_dealer_detail", { p_dealer_id: id }),
      supabase.rpc("get_dealer_orders", { p_dealer_id: id, p_limit: 20 }),
    ]).then(([detailRes, ordersRes]) => {
      if (cancelled) return;
      if (detailRes.error) {
        setError(detailRes.error.message);
      } else {
        const row = Array.isArray(detailRes.data) ? detailRes.data[0] : detailRes.data;
        if (!row) {
          setError("This dealer isn't in your assigned list.");
        } else {
          setDealer(row);
        }
      }
      if (!ordersRes.error) setOrders(ordersRes.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', Arial, sans-serif", color: "#999" }}>
        Loading…
      </div>
    );
  }

  if (error || !dealer) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div style={{ padding: "18px 24px" }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#7B2D8B", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            ← Back
          </button>
        </div>
        <div style={{ textAlign: "center", padding: "60px 24px", color: "#999", fontSize: 13.5 }}>
          {error || "Dealer not found."}
        </div>
      </div>
    );
  }

  const territories = Array.isArray(dealer.territory) ? dealer.territory : [];
  const creditLimit = Number(dealer.credit_limit || 0);
  const outstanding = Number(dealer.outstanding || 0);
  const usedPct = creditLimit > 0 ? Math.min(100, Math.round((outstanding / creditLimit) * 100)) : null;
  const netRate = (dealer.discount1 || dealer.discount2)
    ? ((1 - (dealer.discount1 || 0) / 100) * (1 - (dealer.discount2 || 0) / 100) * 100).toFixed(2)
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 24px 40px", color: "#fff" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 16 }}>
          ← Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{
            width: 52, height: 52, borderRadius: "50%", background: "rgba(255,255,255,0.25)",
            border: "2px solid rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 19, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>
            {initials(dealer.name)}
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{dealer.name}</div>
            <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>{dealer.dealer_code || "—"}</div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "-20px auto 0", padding: "0 20px 60px", position: "relative", zIndex: 2 }}>
        <div style={CARD_STYLE}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
            <span>Outstanding</span>
            <span style={{ color: outstanding > 0 ? "#d64545" : "#2fa84f" }}>₹{outstanding.toLocaleString("en-IN")}</span>
          </div>
          {creditLimit > 0 && (
            <>
              <div style={{ height: 8, background: "#f0eaf2", borderRadius: 999, overflow: "hidden" }}>
                <div style={{ height: "100%", width: `${usedPct}%`, background: usedPct >= 90 ? "#d64545" : "linear-gradient(90deg, #7B2D8B, #c65fd3)", borderRadius: 999 }} />
              </div>
              <div style={{ fontSize: 11.5, color: "#999", marginTop: 6 }}>
                {usedPct}% of ₹{creditLimit.toLocaleString("en-IN")} credit limit used
              </div>
            </>
          )}
          {netRate && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#7B2D8B", fontWeight: 700, background: "#f8f4f8", borderRadius: 8, padding: "8px 12px" }}>
              Net Rate = DLP × {netRate}% (Disc. {dealer.discount1 || 0}% + {dealer.discount2 || 0}%)
            </div>
          )}
        </div>

        <div style={CARD_STYLE}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Contact</div>
          {dealer.phone && (
            <a href={`tel:${dealer.phone}`} style={{ display: "block", fontSize: 13.5, color: "#222", textDecoration: "none", marginBottom: 6 }}>
              📞 {dealer.phone}{dealer.phone2 ? ` / ${dealer.phone2}` : ""}
            </a>
          )}
          {dealer.email && (
            <a href={`mailto:${dealer.email}`} style={{ display: "block", fontSize: 13.5, color: "#222", textDecoration: "none", marginBottom: 6 }}>
              ✉️ {dealer.email}
            </a>
          )}
          {dealer.address && (
            <div style={{ fontSize: 13.5, color: "#666", lineHeight: 1.5 }}>📍 {dealer.address}</div>
          )}
          {dealer.gstin && (
            <div style={{ fontSize: 12, color: "#999", marginTop: 8 }}>GSTIN: {dealer.gstin}</div>
          )}
          {territories.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 10 }}>
              {territories.map((t) => (
                <span key={t} style={{ fontSize: 11, fontWeight: 700, color: "#7B2D8B", background: "#f3e6f6", borderRadius: 999, padding: "3px 10px" }}>{t}</span>
              ))}
            </div>
          )}
          {!dealer.phone && !dealer.email && !dealer.address && (
            <div style={{ fontSize: 12.5, color: "#aaa" }}>No contact details on file yet.</div>
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 800, margin: "20px 0 12px" }}>Order History</div>
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          {orders.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>No orders yet.</div>
          ) : (
            orders.map((o) => (
              <div key={o.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "13px 16px", borderBottom: "1px solid #f2f2f2" }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700 }}>₹{Number(o.total || 0).toLocaleString("en-IN")}</div>
                  <div style={{ fontSize: 11.5, color: "#999", marginTop: 1 }}>{formatDate(o.created_at)}</div>
                </div>
                <StatusBadge status={o.status} />
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
