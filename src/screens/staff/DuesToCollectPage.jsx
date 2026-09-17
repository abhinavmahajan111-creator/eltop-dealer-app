import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import DealerRow from "../../components/staff/DealerRow";

// Dedicated page for the dashboard's "₹2,854 · Total outstanding" stat
// tile — previously that tile just scrolled down to the same "My
// Dealers / Parties" list further down the dashboard. This gives it its
// own page instead, with the list sorted highest-dues-first so the
// dealers actually worth chasing are at the top, rather than scrolling
// to the same order the dashboard's own list uses.
export default function DuesToCollectPage() {
  const navigate = useNavigate();
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    supabase.rpc("get_my_dealers").then(({ data, error: err }) => {
      if (cancelled) return;
      if (err) { setError(err.message); setLoading(false); return; }
      setError(null);
      setDealers(data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  const duesSorted = useMemo(
    () => [...dealers].sort((a, b) => Number(b.outstanding || 0) - Number(a.outstanding || 0)),
    [dealers]
  );
  const totalOutstanding = useMemo(
    () => dealers.reduce((sum, d) => sum + Number(d.outstanding || 0), 0),
    [dealers]
  );

  const goToDealer = (d) => {
    if (d.dealer_kind && d.dealer_kind !== "profile") {
      navigate(`/staff/sales/field-dealer/${d.id}`);
    } else {
      navigate(`/staff/sales/dealer/${d.id}`);
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f8ecf6", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 20px 22px", color: "#fff" }}>
        <button
          onClick={() => navigate("/staff/sales")}
          style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 14 }}
        >
          ← Dashboard
        </button>
        <div style={{ fontSize: 18, fontWeight: 800 }}>₹ Dues to collect</div>
        <div style={{ fontSize: 12, opacity: 0.85, marginTop: 2 }}>
          {loading ? "Loading…" : `Total outstanding: ₹${totalOutstanding.toLocaleString("en-IN")}`}
        </div>
      </div>

      <div style={{ maxWidth: 640, margin: "0 auto", padding: "16px 16px 60px" }}>
        <div style={{ background: "#fff", border: "1.5px solid #7B2D8B", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", overflow: "hidden" }}>
          {loading ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>
          ) : error ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#d64545" }}>
              Couldn't load your dealers ({error}).
            </div>
          ) : duesSorted.length === 0 ? (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999", lineHeight: 1.6 }}>
              No dealers assigned to you yet.<br />Ask Admin to assign dealers via Dealer Management.
            </div>
          ) : (
            duesSorted.map((d) => <DealerRow key={d.id} dealer={d} onClick={() => goToDealer(d)} />)
          )}
        </div>
      </div>
    </div>
  );
}
