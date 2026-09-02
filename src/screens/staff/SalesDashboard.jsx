import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { staffRoleLabel } from "../../utils/staffRoles";
import { featuresForRole } from "../../utils/staffFeatures";

// Real dashboard for /staff/sales — all three Sales roles (sales_associate,
// senior_sales_associate, senior_sales_executive). Design approved against
// the "richer" mockup (avatar header, stat cards, dealer list).
//
// What's real here: the "My Dealers / Parties" list and its two stat cards
// (count, total outstanding) — all come from get_my_dealers(), a SECURITY
// DEFINER RPC scoped per role (see supabase/migrations/
// sales_dealer_assignment.sql). Dealers only show up once Admin assigns
// them to a rep via AdminDealers' new "Assigned Sales Rep" field.
// "My Visits" is also real now — recent visits logged from a dealer's
// detail screen (get_my_visits(), see supabase/migrations/sales_visits.sql).
//
// What's still "coming soon": territory map, targets, commission, and
// (for Senior tiers) a real team-performance view — none of those have a
// data model yet, so rather than show made-up numbers in a live app,
// those sections stay clearly marked as not built yet.

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const CARD_STYLE = {
  background: "#fff",
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

function StatCard({ icon, value, label }) {
  return (
    <div style={CARD_STYLE}>
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#888", fontWeight: 600, marginTop: 2 }}>{label}</div>
    </div>
  );
}

function DealerRow({ dealer, onClick }) {
  const territories = Array.isArray(dealer.territory) ? dealer.territory : [];
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #f2f2f2", cursor: "pointer" }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: "#f3e6f6", color: "#7B2D8B",
        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
      }}>
        {initials(dealer.name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700 }}>{dealer.name || "Unnamed"}</div>
        <div style={{ fontSize: 11.5, color: "#999", marginTop: 1 }}>
          {dealer.dealer_code || "—"}{territories.length ? ` · ${territories.join(", ")}` : ""}
        </div>
      </div>
      <div style={{ fontSize: 12, fontWeight: 700, color: dealer.outstanding > 0 ? "#d64545" : "#2fa84f", whiteSpace: "nowrap" }}>
        ₹{Number(dealer.outstanding || 0).toLocaleString("en-IN")}
      </div>
      <div style={{ color: "#ccc", fontSize: 14, marginLeft: 2 }}>›</div>
    </div>
  );
}

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function VisitRow({ visit, onClick }) {
  return (
    <div onClick={onClick} style={{ padding: "13px 16px", borderBottom: "1px solid #f2f2f2", cursor: "pointer" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>{visit.dealer_name || "Unnamed"}</div>
        <div style={{ fontSize: 11, color: "#999" }}>{formatDateTime(visit.check_in_at || visit.visited_at)}</div>
      </div>
      <div style={{ marginTop: 3 }}>
        {visit.status === "open" ? (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#c98400", background: "#fff4e0", borderRadius: 999, padding: "2px 8px" }}>Still checked in</span>
        ) : (
          <span style={{ fontSize: 10, fontWeight: 700, color: "#2fa84f", background: "#e6f7ec", borderRadius: 999, padding: "2px 8px" }}>Checked out</span>
        )}
      </div>
      {visit.notes && <div style={{ fontSize: 12, color: "#666", marginTop: 4, lineHeight: 1.5 }}>{visit.notes}</div>}
    </div>
  );
}

// Clickable feature tile — opens the shared ComingSoon placeholder screen
// for that feature. Icon-grid "superapp" look rather than a plain list, so
// the dashboard reads like a complete app even for the sections that
// aren't built out yet.
function FeatureTile({ icon, title, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", borderRadius: 14, padding: "16px 8px", textAlign: "center",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)", cursor: "pointer", position: "relative",
      }}
    >
      <span style={{
        position: "absolute", top: 6, right: 6, fontSize: 8.5, fontWeight: 700, color: "#7B2D8B",
        background: "#f3e6f6", borderRadius: 999, padding: "2px 6px", textTransform: "uppercase", letterSpacing: 0.2,
      }}>
        Soon
      </span>
      <div style={{
        width: 40, height: 40, borderRadius: 12, background: "#f3e6f6",
        display: "flex", alignItems: "center", justifyContent: "center",
        fontSize: 19, margin: "0 auto 8px",
      }}>
        {icon}
      </div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#444", lineHeight: 1.3 }}>{title}</div>
    </div>
  );
}

