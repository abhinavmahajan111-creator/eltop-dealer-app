import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";

// "My team" tab — universal, unlike the Dealer Access tab next to it.
// Any active staff member can see whoever reports to them (directly or
// indirectly) as a collapsible org-chart tree, and drill into a profile
// for anyone in that downline: their dealers (owner + granted access),
// total dues across those dealers, and item-wise sales for a chosen
// period. Server enforces the "only your own downline" rule on every
// call via _is_in_my_downline() — this screen only decides what's shown.

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

function roleLabel(role) {
  if (role === "senior_sales_executive") return "Senior Sales Executive";
  if (role === "senior_sales_associate") return "Senior Sales Associate";
  if (role === "sales_associate") return "Sales Associate";
  return role || "—";
}

// Seniority rank purely for display — sorting siblings and coloring the
// role badge so two people with different job roles who happen to report
// to the same manager don't read as equals in the tree. Has no bearing on
// who reports to whom (that's still reports_to / depth from the server).
function roleRank(role) {
  if (role === "senior_sales_executive") return 3;
  if (role === "senior_sales_associate") return 2;
  if (role === "sales_associate") return 1;
  return 0;
}

function roleColor(role) {
  if (role === "senior_sales_executive") return "#7B2D8B";
  if (role === "senior_sales_associate") return "#2f6fa8";
  if (role === "sales_associate") return "#c98a1a";
  return "#999";
}

function toISO(d) {
  return d.toISOString().slice(0, 10);
}

const PERIODS = [
  {
    key: "this_month",
    label: "This month",
    range: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return { start: toISO(start), end: toISO(end) };
    },
  },
  {
    key: "last_month",
    label: "Last month",
    range: () => {
      const now = new Date();
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const end = new Date(now.getFullYear(), now.getMonth(), 0);
      return { start: toISO(start), end: toISO(end) };
    },
  },
  {
    key: "this_quarter",
    label: "This quarter",
    range: () => {
      const now = new Date();
      const qStartMonth = Math.floor(now.getMonth() / 3) * 3;
      const start = new Date(now.getFullYear(), qStartMonth, 1);
      const end = new Date(now.getFullYear(), qStartMonth + 3, 0);
      return { start: toISO(start), end: toISO(end) };
    },
  },
];

function buildTree(rows) {
  if (!rows || rows.length === 0) return null;
  const byEmail = {};
  rows.forEach((r) => { byEmail[r.email] = { ...r, children: [] }; });
  let root = null;
  rows.forEach((r) => {
    if (r.depth === 0) { root = byEmail[r.email]; return; }
    const parent = byEmail[r.reports_to];
    if (parent) parent.children.push(byEmail[r.email]);
  });
  // Same reports_to doesn't mean same seniority — sort siblings by job-role
  // rank (senior roles first) so the tree reads by position, not just by
  // who happens to report to whom.
  const sortChildren = (node) => {
    if (!node) return;
    node.children.sort((a, b) => roleRank(b.role) - roleRank(a.role) || (a.name || "").localeCompare(b.name || ""));
    node.children.forEach(sortChildren);
  };
  sortChildren(root);
  return root;
}

