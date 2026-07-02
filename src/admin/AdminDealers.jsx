import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function AdminDealers() {
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState(null);
  const [edits, setEdits] = useState({});
  const [savingId, setSavingId] = useState(null);

  const loadDealers = () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("profiles")
      .select("id, name, email, dealer_code, address, gstin, created_at, is_blocked, discount1, discount2")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setDealers(data);
        setLoading(false);
      });
  };

  useEffect(() => { loadDealers(); }, []);

  const openEdit = (d) => {
    setExpandedId(d.id);
    setEdits({
      name:      d.name || "",
      address:   d.address || "",
      gstin:     d.gstin || "",
      discount1: d.discount1 ?? 0,
      discount2: d.discount2 ?? 0,
    });
  };

  const closeEdit = () => { setExpandedId(null); setEdits({}); };

  const setField = (field, value) => setEdits((prev) => ({ ...prev, [field]: value }));

  const handleSave = async (dealerId) => {
    setSavingId(dealerId + "_save");
    await supabase.from("profiles").update({
      name:      edits.name,
      address:   edits.address,
      gstin:     edits.gstin,
      discount1: Number(edits.discount1) || 0,
      discount2: Number(edits.discount2) || 0,
    }).eq("id", dealerId);
    setDealers((prev) => prev.map((d) =>
      d.id === dealerId
        ? { ...d, ...edits, discount1: Number(edits.discount1) || 0, discount2: Number(edits.discount2) || 0 }
        : d
    ));
    setSavingId(null);
    closeEdit();
  };

  const handleToggleBlock = async (dealer) => {
    setSavingId(dealer.id + "_block");
    const next = !dealer.is_blocked;
    await supabase.from("profiles").update({ is_blocked: next }).eq("id", dealer.id);
    setDealers((prev) => prev.map((d) => d.id === dealer.id ? { ...d, is_blocked: next } : d));
    setSavingId(null);
  };

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
                <th style={{ width: 36 }}>#</th>
                <th>Dealer Code</th>
                <th>Email / Name</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dealers.map((d, idx) => {
                const isOpen = expandedId === d.id;
                const d1 = Number(isOpen ? edits.discount1 : d.discount1) || 0;
                const d2 = Number(isOpen ? edits.discount2 : d.discount2) || 0;
                const multiplier = (1 - d1 / 100) * (1 - d2 / 100);

                return [
                  <tr key={d.id} style={isOpen ? { background: "#f8f4f8" } : {}}>
                    <td style={{ color: "var(--muted)", fontSize: 12, textAlign: "center" }}>{idx + 1}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.dealer_code || "—"}</td>
                    <td>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>
                        {d.name && d.name !== "New Dealer" ? d.name : "—"}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.email}</div>
                    </td>
                    <td>
                      <span className={`badge ${d.is_blocked ? "pending" : "delivered"}`}>
                        {d.is_blocked ? "Blocked" : "Active"}
                      </span>
                    </td>
                    <td className="admin-row-actions">
                      {isOpen
                        ? <button className="admin-link" onClick={closeEdit}>✕ Close</button>
                        : <button className="admin-link" onClick={() => openEdit(d)}>Edit</button>
                      }
                    </td>
                  </tr>,

                  isOpen && (
                    <tr key={`${d.id}-edit`}>
                      <td colSpan={5} style={{ padding: 0 }}>
                        <div style={{
                          background: "#f8f4f8",
                          borderTop: "2px solid var(--red-light)",
                          padding: "16px 20px",
                          display: "flex", flexDirection: "column", gap: 12,
                        }}>
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                            <div>
                              <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 3 }}>Name</label>
                              <input value={edits.name} onChange={(e) => setField("name", e.target.value)}
                                placeholder="Dealer name"
                                style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 3 }}>GSTIN</label>
                              <input value={edits.gstin} onChange={(e) => setField("gstin", e.target.value)}
                                placeholder="07XXXXX…"
                                style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                            </div>
                            <div style={{ gridColumn: "1 / -1" }}>
                              <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 3 }}>Address</label>
                              <textarea
                                value={edits.address}
                                onChange={(e) => setField("address", e.target.value)}
                                placeholder="Full address" rows={2}
                                style={{
                                  width: "100%", boxSizing: "border-box", resize: "vertical",
                                  fontFamily: "inherit", fontSize: 13, padding: "8px 10px",
                                  border: "1.5px solid var(--border)", borderRadius: 8,
                                }}
                              />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 3 }}>Discount 1 (%)</label>
                              <input type="number" min="0" max="100" step="0.5"
                                value={edits.discount1} onChange={(e) => setField("discount1", e.target.value)}
                                style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                            </div>
                            <div>
                              <label style={{ fontSize: 11, color: "var(--muted)", display: "block", marginBottom: 3 }}>Discount 2 (%)</label>
                              <input type="number" min="0" max="100" step="0.5"
                                value={edits.discount2} onChange={(e) => setField("discount2", e.target.value)}
                                style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                            </div>
                          </div>

                          <div style={{ fontSize: 12, color: "var(--red-dark)", fontWeight: 600 }}>
                            Net Rate = DLP × {(multiplier * 100).toFixed(2)}%
                          </div>

                          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
                            <button
                              className="btn small"
                              disabled={savingId === d.id + "_save"}
                              onClick={() => handleSave(d.id)}
                            >
                              {savingId === d.id + "_save" ? "Saving…" : "Save"}
                            </button>
                            <button className="btn small outline" onClick={closeEdit}>Cancel</button>
                            <button
                              className="btn small outline"
                              style={{
                                marginLeft: "auto",
                                color: d.is_blocked ? "#27ae60" : "#c0392b",
                                borderColor: d.is_blocked ? "#27ae60" : "#c0392b",
                              }}
                              disabled={savingId === d.id + "_block"}
                              onClick={() => handleToggleBlock(d)}
                            >
                              {savingId === d.id + "_block" ? "…" : d.is_blocked ? "Unblock Dealer" : "Block Dealer"}
                            </button>
                          </div>
                        </div>
                      </td>
                    </tr>
                  ),
                ];
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
