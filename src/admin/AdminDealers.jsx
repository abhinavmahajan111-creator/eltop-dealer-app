import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function AdminDealers() {
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  // Local discount edits: { [dealerId]: { discount1, discount2 } }
  const [discountEdits, setDiscountEdits] = useState({});

  const loadDealers = () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("profiles")
      .select("id, name, email, created_at, is_blocked, discount1, discount2")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) {
          setDealers(data);
          // Seed edit state from DB values
          const edits = {};
          data.forEach((d) => {
            edits[d.id] = {
              discount1: d.discount1 ?? 0,
              discount2: d.discount2 ?? 0,
            };
          });
          setDiscountEdits(edits);
        }
        setLoading(false);
      });
  };

  useEffect(() => { loadDealers(); }, []);

  const toggleBlocked = async (dealer) => {
    setSavingId(dealer.id + "_block");
    const nextBlocked = !dealer.is_blocked;
    await supabase.from("profiles").update({ is_blocked: nextBlocked }).eq("id", dealer.id);
    setDealers((prev) =>
      prev.map((d) => (d.id === dealer.id ? { ...d, is_blocked: nextBlocked } : d))
    );
    setSavingId(null);
  };

  const saveDiscounts = async (dealerId) => {
    const { discount1, discount2 } = discountEdits[dealerId] || {};
    setSavingId(dealerId + "_disc");
    await supabase
      .from("profiles")
      .update({ discount1: Number(discount1) || 0, discount2: Number(discount2) || 0 })
      .eq("id", dealerId);
    setDealers((prev) =>
      prev.map((d) =>
        d.id === dealerId
          ? { ...d, discount1: Number(discount1) || 0, discount2: Number(discount2) || 0 }
          : d
      )
    );
    setSavingId(null);
  };

  const setEdit = (dealerId, field, value) => {
    setDiscountEdits((prev) => ({
      ...prev,
      [dealerId]: { ...prev[dealerId], [field]: value },
    }));
  };

  const dealerName = (d) =>
    d.name && d.name !== "New Dealer" ? d.name : d.email || "Unknown";

  return (
    <div className="admin-page">
      <h1 className="admin-title">Dealers</h1>
      {loading ? (
        <div className="admin-loading">Loading&hellip;</div>
      ) : dealers.length === 0 ? (
        <div className="admin-empty">No dealers yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name / Email</th>
                <th>Created</th>
                <th style={{ whiteSpace: "nowrap" }}>Discount 1 (%)</th>
                <th style={{ whiteSpace: "nowrap" }}>Discount 2 (%)</th>
                <th>Net Formula</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dealers.map((d) => {
                const edit = discountEdits[d.id] || { discount1: 0, discount2: 0 };
                const d1 = Number(edit.discount1) || 0;
                const d2 = Number(edit.discount2) || 0;
                const multiplier = (1 - d1 / 100) * (1 - d2 / 100);
                const savingDisc = savingId === d.id + "_disc";
                const savingBlock = savingId === d.id + "_block";

                return (
                  <tr key={d.id}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{dealerName(d)}</div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.email}</div>
                    </td>
                    <td>{new Date(d.created_at).toLocaleDateString()}</td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={edit.discount1}
                        onChange={(e) => setEdit(d.id, "discount1", e.target.value)}
                        style={{ width: 70, marginBottom: 0, padding: "5px 8px", fontSize: 13 }}
                      />
                    </td>
                    <td>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        step="0.5"
                        value={edit.discount2}
                        onChange={(e) => setEdit(d.id, "discount2", e.target.value)}
                        style={{ width: 70, marginBottom: 0, padding: "5px 8px", fontSize: 13 }}
                      />
                    </td>
                    <td style={{ fontSize: 12, color: "var(--muted)", whiteSpace: "nowrap" }}>
                      DLP × {(multiplier * 100).toFixed(2)}%
                    </td>
                    <td>
                      <span className={`badge ${d.is_blocked ? "pending" : "delivered"}`}>
                        {d.is_blocked ? "Blocked" : "Active"}
                      </span>
                    </td>
                    <td className="admin-row-actions" style={{ whiteSpace: "nowrap" }}>
                      <button
                        className="admin-link"
                        disabled={savingDisc}
                        onClick={() => saveDiscounts(d.id)}
                      >
                        {savingDisc ? "Saving…" : "Save"}
                      </button>
                      <button
                        className="admin-link danger"
                        disabled={savingBlock}
                        onClick={() => toggleBlocked(d)}
                      >
                        {d.is_blocked ? "Unblock" : "Block"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
