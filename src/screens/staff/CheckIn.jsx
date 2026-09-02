import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { getCurrentPosition } from "../../utils/visitMedia";

// "Check In" entry point reached from the Sales dashboard's Check In
// button (only shown once the day is started) — pick the dealer here,
// then confirm check-in. No photo required at shop check-in anymore —
// that moved to Start Day (bike/vehicle meter reading, captured once per
// day, anywhere). Lands on that dealer's detail screen afterwards, ready
// for check-out later.

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function CheckIn() {
  const navigate = useNavigate();

  const [dealers, setDealers] = useState([]);
  const [loadingDealers, setLoadingDealers] = useState(true);
  const [dealerError, setDealerError] = useState(null);
  const [search, setSearch] = useState("");

  const [openVisit, setOpenVisit] = useState(null);
  const [loadingOpenVisit, setLoadingOpenVisit] = useState(true);

  const [dayStart, setDayStart] = useState(null);
  const [loadingDayStart, setLoadingDayStart] = useState(true);

  const [checkingInId, setCheckingInId] = useState(null);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoadingDealers(false); setLoadingOpenVisit(false); setLoadingDayStart(false);
      return;
    }
    let cancelled = false;
    supabase.rpc("get_my_dealers").then(({ data, error }) => {
      if (cancelled) return;
      if (error) setDealerError(error.message);
      else setDealers(data || []);
      setLoadingDealers(false);
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
    return () => { cancelled = true; };
  }, []);

  const filteredDealers = dealers.filter((d) => {
    if (!search.trim()) return true;
    const q = search.trim().toLowerCase();
    return (d.name || "").toLowerCase().includes(q) || (d.dealer_code || "").toLowerCase().includes(q);
  });

  const handleCheckIn = async (dealer) => {
    setStatus(null);
    setCheckingInId(dealer.id);
    try {
      const pos = await getCurrentPosition();
      const { data, error } = await supabase.rpc("start_dealer_visit", {
        p_dealer_id: dealer.id,
        p_latitude: pos.latitude,
        p_longitude: pos.longitude,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setStatus({ type: "error", message: error?.message || result?.message || "Couldn't check in." });
        setCheckingInId(null);
      } else {
        navigate(`/staff/sales/dealer/${dealer.id}`);
      }
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Couldn't check in." });
      setCheckingInId(null);
    }
  };

  const loading = loadingDealers || loadingOpenVisit || loadingDayStart;

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 24px 34px", color: "#fff" }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}
        >
          ← Back
        </button>
        <div style={{ fontSize: 20, fontWeight: 800 }}>📍 Check In</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>Which dealer are you visiting?</div>
      </div>

      <div style={{ maxWidth: 560, margin: "-18px auto 0", padding: "0 20px 60px", position: "relative", zIndex: 2 }}>
        {loading ? null : !dayStart ? (
          <div style={{
            background: "#fff8ea", border: "1.5px solid #f3d98a", borderRadius: 12, padding: "14px 16px",
            marginBottom: 16, fontSize: 12.5, fontWeight: 600, color: "#8a6100", lineHeight: 1.6,
          }}>
            You haven't started your day yet. Start your day first (a quick meter-reading photo), then come back to check in.
            <button
              onClick={() => navigate("/staff/sales/start-day")}
              style={{ display: "block", marginTop: 10, width: "100%", padding: "9px", border: "1.5px solid #8a6100", borderRadius: 8, background: "#fff", color: "#8a6100", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
            >
              🛵 Start Day
            </button>
          </div>
        ) : openVisit ? (
          <div style={{
            background: "#fff8ea", border: "1.5px solid #f3d98a", borderRadius: 12, padding: "14px 16px",
            marginBottom: 16, fontSize: 12.5, fontWeight: 600, color: "#8a6100", lineHeight: 1.6,
          }}>
            You're already checked in at <b>{openVisit.dealer_name}</b>. Check out there before starting a new visit.
            <button
              onClick={() => navigate(`/staff/sales/dealer/${openVisit.dealer_id}`)}
              style={{ display: "block", marginTop: 10, width: "100%", padding: "9px", border: "1.5px solid #8a6100", borderRadius: 8, background: "#fff", color: "#8a6100", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
            >
              Go check out at {openVisit.dealer_name}
            </button>
          </div>
        ) : (
          <>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search your dealers…"
              style={{ width: "100%", padding: "12px 14px", border: "1.5px solid #eee", borderRadius: 10, fontSize: 13.5, marginBottom: 14, boxSizing: "border-box", background: "#fff" }}
            />
            {status && (
              <div style={{ marginBottom: 12, fontSize: 12, fontWeight: 600, color: "#d64545" }}>
                {status.message}
              </div>
            )}
            <div style={{ fontSize: 11, color: "#999", marginBottom: 10, lineHeight: 1.5 }}>
              You must be within 100m of a dealer to check in there. Tap a dealer to confirm.
            </div>
            <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden" }}>
              {loadingDealers ? (
                <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>
              ) : dealerError ? (
                <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#d64545" }}>Couldn't load your dealers ({dealerError}).</div>
              ) : filteredDealers.length === 0 ? (
                <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>
                  {dealers.length === 0 ? "No dealers assigned to you yet." : "No dealers match your search."}
                </div>
              ) : (
                filteredDealers.map((d) => (
                  <div
                    key={d.id}
                    onClick={() => (checkingInId ? null : handleCheckIn(d))}
                    style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #f2f2f2", cursor: checkingInId ? "default" : "pointer", opacity: checkingInId && checkingInId !== d.id ? 0.5 : 1 }}
                  >
                    <div style={{
                      width: 36, height: 36, borderRadius: 10, background: "#f3e6f6", color: "#7B2D8B",
                      display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
                    }}>
                      {initials(d.name)}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{d.name || "Unnamed"}</div>
                      <div style={{ fontSize: 11.5, color: "#999", marginTop: 1 }}>{d.dealer_code || "—"}</div>
                    </div>
                    <div style={{ fontSize: 11.5, fontWeight: 700, color: "#7B2D8B" }}>
                      {checkingInId === d.id ? "Checking in…" : "Check in ›"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
