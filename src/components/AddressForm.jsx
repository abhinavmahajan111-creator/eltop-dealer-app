const INDIAN_STATES = [
  "Andaman and Nicobar Islands", "Andhra Pradesh", "Arunachal Pradesh",
  "Assam", "Bihar", "Chandigarh", "Chhattisgarh",
  "Dadra and Nagar Haveli and Daman and Diu", "Delhi", "Goa", "Gujarat",
  "Haryana", "Himachal Pradesh", "Jammu and Kashmir", "Jharkhand",
  "Karnataka", "Kerala", "Ladakh", "Lakshadweep", "Madhya Pradesh",
  "Maharashtra", "Manipur", "Meghalaya", "Mizoram", "Nagaland", "Odisha",
  "Puducherry", "Punjab", "Rajasthan", "Sikkim", "Tamil Nadu", "Telangana",
  "Tripura", "Uttar Pradesh", "Uttarakhand", "West Bengal",
];

export default function AddressForm({ form, onChange, onSave, onCancel, saving, error }) {
  const set = (k, v) => onChange(prev => ({ ...prev, [k]: v, _validationError: undefined }));
  const inp = { display: "block", marginTop: 4, width: "100%", padding: "8px 10px", border: "1px solid #cbd5e1", borderRadius: 8, fontSize: 13, fontFamily: "inherit", boxSizing: "border-box" };
  const required = ["label", "recipient_name", "phone", "address_line1", "city", "state", "pincode"];

  function validate() {
    for (const k of required) if (!form[k]?.trim()) return `${k.replace(/_/g, " ")} is required`;
    if (!/^\d{10}$/.test(form.phone?.trim())) return "Phone must be 10 digits";
    if (!/^\d{6}$/.test(form.pincode?.trim())) return "Pincode must be 6 digits";
    return null;
  }

  function handleSave() {
    const err = validate();
    if (err) { onChange(f => ({ ...f, _validationError: err })); return; }
    onSave(form);
  }

  const validationError = form._validationError;

  return (
    <div style={{ background: "#f8f4f8", borderRadius: 10, padding: 16, marginBottom: 16, border: "1px solid #e2e8f0" }}>
      <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 12, color: "#7B2D8B" }}>
        {form.id ? "Edit Address" : "New Address"}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "10px 14px" }}>
        {[
          ["label",          "Label (e.g. Home, Office)"],
          ["recipient_name", "Recipient Name"],
          ["phone",          "Phone (10 digits)"],
          ["address_line1",  "Address Line 1"],
          ["address_line2",  "Address Line 2 (optional)"],
          ["city",           "City"],
          ["state",          "State"],
          ["pincode",        "Pincode (6 digits)"],
        ].map(([k, label]) => (
          <label key={k} style={{ fontSize: 12, color: "#555", gridColumn: (k === "address_line1" || k === "address_line2") ? "1 / -1" : undefined }}>
            {label}{required.includes(k) && <span style={{ color: "#dc2626" }}> *</span>}
            {k === "state" ? (
              <select value={form.state || ""} onChange={e => set("state", e.target.value)} style={inp}>
                <option value="" disabled>Select State</option>
                {INDIAN_STATES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            ) : (
              <input
                value={form[k] || ""}
                onChange={e => set(k, (k === "phone" || k === "pincode") ? e.target.value.replace(/\D/g, "") : e.target.value)}
                maxLength={k === "phone" ? 10 : k === "pincode" ? 6 : undefined}
                inputMode={(k === "phone" || k === "pincode") ? "numeric" : "text"}
                style={inp}
              />
            )}
          </label>
        ))}
      </div>
      <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 12, fontSize: 13, cursor: "pointer" }}>
        <input type="checkbox" checked={Boolean(form.is_default)} onChange={e => set("is_default", e.target.checked)} />
        Set as default address
      </label>
      {(error || validationError) && (
        <div style={{ marginTop: 10, fontSize: 13, color: "#dc2626", fontWeight: 600 }}>
          {error || validationError}
        </div>
      )}
      <div style={{ marginTop: 14, display: "flex", gap: 10 }}>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{ background: "#7B2D8B", color: "#fff", border: "none", borderRadius: 8, padding: "8px 20px", fontWeight: 700, fontSize: 13, cursor: saving ? "not-allowed" : "pointer", opacity: saving ? 0.7 : 1 }}
        >
          {saving ? "Saving…" : "Save Address"}
        </button>
        <button onClick={onCancel} style={{ background: "none", border: "1px solid #cbd5e1", borderRadius: 8, padding: "8px 16px", fontSize: 13, cursor: "pointer", fontFamily: "inherit" }}>
          Cancel
        </button>
      </div>
    </div>
  );
}
