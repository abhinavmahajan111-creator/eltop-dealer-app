import { useEffect, useMemo, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import ScrollFade from "../components/ScrollFade";

// Admin-facing check-in/check-out activity log + emergency controls —
// built 3 Sept 2026 for a real, no-current-remedy scenario: a rep's phone
// dies right after check-in (before checkout), or a dealer's saved GPS
// location is wrong and keeps failing the 100m geofence, and until now
// NOTHING — not even an admin — could close the stuck open visit, because
// sales_visits has RLS enabled with zero policies (every read/write goes
// through the SECURITY DEFINER functions in sales_visits_checkinout.sql,
// none of which were admin-facing).
//
// Two remedies, both scoped to admins only (admin_get_all_visits /
// admin_force_checkout re-check public.is_admin() server-side — this
// screen being reachable is not itself the authorization):
//   - Force Checkout — closes a stuck open visit without the 100m geofence
//     or photo/video requirements (an admin isn't standing at the dealer).
//     Requires a reason; the visit is flagged forced_checkout so it stays
//     visibly distinct from a normal field checkout, never silently
//     indistinguishable from real data.
//   - Reset GPS — clears the dealer's saved location_lat/lng (via the
//     existing "Admins can update any profile" RLS policy — no new RPC
//     needed) so the next check-in there sets it fresh, same as a
//     brand-new dealer. Fixes a dealer whose stored location is stale or
//     was captured wrong, which otherwise keeps failing check-in/checkout
//     for every rep at that dealer, not just once.

function fmtDateTime(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
}

function StatusBadge({ status, forced }) {
  if (status === "open") {
    return <span style={{ fontSize: 11, fontWeight: 700, color: "#c98400", background: "#fff4e0", borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>Still checked in</span>;
  }
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 3, alignItems: "flex-start" }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: "#2fa84f", background: "#e6f7ec", borderRadius: 999, padding: "3px 9px", whiteSpace: "nowrap" }}>Checked out</span>
      {forced && (
        <span style={{ fontSize: 10, fontWeight: 700, color: "#c0392b", background: "#fdeceb", borderRadius: 999, padding: "2px 8px", whiteSpace: "nowrap" }}>⚡ Force closed</span>
      )}
    </div>
  );
}

