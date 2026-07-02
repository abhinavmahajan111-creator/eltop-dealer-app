import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const BUCKET = "dealer-media";

async function uploadFile(dealerId, key, file) {
  const ext = file.name.split(".").pop();
  const path = `${dealerId}/${key}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// ─── helpers ────────────────────────────────────────────────────────────────

function SectionHead({ title }) {
  return (
    <div style={{
      gridColumn: "1 / -1", margin: "18px 0 10px",
      paddingBottom: 6, borderBottom: "2px solid var(--red-light)",
      fontSize: 11, fontWeight: 800, textTransform: "uppercase",
      letterSpacing: "0.8px", color: "var(--red-dark)",
    }}>
      {title}
    </div>
  );
}

function ReadField({ label, value, span, children }) {
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined, marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>{label}</div>
      {children ?? <div style={{ fontSize: 14, fontWeight: 500, color: value ? "#111" : "var(--muted)", whiteSpace: "pre-wrap" }}>{value || "—"}</div>}
    </div>
  );
}

function EditField({ label, field, value, onChange, type = "text", textarea = false, span = false, readOnly = false, children }) {
  return (
    <div style={{ gridColumn: span ? "1 / -1" : undefined, marginBottom: 14 }}>
      <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>{label}</div>
      {children ?? (readOnly
        ? <div style={{ fontSize: 14, fontWeight: 500, color: "#111", padding: "8px 0" }}>{value || "—"}</div>
        : textarea
          ? <textarea value={value} onChange={e => onChange(field, e.target.value)} rows={2}
              style={{ width: "100%", boxSizing: "border-box", fontFamily: "inherit", fontSize: 13, padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, resize: "vertical", marginBottom: 0 }} />
          : <input type={type} value={value} onChange={e => onChange(field, e.target.value)}
              style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
      )}
    </div>
  );
}

function MediaTile({ label, url, uploading, onPick, accept = "image/*", editing }) {
  const ref = useRef();
  const isVideo = accept.includes("video");
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "center" }}>
      <div
        onClick={() => editing && ref.current?.click()}
        style={{
          width: 96, height: 96, borderRadius: 10,
          border: `2px ${editing ? "dashed" : "solid"} ${editing ? "var(--red-light)" : "#eee"}`,
          background: "#f8f4f8", cursor: editing ? "pointer" : "default",
          overflow: "hidden", display: "flex", alignItems: "center",
          justifyContent: "center", fontSize: url ? undefined : 24, color: "var(--muted)",
          position: "relative",
        }}
      >
        {uploading
          ? <span style={{ fontSize: 12 }}>⏳</span>
          : url
            ? isVideo
              ? <video src={url} style={{ width: "100%", height: "100%", objectFit: "cover" }} muted playsInline />
              : <img src={url} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
            : editing ? "+" : <span style={{ fontSize: 11, color: "#ccc" }}>—</span>
        }
        {url && editing && (
          <div style={{ position: "absolute", inset: 0, background: "rgba(0,0,0,.25)", display: "flex", alignItems: "center", justifyContent: "center", opacity: 0, transition: ".15s" }}
            onMouseEnter={e => e.currentTarget.style.opacity = 1}
            onMouseLeave={e => e.currentTarget.style.opacity = 0}>
            <span style={{ color: "#fff", fontSize: 18 }}>✏️</span>
          </div>
        )}
      </div>
      <div style={{ fontSize: 10, color: "var(--muted)", textAlign: "center", maxWidth: 96, lineHeight: 1.3 }}>{label}</div>
      {editing && <input ref={ref} type="file" accept={accept} style={{ display: "none" }} onChange={e => e.target.files[0] && onPick(e.target.files[0])} />}
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export default function AdminDealers() {
  const navigate = useNavigate();
  const [dealers, setDealers]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [selected, setSelected] = useState(null);
  const [editing, setEditing]   = useState(false);
  const [edits, setEdits]       = useState({});
  const [saving, setSaving]     = useState(false);
  const [uploading, setUploading] = useState({});
  const [newTerritory, setNewTerritory] = useState("");
  const [creditUsed, setCreditUsed] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    supabase.from("profiles").select("*").order("created_at", { ascending: false })
      .then(({ data }) => { if (data) setDealers(data); setLoading(false); });
  }, []);

  const openDealer = (d) => {
    setSelected(d);
    setEditing(false);
    setEdits({});
    setNewTerritory("");
    setCreditUsed(null);
    // Fetch sum of pending + confirmed orders for credit utilization
    if (isSupabaseConfigured) {
      supabase
        .from("orders")
        .select("total")
        .eq("dealer_id", d.id)
        .in("status", ["pending", "confirmed"])
        .then(({ data }) => {
          if (data) setCreditUsed(data.reduce((sum, o) => sum + Number(o.total || 0), 0));
        });
    }
  };
  const goBack     = ()  => { setSelected(null); setEditing(false); setEdits({}); setNewTerritory(""); };

  const startEdit = () => {
    setEdits({
      owner_name:        selected.owner_name        || "",
      shop_name:         selected.shop_name         || "",
      alias_name:        selected.alias_name        || "",
      registration_type: selected.registration_type || "Unregistered",
      gstin:             selected.gstin             || "",
      phone:             selected.phone             || "",
      phone2:            selected.phone2            || "",
      address:           selected.address           || "",
      shop_address:      selected.shop_address      || "",
      godown_address:    selected.godown_address    || "",
      staff_assigned:    selected.staff_assigned    || "",
      staff1_name:       selected.staff1_name       || "",
      staff2_name:       selected.staff2_name       || "",
      website:           selected.website           || "",
      territory:                  Array.isArray(selected.territory) ? [...selected.territory] : [],
      discount1:                  selected.discount1                  ?? 0,
      discount2:                  selected.discount2                  ?? 0,
      credit_limit:               selected.credit_limit               ?? "",
      google_business_name:       selected.google_business_name       || "",
      google_maps_url:            selected.google_maps_url            || "",
      google_rating:              selected.google_rating              ?? "",
      google_reviews_count:       selected.google_reviews_count       ?? "",
      google_listing_status:      selected.google_listing_status      || "Not Listed",
      google_listing_claimed:     selected.google_listing_claimed     ?? false,
    });
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setEdits({}); setNewTerritory(""); };

  const ev = (field) => edits[field] ?? "";
  const set = (field, val) => setEdits(p => ({ ...p, [field]: val }));

  const handleSave = async () => {
    setSaving(true);
    const isRegistered = edits.registration_type === "Registered";
    const payload = {
      owner_name:        edits.owner_name,
      shop_name:         edits.shop_name,
      alias_name:        edits.alias_name,
      registration_type: edits.registration_type,
      gstin:             isRegistered ? edits.gstin : null,
      phone:             edits.phone,
      phone2:            edits.phone2,
      address:           edits.address,
      shop_address:      edits.shop_address,
      godown_address:    edits.godown_address,
      staff_assigned:    edits.staff_assigned,
      staff1_name:       edits.staff1_name,
      staff2_name:       edits.staff2_name,
      website:           edits.website,
      territory:                  edits.territory,
      discount1:                  Number(edits.discount1) || 0,
      discount2:                  Number(edits.discount2) || 0,
      credit_limit:               edits.credit_limit !== "" ? Number(edits.credit_limit) : null,
      google_business_name:       edits.google_business_name || null,
      google_maps_url:            edits.google_maps_url      || null,
      google_rating:              edits.google_rating !== "" ? Number(edits.google_rating) : null,
      google_reviews_count:       edits.google_reviews_count !== "" ? Number(edits.google_reviews_count) : null,
      google_listing_status:      edits.google_listing_status || "Not Listed",
      google_listing_claimed:     !!edits.google_listing_claimed,
    };
    const { error } = await supabase.from("profiles").update(payload).eq("id", selected.id);
    if (!error) {
      const updated = { ...selected, ...payload };
      setSelected(updated);
      setDealers(prev => prev.map(d => d.id === selected.id ? updated : d));
    }
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
    try {
      const url = await uploadFile(selected.id, key, file);
      await supabase.from("profiles").update({ [key]: url }).eq("id", selected.id);
      const updated = { ...selected, [key]: url };
      setSelected(updated);
      setDealers(prev => prev.map(d => d.id === selected.id ? updated : d));
    } catch (e) {
      alert("Upload failed: " + e.message);
    }
    setUploading(p => ({ ...p, [key]: false }));
  };

  const fetchLocation = () => {
    if (!navigator.geolocation) { alert("Geolocation not supported."); return; }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        await supabase.from("profiles").update({ latitude, longitude }).eq("id", selected.id);
        const updated = { ...selected, latitude, longitude };
        setSelected(updated);
        setDealers(prev => prev.map(d => d.id === selected.id ? updated : d));
      },
      () => alert("Location access denied. Please allow location in your browser.")
    );
  };

  const currentTerritories = () => editing ? (edits.territory || []) : (Array.isArray(selected?.territory) ? selected.territory : []);

  const addTerritory = () => {
    const t = newTerritory.trim();
    if (!t) return;
    const list = [...currentTerritories(), t];
    if (editing) {
      set("territory", list);
    } else {
      supabase.from("profiles").update({ territory: list }).eq("id", selected.id);
      setSelected(p => ({ ...p, territory: list }));
      setDealers(prev => prev.map(d => d.id === selected.id ? { ...d, territory: list } : d));
    }
    setNewTerritory("");
  };

  const removeTerritory = (i) => {
    const list = currentTerritories().filter((_, idx) => idx !== i);
    if (editing) {
      set("territory", list);
    } else {
      supabase.from("profiles").update({ territory: list }).eq("id", selected.id);
      setSelected(p => ({ ...p, territory: list }));
      setDealers(prev => prev.map(d => d.id === selected.id ? { ...d, territory: list } : d));
    }
  };

  // ─── DETAIL VIEW ─────────────────────────────────────────────────────────────
  if (selected) {
    const memberSince = new Date(selected.created_at).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const regType     = editing ? ev("registration_type") : (selected.registration_type || "Unregistered");
    const d1          = Number(editing ? ev("discount1") : selected.discount1) || 0;
    const d2          = Number(editing ? ev("discount2") : selected.discount2) || 0;
    const territories = currentTerritories();

    // shorthand for edit field value
    const E = (field) => ev(field);
    const S = (field) => selected[field] || "";

    return (
      <div className="admin-page">

        {/* ── Top bar ── */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20, flexWrap: "wrap", gap: 8 }}>
          <button onClick={goBack} style={{ background: "none", border: "none", cursor: "pointer", color: "var(--red-dark)", fontWeight: 700, fontSize: 14, padding: 0 }}>
            ← Back to Dealers
          </button>
          {!editing ? (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn small" style={{ background: "var(--red-dark)", color: "#fff", border: "none" }}
                onClick={() => navigate(`/admin/crm/${selected.id}`)}>
                View Full CRM →
              </button>
              <button className="btn small outline" onClick={startEdit}>Edit</button>
            </div>
          ) : (
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn small" disabled={saving} onClick={handleSave} style={{ minWidth: 90 }}>
                {saving ? "Saving…" : "Save All"}
              </button>
              <button className="btn small outline" onClick={cancelEdit}>Cancel</button>
            </div>
          )}
        </div>

        {/* ── Profile card ── */}
        <div style={{ background: "#fff", borderRadius: 16, padding: 28, boxShadow: "0 2px 12px rgba(0,0,0,.07)", maxWidth: 760 }}>

          {/* Avatar header */}
          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 4, paddingBottom: 20, borderBottom: "1px solid var(--border)" }}>
            <div style={{
              width: 56, height: 56, borderRadius: "50%", flexShrink: 0,
              background: "var(--red-light)", display: "flex", alignItems: "center",
              justifyContent: "center", fontSize: 24, fontWeight: 800, color: "var(--red-dark)",
            }}>
              {(selected.shop_name || selected.owner_name || selected.email)?.[0]?.toUpperCase() || "?"}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 17, color: "#111" }}>
                {selected.shop_name || selected.owner_name || selected.email}
              </div>
              {selected.alias_name && <div style={{ fontSize: 12, color: "var(--muted)" }}>aka {selected.alias_name}</div>}
              <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 2 }}>
                {selected.dealer_code || "No Code"} · Member since {memberSince}
              </div>
            </div>
            <span className={`badge ${selected.is_blocked ? "pending" : "delivered"}`}>
              {selected.is_blocked ? "Blocked" : "Active"}
            </span>
          </div>

          {/* ══ SECTION 1 — BUSINESS INFO ══ */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px" }}>
            <SectionHead title="Business Information" />

            {editing ? (
              <>
                <EditField label="Shop / Business Name" field="shop_name" value={E("shop_name")} onChange={set} span />
                <EditField label="Alias / Brand Name" field="alias_name" value={E("alias_name")} onChange={set} />
                <EditField label="Owner Name" field="owner_name" value={E("owner_name")} onChange={set} />

                <EditField label="Registration Type" field="registration_type" value={E("registration_type")} onChange={set}>
                  <select value={E("registration_type")} onChange={e => set("registration_type", e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, marginBottom: 0 }}>
                    <option>Registered</option>
                    <option>Unregistered</option>
                    <option>Composite</option>
                  </select>
                </EditField>

                {regType === "Registered" && (
                  <EditField label="GST No." field="gstin" value={E("gstin")} onChange={set} span />
                )}

                <EditField label="Website" field="website" value={E("website")} onChange={set} />
                <EditField label="Staff Assigned" field="staff_assigned" value={E("staff_assigned")} onChange={set} />
                <EditField label="Discount 1 (%)" field="discount1" value={E("discount1")} onChange={set} type="number" />
                <EditField label="Discount 2 (%)" field="discount2" value={E("discount2")} onChange={set} type="number" />
                <EditField label="Credit Limit (Rs.)" field="credit_limit" value={E("credit_limit")} onChange={set} type="number" span />
              </>
            ) : (
              <>
                <ReadField label="Shop / Business Name" value={S("shop_name")} span />
                <ReadField label="Alias / Brand Name" value={S("alias_name")} />
                <ReadField label="Owner Name" value={S("owner_name")} />
                <ReadField label="Registration Type" value={S("registration_type") || "Unregistered"} />
                {(selected.registration_type === "Registered") && (
                  <ReadField label="GST No." value={S("gstin")} span />
                )}
                <ReadField label="Website" value={S("website")} />
                <ReadField label="Staff Assigned" value={S("staff_assigned")} />
                <ReadField label="Discount 1 (%)" value={String(selected.discount1 ?? "—")} />
                <ReadField label="Discount 2 (%)" value={String(selected.discount2 ?? "—")} />
                {(selected.discount1 || selected.discount2) ? (
                  <div style={{ gridColumn: "1 / -1", background: "#f8f4f8", borderRadius: 8, padding: "9px 14px", marginBottom: 14, fontSize: 12, color: "var(--red-dark)", fontWeight: 700 }}>
                    Net Rate = DLP × {((1 - d1 / 100) * (1 - d2 / 100) * 100).toFixed(2)}%
                  </div>
                ) : null}

                {/* Credit Limit + Utilization */}
                <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                  <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Credit Limit</div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: selected.credit_limit ? "#111" : "var(--muted)" }}>
                    {selected.credit_limit ? `Rs. ${Number(selected.credit_limit).toLocaleString("en-IN")}` : "Not set"}
                  </div>
                  {selected.credit_limit && creditUsed !== null && (() => {
                    const limit = Number(selected.credit_limit);
                    const used  = creditUsed;
                    const pct   = Math.min((used / limit) * 100, 100);
                    const over  = used > limit;
                    return (
                      <div style={{ marginTop: 8 }}>
                        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, marginBottom: 4, color: over ? "#c0392b" : "#555" }}>
                          <span>Used: <strong>Rs. {used.toLocaleString("en-IN")}</strong> of Rs. {limit.toLocaleString("en-IN")}</span>
                          <span style={{ fontWeight: 700, color: over ? "#c0392b" : pct > 75 ? "#e67e22" : "#27ae60" }}>{pct.toFixed(0)}%</span>
                        </div>
                        <div style={{ height: 8, borderRadius: 4, background: "#e8e8e8", overflow: "hidden" }}>
                          <div style={{
                            height: "100%", borderRadius: 4,
                            width: `${pct}%`,
                            background: over ? "#c0392b" : pct > 75 ? "#e67e22" : "#27ae60",
                            transition: "width .4s ease",
                          }} />
                        </div>
                        {over && <div style={{ fontSize: 11, color: "#c0392b", fontWeight: 700, marginTop: 4 }}>⚠️ Over credit limit by Rs. {(used - limit).toLocaleString("en-IN")}</div>}
                      </div>
                    );
                  })()}
                  {selected.credit_limit && creditUsed === null && (
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 4 }}>Loading utilization…</div>
                  )}
                </div>
              </>
            )}

            {/* Territory tags — always editable inline (no "edit mode" needed to add) */}
            <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Territories</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 7, marginBottom: 8, minHeight: 28 }}>
                {territories.length === 0 && <span style={{ fontSize: 13, color: "var(--muted)" }}>No territories added.</span>}
                {territories.map((t, i) => (
                  <span key={i} style={{
                    background: "var(--red-light)", color: "var(--red-dark)", borderRadius: 20,
                    padding: "4px 11px", fontSize: 12, fontWeight: 600,
                    display: "flex", alignItems: "center", gap: 5,
                  }}>
                    {t}
                    <span onClick={() => removeTerritory(i)}
                      style={{ cursor: "pointer", opacity: 0.6, fontWeight: 800, lineHeight: 1 }}>✕</span>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  value={newTerritory}
                  onChange={e => setNewTerritory(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && addTerritory()}
                  placeholder="Type territory name and press Add…"
                  style={{ flex: 1, marginBottom: 0 }}
                />
                <button className="btn small" onClick={addTerritory}>+ Add</button>
              </div>
            </div>

            {/* ══ SECTION 2 — CONTACT INFO ══ */}
            <SectionHead title="Contact Information" />

            {editing ? (
              <>
                <EditField label="Email" field="email" value={selected.email} onChange={() => {}} readOnly span />
                <EditField label="Phone 1" field="phone" value={E("phone")} onChange={set} type="tel" />
                <EditField label="Phone 2" field="phone2" value={E("phone2")} onChange={set} type="tel" />
              </>
            ) : (
              <>
                <ReadField label="Email" value={selected.email} span />
                <ReadField label="Phone 1" value={S("phone")} />
                <ReadField label="Phone 2" value={S("phone2")} />
              </>
            )}

            {/* ══ SECTION 3 — ADDRESSES ══ */}
            <SectionHead title="Addresses & Location" />

            {editing ? (
              <>
                <EditField label="Billing / Registered Address" field="address" value={E("address")} onChange={set} textarea span />
                <EditField label="Shop Address" field="shop_address" value={E("shop_address")} onChange={set} textarea span />
                <EditField label="Godown / Warehouse Address" field="godown_address" value={E("godown_address")} onChange={set} textarea span />
              </>
            ) : (
              <>
                <ReadField label="Billing / Registered Address" value={S("address")} span />
                <ReadField label="Shop Address" value={S("shop_address")} span />
                <ReadField label="Godown / Warehouse Address" value={S("godown_address")} span />
              </>
            )}

            {/* GPS location — always available */}
            <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 6, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>GPS Location</div>
              {selected.latitude ? (
                <div style={{ fontSize: 13, fontWeight: 600, color: "#111", marginBottom: 6 }}>
                  📍 {Number(selected.latitude).toFixed(5)}, {Number(selected.longitude).toFixed(5)}{" "}
                  <a href={`https://maps.google.com/?q=${selected.latitude},${selected.longitude}`}
                    target="_blank" rel="noreferrer"
                    style={{ fontSize: 11, color: "var(--red-dark)", fontWeight: 700 }}>
                    View on Maps →
                  </a>
                </div>
              ) : (
                <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 6 }}>No location saved yet.</div>
              )}
              <button className="btn small outline" onClick={fetchLocation}>📡 Fetch My Location</button>
            </div>

          </div>{/* end grid */}

          {/* ══ SECTION 4 — MEDIA ══ */}
          <div style={{ borderTop: "2px solid var(--red-light)", paddingTop: 6, marginTop: 8 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: "0.8px", color: "var(--red-dark)", marginBottom: 18, marginTop: 12,
            }}>
              Photos & Media
            </div>

            {/* Staff name + photo pairs */}
            <div style={{ marginBottom: 18 }}>
              <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Staff Members</div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
                {/* Staff 1 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <MediaTile
                    label="Staff 1 Photo"
                    url={selected.staff1_photo}
                    uploading={uploading.staff1_photo}
                    onPick={f => handleMediaUpload("staff1_photo", f)}
                    editing={true}
                  />
                  {editing
                    ? <input value={E("staff1_name")} onChange={e => set("staff1_name", e.target.value)}
                        placeholder="Staff 1 Name" style={{ width: 96, fontSize: 11, textAlign: "center", marginBottom: 0, padding: "4px 6px" }} />
                    : <div style={{ fontSize: 11, color: "#333", fontWeight: 600, textAlign: "center" }}>{selected.staff1_name || "Staff 1"}</div>
                  }
                </div>
                {/* Staff 2 */}
                <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                  <MediaTile
                    label="Staff 2 Photo"
                    url={selected.staff2_photo}
                    uploading={uploading.staff2_photo}
                    onPick={f => handleMediaUpload("staff2_photo", f)}
                    editing={true}
                  />
                  {editing
                    ? <input value={E("staff2_name")} onChange={e => set("staff2_name", e.target.value)}
                        placeholder="Staff 2 Name" style={{ width: 96, fontSize: 11, textAlign: "center", marginBottom: 0, padding: "4px 6px" }} />
                    : <div style={{ fontSize: 11, color: "#333", fontWeight: 600, textAlign: "center" }}>{selected.staff2_name || "Staff 2"}</div>
                  }
                </div>
              </div>
            </div>

            {/* Photo grid */}
            <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>Shop & Owner</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 16 }}>
              <MediaTile label="Owner Photo"       url={selected.owner_photo}       uploading={uploading.owner_photo}       onPick={f => handleMediaUpload("owner_photo", f)}       editing={true} />
              <MediaTile label="Shop Inside"       url={selected.shop_inside_photo} uploading={uploading.shop_inside_photo} onPick={f => handleMediaUpload("shop_inside_photo", f)} editing={true} />
              <MediaTile label="Shop Board"        url={selected.shop_board_photo}  uploading={uploading.shop_board_photo}  onPick={f => handleMediaUpload("shop_board_photo", f)}  editing={true} />
              <MediaTile label="Interior Video (30s)" url={selected.shop_video}    uploading={uploading.shop_video}        onPick={f => handleMediaUpload("shop_video", f)}         editing={true} accept="video/mp4,video/quicktime,video/*" />
            </div>
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 8 }}>Click any tile to upload or replace. Videos: mp4 / mov, max 30 seconds.</div>
          </div>

          {/* ══ SECTION 5 — GOOGLE BUSINESS ══ */}
          <div style={{ borderTop: "2px solid var(--red-light)", paddingTop: 6, marginTop: 20 }}>
            <div style={{
              fontSize: 11, fontWeight: 800, textTransform: "uppercase",
              letterSpacing: "0.8px", color: "var(--red-dark)", marginBottom: 4, marginTop: 12,
            }}>
              🗺️ Google Business Listing
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "0 28px", marginTop: 8 }}>

              {editing ? (
                <>
                  {/* Google Business Name */}
                  <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Google Business Name</div>
                    <input value={ev("google_business_name")} onChange={e => set("google_business_name", e.target.value)}
                      placeholder="Name as it appears on Google Maps"
                      style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>

                  {/* Google Maps URL */}
                  <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>
                      Google Maps URL
                      {ev("google_maps_url") && (
                        <a href={ev("google_maps_url")} target="_blank" rel="noreferrer"
                          style={{ marginLeft: 10, color: "var(--red-dark)", fontWeight: 700, textTransform: "none" }}>
                          Open in Maps 🔗
                        </a>
                      )}
                    </div>
                    <input value={ev("google_maps_url")} onChange={e => set("google_maps_url", e.target.value)}
                      placeholder="Paste full Google Maps listing URL here…"
                      style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                    <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 5 }}>
                      💡 Tip: Search dealer name on Google Maps and paste the share link here
                    </div>
                  </div>

                  {/* Rating */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Rating (1–5)</div>
                    <input type="number" min="1" max="5" step="0.1" value={ev("google_rating")} onChange={e => set("google_rating", e.target.value)}
                      placeholder="e.g. 4.3"
                      style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>

                  {/* Reviews Count */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Total Reviews</div>
                    <input type="number" min="0" value={ev("google_reviews_count")} onChange={e => set("google_reviews_count", e.target.value)}
                      placeholder="e.g. 42"
                      style={{ width: "100%", boxSizing: "border-box", marginBottom: 0 }} />
                  </div>

                  {/* Listing Status */}
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Listing Status</div>
                    <select value={ev("google_listing_status")} onChange={e => set("google_listing_status", e.target.value)}
                      style={{ width: "100%", padding: "8px 10px", border: "1.5px solid var(--border)", borderRadius: 8, fontSize: 13, marginBottom: 0 }}>
                      <option>Active</option>
                      <option>Unclaimed</option>
                      <option>Suspended</option>
                      <option>Not Listed</option>
                    </select>
                  </div>

                  {/* Listing Claimed */}
                  <div style={{ marginBottom: 14, display: "flex", alignItems: "center", gap: 10, paddingTop: 22 }}>
                    <input type="checkbox" id="gl_claimed" checked={!!edits.google_listing_claimed}
                      onChange={e => set("google_listing_claimed", e.target.checked)}
                      style={{ width: 16, height: 16, accentColor: "var(--red-dark)", cursor: "pointer" }} />
                    <label htmlFor="gl_claimed" style={{ fontSize: 13, fontWeight: 600, cursor: "pointer", userSelect: "none" }}>
                      Listing Claimed
                    </label>
                  </div>
                </>
              ) : (
                <>
                  {/* Read mode */}
                  <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Google Business Name</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: selected.google_business_name ? "#111" : "var(--muted)" }}>
                      {selected.google_business_name || "—"}
                    </div>
                  </div>

                  <div style={{ gridColumn: "1 / -1", marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Google Maps URL</div>
                    {selected.google_maps_url
                      ? <a href={selected.google_maps_url} target="_blank" rel="noreferrer"
                          style={{ fontSize: 13, color: "var(--red-dark)", fontWeight: 600, wordBreak: "break-all" }}>
                          Open Listing in Maps 🔗
                        </a>
                      : <div style={{ fontSize: 14, color: "var(--muted)" }}>—</div>
                    }
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Rating</div>
                    {selected.google_rating != null
                      ? <div style={{ fontSize: 15, fontWeight: 700, color: "#e67e22" }}>
                          {"★".repeat(Math.round(Number(selected.google_rating)))}{"☆".repeat(5 - Math.round(Number(selected.google_rating)))}
                          {" "}<span style={{ fontSize: 13, color: "#555", fontWeight: 600 }}>{Number(selected.google_rating).toFixed(1)}</span>
                        </div>
                      : <div style={{ fontSize: 14, color: "var(--muted)" }}>—</div>
                    }
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Total Reviews</div>
                    <div style={{ fontSize: 14, fontWeight: 500, color: selected.google_reviews_count != null ? "#111" : "var(--muted)" }}>
                      {selected.google_reviews_count != null ? `${selected.google_reviews_count} reviews` : "—"}
                    </div>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Listing Status</div>
                    <span style={{
                      display: "inline-block", padding: "3px 10px", borderRadius: 12, fontSize: 12, fontWeight: 700,
                      background: selected.google_listing_status === "Active" ? "#e8f8f0"
                        : selected.google_listing_status === "Suspended" ? "#fdecea"
                        : "#f5f5f5",
                      color: selected.google_listing_status === "Active" ? "#27ae60"
                        : selected.google_listing_status === "Suspended" ? "#c0392b"
                        : "#777",
                    }}>
                      {selected.google_listing_status || "Not Listed"}
                    </span>
                  </div>

                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 10, color: "var(--muted)", marginBottom: 3, textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 600 }}>Listing Claimed</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: selected.google_listing_claimed ? "#27ae60" : "#c0392b" }}>
                      {selected.google_listing_claimed ? "✓ Yes, claimed" : "✗ Not claimed"}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* ── Block/Unblock ── */}
          <div style={{ marginTop: 28, paddingTop: 18, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 12 }}>
            <button
              className="btn small outline"
              style={{ color: selected.is_blocked ? "#27ae60" : "#c0392b", borderColor: selected.is_blocked ? "#27ae60" : "#c0392b" }}
              disabled={saving} onClick={handleToggleBlock}
            >
              {saving ? "…" : selected.is_blocked ? "✓ Unblock Dealer" : "⊘ Block Dealer"}
            </button>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>
              {selected.is_blocked ? "This dealer is currently blocked from placing orders." : "Dealer can place orders normally."}
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ─── MASTER LIST ─────────────────────────────────────────────────────────────
  return (
    <div className="admin-page">
      <h1 className="admin-title">Dealers</h1>
      {loading ? (
        <div className="admin-loading">Loading…</div>
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
                <th>Territory</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {dealers.map((d, idx) => {
                const territories = Array.isArray(d.territory) ? d.territory : [];
                return (
                  <tr key={d.id} onClick={() => openDealer(d)} style={{ cursor: "pointer" }} className="admin-dealer-row">
                    <td style={{ color: "var(--muted)", fontSize: 12, textAlign: "center" }}>{idx + 1}</td>
                    <td style={{ fontFamily: "monospace", fontSize: 12 }}>{d.dealer_code || "—"}</td>
                    <td>
                      <div style={{ fontWeight: 700, fontSize: 13 }}>
                        {d.shop_name || d.owner_name || (d.name !== "New Dealer" ? d.name : "—")}
                      </div>
                      <div style={{ fontSize: 11, color: "var(--muted)" }}>{d.email}</div>
                    </td>
                    <td style={{ fontSize: 12 }}>{d.phone || "—"}</td>
                    <td style={{ fontSize: 11, color: "var(--muted)" }}>
                      {territories.slice(0, 2).join(", ")}{territories.length > 2 ? ` +${territories.length - 2}` : ""}
                    </td>
                    <td>
                      <span className={`badge ${d.is_blocked ? "pending" : "delivered"}`}>
                        {d.is_blocked ? "Blocked" : "Active"}
                      </span>
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
