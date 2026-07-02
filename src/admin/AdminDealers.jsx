import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const BUCKET = "dealer-media";

function getPublicUrl(path) {
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

async function uploadFile(dealerId, key, file) {
  const ext = file.name.split(".").pop();
  const path = `${dealerId}/${key}.${ext}`;
  await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  return getPublicUrl(path);
}

// ── Section heading ──────────────────────────────────────────────────────────
function Section({ title }) {
  return (
    <div style={{ gridColumn: "1 / -1", borderBottom: "1.5px solid var(--red-light)", paddingBottom: 4, marginBottom: 4, marginTop: 8, fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--red-dark)" }}>
      {title}
    </div>
  );
}

// ── Media upload tile ────────────────────────────────────────────────────────
function MediaTile({ label, url, uploading, onPick, accept = "image/*" }) {
  const ref = useRef();
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
      <div
        onClick={() => ref.current?.click()}
        style={{
          width: 100, height: 100, borderRadius: 10, border: "2px dashed var(--border)",
          background: "#f8f4f8", cursor: "pointer", overflow: "hidden",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: url ? undefined : 28, color: "var(--muted)",
        }}
      >
        {uploading ? "⏳" : url
          ? (accept.includes("video")
            ? <video src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted />
            : <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />)
          : "+"
        }
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", maxWidth: 100 }}>{label}</div>
      <input ref={ref} type="file" accept={accept} style={{ display: "none" }} onChange={e => e.target.files[0] && onPick(e.target.files[0])} />
    </div>
  );
}

export default function AdminDealers() {
  const navigate = useNavigate();
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState({});
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState({});
  const [newTerritory, setNewTerritory] = useState("");

  const loadDealers = () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    supabase.from("profiles").select("*").order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setDealers(data);
        setLoading(false);
      });
  };

  useEffect(() => { loadDealers(); }, []);

  const openDealer = (d) => { setSelected(d); setEditing(false); setEdits({}); };
  const goBack = () => { setSelected(null); setEditing(false); setEdits({}); };

  const startEdit = () => {
    setEdits({
      owner_name:        selected.owner_name || "",
      shop_name:         selected.shop_name || "",
      name:              selected.name || "",
      registration_type: selected.registration_type || "unregistered",
      gstin:             selected.gstin || "",
      phone:             selected.phone || "",
      phone2:            selected.phone2 || "",
      address:           selected.address || "",
      shop_address:      selected.shop_address || "",
      godown_address:    selected.godown_address || "",
      staff_assigned:    selected.staff_assigned || "",
      name_staff1:       selected.name_staff1 || "",
      name_staff2:       selected.name_staff2 || "",
      website:           selected.website || "",
      territories:       Array.isArray(selected.territories) ? [...selected.territories] : [],
      discount1:         selected.discount1 ?? 0,
      discount2:         selected.discount2 ?? 0,
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setEdits({}); setNewTerritory(""); };

  const f = (field) => editing ? (edits[field] ?? "") : (selected?.[field] ?? "");
  const set = (field, val) => setEdits(p => ({ ...p, [field]: val }));

  const handleSave = async () => {
    setSaving(true);
    const payload = {
      owner_name:        edits.owner_name,
      shop_name:         edits.shop_name,
      name:              edits.name,
      registration_type: edits.registration_type,
      gstin:             edits.registration_type === "registered" ? edits.gstin : null,
      phone:             edits.phone,
      phone2:            edits.phone2,
      address:           edits.address,
      shop_address:      edits.shop_address,
      godown_address:    edits.godown_address,
      staff_assigned:    edits.staff_assigned,
      name_staff1:       edits.name_staff1,
      name_staff2:       edits.name_staff2,
      website:           edits.website,
      territories:       edits.territories,
      discount1:         Number(edits.discount1) || 0,
      discount2:         Number(edits.discount2) || 0,
    };
    await supabase.from("profiles").update(payload).eq("id", selected.id);
    const updated = { ...selected, ...payload };
    setSelected(updated);
    setDealers(prev => prev.map(d => d.id === selected.id ? updated : d));
    setSaving(false);
    setEditing(false);
    setEdits({});
    setNewTerritory("");
  };

  const handleToggleBlock = async () => {
    setSaving(true);
    const next = !selected.is_blocked;
    await supabase.from("profiles").update({ is_blocked: next }).eq("id", selected.id);
    const updated = { ...selected, is_blocked: next };
    setSelected(updated);
    setDealers(prev => prev.map(d => d.id === selected.id ? updated : d));
    setSaving(false);
  };

  const handleMediaUpload = async (key, file) => {
    setUploading(p => ({ ...p, [key]: true }));
    const url = await uploadFile(selected.id, key, file);
    await supabase.from("profiles").update({ [key]: url }).eq("id", selected.id);
    const updated = { ...selected, [key]: url };
    setSelected(updated);
    setDealers(prev => prev.map(d => d.id === selected.id ? updated : d));
    setUploading(p => ({ ...p, [key]: false }));
  };

  const fetchLocation = () => {
    navigator.geolocation?.getCurrentPosition(pos => {
      const { latitude, longitude } = pos.coords;
      supabase.from("profiles").update({ location_lat: latitude, location_lng: longitude }).eq("id", selected.id);
      const updated = { ...selected, location_lat: latitude, location_lng: longitude };
      setSelected(updated);
      setDealers(prev => prev.map(d => d.id === selected.id ? updated : d));
    }, () => alert("Location access denied."));
  };

  const addTerritory = () => {
    const t = newTerritory.trim();
    if (!t) return;
    const list = [...(editing ? edits.territories : (selected.territories || [])), t];
    if (editing) set("territories", list);
    else { supabase.from("profiles").update({ territories: list }).eq("id", selected.id); setSelected(p => ({ ...p, territories: list })); }
    setNewTerritory("");
  };

  const removeTerritory = (i) => {
    const list = (editing ? edits.territories : (selected.territories || [])).filter((_, idx) => idx !== i);
    if (editing) set("territories", list);
    else { supabase.from("profiles").update({ territories: list }).eq("id", selected.id); setSelected(p => ({ ...p, territories: list })); }
  };

  // ── DETAIL / EDIT VIEW ──────────────────────────────────────────────────────
  if (selected) {
    const d1 = Number(editing ? edits.discount1 : selected.discount1) || 0;
    const d2 = Number(editing ? edits.discount2 : selected.discount2) || 0;
    const multiplier = (1 - d1 / 100) * (1 - d2 / 100);
    const memberSince = new Date(selected.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const regType = editing ? edits.registration_type : (selected.registration_type || "unregistered");
    const territories = editing ? (edits.territories || []) : (selected.territories || []);

    const TF = ({ label, field, type = "text", textarea = false, span = false }) => (
      <div style={{ gridColumn: span ? "1 / -1" : undefined, marginBottom: 14 }}>
        <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>{label}</div>
        {editing ? (
          textarea
            ? <textarea value={f(field)} onChange={e => set(field, e.target.value)} rows={2}
                style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, resize: "vertical" }} />
            : <input type={type} value={f(field)} onChange={e => set(field, e.target.value)}
                style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
        ) : (
          <div style={{ fontSize: 14, fontWeight: 500, color: (selected[field] || "") ? "#000" : "var(--muted)" }}>
            {field === "location_lat"
              ? (selected.location_lat ? `${selected.location_lat.toFixed(5)}, ${selected.location_lng?.toFixed(5)}` : "—")
              : (selected[field] || "—")}
          </div>
        )}
      </div>
    );

    return (
      <div className="admin-page">
        {/* Top bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red-dark)", fontWeight: 600, fontSize: 14, padding: 0 }}>
            ← Back to Dealers
          </button>
          {!editing ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn small" style={{ background: "var(--red-dark)", color: "#fff", border: "none" }} onClick={() => navigate(`/admin/crm/${selected.id}`)}>
                View Full CRM →
              </button>
              <button className="btn small outline" onClick={startEdit}>Edit</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn small" disabled={saving} onClick={handleSave}>{saving ? "Saving…" : "Save All"}</button>
              <button className="btn small outline" onClick={cancelEdit}>Cancel</button>
            </div>
          )}
        </div>

        <div style={{ background: "#fff", borderRadius: 14, padding: 24, boxShadow: "0 2px 8px rgba(0,0,0,.06)", maxWidth: 700 }}>
          {/* Header avatar row */}
          <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 20, paddingBottom: 16, borderBottom: "1px solid var(--border)" }}>
            <div style={{ width: 52, height: 52, borderRadius: "50%", background: "var(--red-light)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, fontWeight: 700, color: "var(--red-dark)", flexShrink: 0 }}>
              {(selected.owner_name || selected.shop_name || selected.email)?.[0]?.toUpperCase()}
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16 }}>{selected.shop_name || selected.owner_name || selected.email}</div>
              <div style={{ fontSize: 12, color: "var(--muted)" }}>{selected.dealer_code || "No Code"} · Member since {memberSince}</div>
            </div>
            <span className={`badge ${selected.is_blocked ? "pending" : "delivered"}`} style={{ marginLeft: "auto" }}>
              {selected.is_blocked ? "Blocked" : "Active"}
            </span>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 24px" }}>

            {/* ── Business Info ── */}
            <Section title="Business Information" />
            <TF label="Shop / Business Name" field="shop_name" span />
            <TF label="Owner Name" field="owner_name" />
            <TF label="Dealer Code" field="dealer_code" />
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Email</div>
              <div style={{ fontSize: 14, fontWeight: 500 }}>{selected.email}</div>
            </div>
            <TF label="Website" field="website" />
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.4px" }}>Registration Type</div>
              {editing ? (
                <select value={edits.registration_type} onChange={e => set("registration_type", e.target.value)}
                  style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13 }}>
                  <option value="registered">Registered</option>
                  <option value="unregistered">Unregistered</option>
                  <option value="composite">Composite</option>
                </select>
              ) : (
                <div style={{ fontSize: 14, fontWeight: 500, textTransform: "capitalize" }}>{regType}</div>
              )}
            </div>
            {regType === "registered" && <TF label="GSTIN" field="gstin" span />}

            {/* ── Contact ── */}
            <Section title="Contact" />
            <TF label="Phone 1" field="phone" type="tel" />
            <TF label="Phone 2" field="phone2" type="tel" />

            {/* ── Addresses ── */}
            <Section title="Addresses" />
            <TF label="Billing / Registered Address" field="address" textarea span />
            <TF label="Shop Address" field="shop_address" textarea span />
            <TF label="Godown / Warehouse Address" field="godown_address" textarea span />

            {/* ── Location ── */}
            <Section title="Location" />
            <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.4px" }}>GPS Coordinates</div>
              {selected.location_lat ? (
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 6 }}>
                  📍 {selected.location_lat.toFixed(5)}, {selected.location_lng?.toFixed(5)}
                  {" "}<a href={`https://maps.google.com/?q=${selected.location_lat},${selected.location_lng}`} target="_blank" rel="noreferrer" style={{ fontSize: 11, color: "var(--red-dark)" }}>View on Maps →</a>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>No location saved.</div>
              )}
              <button className="btn small outline" onClick={fetchLocation}>📡 Fetch My Location</button>
            </div>

            {/* ── Territories ── */}
            <Section title="Territories" />
            <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
                {territories.length === 0 && <div style={{ fontSize: 13, color: "var(--muted)" }}>No territories added.</div>}
                {territories.map((t, i) => (
                  <span key={i} style={{ background: "var(--red-light)", color: "var(--red-dark)", borderRadius: 20, padding: "4px 12px", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                    {t}
                    <span onClick={() => removeTerritory(i)} style={{ cursor: "pointer", fontWeight: 700, opacity: 0.7 }}>✕</span>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newTerritory} onChange={e => setNewTerritory(e.target.value)} onKeyDown={e => e.key === "Enter" && addTerritory()}
                  placeholder="Add territory (e.g. Karol Bagh)" style={{ flex: 1, marginBottom: 0 }} />
                <button className="btn small" onClick={addTerritory}>+ Add</button>
              </div>
            </div>

            {/* ── Staff ── */}
            <Section title="Staff" />
            <TF label="Staff Assigned" field="staff_assigned" span />
            <TF label="Staff 1 Name" field="name_staff1" />
            <TF label="Staff 2 Name" field="name_staff2" />

            {/* ── Pricing ── */}
            <Section title="Pricing & Discounts" />
            <TF label="Discount 1 (%)" field="discount1" type="number" />
            <TF label="Discount 2 (%)" field="discount2" type="number" />
            <div style={{ gridColumn: "1 / -1", background: "#f8f4f8", borderRadius: 8, padding: "10px 14px", marginBottom: 14, fontSize: 13, color: "var(--red-dark)", fontWeight: 600 }}>
              Net Rate = DLP × {(multiplier * 100).toFixed(2)}%
            </div>
          </div>

          {/* ── Media uploads ── */}
          <div style={{ borderTop: "1.5px solid var(--red-light)", paddingTop: 16, marginTop: 4 }}>
            <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.6px", color: "var(--red-dark)", marginBottom: 14 }}>Photos & Media</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <MediaTile label="Owner Photo" url={selected.photo_owner} uploading={uploading.photo_owner} onPick={f => handleMediaUpload("photo_owner", f)} />
              <MediaTile label="Staff 1 Photo" url={selected.photo_staff1} uploading={uploading.photo_staff1} onPick={f => handleMediaUpload("photo_staff1", f)} />
              <MediaTile label="Staff 2 Photo" url={selected.photo_staff2} uploading={uploading.photo_staff2} onPick={f => handleMediaUpload("photo_staff2", f)} />
              <MediaTile label="Shop Inside" url={selected.photo_shop_inside} uploading={uploading.photo_shop_inside} onPick={f => handleMediaUpload("photo_shop_inside", f)} />
              <MediaTile label="Shop Board" url={selected.photo_shop_board} uploading={uploading.photo_shop_board} onPick={f => handleMediaUpload("photo_shop_board", f)} />
              <MediaTile label="Interior Video (30s)" url={selected.video_shop_interior} uploading={uploading.video_shop_interior} onPick={f => handleMediaUpload("video_shop_interior", f)} accept="video/*" />
            </div>
          </div>

          {/* ── Block/Unblock ── */}
          <div style={{ marginTop: 24, paddingTop: 16, borderTop: "1px solid var(--border)" }}>
            <button className="btn small outline"
              style={{ color: selected.is_blocked ? "#27ae60" : "#c0392b", borderColor: selected.is_blocked ? "#27ae60" : "#c0392b" }}
              disabled={saving} onClick={handleToggleBlock}>
              {saving ? "…" : selected.is_blocked ? "Unblock Dealer" : "Block Dealer"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── MASTER LIST ──────────────────────────────────────────────────────────────
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
                <th>Shop / Owner</th>
                <th>Phone</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dealers.map((d, idx) => (
                <tr key={d.id} onClick={() => openDealer(d)} style={{ cursor: "pointer" }} className="admin-dealer-row">
                  <td style={{ color: "var(--muted)", fontSize: 12, textAlign: "center" }}>{idx + 1}</td>
                  <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.dealer_code || "—"}</td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{d.shop_name || d.owner_name || (d.name !== "New Dealer" ? d.name : "—")}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.email}</div>
                  </td>
                  <td style={{ fontSize: 12 }}>{d.phone || "—"}</td>
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