export default function AdminVisits() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("__all__"); // __all__ | open | checked_out

  const [forceTarget, setForceTarget] = useState(null); // the visit row being force-closed, or null
  const [forceReason, setForceReason] = useState("");
  const [forceSubmitting, setForceSubmitting] = useState(false);
  const [forceError, setForceError] = useState("");

  const [resettingDealerId, setResettingDealerId] = useState(null);
  const [message, setMessage] = useState("");

  const load = () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    setFetchError("");
    supabase
      .rpc("admin_get_all_visits", { p_limit: 300, p_status: null, p_search: null })
      .then(({ data, error }) => {
        if (error) setFetchError(error.message || "Failed to load visit activity.");
        else setRows(data || []);
        setLoading(false);
      });
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    let out = [...rows];
    if (statusFilter !== "__all__") out = out.filter((r) => r.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        (r.dealer_name || "").toLowerCase().includes(q) ||
        (r.dealer_code || "").toLowerCase().includes(q) ||
        (r.staff_name || "").toLowerCase().includes(q) ||
        (r.staff_email || "").toLowerCase().includes(q)
      );
    }
    return out;
  }, [rows, statusFilter, search]);

  const openCount = useMemo(() => rows.filter((r) => r.status === "open").length, [rows]);

  const handleForceCheckout = async () => {
    if (!forceTarget) return;
    setForceError("");
    if (!forceReason.trim()) { setForceError("A reason is required."); return; }
    setForceSubmitting(true);
    const { data, error } = await supabase.rpc("admin_force_checkout", {
      p_visit_id: forceTarget.id,
      p_reason: forceReason.trim(),
    });
    const result = Array.isArray(data) ? data[0] : data;
    setForceSubmitting(false);
    if (error || !result?.success) {
      setForceError(error?.message || result?.message || "Couldn't force checkout.");
      return;
    }
    setForceTarget(null);
    setForceReason("");
    setMessage(`Force-closed the visit at ${forceTarget.dealer_name || "this dealer"}.`);
    load();
  };

  const handleResetGps = async (row) => {
    if (!window.confirm(`Reset ${row.dealer_name || "this dealer"}'s saved GPS location?\n\nThe next check-in there will set a fresh location — use this if check-in/checkout keeps failing the distance check for reasons that aren't the rep's fault (dealer relocated, or the location was captured wrong the first time).`)) {
      return;
    }
    setResettingDealerId(row.dealer_id);
    const { error } = await supabase
      .from("profiles")
      .update({ location_lat: null, location_lng: null })
      .eq("id", row.dealer_id);
    setResettingDealerId(null);
    if (error) {
      setMessage(`Couldn't reset location: ${error.message}`);
    } else {
      setMessage(`Reset ${row.dealer_name || "the dealer"}'s saved GPS location — the next check-in there sets it fresh.`);
    }
  };

  return (
    <div className="admin-page">
      <h1 className="admin-title">Field Activity</h1>
      <div style={{ fontSize: 13, color: "var(--muted)", marginTop: 6, marginBottom: 18, maxWidth: 720, lineHeight: 1.6 }}>
        Every rep check-in / check-out, across all dealers. If a rep's phone died before checkout (or a dealer's
        saved location is wrong and keeps failing the 100m distance check), use <b>Force Checkout</b> to close a
        stuck visit, and <b>Reset GPS</b> to fix that dealer's location going forward.
        {openCount > 0 && (
          <span style={{ display: "block", marginTop: 6, color: "#c98400", fontWeight: 700 }}>
            {openCount} visit{openCount === 1 ? "" : "s"} currently still checked in.
          </span>
        )}
      </div>

      {message && (
        <div style={{ background: "#f3e6f6", border: "1.3px solid #d9b8e0", color: "#7B2D8B", fontSize: 12.5, fontWeight: 600, borderRadius: 8, padding: "9px 14px", marginBottom: 16, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <span>{message}</span>
          <button onClick={() => setMessage("")} className="admin-link" style={{ flexShrink: 0 }}>Dismiss</button>
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap", alignItems: "center" }}>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search dealer or staff…"
          style={{ padding: "8px 12px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 13, minWidth: 220 }}
        />
        <select
          className="admin-select"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="__all__">All statuses</option>
          <option value="open">Still checked in</option>
          <option value="checked_out">Checked out</option>
        </select>
        <button className="admin-link" onClick={load}>↻ Refresh</button>
      </div>

      {loading ? (
        <div className="admin-loading">Loading&hellip;</div>
      ) : fetchError ? (
        <div className="admin-empty" style={{ color: "#c0392b" }}>{fetchError}</div>
      ) : filtered.length === 0 ? (
        <div className="admin-empty">No visits match the current filters.</div>
      ) : (
        <ScrollFade className="admin-table-wrap" bg="#fff">
          <table className="admin-table">
            <thead>
              <tr>
                <th style={{ width: 32 }}>#</th>
                <th>Status</th>
                <th>Dealer</th>
                <th>Staff</th>
                <th>Check-in</th>
                <th>Check-out</th>
                <th>Discussion</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.id}>
                  <td style={{ textAlign: "center", color: "var(--muted)", fontSize: 12, fontWeight: 600 }}>{i + 1}</td>
                  <td><StatusBadge status={r.status} forced={r.forced_checkout} /></td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{r.dealer_name || "Unnamed"}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.dealer_code || "—"}</div>
                  </td>
                  <td>
                    <div style={{ fontSize: 13, fontWeight: 600 }}>{r.staff_name || "—"}</div>
                    <div style={{ fontSize: 11, color: "var(--muted)" }}>{r.staff_email}</div>
                  </td>
                  <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>{fmtDateTime(r.check_in_at) || "—"}</td>
                  <td style={{ fontSize: 12.5, whiteSpace: "nowrap" }}>
                    {r.status === "open" ? <span style={{ color: "#c98400", fontStyle: "italic" }}>— pending</span> : (fmtDateTime(r.check_out_at) || "—")}
                  </td>
                  <td style={{ fontSize: 12.5, color: "#555", maxWidth: 240, lineHeight: 1.5 }}>
                    {r.notes || <span style={{ color: "#bbb", fontStyle: "italic" }}>No notes added</span>}
                    {r.forced_checkout && r.force_checkout_reason && (
                      <div style={{ marginTop: 4, fontSize: 11, color: "#c0392b" }}>
                        Force-closed by {r.force_checkout_by || "admin"}: {r.force_checkout_reason}
                      </div>
                    )}
                  </td>
                  <td style={{ whiteSpace: "nowrap" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: 6, alignItems: "flex-start" }}>
                      {r.status === "open" && (
                        <button
                          onClick={() => { setForceTarget(r); setForceReason(""); setForceError(""); }}
                          style={{ background: "#fdeceb", border: "1.3px solid #e8b4ae", color: "#c0392b", fontSize: 11, fontWeight: 800, borderRadius: 7, padding: "5px 10px", cursor: "pointer" }}
                        >
                          ⚡ Force Checkout
                        </button>
                      )}
                      <button
                        onClick={() => handleResetGps(r)}
                        disabled={resettingDealerId === r.dealer_id}
                        style={{ background: "#fff", border: "1.3px solid #ddd", color: "#666", fontSize: 11, fontWeight: 700, borderRadius: 7, padding: "5px 10px", cursor: resettingDealerId === r.dealer_id ? "default" : "pointer" }}
                      >
                        {resettingDealerId === r.dealer_id ? "Resetting…" : "📍 Reset GPS"}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollFade>
      )}

      {forceTarget && (
        <div
          onClick={() => !forceSubmitting && setForceTarget(null)}
          style={{ position: "fixed", inset: 0, background: "rgba(20,10,25,0.5)", zIndex: 60, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#fff", borderRadius: 14, padding: 22, width: "100%", maxWidth: 440, boxShadow: "0 8px 30px rgba(0,0,0,0.2)" }}
          >
            <div style={{ fontSize: 15, fontWeight: 800, color: "#c0392b", marginBottom: 6 }}>⚡ Force Checkout</div>
            <div style={{ fontSize: 12.5, color: "#666", lineHeight: 1.6, marginBottom: 14 }}>
              Closes <b>{forceTarget.staff_name || forceTarget.staff_email}</b>'s open visit at{" "}
              <b>{forceTarget.dealer_name || "this dealer"}</b> (checked in {fmtDateTime(forceTarget.check_in_at) || "—"})
              without the usual 100m distance check or checkout photos — for cases where the rep genuinely can't
              complete checkout themselves (phone died, dealer's saved location is wrong, etc). This is logged
              against your admin account.
            </div>
            <div style={{ fontSize: 11.5, fontWeight: 700, color: "#444", marginBottom: 6 }}>Reason (required)</div>
            <textarea
              value={forceReason}
              onChange={(e) => setForceReason(e.target.value)}
              placeholder="e.g. rep's phone died right after check-in, confirmed by call"
              rows={3}
              style={{ width: "100%", padding: "9px 11px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 12.5, fontFamily: "inherit", resize: "vertical", boxSizing: "border-box" }}
            />
            {forceError && <div style={{ color: "#c0392b", fontSize: 12, fontWeight: 700, marginTop: 8 }}>{forceError}</div>}
            <div style={{ display: "flex", gap: 10, marginTop: 16, justifyContent: "flex-end" }}>
              <button
                onClick={() => setForceTarget(null)}
                disabled={forceSubmitting}
                style={{ background: "#fff", border: "1.5px solid #ddd", color: "#555", fontSize: 12.5, fontWeight: 700, borderRadius: 8, padding: "9px 16px", cursor: "pointer" }}
              >
                Cancel
              </button>
              <button
                onClick={handleForceCheckout}
                disabled={forceSubmitting}
                style={{ background: "#c0392b", border: "none", color: "#fff", fontSize: 12.5, fontWeight: 800, borderRadius: 8, padding: "9px 16px", cursor: forceSubmitting ? "default" : "pointer" }}
              >
                {forceSubmitting ? "Closing…" : "Force Checkout"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
