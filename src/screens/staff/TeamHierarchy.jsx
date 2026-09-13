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

// Seniority rank purely for display — rows and the role badge, so two
// people with different job roles who happen to share a manager don't
// read as equals in the tree. Has no bearing on who reports to whom
// (that's still reports_to from the server).
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

// Which row a role sits in, independent of reports_to depth — every
// Senior Sales Associate lands in the same row whether they report
// straight to a Senior Sales Executive or via someone else. Unknown
// roles fall one row below Sales Associate.
function tierRow(role) {
  const rank = roleRank(role);
  return rank > 0 ? 3 - rank : 3;
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
  // rank (senior roles first) so left-to-right order reads sensibly; the
  // row each one ends up in is decided separately, by tierRow below.
  const sortChildren = (node) => {
    if (!node) return;
    node.children.sort((a, b) => roleRank(b.role) - roleRank(a.role) || (a.name || "").localeCompare(b.name || ""));
    node.children.forEach(sortChildren);
  };
  sortChildren(root);
  return root;
}

const CARD_W = 138;
const CARD_H = 84;
const COL_W = CARD_W + 16;
const ROW_H = CARD_H + 46;

// Lays the tree out on a grid: row = job-role tier (so every Senior Sales
// Associate lines up in the same row regardless of who they report to),
// column = a standard tidy-tree position derived purely from the actual
// reports_to edges (leaves get sequential slots, a parent centers over its
// own children). Because column slots are assigned uniquely per node in a
// single left-to-right pass, a connector line dropped straight down a
// node's own column can never cross another unrelated card, even when it
// has to pass through a row where that node's real manager isn't — which
// is exactly what lets, say, a Sales Associate who reports straight to a
// Senior Sales Executive sit in the Sales Associate row next to their
// peers, with a line that skips the Senior Sales Associate row entirely.
function computeLayout(root, expandedMap) {
  if (!root) return { nodes: [], edges: [], width: COL_W, height: ROW_H };

  const isExpanded = (email) => expandedMap[email] !== false;

  const rowOf = {};
  const kidsOf = {};
  function walkRows(node, parentRow) {
    const r = parentRow == null ? tierRow(node.role) : Math.max(tierRow(node.role), parentRow + 1);
    rowOf[node.email] = r;
    const kids = isExpanded(node.email) ? (node.children || []) : [];
    kidsOf[node.email] = kids;
    kids.forEach((c) => walkRows(c, r));
  }
  walkRows(root, null);

  const colOf = {};
  let nextLeaf = 0;
  function walkCols(node) {
    const kids = kidsOf[node.email] || [];
    if (kids.length === 0) {
      colOf[node.email] = nextLeaf;
      nextLeaf += 1;
      return colOf[node.email];
    }
    const kidCols = kids.map(walkCols);
    colOf[node.email] = kidCols.reduce((a, b) => a + b, 0) / kidCols.length;
    return colOf[node.email];
  }
  walkCols(root);

  const minRow = Math.min(...Object.values(rowOf));
  const nodes = [];
  const edges = [];
  let maxCol = 0;
  let maxRow = 0;

  function collect(node, parentCoord) {
    const row = rowOf[node.email] - minRow;
    const col = colOf[node.email];
    const x = col * COL_W + COL_W / 2;
    const y = row * ROW_H;
    maxCol = Math.max(maxCol, col);
    maxRow = Math.max(maxRow, row);
    const kids = kidsOf[node.email] || [];
    nodes.push({
      email: node.email,
      name: node.name,
      role: node.role,
      x, y, row,
      childCount: (node.children || []).length,
      expanded: isExpanded(node.email),
    });
    if (parentCoord) {
      edges.push({
        key: node.email,
        fromX: parentCoord.x, fromY: parentCoord.y, fromRow: parentCoord.row,
        toX: x, toY: y, toRow: row,
      });
    }
    kids.forEach((c) => collect(c, { x, y, row }));
  }
  collect(root, null);

  return {
    nodes, edges,
    width: (maxCol + 1) * COL_W,
    height: (maxRow + 1) * ROW_H + CARD_H,
  };
}

function TeamTree({ tree, onSelect }) {
  const [expandedMap, setExpandedMap] = useState({});
  const layout = useMemo(() => computeLayout(tree, expandedMap), [tree, expandedMap]);

  const toggleExpand = (email) => {
    setExpandedMap((m) => ({ ...m, [email]: m[email] === false }));
  };

  return (
    <div style={{ overflowX: "auto", paddingBottom: 6 }}>
      <div style={{ position: "relative", width: layout.width, height: layout.height, margin: "0 auto" }}>
        <svg
          width={layout.width}
          height={layout.height}
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          style={{ position: "absolute", inset: 0, pointerEvents: "none" }}
        >
          <defs>
            <marker id="team-tree-arrow" viewBox="0 0 8 8" refX="6" refY="4" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L8,4 L0,8 Z" fill="#7B2D8B" />
            </marker>
          </defs>
          {layout.edges.map((e) => {
            const skip = e.toRow > e.fromRow + 1;
            const fromBottom = e.fromY + CARD_H;
            const channelY = fromBottom + (ROW_H - CARD_H) / 2;
            const d = `M${e.fromX},${fromBottom} L${e.fromX},${channelY} L${e.toX},${channelY} L${e.toX},${e.toY}`;
            return skip ? (
              <path key={e.key} d={d} fill="none" stroke="#7B2D8B" strokeWidth="2" strokeDasharray="5,4" markerEnd="url(#team-tree-arrow)" />
            ) : (
              <path key={e.key} d={d} fill="none" stroke="#e3cdea" strokeWidth="1.5" />
            );
          })}
        </svg>

        {layout.nodes.map((node) => {
          const isRoot = node.email === tree.email;
          return (
            <div
              key={node.email}
              style={{
                position: "absolute", left: node.x - CARD_W / 2, top: node.y, width: CARD_W,
                border: isRoot ? "1.5px solid #eadcec" : "1.5px solid #eadcec",
                borderLeft: `3px solid ${roleColor(node.role)}`,
                borderRadius: 10, overflow: "hidden", background: "#fff",
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
              {node.childCount > 0 && (
                <div
                  onClick={() => toggleExpand(node.email)}
                  style={{ textAlign: "center", fontSize: 10, color: "#999", padding: "3px", borderTop: "1px solid #f2f2f2", cursor: "pointer" }}
                >
                  {node.expanded ? "▲" : `▼ ${node.childCount}`}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
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
      <TeamTree tree={tree} onSelect={(email, name) => setSelected({ email, name })} />
    </div>
  );
}