export default function SalesDashboard() {
  const navigate = useNavigate();
  const { staffProfile, signOut } = useApp();

  const [dealers, setDealers] = useState([]);
  const [loadingDealers, setLoadingDealers] = useState(true);
  const [dealerError, setDealerError] = useState(null);

  const [visits, setVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(true);

  const [openVisit, setOpenVisit] = useState(null);
  const [loadingOpenVisit, setLoadingOpenVisit] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoadingDealers(false); setLoadingVisits(false); setLoadingOpenVisit(false); return; }
    let cancelled = false;
    supabase.rpc("get_my_dealers").then(({ data, error }) => {
      if (cancelled) return;
      if (error) {
        console.error("[SalesDashboard] get_my_dealers failed:", error);
        setDealerError(error.message);
      } else {
        setDealers(data || []);
      }
      setLoadingDealers(false);
    });
    supabase.rpc("get_my_visits", { p_limit: 10 }).then(({ data, error }) => {
      if (cancelled) return;
      if (!error) setVisits(data || []);
      setLoadingVisits(false);
    });
    supabase.rpc("get_my_open_visit").then(({ data, error }) => {
      if (cancelled) return;
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        setOpenVisit(row || null);
      }
      setLoadingOpenVisit(false);
    });
    return () => { cancelled = true; };
  }, []);

  const roleLabel = staffRoleLabel(staffProfile?.role);
  const comingSoon = featuresForRole(staffProfile?.role);
  const totalOutstanding = dealers.reduce((sum, d) => sum + Number(d.outstanding || 0), 0);
  const dealersLabel = staffProfile?.role === "senior_sales_executive" ? "Dealers, Sales dept." : "My dealers / parties";

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "22px 24px 44px", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ fontSize: 18, fontWeight: 800, opacity: 0.9 }}>Eltop Staff</div>
          <button
            onClick={handleLogout}
            style={{ background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.4)", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, color: "#fff", cursor: "pointer" }}
          >
            Log out
          </button>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 16, marginTop: 22 }}>
          <div style={{
            width: 60, height: 60, borderRadius: "50%", background: "rgba(255,255,255,0.25)",
            border: "2px solid rgba(255,255,255,0.6)", display: "flex", alignItems: "center", justifyContent: "center",
            fontSize: 22, fontWeight: 800, color: "#fff", flexShrink: 0,
          }}>
            {initials(staffProfile?.name)}
          </div>
          <div>
            <div style={{ fontSize: 22, fontWeight: 800 }}>
              {staffProfile?.name ? `Welcome, ${staffProfile.name}` : "Welcome"}
            </div>
            <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.85, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.4 }}>
              {roleLabel}
            </div>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "-28px auto 0", padding: "0 20px 60px", position: "relative", zIndex: 2 }}>
        {!loadingOpenVisit && openVisit && (
          <div
            onClick={() => navigate(`/staff/sales/dealer/${openVisit.dealer_id}`)}
            style={{
              background: "#fff8ea", border: "1.5px solid #f3d98a", borderRadius: 12, padding: "12px 16px",
              marginBottom: 16, fontSize: 12.5, fontWeight: 600, color: "#8a6100", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
            }}
          >
            <span>🟢 Checked in at <b>{openVisit.dealer_name}</b> since {formatDateTime(openVisit.check_in_at)} — tap to check out</span>
            <span style={{ fontSize: 14 }}>›</span>
          </div>
        )}

        {!loadingOpenVisit && !openVisit && (
          <button
            onClick={() => navigate("/staff/sales/check-in")}
            style={{
              width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
              background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", border: "none", borderRadius: 14,
              padding: "16px", marginBottom: 16, color: "#fff", fontSize: 15, fontWeight: 800, cursor: "pointer",
              boxShadow: "0 4px 14px rgba(123,45,139,0.3)",
            }}
          >
            <span style={{ fontSize: 20 }}>📍</span> Check In / Start Day
          </button>
        )}

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <StatCard icon="🏬" value={loadingDealers ? "…" : dealers.length} label={dealersLabel} />
          <StatCard icon="₹" value={loadingDealers ? "…" : `₹${totalOutstanding.toLocaleString("en-IN")}`} label="Total outstanding" />
        </div>

        <div style={{ fontSize: 15, fontWeight: 800, margin: "4px 0 12px" }}>My Dealers / Parties</div>
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden", marginBottom: 20 }}>
          {loadingDealers ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>
          ) : dealerError ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#d64545" }}>
              Couldn't load your dealers ({dealerError}).
            </div>
          ) : dealers.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999", lineHeight: 1.6 }}>
              No dealers assigned to you yet.<br />Ask Admin to assign dealers via Dealer Management.
            </div>
          ) : (
            dealers.map((d) => <DealerRow key={d.id} dealer={d} onClick={() => navigate(`/staff/sales/dealer/${d.id}`)} />)
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 800, margin: "4px 0 12px" }}>My Visits</div>
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden", marginBottom: 20 }}>
          {loadingVisits ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>
          ) : visits.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999", lineHeight: 1.6 }}>
              No visits logged yet.<br />Open a dealer to log your first visit.
            </div>
          ) : (
            visits.map((v) => <VisitRow key={v.id} visit={v} onClick={() => navigate(`/staff/sales/dealer/${v.dealer_id}`)} />)
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 800, margin: "4px 0 12px" }}>More</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {comingSoon.map((f) => (
            <FeatureTile key={f.slug} icon={f.icon} title={f.title} onClick={() => navigate(`/staff/sales/coming-soon/${f.slug}`)} />
          ))}
        </div>
      </div>
    </div>
  );
}
