import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { STAFF_ROLE_META, staffRoleLabel } from "../utils/staffRoles";

const ROLE_OPTIONS = Object.keys(STAFF_ROLE_META);

const EMPTY_FORM = { email: "", name: "", role: ROLE_OPTIONS[0], reports_to: "" };

export default function AdminStaff() {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [form, setForm]         = useState(EMPTY_FORM);
  const [saving, setSaving]     = useState(false);
  const [formError, setFormError] = useState("");

  const load = async () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setFetchError("");
    const { data, error } = await supabase
      .from("staff_profiles")
      .select("email, id, name, role, department, reports_to, is_active, created_at")
      .order("created_at", { ascending: false });
    if (error) {
      setFetchError(error.message || "Failed to load staff.");
    } else {
      setRows(data || []);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const handleAdd = async () => {
    setFormError("");
    const email = form.email.trim().toLowerCase();
    if (!email) { setFormError("Email is required."); return; }
    if (rows.some(r => r.email === email)) { setFormError("This email is already registered as staff."); return; }

    setSaving(true);
    const department = STAFF_ROLE_META[form.role]?.department || "";
    const { error } = await supabase.from("staff_profiles").insert({
      email,
      name: form.name.trim() || null,
      role: form.role,
      department,
      reports_to: form.reports_to || null,
    });
    setSaving(false);
    if (error) {
      setFormError(error.message || "Could not add staff member.");
      return;
    }
    setForm(EMPTY_FORM);
    load();
  };

  const toggleActive = async (row) => {
    await supabase.from("staff_profiles").update({ is_active: !row.is_active }).eq("email", row.email);
    load();
  };

  const removeRow = async (row) => {
    if (!window.confirm(`Remove ${row.email} from staff? This cannot be undone.`)) return;
    await supabase.from("staff_profiles").delete().eq("email", row.email);
    load();
  };

  return (
    <div className="admin-page">
      <h1 className="admin-title">Staff</h1>
      <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 20 }}>
        Add a staff member here BEFORE they try to log in — the Staff login option on
        the login screen only lets registered, active emails through.
      </div>

      {/* ── Add staff form ── */}
      <div style={{ background: "#fff", border: "1px solid #eee", borderRadius: 10, padding: 18, marginBottom: 24, display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>Email</div>
          <input
            type="email"
            value={form.email}
            onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
            placeholder="name@eltop.com"
            style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 13, minWidth: 200 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>Name</div>
          <input
            type="text"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            placeholder="Optional"
            style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 13, minWidth: 160 }}
          />
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>Role</div>
          <select
            className="admin-select"
            value={form.role}
            onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 13 }}
          >
            {ROLE_OPTIONS.map(r => (
              <option key={r} value={r}>{staffRoleLabel(r)} — {STAFF_ROLE_META[r].department}</option>
            ))}
          </select>
        </div>
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 4 }}>Reports to (optional)</div>
          <select
            className="admin-select"
            value={form.reports_to}
            onChange={e => setForm(f => ({ ...f, reports_to: e.target.value }))}
            style={{ padding: "8px 10px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 13 }}
          >
            <option value="">— none —</option>
            {rows.map(r => (
              <option key={r.email} value={r.email}>{r.name || r.email}</option>
            ))}
          </select>
        </div>
        <button className="btn small" disabled={saving} onClick={handleAdd}>
          {saving ? "Adding…" : "+ Add Staff"}
        </button>
      </div>
      {formError && (
        <div style={{ background: "#fff1f2", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "10px 14px", marginBottom: 20, color: "#be123c", fontSize: 13 }}>
          {formError}
        </div>
      )}

      {fetchError && (
        <div style={{ background: "#fff1f2", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "12px 16px", marginBottom: 20, color: "#be123c", fontSize: 13 }}>
          ⚠️ Query failed: {fetchError}
        </div>
      )}

      {loading ? (
        <div className="admin-loading">Loading&hellip;</div>
      ) : rows.length === 0 ? (
        <div className="admin-empty">No staff added yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Email</th>
                <th>Name</th>
                <th>Role</th>
                <th>Department</th>
                <th>Reports to</th>
                <th>Login status</th>
                <th>Active</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.email}>
                  <td>{r.email}</td>
                  <td>{r.name || "—"}</td>
                  <td>{staffRoleLabel(r.role)}</td>
                  <td>{r.department}</td>
                  <td>{r.reports_to || "—"}</td>
                  <td>{r.id ? "Logged in at least once" : "Never logged in"}</td>
                  <td>
                    <button className="btn small outline" onClick={() => toggleActive(r)}>
                      {r.is_active ? "Active — deactivate" : "Deactivated — activate"}
                    </button>
                  </td>
                  <td>
                    <button className="btn small outline" style={{ color: "#c0392b", borderColor: "#c0392b" }} onClick={() => removeRow(r)}>
                      Remove
                    </button>
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
