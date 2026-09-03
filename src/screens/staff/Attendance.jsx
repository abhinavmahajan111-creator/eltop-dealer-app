import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

// Monthly attendance calendar — approved from a mockup. A day counts as
// "present" simply by starting it (sales_day_starts, via the Day tab), so
// there's no separate punch-in here — just a read-only view driven by
// get_my_attendance_month() (see supabase/migrations/sales_attendance.sql).
//
// Leaves and Holidays are shown as a fixed 0 — neither is a real feature
// yet (no leave-request flow or holiday calendar), same as Territory /
// Targets / Commission stay marked "Soon" elsewhere in the app rather than
// showing made-up numbers.

const DOW = ["M", "T", "W", "T", "F", "S", "S"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const CAL_CARD_STYLE = {
  background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14,
  padding: "14px 8px 6px", boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

const STAT_CARD_STYLE = {
  flex: 1, background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14,
  padding: "14px 6px", textAlign: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

// Monday-first weekday index (0=Mon .. 6=Sun) for the 1st of a given
// year/month (1-12).
function firstWeekdayIndex(year, month) {
  const jsDay = new Date(year, month - 1, 1).getDay(); // 0=Sun..6=Sat
  return (jsDay + 6) % 7;
}

function daysInMonth(year, month) {
  return new Date(year, month, 0).getDate();
}

export default function Attendance() {
  const navigate = useNavigate();
  const now = useMemo(() => new Date(), []);
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-12

  const [presentDays, setPresentDays] = useState(new Set());
  const [loading, setLoading] = useState(true);

  const isCurrentMonth = viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1;

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    supabase.rpc("get_my_attendance_month", { p_year: viewYear, p_month: viewMonth }).then(({ data, error }) => {
      if (cancelled) return;
      if (!error) {
        const days = new Set((data || []).map((r) => new Date(r.work_date).getDate()));
        setPresentDays(days);
      }
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [viewYear, viewMonth]);

  const goPrevMonth = () => {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  };
  const goNextMonth = () => {
    if (isCurrentMonth) return; // no future months
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
  };

  const leadingBlanks = firstWeekdayIndex(viewYear, viewMonth);
  const totalDays = daysInMonth(viewYear, viewMonth);
  const today = isCurrentMonth ? now.getDate() : null;

  const cells = [];
  for (let i = 0; i < leadingBlanks; i++) cells.push(null);
  for (let d = 1; d <= totalDays; d++) cells.push(d);

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 20px 22px", color: "#fff" }}>
        <button
          onClick={() => navigate("/staff/sales")}
          style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14 }}
        >
          ← Dashboard
        </button>
        <div style={{ fontSize: 18, fontWeight: 800 }}>🗓️ Attendance</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
          Every day you start counts as present — no separate punch needed.
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 4px 12px" }}>
          <span
            onClick={goPrevMonth}
            style={{ fontSize: 18, fontWeight: 800, color: "#7B2D8B", cursor: "pointer", padding: "4px 10px" }}
          >
            ‹
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: "#333" }}>
            {MONTH_NAMES[viewMonth - 1]} {viewYear}
          </span>
          <span
            onClick={goNextMonth}
            style={{
              fontSize: 18, fontWeight: 800, padding: "4px 10px",
              color: isCurrentMonth ? "#ddd" : "#7B2D8B",
              cursor: isCurrentMonth ? "default" : "pointer",
            }}
          >
            ›
          </span>
        </div>

        <div style={CAL_CARD_STYLE}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 2, textAlign: "center" }}>
            {DOW.map((d, i) => (
              <div key={i} style={{ fontSize: 10.5, fontWeight: 800, color: "#999", padding: "6px 0 10px" }}>{d}</div>
            ))}
            {cells.map((d, i) => (
              <div key={i} style={{ padding: "8px 0 10px" }}>
                {d && (
                  <>
                    <div style={
                      d === today
                        ? { fontSize: 12.5, fontWeight: 700, background: "#7B2D8B", color: "#fff", borderRadius: "50%", width: 22, height: 22, display: "inline-flex", alignItems: "center", justifyContent: "center" }
                        : { fontSize: 12.5, fontWeight: 700, color: "#333" }
                    }>
                      {d}
                    </div>
                    {presentDays.has(d) && (
                      <div style={{ width: 5, height: 5, borderRadius: "50%", background: "#2fa84f", margin: "4px auto 0" }} />
                    )}
                  </>
                )}
              </div>
            ))}
          </div>
        </div>

        <div style={{ display: "flex", gap: 14, justifyContent: "center", padding: "12px 0 4px", fontSize: 10, color: "#888", fontWeight: 600 }}>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <i style={{ width: 6, height: 6, borderRadius: "50%", background: "#2fa84f", display: "inline-block" }} /> Present
          </span>
        </div>

        <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
          <div style={STAT_CARD_STYLE}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#2fa84f" }}>{loading ? "…" : presentDays.size}</div>
            <div style={{ fontSize: 10.5, color: "#888", fontWeight: 700, marginTop: 4 }}>Present</div>
          </div>
          <div style={STAT_CARD_STYLE}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#d64545" }}>0</div>
            <div style={{ fontSize: 10.5, color: "#888", fontWeight: 700, marginTop: 4 }}>Leaves</div>
          </div>
          <div style={STAT_CARD_STYLE}>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#c98400" }}>0</div>
            <div style={{ fontSize: 10.5, color: "#888", fontWeight: 700, marginTop: 4 }}>Holidays</div>
          </div>
        </div>
        <div style={{ fontSize: 11, color: "#999", textAlign: "center", marginTop: 10, lineHeight: 1.5 }}>
          Leaves and Holidays aren't tracked yet — coming soon.
        </div>
      </div>
    </div>
  );
}
