import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../../context/AppContext";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import TeamHierarchy from "./TeamHierarchy";

// Team & Access — Senior Sales Associate + Senior Sales Executive only.
// Lets a senior grant or revoke another Sales staff member's LEDGER
// access to a dealer (R4 of Eltop_Dealer_Access_Control_Design_
// 10Sep2026.md). Doesn't touch who can SEE a dealer or check in there —
// that's universal for everyone already (R1/R2), this screen is purely
// about the financial ledger. Server re-validates every grant/revoke
// (get_my_team_access / grant_dealer_access / revoke_dealer_access are
// all SECURITY DEFINER and re-check the caller's own tier + access) —
// this screen only decides what's shown, never what's allowed.
//
// Redesigned 13 Sep 2026 per Sumaksh's feedback on the first version:
// numbered dealer cards, a dealer search box, a searchable/sorted staff
// picker for grants, and a per-dealer access-history timeline (backed by
// the new append-only dealer_access_history table + get_dealer_access_
// history RPC — dealer_access_grants itself only ever holds current
// state, so history has to come from a separate log).

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" }) + ", " +
    d.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" });
}

const CARD_STYLE = {
  background: "#fff",
  border: "1.5px solid #7B2D8B",
  borderRadius: 14,
  padding: "16px 18px",
  marginBottom: 14,
  boxShadow: "0 2px 10px rgba(0,0,0,0.05)",
};

const AVATAR_STYLE = {
  width: 28, height: 28, borderRadius: 999, background: "#f3e6f6", color: "#7B2D8B",
  display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800, flexShrink: 0,
};

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div style={{ position: "relative" }}>
      <span style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)", fontSize: 13, color: "#aaa" }}>⌕</span>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", boxSizing: "border-box", padding: "9px 12px 9px 32px", borderRadius: 8,
          border: "1.5px solid #eadcec", fontSize: 12.5, outline: "none", background: "#fff",
        }}
      />
    </div>
  );
}