function TreeNode({ node, isRoot, onSelect, depth }) {
  const [expanded, setExpanded] = useState(true);
  const hasKids = node.children && node.children.length > 0;

  return (
    <li style={{ listStyle: "none", position: "relative", display: "flex", flexDirection: "column", alignItems: "center", padding: depth === 0 ? 0 : "24px 10px 0 10px" }}>
      {depth > 0 && (
        <span style={{ position: "absolute", top: 0, left: "50%", width: 0, height: 24, borderLeft: "1.5px solid #e3cdea" }} />
      )}
      <div
        style={{
          width: 138, border: "1.5px solid #eadcec", borderLeft: `3px solid ${roleColor(node.role)}`,
          borderRadius: 10, overflow: "hidden", background: "#fff", flexShrink: 0,
        }}
      >
        <div
          style={{
            background: isRoot ? "#7B2D8B" : "#f8f0f9", padding: "8px 6px",
            display: "flex", flexDirection: "column", alignItems: "center", gap: 4,
          }}
        >
          <div
            style={{
              width: 28, height: 28, borderRadius: 999,
              background: isRoot ? "rgba(255,255,255,.25)" : "#fff",
              color: isRoot ? "#fff" : "#7B2D8B",
              display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 800,
            }}
          >
            {initials(node.name || node.email)}
          </div>
          <div
            onClick={isRoot ? undefined : () => onSelect(node.email, node.name)}
            style={{
              fontSize: 12, fontWeight: 800, textAlign: "center", lineHeight: 1.25,
              color: isRoot ? "#fff" : "#7B2D8B", cursor: isRoot ? "default" : "pointer",
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "100%",
            }}
          >
            {node.name || node.email}{isRoot ? " (you)" : ""}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4, fontSize: 10.5, color: "#999", textAlign: "center", padding: "5px 4px", borderTop: "1px solid #f2f2f2" }}>
          <span style={{ width: 6, height: 6, borderRadius: 999, background: roleColor(node.role), flexShrink: 0 }} />
          {roleLabel(node.role)}
        </div>
        {hasKids && (
          <div
            onClick={() => setExpanded((v) => !v)}
            style={{ textAlign: "center", fontSize: 10, color: "#999", padding: "3px", borderTop: "1px solid #f2f2f2", cursor: "pointer" }}
          >
            {expanded ? "▲" : `▼ ${node.children.length}`}
          </div>
        )}
      </div>

      {hasKids && expanded && (
        <ul style={{ display: "flex", padding: 0, margin: 0, position: "relative", paddingTop: 24 }}>
          {node.children.length > 1 && (
            <span
              style={{
                position: "absolute", top: 0, height: 0,
                left: `${100 / (node.children.length * 2)}%`,
                right: `${100 / (node.children.length * 2)}%`,
                borderTop: "1.5px solid #e3cdea",
              }}
            />
          )}
          {node.children.map((c) => (
            <TreeNode key={c.email} node={c} onSelect={onSelect} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  );
}

function TeamMemberProfile({ email, name, onBack }) {
  const [periodKey, setPeriodKey] = useState("this_month");
  const [summary, setSummary] = useState(null);
  const [dealers, setDealers] = useState([]);
  const [items, setItems] = useState([]);
  const [ordersCount, setOrdersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const period = useMemo(() => PERIODS.find((p) => p.key === periodKey) || PERIODS[0], [periodKey]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    const { start, end } = period.range();
    Promise.all([
      supabase.rpc("get_team_member_summary", { p_email: email }),
      supabase.rpc("get_team_member_dealers", { p_email: email }),
      supabase.rpc("get_team_member_orders_count", { p_email: email, p_start: start, p_end: end }),
      supabase.rpc("get_team_member_item_sales", { p_email: email, p_start: start, p_end: end }),
    ]).then(([s, d, oc, it]) => {
      if (cancelled) return;
      if (s.error || d.error) {
        setError((s.error || d.error).message);
        setLoading(false);
        return;
      }
      setSummary(Array.isArray(s.data) ? s.data[0] : s.data);
      setDealers(d.data || []);
      setOrdersCount(typeof oc.data === "number" ? oc.data : 0);
      setItems(it.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [email, period]);

  const totalQty = items.reduce((s, it) => s + Number(it.qty || 0), 0);

  return (
    <div>
      <button onClick={onBack} style={{ background: "none", border: "none", color: "#7B2D8B", fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: 0, marginBottom: 10 }}>
        ← My team
      </button>

      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <div style={{ width: 36, height: 36, borderRadius: 999, background: "#f3e6f6", color: "#7B2D8B", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, fontWeight: 800 }}>
          {initials(name)}
        </div>
        <div>
          <div style={{ fontSize: 16, fontWeight: 800 }}>{name}</div>
          <div style={{ fontSize: 11.5, color: "#999" }}>{summary ? roleLabel(summary.target_role) : "—"} · reports up to you</div>
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ fontSize: 11.5, color: "#999" }}>Period</div>
        <select
          className="admin-select"
          value={periodKey}
          onChange={(e) => setPeriodKey(e.target.value)}
          style={{ padding: "6px 8px", borderRadius: 8, border: "1.5px solid #eadcec", fontSize: 12.5 }}
        >
          {PERIODS.map((p) => (
            <option key={p.key} value={p.key}>{p.label}</option>
          ))}
        </select>
      </div>

      {loading ? (
        <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>
      ) : error ? (
        <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#d64545" }}>Couldn't load ({error}).</div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, marginBottom: 16 }}>
            <div style={{ background: "#f8f0f9", borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10.5, color: "#999" }}>Dues to collect</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: Number(summary?.dues_total) > 0 ? "#d64545" : "#2fa84f" }}>
                ₹{Number(summary?.dues_total || 0).toLocaleString("en-IN")}
              </div>
            </div>
            <div style={{ background: "#f8f0f9", borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10.5, color: "#999" }}>Dealers</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{summary?.dealer_count ?? 0}</div>
            </div>
            <div style={{ background: "#f8f0f9", borderRadius: 10, padding: 10 }}>
              <div style={{ fontSize: 10.5, color: "#999" }}>Orders</div>
              <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4 }}>{ordersCount}</div>
            </div>
          </div>

          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Dealers</div>
          {dealers.length === 0 ? (
            <div style={{ fontSize: 12, color: "#999", marginBottom: 16 }}>No dealers yet.</div>
          ) : (
            <div style={{ marginBottom: 16 }}>
              {dealers.map((d) => (
                <div key={d.dealer_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "7px 0", borderTop: "1px solid #f2f2f2" }}>
                  <div>
                    <div style={{ fontSize: 12.5, fontWeight: 700 }}>{d.dealer_code} · {d.display_name}</div>
                    <div style={{ fontSize: 10.5, color: d.tag === "owner" ? "#999" : "#7B2D8B" }}>{d.tag === "owner" ? "owner" : "granted access"}</div>
                  </div>
                  <div style={{ fontSize: 12.5, fontWeight: 800, color: Number(d.outstanding) > 0 ? "#d64545" : "#2fa84f" }}>
                    ₹{Number(d.outstanding || 0).toLocaleString("en-IN")} due
                  </div>
                </div>
              ))}
            </div>
          )}

          <div style={{ fontSize: 13, fontWeight: 800, marginBottom: 8 }}>Item-wise sales this period</div>
          {items.length === 0 ? (
            <div style={{ fontSize: 12, color: "#999" }}>No sales this period.</div>
          ) : (
            items.map((it) => (
              <div key={it.item_name} style={{ marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                  <span>{it.item_name}</span>
                  <span style={{ color: "#999" }}>{it.qty} pc · {it.pct}%</span>
                </div>
                <div style={{ height: 5, background: "#f2f2f2", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                  <div style={{ height: "100%", width: `${Math.min(100, Number(it.pct) || 0)}%`, background: "#7B2D8B" }} />
                </div>
              </div>
            ))
          )}
          {totalQty === 0 && items.length > 0 && null}
        </>
      )}
    </div>
  );
}

export default function TeamHierarchy() {
  const [tree, setTree] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null); // { email, name }

  useEffect(() => {
    supabase.rpc("get_my_team_subtree").then(({ data, error }) => {
      if (error) { setError(error.message); setLoading(false); return; }
      setTree(buildTree(data || []));
      setLoading(false);
    });
  }, []);

  if (loading) return <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>;
  if (error) return <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "#d64545" }}>Couldn't load ({error}).</div>;
  if (!tree) return <div style={{ padding: "24px 0", textAlign: "center", fontSize: 13, color: "#999" }}>Couldn't find your staff profile.</div>;

  if (selected) {
    return <TeamMemberProfile email={selected.email} name={selected.name} onBack={() => setSelected(null)} />;
  }

  return (
    <div>
      <div style={{ fontSize: 11.5, color: "#999", marginBottom: 14 }}>
        {tree.children.length === 0
          ? "No one reports to you yet."
          : "Tap the arrow to expand a branch, tap a name to open their profile"}
      </div>
      <div style={{ overflowX: "auto", paddingBottom: 6 }}>
        <ul style={{ display: "flex", justifyContent: "center", padding: 0, margin: 0, minWidth: 160 }}>
          <TreeNode node={tree} isRoot onSelect={(email, name) => setSelected({ email, name })} depth={0} />
        </ul>
      </div>
    </div>
  );
}
