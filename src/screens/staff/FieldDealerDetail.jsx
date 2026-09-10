import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

// Lightweight detail screen for a dealer added straight from the field
// (public.dealer_field_adds) — reached by tapping one in "My Dealers" or
// "My Visits" on the Sales dashboard. Deliberately NOT the full
// DealerDetail CRM (ledger/orders/insights) — this record has none of
// that data yet, it's an un-onboarded lead. Shows exactly what the rep
// entered (owner, phone numbers, address, GST registration), where it
// was added, and the rep's own visit history there — plus a shortcut
// into Check In. Requested 10 Sept 2026: tapping a field-added dealer
// previously jumped straight to Check In with no way to see any of this.

const CARD_STYLE = {
  background: "#fff",
  border: "1.5px solid #7B2D8B",
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

const ICON_BTN = { width: 32, height: 32, borderRadius: 8, background: "rgba(255,255,255,0.18)", border: "1.5px solid rgba(255,255,255,0.4)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, textDecoration: "none" };

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

const STATUS_META = {
  pending: { label: "🆕 Pending review", color: "#c98400", bg: "#fff4e0" },
  approved: { label: "✅ Approved", color: "#2fa84f", bg: "#e6f7ec" },
  rejected: { label: "✕ Rejected", color: "#d64545", bg: "#fdeaea" },
};

export default function FieldDealerDetail() {
  const navigate = useNavigate();
  const { id } = useParams();

  const [dealer, setDealer] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [visits, setVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); setLoadingVisits(false); return; }
    let cancelled = false;

    supabase.rpc("get_field_dealer_detail", { p_id: id }).then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        setError(error.message);
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        if (!row) setError("This dealer wasn't found, or isn't yours to view.");
        else setDealer(row);
      }
      setLoading(false);
    });

    supabase.rpc("get_my_visits", { p_limit: 100 }).then(({ data, error }) => {
      if (cancelled) return;
      if (!error) setVisits((data || []).filter((v) => v.is_field_dealer && v.dealer_id === id));
      setLoadingVisits(false);
    });

    return () => { cancelled = true; };
  }, [id]);

  if (loading) {
    return <div style={{ minHeight: "100vh", background: "#f5f5f7", display: "flex", alignItems: "center", justifyContent: "center", color: "#999" }}>Loading…</div>;
  }

  if (error || !dealer) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f7", padding: 20 }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#7B2D8B", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 16 }}>
          ← Back
        </button>
        <div style={{ ...CARD_STYLE, textAlign: "center", color: "#d64545" }}>{error || "Couldn't load this dealer."}</div>
      </div>
    );
  }

  const statusMeta = STATUS_META[dealer.status] || STATUS_META.pending;
  const mapsUrl = dealer.location_lat != null && dealer.location_lng != null
    ? `https://www.google.com/maps?q=${dealer.location_lat},${dealer.location_lng}`
    : null;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 18px 20px", color: "#fff" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}>
          ← Back
        </button>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{
            width: 46, height: 46, borderRadius: "50%", background: "rgba(255,255,255,0.25)",
            border: "2px solid rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 17, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>
            {initials(dealer.shop_name)}
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 18, fontWeight: 800, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {dealer.shop_name}{dealer.alias_name ? ` (${dealer.alias_name})` : ""}
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 3 }}>
              <span style={{ background: statusMeta.bg, color: statusMeta.color, borderRadius: 999, padding: "2px 9px", fontWeight: 800, fontSize: 10.5 }}>
                {statusMeta.label}
              </span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
            {dealer.whatsapp_number && <a href={`https://wa.me/${dealer.whatsapp_number.replace(/\D/g, "")}`} target="_blank" rel="noreferrer" style={ICON_BTN}>💬</a>}
            {dealer.whatsapp_number && <a href={`tel:${dealer.whatsapp_number}`} style={ICON_BTN}>📞</a>}
          </div>
        </div>
      </div>

      <div style={{ padding: 16, maxWidth: 560, margin: "0 auto" }}>
        <div style={CARD_STYLE}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Details you entered</div>
          <DetailRow label="Owner name" value={dealer.owner_name} />
          <DetailRow label="WhatsApp" value={dealer.whatsapp_number} />
          <DetailRow label="Alternate number" value={dealer.alternate_number} />
          <DetailRow label="Address" value={dealer.address} />
          <DetailRow
            label="GST registration"
            value={dealer.registration_type ? (dealer.registration_type === "registered" ? "✅ Registered" : "Unregistered") : null}
          />
          <DetailRow label="Added on" value={formatDateTime(dealer.created_at)} last />
        </div>

        <div style={CARD_STYLE}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Location</div>
          {mapsUrl ? (
            <a href={mapsUrl} target="_blank" rel="noreferrer" style={{ fontSize: 12.5, color: "#7B2D8B", fontWeight: 700, textDecoration: "none" }}>
              📍 Open in Google Maps ({dealer.location_lat.toFixed(5)}, {dealer.location_lng.toFixed(5)})
            </a>
          ) : (
            <div style={{ fontSize: 12.5, color: "#999" }}>No location on file.</div>
          )}
        </div>

        <div style={CARD_STYLE}>
          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 10 }}>Your visits here</div>
          {loadingVisits ? (
            <div style={{ fontSize: 12.5, color: "#999" }}>Loading…</div>
          ) : visits.length === 0 ? (
            <div style={{ fontSize: 12.5, color: "#999" }}>No visits logged yet.</div>
          ) : (
            visits.map((v) => (
              <div key={v.id} style={{ padding: "10px 0", borderBottom: "1px solid #f2f2f2" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{formatDateTime(v.check_in_at || v.visited_at)}</div>
                  {v.status === "open" ? (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#c98400", background: "#fff4e0", borderRadius: 999, padding: "2px 8px" }}>Still checked in</span>
                  ) : (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "#2fa84f", background: "#e6f7ec", borderRadius: 999, padding: "2px 8px" }}>Checked out</span>
                  )}
                </div>
                {v.notes && <div style={{ fontSize: 11.5, color: "#666", marginTop: 3, lineHeight: 1.5 }}>{v.notes}</div>}
              </div>
            ))
          )}
        </div>

        <button
          onClick={() => navigate("/staff/sales/day-checkin", {
            state: { tab: "checkin", autoCheckInDealer: { id: dealer.id, name: dealer.shop_name } },
          })}
          style={{ width: "100%", padding: 13, border: "none", borderRadius: 10, background: "#7B2D8B", color: "#fff", fontSize: 14, fontWeight: 800, cursor: "pointer" }}
        >
          📍 Check In Here
        </button>
        <div style={{ fontSize: 11, color: "#999", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
          You must be within 100m to check in. If your day isn't started yet, you'll be asked to start it first.
        </div>
      </div>
    </div>
  );
}

function DetailRow({ label, value, last }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: last ? "none" : "1px solid #f5f0f6" }}>
      <div style={{ fontSize: 12, color: "#999" }}>{label}</div>
      <div style={{ fontSize: 12.5, fontWeight: 600, textAlign: "right" }}>{value || "—"}</div>
    </div>
  );
}
