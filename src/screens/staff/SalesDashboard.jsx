import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { staffRoleLabel } from "../../utils/staffRoles";
import { featuresForRole } from "../../utils/staffFeatures";
import DashboardAiCard from "../../components/staff/DashboardAiCard";
import { getCurrentPosition } from "../../utils/visitMedia";

// Real dashboard for /staff/sales — all three Sales roles (sales_associate,
// senior_sales_associate, senior_sales_executive). Design approved against
// the "richer" mockup (avatar header, stat cards, dealer list), then
// reworked again (3 Sep 2026) against a second mockup adding ring-style
// stat cards and an Attendance calendar, inspired by a reference field-app
// screenshot the user shared.
//
// What's real here: the "My Dealers / Parties" list and its two stat cards
// (count, total outstanding) — all come from get_my_dealers(), a SECURITY
// DEFINER RPC scoped per role (see supabase/migrations/
// sales_dealer_assignment.sql). Dealers only show up once Admin assigns
// them to a rep via AdminDealers' new "Assigned Sales Rep" field.
// "My Visits" is also real now — recent visits logged from a dealer's
// detail screen (get_my_visits(), see supabase/migrations/sales_visits.sql).
// The header's two ring stats are real too: "Today's Visits" is derived
// from that same visits list (filtered to today), and "This Month" comes
// from get_my_attendance_month() (see supabase/migrations/
// sales_attendance.sql) — tapping it opens the new Attendance screen,
// which shares the same RPC for its full calendar.
//
// What's still "coming soon": territory map, targets, commission, leaves,
// expenses, and (for Senior tiers) a real team-performance view — none of
// those have a data model yet, so rather than show made-up numbers in a
// live app, those sections stay clearly marked as not built yet.

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const CARD_STYLE = {
  background: "#fff",
  border: "1.5px solid #7B2D8B",
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

function StatCard({ icon, value, label, onClick }) {
  return (
    <div
      onClick={onClick}
      style={onClick ? { ...CARD_STYLE, cursor: "pointer" } : CARD_STYLE}
    >
      <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }}>{value}</div>
      <div style={{ fontSize: 12, color: "#888", fontWeight: 600, marginTop: 2 }}>
        {label}{onClick ? " ›" : ""}
      </div>
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
        <div style={{ fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
          {dealer.name || "Unnamed"}
          {dealer.dealer_kind && dealer.dealer_kind !== "profile" && (
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "#c98400", background: "#fff4e0", borderRadius: 999, padding: "2px 7px" }}>
              🆕 New
            </span>
          )}
        </div>
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
        background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14, padding: "16px 8px", textAlign: "center",
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

// Same tile look as FeatureTile, minus the "Soon" badge — for real,
// already-built shortcuts (My Dealers, My Visits, Attendance).
function NavTile({ icon, title, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14, padding: "16px 8px", textAlign: "center",
        boxShadow: "0 2px 10px rgba(0,0,0,0.05)", cursor: "pointer",
      }}
    >
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

// Circular progress "ring" stat — used for Today's Visits / This Month
// attendance in the header. `value`/`total` drive both the fraction drawn
// and the "n/N" label; total===0 just draws an empty ring rather than
// dividing by zero.
const RING_RADIUS = 34;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;

function RingStat({ title, value, total, sub, onClick }) {
  const fraction = total > 0 ? Math.max(0, Math.min(1, value / total)) : 0;
  const offset = RING_CIRCUMFERENCE * (1 - fraction);
  return (
    <div
      onClick={onClick}
      style={{
        flex: 1, background: "#fff", borderRadius: 16, padding: "14px 10px 16px", textAlign: "center",
        boxShadow: "0 4px 16px rgba(0,0,0,0.12)", border: "1.5px solid #7B2D8B", cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800, color: "#333", marginBottom: 10, textAlign: "left", paddingLeft: 2 }}>{title}</div>
      <div style={{ position: "relative", width: 84, height: 84, margin: "0 auto" }}>
        <svg width={84} height={84} style={{ transform: "rotate(-90deg)" }}>
          <circle cx={42} cy={42} r={RING_RADIUS} fill="none" stroke="#f0e2f2" strokeWidth={8} />
          <circle
            cx={42} cy={42} r={RING_RADIUS} fill="none" stroke="#7B2D8B" strokeWidth={8} strokeLinecap="round"
            strokeDasharray={RING_CIRCUMFERENCE} strokeDashoffset={offset}
            style={{ transition: "stroke-dashoffset 0.6s ease" }}
          />
        </svg>
        <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#222" }}>{value}/{total}</div>
          <div style={{ fontSize: 9.5, color: "#999", fontWeight: 700 }}>{sub}</div>
        </div>
      </div>
    </div>
  );
}

export default function SalesDashboard() {
  const navigate = useNavigate();
  const { staffProfile, signOut } = useApp();
  const dealersSectionRef = useRef(null);
  const visitsSectionRef = useRef(null);

  const [dealers, setDealers] = useState([]);
  const [loadingDealers, setLoadingDealers] = useState(true);
  const [dealerError, setDealerError] = useState(null);

  const [visits, setVisits] = useState([]);
  const [loadingVisits, setLoadingVisits] = useState(true);

  const [openVisit, setOpenVisit] = useState(null);
  const [loadingOpenVisit, setLoadingOpenVisit] = useState(true);

  // Whether the rep has started their day (bike/vehicle meter-reading
  // photo) yet today — separate from, and required before, checking in
  // at any shop. See supabase/migrations/sales_start_day.sql.
  const [dayStart, setDayStart] = useState(null);
  const [loadingDayStart, setLoadingDayStart] = useState(true);

  // "This Month" attendance ring — just the current month's present-day
  // count from the same RPC the Attendance screen's calendar uses. See
  // supabase/migrations/sales_attendance.sql.
  const [presentThisMonth, setPresentThisMonth] = useState(0);
  const [loadingAttendance, setLoadingAttendance] = useState(true);

  // AI assistant is a small trigger chip under "Log out" (approved change
  // from the full inline card that used to sit at the top of the page) —
  // opens the same DashboardAiCard as a modal on tap.
  const [aiOpen, setAiOpen] = useState(false);

  // "+ Add New Dealer" — same field-add capability as the Day/Check-In
  // screen, but reachable straight from the Dashboard so a rep doesn't
  // have to start their day first just to log a new lead. add_field_dealer
  // itself has no day-start requirement (only check-in/checkout does), so
  // this was purely a UI gap, not a backend one — requested 10 Sept 2026.
  const [showAddDealer, setShowAddDealer] = useState(false);
  const [newShopName, setNewShopName] = useState("");
  const [newOwnerName, setNewOwnerName] = useState("");
  const [newWhatsapp, setNewWhatsapp] = useState("");
  const [newAlternate, setNewAlternate] = useState("");
  const [newAddress, setNewAddress] = useState("");
  const [addingDealer, setAddingDealer] = useState(false);
  const [addDealerError, setAddDealerError] = useState(null);
  const [dupMatches, setDupMatches] = useState([]);
  const [checkingDup, setCheckingDup] = useState(false);
  const dupTimerRef = useRef(null);

  useEffect(() => {
    if (dupTimerRef.current) clearTimeout(dupTimerRef.current);
    const w = newWhatsapp.trim();
    const a = newAlternate.trim();
    if (w.length < 6 && a.length < 6) {
      setDupMatches([]);
      return;
    }
    dupTimerRef.current = setTimeout(async () => {
      setCheckingDup(true);
      try {
        const { data, error } = await supabase.rpc("check_duplicate_dealer_phone", {
          p_whatsapp: w.length >= 6 ? w : null,
          p_alternate: a.length >= 6 ? a : null,
        });
        setDupMatches(error ? [] : data || []);
      } catch {
        setDupMatches([]);
      } finally {
        setCheckingDup(false);
      }
    }, 600);
    return () => { if (dupTimerRef.current) clearTimeout(dupTimerRef.current); };
  }, [newWhatsapp, newAlternate]);

  const loadDealers = () => {
    setLoadingDealers(true);
    return supabase.rpc("get_my_dealers").then(({ data, error }) => {
      if (error) {
        console.error("[SalesDashboard] get_my_dealers failed:", error);
        setDealerError(error.message);
      } else {
        setDealerError(null);
        setDealers(data || []);
      }
      setLoadingDealers(false);
    });
  };

  const handleAddDealer = async () => {
    setAddDealerError(null);
    if (!newShopName.trim()) { setAddDealerError("Shop name is required."); return; }
    if (!newWhatsapp.trim()) { setAddDealerError("WhatsApp number is required."); return; }
    setAddingDealer(true);
    try {
      const pos = await getCurrentPosition();
      const { data, error } = await supabase.rpc("add_field_dealer", {
        p_shop_name: newShopName.trim(),
        p_owner_name: newOwnerName.trim() || null,
        p_whatsapp_number: newWhatsapp.trim(),
        p_alternate_number: newAlternate.trim() || null,
        p_address: newAddress.trim() || null,
        p_latitude: pos.latitude,
        p_longitude: pos.longitude,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setAddDealerError(error?.message || result?.message || "Couldn't add this dealer.");
      } else {
        setNewShopName(""); setNewOwnerName(""); setNewWhatsapp(""); setNewAlternate(""); setNewAddress("");
        setDupMatches([]);
        setShowAddDealer(false);
        await loadDealers();
      }
    } catch (err) {
      setAddDealerError(err.message || "Couldn't get your location.");
    } finally {
      setAddingDealer(false);
    }
  };

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoadingDealers(false); setLoadingVisits(false); setLoadingOpenVisit(false); setLoadingDayStart(false);
      setLoadingAttendance(false);
      return;
    }
    let cancelled = false;
    loadDealers();
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
    supabase.rpc("get_my_day_start").then(({ data, error }) => {
      if (cancelled) return;
      if (!error) {
        const row = Array.isArray(data) ? data[0] : data;
        setDayStart(row || null);
      }
      setLoadingDayStart(false);
    });
    const now = new Date();
    supabase.rpc("get_my_attendance_month", { p_year: now.getFullYear(), p_month: now.getMonth() + 1 }).then(({ data, error }) => {
      if (cancelled) return;
      if (!error) setPresentThisMonth((data || []).length);
      setLoadingAttendance(false);
    });
    return () => { cancelled = true; };
  }, []);

  const roleLabel = staffRoleLabel(staffProfile?.role);
  const comingSoon = featuresForRole(staffProfile?.role);
  const totalOutstanding = dealers.reduce((sum, d) => sum + Number(d.outstanding || 0), 0);
  const dealersLabel = staffProfile?.role === "senior_sales_executive" ? "Dealers, Sales dept." : "My dealers / parties";

  const todayStr = new Date().toDateString();
  const visitsToday = visits.filter((v) => {
    const ts = v.check_in_at || v.visited_at;
    return ts && new Date(ts).toDateString() === todayStr;
  }).length;
  const daysElapsedThisMonth = new Date().getDate();

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "22px 24px 44px", color: "#fff" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <img
              src="/assets/ELTOP%20LOGO.png"
              alt="Eltop"
              style={{ height: 22, width: "auto", filter: "brightness(0) invert(1)" }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
            <img
              src="/assets/EMBASSY%20LOGO.png"
              alt="Embassy"
              style={{ height: 20, width: "auto", filter: "brightness(0) invert(1)" }}
              onError={(e) => { e.target.style.display = "none"; }}
            />
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
            <button
              onClick={handleLogout}
              style={{ background: "rgba(255,255,255,0.15)", border: "1.5px solid rgba(255,255,255,0.4)", borderRadius: 8, padding: "7px 14px", fontSize: 12.5, fontWeight: 700, color: "#fff", cursor: "pointer" }}
            >
              Log out
            </button>
            <button
              onClick={() => setAiOpen(true)}
              style={{
                display: "flex", alignItems: "center", gap: 5, background: "rgba(255,255,255,0.15)",
                border: "1.5px solid rgba(255,255,255,0.4)", borderRadius: 999, padding: "6px 12px",
                fontSize: 11.5, fontWeight: 700, color: "#fff", cursor: "pointer",
              }}
            >
              ✨ Ask AI
            </button>
          </div>
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

        {/* Day-start / check-in CTA lives inside the purple header itself —
            keeping it out of the white content area below (which uses a
            negative top-margin to float its stat cards over the header's
            bottom edge) avoids the purple-on-purple seam a gradient button
            created there before. Everything here routes into the combined
            Day / Check In screen — its own tabs handle the rest. */}
        <div style={{ marginTop: 20 }}>
          {!loadingOpenVisit && openVisit && (
            <div
              onClick={() => navigate("/staff/sales/day-checkin")}
              style={{
                background: "#fff8ea", border: "1.5px solid #f3d98a", borderRadius: 12, padding: "12px 16px",
                fontSize: 12.5, fontWeight: 600, color: "#8a6100", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10,
              }}
            >
              <span>🟢 Checked in at <b>{openVisit.dealer_name}</b> since {formatDateTime(openVisit.check_in_at)} — tap to check out</span>
              <span style={{ fontSize: 14 }}>›</span>
            </div>
          )}

          {!loadingOpenVisit && !openVisit && !loadingDayStart && !dayStart && (
            <button
              onClick={() => navigate("/staff/sales/day-checkin")}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                background: "#fff", border: "none", borderRadius: 14,
                padding: "16px", color: "#7B2D8B", fontSize: 15, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
              }}
            >
              <span style={{ fontSize: 20 }}>🛵</span> Start Day
            </button>
          )}

          {!loadingOpenVisit && !openVisit && !loadingDayStart && dayStart && !dayStart.ended_at && (
            <div style={{ display: "flex", gap: 10 }}>
              <button
                onClick={() => navigate("/staff/sales/day-checkin", { state: { tab: "day" } })}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: "#fff", border: "none", borderRadius: 14,
                  padding: "16px 8px", color: "#7B2D8B", fontSize: 14, fontWeight: 800, cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                }}
              >
                <span style={{ fontSize: 18 }}>🛵</span> Day
              </button>
              <button
                onClick={() => navigate("/staff/sales/day-checkin", { state: { tab: "checkin" } })}
                style={{
                  flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                  background: "#fff", border: "none", borderRadius: 14,
                  padding: "16px 8px", color: "#7B2D8B", fontSize: 14, fontWeight: 800, cursor: "pointer",
                  boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
                }}
              >
                <span style={{ fontSize: 18 }}>📍</span> Check In
              </button>
            </div>
          )}

          {!loadingOpenVisit && !openVisit && !loadingDayStart && dayStart?.ended_at && (
            <button
              onClick={() => navigate("/staff/sales/day-checkin")}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
                background: "#fff", border: "none", borderRadius: 14,
                padding: "16px", color: "#7B2D8B", fontSize: 15, fontWeight: 800, cursor: "pointer",
                boxShadow: "0 4px 14px rgba(0,0,0,0.18)",
              }}
            >
              <span style={{ fontSize: 20 }}>✅</span> Day ended — view summary
            </button>
          )}
        </div>

        <div style={{ display: "flex", gap: 12, marginTop: 18, paddingBottom: 4 }}>
          <RingStat
            title="Today's Visits"
            value={loadingVisits ? 0 : visitsToday}
            total={loadingDealers ? 0 : dealers.length}
            sub="dealers"
            onClick={() => visitsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
          <RingStat
            title="This Month"
            value={loadingAttendance ? 0 : presentThisMonth}
            total={daysElapsedThisMonth}
            sub="present"
            onClick={() => navigate("/staff/sales/attendance")}
          />
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "-28px auto 0", padding: "0 20px 60px", position: "relative", zIndex: 2 }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 20 }}>
          <StatCard icon="🏬" value={loadingDealers ? "…" : dealers.length} label={dealersLabel} />
          <StatCard
            icon="₹"
            value={loadingDealers ? "…" : `₹${totalOutstanding.toLocaleString("en-IN")}`}
            label="Total outstanding"
            onClick={() => dealersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
          />
        </div>

        <div style={{ fontSize: 15, fontWeight: 800, margin: "4px 0 12px" }}>Sales</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
          <NavTile icon="🏬" title="My Dealers" onClick={() => dealersSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          <NavTile icon="📍" title="My Visits" onClick={() => visitsSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" })} />
          <NavTile icon="🗓️" title="Attendance" onClick={() => navigate("/staff/sales/attendance")} />
        </div>

        <div ref={dealersSectionRef} style={{ fontSize: 15, fontWeight: 800, margin: "4px 0 12px" }}>My Dealers / Parties</div>

        <button
          onClick={() => { setShowAddDealer((v) => !v); setAddDealerError(null); setDupMatches([]); }}
          style={{ width: "100%", padding: 11, marginBottom: 12, border: "1.5px dashed #7B2D8B", borderRadius: 10, background: showAddDealer ? "#f8f0f9" : "#fff", color: "#7B2D8B", fontSize: 13, fontWeight: 800, cursor: "pointer" }}
        >
          {showAddDealer ? "✕ Cancel" : "+ Add New Dealer"}
        </button>

        {showAddDealer && (
          <div style={{ background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14, padding: 16, marginBottom: 14, boxShadow: "0 2px 8px rgba(123,45,139,0.06)" }}>
            <div style={{ fontSize: 12.5, color: "#888", lineHeight: 1.5, marginBottom: 10 }}>
              Add a brand-new shop right now — it'll appear in your list below tagged "New". Start your day and check in to log a visit there whenever you're ready.
            </div>
            <input
              value={newShopName}
              onChange={(e) => setNewShopName(e.target.value)}
              placeholder="Shop name *"
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
            />
            <input
              value={newOwnerName}
              onChange={(e) => setNewOwnerName(e.target.value)}
              placeholder="Owner name (optional)"
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
            />
            <input
              value={newWhatsapp}
              onChange={(e) => setNewWhatsapp(e.target.value)}
              placeholder="WhatsApp number *"
              inputMode="tel"
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
            />
            <input
              value={newAlternate}
              onChange={(e) => setNewAlternate(e.target.value)}
              placeholder="Alternate number (optional)"
              inputMode="tel"
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 8, boxSizing: "border-box" }}
            />
            {checkingDup && (
              <div style={{ fontSize: 11.5, color: "#999", marginBottom: 8 }}>Checking for existing matches…</div>
            )}
            {!checkingDup && dupMatches.length > 0 && (
              <div style={{ background: "#fff4e0", border: "1.5px solid #f0c470", borderRadius: 8, padding: "9px 11px", marginBottom: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: "#a56a00", marginBottom: 4 }}>
                  ⚠️ This number is already on file
                </div>
                {dupMatches.map((m, i) => (
                  <div key={i} style={{ fontSize: 11.5, color: "#8a5a00", marginBottom: 2 }}>
                    "{m.name}" ({m.matched_number}) — {m.extra}
                  </div>
                ))}
                <div style={{ fontSize: 11, color: "#a56a00", marginTop: 4 }}>
                  Same shop? Use the existing one instead of adding again. If it's genuinely a different shop, go ahead — this is just a heads-up.
                </div>
              </div>
            )}
            <input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Address (optional)"
              style={{ width: "100%", padding: "10px 12px", border: "1.5px solid #eadcec", borderRadius: 8, fontSize: 13, marginBottom: 10, boxSizing: "border-box" }}
            />
            <button
              onClick={handleAddDealer}
              disabled={addingDealer || !newShopName.trim() || !newWhatsapp.trim()}
              style={{ width: "100%", padding: 12, border: "none", borderRadius: 10, background: addingDealer ? "#c9a8d1" : "#7B2D8B", color: "#fff", fontSize: 13.5, fontWeight: 800, cursor: addingDealer ? "default" : "pointer" }}
            >
              {addingDealer ? "Adding…" : "📍 Add Dealer at My Current Location"}
            </button>
            {addDealerError && <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: "#d64545" }}>{addDealerError}</div>}
          </div>
        )}

        <div style={{ background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden", marginBottom: 20 }}>
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
            dealers.map((d) => (
              <DealerRow
                key={d.id}
                dealer={d}
                onClick={() => {
                  // A dealer someone added straight from the field isn't a
                  // real onboarded account yet — no ledger/orders exist for
                  // it, so there's no CRM detail page to show. Send them to
                  // Check In instead, where check-in/checkout already works
                  // on it right away.
                  if (d.dealer_kind && d.dealer_kind !== "profile") {
                    navigate("/staff/sales/day-checkin", { state: { tab: "checkin" } });
                  } else {
                    navigate(`/staff/sales/dealer/${d.id}`);
                  }
                }}
              />
            ))
          )}
        </div>

        <div ref={visitsSectionRef} style={{ fontSize: 15, fontWeight: 800, margin: "4px 0 12px" }}>My Visits</div>
        <div style={{ background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden", marginBottom: 20 }}>
          {loadingVisits ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>
          ) : visits.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999", lineHeight: 1.6 }}>
              No visits logged yet.<br />Open a dealer to log your first visit.
            </div>
          ) : (
            visits.map((v) => (
              <VisitRow
                key={v.id}
                visit={v}
                onClick={() => {
                  if (v.is_field_dealer) {
                    navigate("/staff/sales/day-checkin", { state: { tab: "checkin" } });
                  } else {
                    navigate(`/staff/sales/dealer/${v.dealer_id}`);
                  }
                }}
              />
            ))
          )}
        </div>

        <div style={{ fontSize: 15, fontWeight: 800, margin: "4px 0 12px" }}>More</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
          {comingSoon.map((f) => (
            <FeatureTile key={f.slug} icon={f.icon} title={f.title} onClick={() => navigate(`/staff/sales/coming-soon/${f.slug}`)} />
          ))}
        </div>
      </div>

      {aiOpen && (
        <div
          onClick={() => setAiOpen(false)}
          style={{
            position: "fixed", inset: 0, background: "rgba(20,10,25,0.5)", zIndex: 50,
            display: "flex", alignItems: "flex-end", justifyContent: "center",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ width: "100%", maxWidth: 640, maxHeight: "85vh", overflowY: "auto", padding: "16px 16px calc(16px + env(safe-area-inset-bottom))" }}
          >
            <DashboardAiCard
              repName={staffProfile?.name}
              dealers={dealers}
              visitsToday={visits.filter((v) => {
                const ts = v.check_in_at || v.visited_at;
                return ts && new Date(ts).toDateString() === todayStr;
              })}
              onClose={() => setAiOpen(false)}
            />
          </div>
        </div>
      )}
    </div>
  );
}
