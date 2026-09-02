import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

// Dealer detail screen for Sales staff — reached by tapping a dealer in
// "My Dealers / Parties" on the Sales dashboard. Everything a rep needs
// before/during a call: contact info, credit terms, recent order history,
// and now visit logging with GPS check-in. Every RPC here (get_dealer_
// detail, get_dealer_orders, get_dealer_visits, log_dealer_visit)
// re-checks that this dealer is within the caller's own scope server-side
// — a rep can't view or log against another rep's dealer just by
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

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
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
  const [visits, setVisits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [visitNotes, setVisitNotes] = useState("");
  const [logging, setLogging] = useState(false);
  const [logStatus, setLogStatus] = useState(null); // { type: 'success'|'error', message }

  const loadVisits = () => {
    supabase.rpc("get_dealer_visits", { p_dealer_id: id, p_limit: 10 }).then(({ data, error }) => {
      if (!error) setVisits(data || []);
    });
  };

  useEffect(() => {
    if (!isSupabaseConfigured || !id) { setLoading(false); return; }
    let cancelled = false;
    Promise.all([
      supabase.rpc("get_dealer_detail", { p_dealer_id: id }),
      supabase.rpc("get_dealer_orders", { p_dealer_id: id, p_limit: 20 }),
      supabase.rpc("get_dealer_visits", { p_dealer_id: id, p_limit: 10 }),
    ]).then(([detailRes, ordersRes, visitsRes]) => {
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
      if (!visitsRes.error) setVisits(visitsRes.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [id]);

  const handleLogVisit = () => {
    setLogging(true);
    setLogStatus(null);

    const submit = (lat, lng) => {
      supabase.rpc("log_dealer_visit", {
        p_dealer_id: id,
        p_notes: visitNotes,
        p_latitude: lat,
        p_longitude: lng,
      }).then(({ data, error }) => {
        const result = Array.isArray(data) ? data[0] : data;
        if (error || !result?.success) {
          setLogStatus({ type: "error", message: error?.message || result?.message || "Couldn't log visit." });
        } else {
          setLogStatus({ type: "success", message: lat != null ? "Visit logged with location." : "Visit logged (no location captured)." });
          setVisitNotes("");
          loadVisits();
        }
        setLogging(false);
      });
    };

    if (!navigator.geolocation) {
      submit(null, null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => submit(pos.coords.latitude, pos.coords.longitude),
      () => submit(null, null), // location denied/unavailable — still log the visit, just without GPS
      { timeout: 8000 }
    );
  };

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

        <div style={CARD_STYLE}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Log a Visit</div>
          <textarea
            value={visitNotes}
            onChange={(e) => setVisitNotes(e.target.value)}
            placeholder="What happened on this visit? (optional)"
            rows={3}
            style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eee", borderRadius: 8, fontSize: 13, fontFamily: "inherit", resize: "vertical", marginBottom: 10, boxSizing: "border-box" }}
          />
          <button
            onClick={handleLogVisit}
            disabled={logging}
            style={{
              width: "100%", padding: "11px", border: "none", borderRadius: 8,
              background: logging ? "#c9a8d1" : "#7B2D8B", color: "#fff", fontSize: 13.5, fontWeight: 700,
              cursor: logging ? "default" : "pointer",
            }}
          >
            {logging ? "Logging…" : "📍 Log Visit"}
          </button>
          {logStatus && (
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: logStatus.type === "success" ? "#2fa84f" : "#d64545" }}>
              {logStatus.message}
            </div>
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 800, margin: "20px 0 12px" }}>Recent Visits</div>
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden", marginBottom: 20 }}>
          {visits.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>No visits logged yet.</div>
          ) : (
            visits.map((v) => (
              <div key={v.id} style={{ padding: "13px 16px", borderBottom: "1px solid #f2f2f2" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{v.staff_name}</div>
                  <div style={{ fontSize: 11, color: "#999" }}>{formatDateTime(v.visited_at)}</div>
                </div>
                {v.notes && <div style={{ fontSize: 12.5, color: "#666", marginTop: 4, lineHeight: 1.5 }}>{v.notes}</div>}
                {v.latitude != null && v.longitude != null && (
                  <a
                    href={`https://www.google.com/maps?q=${v.latitude},${v.longitude}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ display: "inline-block", marginTop: 4, fontSize: 11, color: "#7B2D8B", fontWeight: 700, textDecoration: "none" }}
                  >
                    📍 View location
                  </a>
                )}
              </div>
            ))
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
