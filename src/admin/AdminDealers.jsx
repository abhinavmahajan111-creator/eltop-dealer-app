import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function AdminDealers() {
  const navigate = useNavigate();
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null); // dealer object
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);

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

  const openDealer = (d) => {
    setSelected(d);
    setEditing(false);
    setEdits({});
  };

  const goBack = () => {
    setSelected(null);
    setEditing(false);
    setEdits({});
  };

  const startEdit = () => {
    setEdits({
      name:      selected.name || "",
      address:   selected.address || "",
      gstin:     selected.gstin || "",
      discount1: selected.discount1 ?? 0,
      discount2: selected.discount2 ?? 0,
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setEdits({}); };

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      name:      edits.name,
      address:   edits.address,
      gstin:     edits.gstin,
      discount1: Number(edits.discount1) || 0,
      discount2: Number(edits.discount2) || 0,
    };
    await supabase.from("profiles").update(payload).eq("id", selected.id);
    const updated = { ...selected, ...payload };
    setSelected(updated);
    setDealers((prev) => prev.map((d) => d.id === selected.id ? updated : d));
    setSaving(false);
    setEditing(false);
    setEdits({});
  };

  const handleToggleBlock = async () => {
    setSaving(true);
    const next = !selected.is_blocked;
    await supabase.from("profiles").update({ is_blocked: next }).eq("id", selected.id);
    const updated = { ...selected, is_blocked: next };
    setSelected(updated);
    setDealers((prev) => prev.map((d) => d.id === selected.id ? updated : d));
    setSaving(false);
  };

  const f = (field) => editing ? edits[field] : (selected?.[field] ?? "");
  const setField = (field, val) => setEdits((prev) => ({ ...prev, [field]: val }));

  // ── DETAIL VIEW ────────────────────────────────────────────────────────────
  if (selected) {
    const d1 = Number(editing ? edits.discount1 : selected.discount1) || 0;
    const d2 = Number(editing ? edits.discount2 : selected.discount2) || 0;
    const multiplier = (1 - d1 / 100) * (1 - d2 / 100);
    const memberSince = new Date(selected.created_at).toLocaleDateString("en-IN", {
      day: "2-digit", month: "short", year: "numeric",
    });

    const Field = ({ label, field, type = "text", textarea = false }) => (
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
        {editing ? (
          textarea ? (
            <textarea
              value={f(field)}
              onChange={(e) => setField(field, e.target.value)}
              rows={2}
              style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 14, padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, resize: "vertical" }}
            />
          ) : (
            <input
              type={type}
              value={f(field)}
              onChange={(e) => setField(field, e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }}
            />
          )
        ) : (
          <div style={{ fontSize: 14, fontWeight: 500, color: f(field) ? "#000" : "var(--muted)" }}>
            {f(field) || "—"}
          </div>
        )}
      </div>
    );

    return (
      <div className="admin-page">
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <button
            onClick={goBack}
            style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red-dark)", fontWeight: 600, fontSize: 14, padding: 0 }}
          >
            ← Back to Dealers
          </button>
          {!editing ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button
                className="btn small"
                style={{ background: "var(--red-dark)", color: "#fff", border: "none" }}
                onClick={() => navigate(`/admin/crm/${selected.id}`)}
              >
                View Full CRM →
              </button>
              <button className="btn small outline" onClick={startEdit}>Edit</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn small" disabled={saving} onClick={handleSave}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="btn small outline" onClick={cancelEdit}>Cancel</button>
            </div>
          )}
        </div>

        {/* Detail card */}
        <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,.06)", maxWidth: 600 }}>
          {/* Header */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <div style={{
              width: 48, height: 48, borderRadius: "50%", background: "var(--red-light)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 20, fontWeight: 700, color: "var(--red-dark)",
            }}>
              {(selected.name && selected.name !== "New Dealer" ? selected.name : selected.email)?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>
                {selected.name && selected.name !== "New Dealer" ? selected.name : selected.email}
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>Member since {memberSince}</div>
            </div>
            <span className={`badge ${selected.is_blocked ? "pending" : "delivered"}`} style={{ marginLeft: "auto" }}>
              {selected.is_blocked ? "Blocked" : "Active"}
            </span>
          </div>

          {/* Fields */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>
            <div style={{ gridColumn: "1 / -1" }}>
              <Field label="Dealer Code" field="dealer_code" />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Email</div>
                <div style={{ fontSize: 14, fontWeight: 500 }}>{selected.email}</div>
              </div>
            </div>
            <div style={{ gridColumn: "1 / -1" }}><Field label="Name" field="name" /></div>
            <div style={{ gridColumn: "1 / -1" }}><Field label="Address" field="address" textarea /></div>
            <div style={{ gridColumn: "1 / -1" }}><Field label="GSTIN" field="gstin" /></div>
            <Field label="Discount 1 (%)" field="discount1" type="number" />
            <Field label="Discount 2 (%)" field="discount2" type="number" />
          </div>

          {/* Net formula */}
          <div style={{ background: "#f8f4f8", borderRadius: 8, padding: "10px 14px", marginBottom: 20, fontSize: 13, color: "var(--red-dark)", fontWeight: 600 }}>
            Net Rate = DLP × {(multiplier * 100).toFixed(2)}%
          </div>

          {/* Block/Unblock */}
          <button
            className="btn small outline"
            style={{ color: selected.is_blocked ? "#27ae60" : "#c0392b", borderColor: selected.is_blocked ? "#27ae60" : "#c0392b" }}
            disabled={saving}
            onClick={handleToggleBlock}
          >
            {saving ? "…" : selected.is_blocked ? "Unblock Dealer" : "Block Dealer"}
          </button>
        </div>
      </div>
    );
  }

  // ── MASTER LIST ────────────────────────────────────────────────────────────
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
              </tr>
            </thead>
            <tbody>
              {dealers.map((d, idx) => (
                <tr
                  key={d.id}
                  onClick={() => openDealer(d)}
                  style={{ cursor: "pointer" }}
                  className="admin-dealer-row"
                >
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
