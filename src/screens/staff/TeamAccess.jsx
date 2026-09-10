import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";

// Team & Access — Senior Sales Associate + Senior Sales Executive only.
// Lets a senior grant or revoke another Sales staff member's LEDGER
// access to a dealer (R4 of Eltop_Dealer_Access_Control_Design_
// 10Sep2026.md). Doesn't touch who can SEE a dealer or check in there —
// that's universal for everyone already (R1/R2), this screen is purely
// about the financial ledger. Server re-validates every grant/revoke
// (get_my_team_access / grant_dealer_access / revoke_dealer_access are
// all SECURITY DEFINER and re-check the caller's own tier + access) —
// this screen only decides what's shown, never what's allowed.

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

const CARD_STYLE = {
  background: "#fff",
  border: "1.5px solid #7B2D8B",
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

function GrantPicker({ dealerId, onDone, onCancel }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    supabase.rpc("get_grantable_staff", { p_dealer_id: dealerId }).then(({ data, error }) => {
      if (!error) setStaff(data || []);
      setLoading(false);
    });
  }, [dealerId]);

  const toggle = (email) => {
    setSelected((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));
  };

  const handleGrant = async () => {
    if (selected.length === 0) return;
    setSubmitting(true);
    setError(null);
    try {
      const { data, error } = await supabase.rpc("grant_dealer_access", {
        p_dealer_id: dealerId,
        p_grantee_emails: selected,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setError(error?.message || result?.message || "Couldn't grant access.");
        setSubmitting(false);
        return;
      }
      // Email half of the notification decision — fire-and-forget per
      // grantee, best-effort (in-app alert + the grant itself already
      // succeeded server-side either way).
      const selectedStaff = staff.filter((s) => selected.includes(s.email));
      selectedStaff.forEach((s) => {
        supabase.functions
          .invoke("send-access-grant-email", {
            body: {
              to_email: s.email,
              to_name: s.name,
              dealer_name: onDone.dealerName,
              granted_by_name: onDone.granterName,
            },
          })
          .catch(() => {});
      });
      onDone();
    } catch (err) {
      setError(err.message || "Couldn't grant access.");
      setSubmitting(false);
    }
  };

  return (
    <div style={{ background: "#f8f0f9", border: "1.5px solid #eadcec", borderRadius: 10, padding: 14, marginTop: 10 }}>
      <div style={{ fontSize: 11.5, fontWeight: 800, color: "#7B2D8B", marginBottom: 8 }}>
        Pick one or more people to grant this dealer's ledger to
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>Loading…</div>
      ) : staff.length === 0 ? (
        <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No one eligible to grant this to right now.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          {staff.map((s) => (
            <label key={s.email} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12.5, color: "#333", cursor: "pointer" }}>
              <input type="checkbox" checked={selected.includes(s.email)} onChange={() => toggle(s.email)} />
              {s.name || s.email}
            </label>
          ))}
        </div>
      )}
      {error && <div style={{ fontSize: 11.5, color: "#d64545", marginBottom: 8 }}>{error}</div>}
      <div style={{ display: "flex", gap: 8 }}>
        <button
          onClick={handleGrant}
          disabled={submitting || selected.length === 0}
          style={{
            flex: 1, padding: "9px 10px", borderRadius: 8, border: "none", fontSize: 12.5, fontWeight: 800,
            background: submitting || selected.length === 0 ? "#c9a8d1" : "#7B2D8B", color: "#fff",
            cursor: submitting || selected.length === 0 ? "default" : "pointer",
          }}
        >
          {submitting ? "Granting…" : `Grant to ${selected.length || ""} ${selected.length === 1 ? "person" : "people"}`.trim()}
        </button>
        <button
          onClick={onCancel}
          disabled={submitting}
          style={{ padding: "9px 14px", borderRadius: 8, border: "1.5px solid #eadcec", background: "#fff", color: "#666", fontSize: 12.5, fontWeight: 700, cursor: "pointer" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function DealerAccessCard({ row, granterEmail, granterName, canRevokeAll, onChanged }) {
  const [showPicker, setShowPicker] = useState(false);
  const [revokingEmail, setRevokingEmail] = useState(null);

  const handleRevoke = async (email) => {
    setRevokingEmail(email);
    try {
      await supabase.rpc("revoke_dealer_access", { p_dealer_id: row.dealer_id, p_grantee_email: email });
    } finally {
      setRevokingEmail(null);
      onChanged();
    }
  };

  return (
    <div style={CARD_STYLE}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 800 }}>{row.dealer_name}</div>
          <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>
            {row.dealer_code || "—"} · owner: {row.is_owner ? "you" : row.owner_name || "—"}
          </div>
        </div>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: Number(row.outstanding) > 0 ? "#d64545" : "#2fa84f" }}>
          ₹{Number(row.outstanding || 0).toLocaleString("en-IN")}
        </div>
      </div>

      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#999", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 8 }}>
        Who can see this ledger
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f2f2f2" }}>
        <div style={{ width: 28, height: 28, borderRadius: 999, background: "#f3e6f6", color: "#7B2D8B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
          {initials(row.owner_name)}
        </div>
        <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>
          {row.is_owner ? "You" : row.owner_name || "—"} <span style={{ fontWeight: 600, color: "#999" }}>· owner</span>
        </div>
        <div style={{ fontSize: 10, fontWeight: 700, color: "#999" }}>Always on</div>
      </div>

      {(row.grants || []).map((g) => (
        <div key={g.email} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f2f2f2" }}>
          <div style={{ width: 28, height: 28, borderRadius: 999, background: "#f3e6f6", color: "#7B2D8B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0 }}>
            {initials(g.name)}
          </div>
          <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>
            {g.name} <span style={{ fontWeight: 600, color: "#999" }}>· granted by {g.granted_by === granterEmail ? "you" : g.granted_by_name}</span>
          </div>
          {(canRevokeAll || g.granted_by === granterEmail) && (
            <div
              onClick={() => revokingEmail !== g.email && handleRevoke(g.email)}
              style={{
                fontSize: 10.5, fontWeight: 800, color: "#d64545", background: "#fdeaea", borderRadius: 999,
                padding: "4px 10px", cursor: revokingEmail === g.email ? "default" : "pointer",
                opacity: revokingEmail === g.email ? 0.6 : 1,
              }}
            >
              {revokingEmail === g.email ? "…" : "Revoke"}
            </div>
          )}
        </div>
      ))}

      {(!row.grants || row.grants.length === 0) && (
        <div style={{ fontSize: 12, color: "#999", padding: "4px 0 10px" }}>Only {row.is_owner ? "you" : "the owner"}, right now.</div>
      )}

      {!showPicker ? (
        <button
          onClick={() => setShowPicker(true)}
          style={{ width: "100%", marginTop: 12, padding: 10, border: "1.5px dashed #7B2D8B", borderRadius: 8, background: "#fff", color: "#7B2D8B", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
        >
          + Grant access · pick multiple people
        </button>
      ) : (
        <GrantPicker
          dealerId={row.dealer_id}
          onDone={Object.assign(() => { setShowPicker(false); onChanged(); }, { dealerName: row.dealer_name, granterName })}
          onCancel={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}

export default function TeamAccess() {
  const navigate = useNavigate();
  const { staffProfile, session } = useApp();
  const myEmail = session?.user?.email || "";
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const canManage = staffProfile?.role === "senior_sales_associate" || staffProfile?.role === "senior_sales_executive";

  const load = () => {
    setLoading(true);
    supabase.rpc("get_my_team_access").then(({ data, error }) => {
      if (error) setError(error.message);
      else setRows(data || []);
      setLoading(false);
    });
  };

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!canManage) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
        <div style={{ padding: "18px 24px" }}>
          <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#7B2D8B", fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0 }}>
            ← Back
          </button>
        </div>
        <div style={{ textAlign: "center", padding: "60px 24px", color: "#999", fontSize: 13.5 }}>
          This screen is only for Senior Sales Associate and Senior Sales Executive.
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 20px 20px", color: "#fff" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 4 }}>
          ← Dashboard
        </button>
        <div style={{ fontSize: 19, fontWeight: 800, marginTop: 6 }}>Team &amp; Access</div>
        <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
          {staffProfile?.name} · {staffProfile?.role === "senior_sales_executive" ? "Senior Sales Executive" : "Senior Sales Associate"} — grant or revoke ledger access to a dealer, for anyone on Sales.
        </div>
      </div>

      <div style={{ padding: "14px 16px", maxWidth: 640, margin: "0 auto" }}>
        {loading ? (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>
        ) : error ? (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#d64545" }}>Couldn't load ({error}).</div>
        ) : rows.length === 0 ? (
          <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>No dealers with ledger access yet.</div>
        ) : (
          rows.map((row) => (
            <DealerAccessCard
              key={row.dealer_id}
              row={row}
              granterEmail={myEmail}
              granterName={staffProfile?.name}
              canRevokeAll={staffProfile?.role === "senior_sales_executive"}
              onChanged={load}
            />
          ))
        )}

        <div style={{ display: "flex", gap: 8, alignItems: "flex-start", background: "#f8f0f9", border: "1px solid #eadcec", borderRadius: 10, padding: "10px 12px", marginTop: 4 }}>
          <div style={{ width: 22, height: 22, borderRadius: 999, background: "#fff", border: "1.5px solid #7B2D8B", color: "#7B2D8B", fontSize: 12, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            i
          </div>
          <div style={{ fontSize: 11, color: "#7B2D8B", fontWeight: 600, lineHeight: 1.5 }}>
            {staffProfile?.role === "senior_sales_executive"
              ? "As Senior Sales Executive you can grant or revoke any Sales dealer's ledger, for anyone on Sales."
              : "You see this for dealers you can already see the ledger of — and can only grant access to people who report to you."}
          </div>
        </div>
      </div>
    </div>
  );
}
