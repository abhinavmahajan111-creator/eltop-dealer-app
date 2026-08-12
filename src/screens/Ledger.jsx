import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import BottomNav from "../components/BottomNav";
import { useApp } from "../context/AppContext";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function Ledger() {
  const navigate = useNavigate();
  const { state: routeState } = useLocation();
  const { session } = useApp();
  const returnTo = routeState?.returnTo || "/dashboard";

  const [ledger, setLedger] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      if (!isSupabaseConfigured || !session?.user?.id) { setLoading(false); return; }
      const uid = session.user.id;
      const { data } = await supabase
        .from("dealer_ledger")
        .select("id, type, amount, notes, reference_no, created_at")
        .eq("dealer_id", uid)
        .order("created_at", { ascending: false });
      setLedger(data || []);
      setLoading(false);
    }
    load();
  }, [session]);

  const fmt = (n) => Number(n).toLocaleString("en-IN");

  const totalBilled = ledger.filter(l => l.type === "order").reduce((s, l) => s + Number(l.amount), 0);
  const totalPaid   = ledger.filter(l => l.type === "payment").reduce((s, l) => s + Number(l.amount), 0);
  const outstanding = totalBilled - totalPaid;

  const now = new Date();
  const thisMonthPaid = ledger
    .filter(l => {
      const d = new Date(l.created_at);
      return l.type === "payment" &&
        d.getMonth() === now.getMonth() &&
        d.getFullYear() === now.getFullYear();
    })
    .reduce((s, l) => s + Number(l.amount), 0);

  const typeLabel = { order: "Invoice", payment: "Payment", credit_note: "Credit Note" };
  const typeColor = { order: "due", payment: "paid", credit_note: "paid" };

  return (
    <div className="screen" id="screen-ledger">
      <div className="topbar">
        <span className="back" onClick={() => navigate(returnTo)}>&#8592;</span>
        <h1>Ledger / Invoices</h1>
      </div>
      <div className="content">
        {loading ? (
          <div style={{ textAlign: "center", padding: 40, color: "var(--muted)" }}>Loading…</div>
        ) : (
          <>
            <div className="stat-cards">
              <div className="stat-card">
                <div className="stat-label">Total Due</div>
                <div className="stat-value red">Rs. {fmt(outstanding)}</div>
              </div>
              <div className="stat-card">
                <div className="stat-label">This Month Paid</div>
                <div className="stat-value">Rs. {fmt(thisMonthPaid)}</div>
              </div>
            </div>

            <div className="section-title">Invoices</div>

            {ledger.length === 0 ? (
              <div style={{ textAlign: "center", padding: 32, color: "var(--muted)", fontSize: 14 }}>
                No ledger entries yet.
              </div>
            ) : (
              ledger.map((entry) => (
                <div className="ledger-row" key={entry.id}>
                  <div>
                    <div className="ledger-inv">
                      {typeLabel[entry.type] || entry.type}
                      {entry.reference_no ? ` · ${entry.reference_no}` : ""}
                    </div>
                    <div className="ledger-date">
                      {new Date(entry.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                      {entry.notes ? ` — ${entry.notes}` : ""}
                    </div>
                  </div>
                  <div className={`ledger-amt ${typeColor[entry.type] || ""}`}>
                    Rs. {fmt(entry.amount)}
                    <br />
                    <span style={{ fontSize: 10, fontWeight: 400 }}>
                      {entry.type === "payment" ? "Paid" : entry.type === "credit_note" ? "Credit" : "Due"}
                    </span>
                  </div>
                </div>
              ))
            )}
          </>
        )}
      </div>
      <BottomNav />
    </div>
  );
}