function GrantPicker({ dealerId, onDone, onCancel }) {
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    supabase.rpc("get_grantable_staff", { p_dealer_id: dealerId }).then(({ data, error }) => {
      if (!error) setStaff(data || []);
      setLoading(false);
    });
  }, [dealerId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = q
      ? staff.filter((s) => (s.name || "").toLowerCase().includes(q) || s.email.toLowerCase().includes(q))
      : staff;
    // Server already sorts by name, but re-sort defensively in case of a stale/cached list.
    return [...list].sort((a, b) => (a.name || a.email).localeCompare(b.name || b.email));
  }, [staff, query]);

  const toggle = (email) => {
    setSelected((prev) => (prev.includes(email) ? prev.filter((e) => e !== email) : [...prev, email]));
  };

  const roleLabel = (role) => {
    if (role === "senior_sales_executive") return "Senior Sales Executive";
    if (role === "senior_sales_associate") return "Senior Sales Associate";
    return "Sales Associate";
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

      {!loading && staff.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <SearchBox value={query} onChange={setQuery} placeholder="Search sales person" />
        </div>
      )}

      {loading ? (
        <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>Loading…</div>
      ) : staff.length === 0 ? (
        <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No one eligible to grant this to right now.</div>
      ) : filtered.length === 0 ? (
        <div style={{ fontSize: 12, color: "#999", padding: "8px 0" }}>No one matches "{query}".</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2, marginBottom: 10, maxHeight: 220, overflowY: "auto" }}>
          {filtered.map((s) => (
            <label
              key={s.email}
              style={{
                display: "flex", alignItems: "center", gap: 10, padding: "7px 6px", borderRadius: 8, cursor: "pointer",
                background: selected.includes(s.email) ? "#eee0f2" : "transparent",
              }}
            >
              <input
                type="checkbox"
                checked={selected.includes(s.email)}
                onChange={() => toggle(s.email)}
                style={{ flexShrink: 0, width: 16, height: 16, padding: 0, margin: 0, border: "1.5px solid #ccc", borderRadius: 4 }}
              />
              <div style={AVATAR_STYLE}>{initials(s.name || s.email)}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12.5, fontWeight: 700, color: "#333", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {s.name || s.email}
                </div>
                <div style={{ fontSize: 10.5, color: "#999" }}>{roleLabel(s.role)}</div>
              </div>
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

function HistoryPanel({ dealerId }) {
  const [history, setHistory] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    supabase.rpc("get_dealer_access_history", { p_dealer_id: dealerId }).then(({ data, error }) => {
      if (cancelled) return;
      setHistory(error ? [] : data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [dealerId]);

  return (
    <div style={{ borderTop: "1px solid #f2f2f2", marginTop: 10, paddingTop: 10 }}>
      <div style={{ fontSize: 10.5, fontWeight: 800, color: "#999", textTransform: "uppercase", letterSpacing: 0.4, marginBottom: 6 }}>
        Access history
      </div>
      {loading ? (
        <div style={{ fontSize: 12, color: "#999", padding: "4px 0" }}>Loading…</div>
      ) : history.length === 0 ? (
        <div style={{ fontSize: 12, color: "#999", padding: "4px 0" }}>No access changes yet.</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {history.map((h, i) => (
            <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <div
                style={{
                  fontSize: 11, fontWeight: 800, flexShrink: 0, marginTop: 1,
                  color: h.action === "granted" ? "#2fa84f" : "#d64545",
                }}
              >
                {h.action === "granted" ? "+" : "–"}
              </div>
              <div style={{ fontSize: 12, color: "#333" }}>
                {h.action === "granted" ? "Access granted to " : "Access revoked from "}
                <span style={{ fontWeight: 700 }}>{h.grantee_name}</span>
                <div style={{ fontSize: 10.5, color: "#999", marginTop: 1 }}>
                  by {h.actor_name} · {formatWhen(h.created_at)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DealerAccessCard({ row, number, granterEmail, granterName, canRevokeAll, onChanged }) {
  const [showPicker, setShowPicker] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div
          style={{
            width: 22, height: 22, borderRadius: 999, background: "#f8ecf6", color: "#7B2D8B",
            fontSize: 11, fontWeight: 800, display: "flex", alignItems: "center", justifyContent: "center",
            flexShrink: 0, marginTop: 1,
          }}
        >
          {number}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
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
            <div style={AVATAR_STYLE}>{initials(row.owner_name)}</div>
            <div style={{ flex: 1, fontSize: 12.5, fontWeight: 700 }}>
              {row.is_owner ? "You" : row.owner_name || "—"} <span style={{ fontWeight: 600, color: "#999" }}>· owner</span>
            </div>
            <div style={{ fontSize: 10, fontWeight: 700, color: "#999" }}>Always on</div>
          </div>

          {(row.grants || []).map((g) => (
            <div key={g.email} style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0", borderBottom: "1px solid #f2f2f2" }}>
              <div style={AVATAR_STYLE}>{initials(g.name)}</div>
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

          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button
              onClick={() => setShowPicker((v) => !v)}
              style={{ flex: 1, padding: 10, border: "1.5px dashed #7B2D8B", borderRadius: 8, background: "#fff", color: "#7B2D8B", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
            >
              {showPicker ? "Cancel" : "+ Grant access"}
            </button>
            <button
              onClick={() => setShowHistory((v) => !v)}
              style={{ flex: 1, padding: 10, border: "1.5px solid #eadcec", borderRadius: 8, background: "#fff", color: "#666", fontSize: 12.5, fontWeight: 800, cursor: "pointer" }}
            >
              {showHistory ? "Hide history" : "History"}
            </button>
          </div>

          {showPicker && (
            <GrantPicker
              dealerId={row.dealer_id}
              onDone={Object.assign(() => { setShowPicker(false); onChanged(); }, { dealerName: row.dealer_name, granterName })}
              onCancel={() => setShowPicker(false)}
            />
          )}

          {showHistory && <HistoryPanel dealerId={row.dealer_id} />}
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1, padding: "12px 8px", border: "none", background: active ? "#fff" : "#f3e6f6",
        color: active ? "#7B2D8B" : "#8a5a92", fontSize: 13, fontWeight: 800, cursor: "pointer",
        borderBottom: active ? "2.5px solid #7B2D8B" : "2.5px solid transparent",
      }}
    >
      {children}
    </button>
  );
}

function DealerAccessTab({ staffProfile, myEmail }) {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [dealerQuery, setDealerQuery] = useState("");

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

  const filteredRows = useMemo(() => {
    const q = dealerQuery.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (r) => (r.dealer_name || "").toLowerCase().includes(q) || (r.dealer_code || "").toLowerCase().includes(q)
    );
  }, [rows, dealerQuery]);

  return (
    <>
      {!loading && !error && rows.length > 0 && (
        <div style={{ marginBottom: 12 }}>
          <SearchBox value={dealerQuery} onChange={setDealerQuery} placeholder="Search dealer by name or code" />
        </div>
      )}

      {loading ? (
        <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#d64545" }}>Couldn't load ({error}).</div>
      ) : rows.length === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>No dealers with ledger access yet.</div>
      ) : filteredRows.length === 0 ? (
        <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "#999" }}>No dealer matches "{dealerQuery}".</div>
      ) : (
        filteredRows.map((row, i) => (
          <DealerAccessCard
            key={row.dealer_id}
            row={row}
            number={i + 1}
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
    </>
  );
}

export default function TeamAccess() {
  const navigate = useNavigate();
  const { staffProfile, session } = useApp();
  const myEmail = session?.user?.email || "";
  const canManage = staffProfile?.role === "senior_sales_associate" || staffProfile?.role === "senior_sales_executive";
  const [tab, setTab] = useState("team");

  return (
    <div style={{ minHeight: "100vh", background: "#f8ecf6", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 20px 20px", color: "#fff" }}>
        <button onClick={() => navigate(-1)} style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 4 }}>
          ← Dashboard
        </button>
        <div style={{ fontSize: 19, fontWeight: 800, marginTop: 6 }}>Team &amp; Access</div>
        <div style={{ fontSize: 11.5, opacity: 0.85, marginTop: 4, lineHeight: 1.5 }}>
          {staffProfile?.name} · {roleLabelFor(staffProfile?.role)}
        </div>
      </div>

      {canManage && (
        <div style={{ display: "flex", background: "#f3e6f6" }}>
          <TabButton active={tab === "team"} onClick={() => setTab("team")}>My team</TabButton>
          <TabButton active={tab === "dealer"} onClick={() => setTab("dealer")}>Dealer access</TabButton>
        </div>
      )}

      <div style={{ padding: "14px 16px", maxWidth: 640, margin: "0 auto" }}>
        {tab === "team" || !canManage ? (
          <TeamHierarchy />
        ) : (
          <DealerAccessTab staffProfile={staffProfile} myEmail={myEmail} />
        )}
      </div>
    </div>
  );
}

function roleLabelFor(role) {
  if (role === "senior_sales_executive") return "Senior Sales Executive — see your team and manage ledger access.";
  if (role === "senior_sales_associate") return "Senior Sales Associate — see your team and manage ledger access.";
  return "See who reports to you and their dealers, dues, and sales.";
}
