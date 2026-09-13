import { useEffect, useMemo, useState } from "react";
import { supabase } from "../../lib/supabase";
import { exportRowsToExcel, exportTableToPdf, fmtCurrency } from "../../lib/dealerCrmUtils";
import StaffAvatar from "../../components/staff/StaffAvatar";
import StaffPhotoViewer from "../../components/staff/StaffPhotoViewer";

// "My team" tab — universal, unlike the Dealer Access tab next to it.
// Any active staff member can see whoever reports to them (directly or
// indirectly) as a collapsible org-chart tree, and drill into a profile
// for anyone in that downline: their photo, dealers (owner + granted
// access) with a Dues drill-down, Orders for the period, and item-wise
// sales — each with its own PDF/Excel export. Server enforces the "only
// your own downline" rule on every call via _is_in_my_downline() — this
// screen only decides what's shown.

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

function fmtDateShort(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

function exportFilenameFor(name, label, ext) {
  const slug = (name || "staff").trim().replace(/\s+/g, "_");
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  return `Eltop_${slug}_${label.replace(/\s+/g, "_")}_${dd}${mm}${d.getFullYear()}.${ext}`;
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

const PERIOD_CHIPS = [...PERIODS.map((p) => ({ key: p.key, label: p.label })), { key: "custom", label: "Custom" }];

function periodRangeFor(periodKey, customFrom, customTo) {
  if (periodKey === "custom") return { start: customFrom || null, end: customTo || null };
  const p = PERIODS.find((x) => x.key === periodKey) || PERIODS[0];
  return p.range();
}

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
      photoUrl: node.photo_url,
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
                border: "1.5px solid #eadcec",
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
                <StaffAvatar photoUrl={node.photoUrl} name={node.name || node.email} size={28} dark={isRoot} />
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

const EXPORT_BTN = { display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 700, color: "#7B2D8B", background: "#fff", border: "1.5px solid #eadcec", borderRadius: 8, padding: "6px 10px", cursor: "pointer" };
const MINI_EXPORT_BTN = { fontSize: 10.5, fontWeight: 700, color: "#7B2D8B", background: "#fff", border: "1px solid #eadcec", borderRadius: 6, padding: "3px 7px", cursor: "pointer" };

function StatTile({ label, value, valueColor, onClick }) {
  return (
    <div onClick={onClick} style={{ background: "#f8f0f9", borderRadius: 10, padding: 10, cursor: onClick ? "pointer" : "default" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 10.5, color: "#999" }}>{label}</div>
        {onClick && <span style={{ fontSize: 12, color: "#c9a8d4" }}>›</span>}
      </div>
      <div style={{ fontSize: 15, fontWeight: 800, marginTop: 4, color: valueColor || "#1a1a1a" }}>{value}</div>
    </div>
  );
}

function ComingSoonTile({ label }) {
  return (
    <div style={{ background: "#f2f2f2", border: "1px dashed #d8d8d8", borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <div style={{ fontSize: 10.5, color: "#aaa" }}>{label}</div>
        <span style={{ fontSize: 11 }}>🔒</span>
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, marginTop: 6, color: "#bbb" }}>Coming soon</div>
    </div>
  );
}

function DetailHeader({ title, periodLabel, onExportPdf, onExportExcel }) {
  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: 14, gap: 8 }}>
      <div>
        <div style={{ fontSize: 16, fontWeight: 800 }}>{title}</div>
        {periodLabel && <div style={{ fontSize: 11, color: "#999", marginTop: 2 }}>{periodLabel}</div>}
      </div>
      <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
        <button onClick={onExportPdf} style={EXPORT_BTN}>📄 PDF</button>
        <button onClick={onExportExcel} style={EXPORT_BTN}>📊 Excel</button>
      </div>
    </div>
  );
}

// Top N dealers by outstanding, as horizontal bars — one of the Dues
// report's view modes. Shows a plain empty message when nobody owes
// anything, rather than rendering nothing under a selected toggle.
function TopDuesChart({ rows }) {
  const top = [...rows]
    .filter((d) => Number(d.outstanding) > 0)
    .sort((a, b) => Number(b.outstanding) - Number(a.outstanding))
    .slice(0, 5);
  if (top.length === 0) {
    return (
      <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#999" }}>Nothing to chart yet.</div>
      </div>
    );
  }
  const max = Math.max(...top.map((d) => Number(d.outstanding)));
  return (
    <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#999", marginBottom: 10 }}>Top dealers by outstanding</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {top.map((d) => (
          <div key={d.dealer_id}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11.5, marginBottom: 3 }}>
              <span>{d.dealer_code}</span>
              <span style={{ fontWeight: 700, color: "#d64545" }}>{fmtCurrency(d.outstanding)}</span>
            </div>
            <div style={{ height: 8, background: "#f2f2f2", borderRadius: 4, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${Math.max(4, (Number(d.outstanding) / max) * 100)}%`, background: "#d64545" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Owner-vs-granted-access split — one of the Dealers report's view modes.
function DealersSplitChart({ rows }) {
  if (rows.length === 0) {
    return (
      <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#999" }}>Nothing to chart yet.</div>
      </div>
    );
  }
  const ownerCount = rows.filter((d) => d.tag === "owner").length;
  const grantedCount = rows.length - ownerCount;
  const max = Math.max(ownerCount, grantedCount, 1);
  return (
    <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#999", marginBottom: 10 }}>Owner vs granted access</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 24, height: 70, padding: "0 20px" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 34, height: Math.max(6, (ownerCount / max) * 56), background: "#7B2D8B", borderRadius: "4px 4px 0 0", margin: "0 auto" }} />
          <div style={{ fontSize: 10.5, color: "#999", marginTop: 4 }}>Owner ({ownerCount})</div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 34, height: Math.max(6, (grantedCount / max) * 56), background: "#c98a1a", borderRadius: "4px 4px 0 0", margin: "0 auto" }} />
          <div style={{ fontSize: 10.5, color: "#999", marginTop: 4 }}>Granted ({grantedCount})</div>
        </div>
      </div>
    </div>
  );
}

// Groups orders into day buckets (or wider buckets for long periods, so a
// full quarter doesn't render 90+ slivers) and sums order value per bucket.
function bucketOrders(orders, startISO, endISO) {
  if (!startISO || !endISO) return [];
  const start = new Date(`${startISO}T00:00:00`);
  const end = new Date(`${endISO}T00:00:00`);
  const dayMs = 86400000;
  const totalDays = Math.max(1, Math.round((end - start) / dayMs) + 1);
  const bucketDays = totalDays <= 14 ? 1 : Math.ceil(totalDays / 10);
  const buckets = [];
  let cursor = new Date(start);
  while (cursor <= end) {
    const bucketStart = new Date(cursor);
    const candidate = new Date(cursor);
    candidate.setDate(candidate.getDate() + bucketDays - 1);
    const bucketEnd = candidate > end ? end : candidate;
    buckets.push({ start: bucketStart, end: bucketEnd, total: 0 });
    cursor = new Date(bucketEnd);
    cursor.setDate(cursor.getDate() + 1);
  }
  orders.forEach((o) => {
    const od = new Date(o.created_at);
    const odDay = new Date(od.getFullYear(), od.getMonth(), od.getDate());
    const bucket = buckets.find((b) => odDay >= b.start && odDay <= b.end);
    if (bucket) bucket.total += Number(o.total || 0);
  });
  return buckets;
}

// Order value over the period — one of the Orders report's view modes.
function OrdersBarChart({ orders, start, end }) {
  const buckets = useMemo(() => bucketOrders(orders, start, end), [orders, start, end]);
  if (orders.length === 0 || buckets.length === 0) {
    return (
      <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: 12, marginBottom: 14 }}>
        <div style={{ fontSize: 12, color: "#999" }}>Nothing to chart yet.</div>
      </div>
    );
  }
  const max = Math.max(...buckets.map((b) => b.total), 1);
  const manyBuckets = buckets.length > 12;
  return (
    <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: 12, marginBottom: 14 }}>
      <div style={{ fontSize: 11, fontWeight: 800, color: "#999", marginBottom: 10 }}>Order value over the period</div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 5, height: 70, overflowX: manyBuckets ? "auto" : "visible" }}>
        {buckets.map((b, i) => (
          <div key={i} style={{ flex: manyBuckets ? "0 0 22px" : 1, textAlign: "center" }}>
            <div style={{ height: Math.max(3, (b.total / max) * 56), background: b.total > 0 ? "#7B2D8B" : "#e3cdea", borderRadius: "3px 3px 0 0" }} />
            <div style={{ fontSize: 9, color: "#bbb", marginTop: 3 }}>
              {b.start.getDate()}{buckets.length > 1 && (i === 0 || b.start.getMonth() !== buckets[i - 1].start.getMonth()) ? `/${b.start.getMonth() + 1}` : ""}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Number / Bars / Pie switcher — same three icon buttons on every report.
const VIEW_MODES = [
  { key: "number", icon: "#", label: "Number" },
  { key: "bar", icon: "📊", label: "Bars" },
  { key: "pie", icon: "🥧", label: "Pie" },
];

function ViewToggle({ mode, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
      {VIEW_MODES.map((m) => (
        <button
          key={m.key}
          onClick={() => onChange(m.key)}
          style={{
            flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 5,
            fontSize: 11, fontWeight: 700, padding: "7px 0", borderRadius: 8, cursor: "pointer", fontFamily: "inherit",
            background: mode === m.key ? "#7B2D8B" : "#fff",
            color: mode === m.key ? "#fff" : "#666",
            border: mode === m.key ? "1px solid #7B2D8B" : "1px solid #eadcec",
          }}
        >
          <span>{m.icon}</span><span>{m.label}</span>
        </button>
      ))}
    </div>
  );
}

// Generic donut — a plain CSS conic-gradient circle plus a color-swatch
// legend, shared by every report's Pie view. No charting library needed.
function buildConicGradient(slices) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return "#f2f2f2";
  let acc = 0;
  const stops = slices.map((s) => {
    const startPct = (acc / total) * 100;
    acc += s.value;
    const endPct = (acc / total) * 100;
    return `${s.color} ${startPct}% ${endPct}%`;
  });
  return `conic-gradient(${stops.join(", ")})`;
}

function PieChart({ slices, size = 88 }) {
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  if (total <= 0) return <div style={{ fontSize: 12, color: "#999" }}>Nothing to chart yet.</div>;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <div style={{ width: size, height: size, borderRadius: "50%", background: buildConicGradient(slices), flexShrink: 0 }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 6, fontSize: 11.5 }}>
        {slices.map((s) => (
          <div key={s.label} style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color, flexShrink: 0 }} />
            <span>{s.label} · {Math.round((s.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Top 4 dealers by outstanding + an "Others" bucket for the rest — a red
// ramp since these are dues, matching TopDuesChart's own red bars.
function duesPieSlices(rows) {
  const withDue = [...rows].filter((d) => Number(d.outstanding) > 0).sort((a, b) => Number(b.outstanding) - Number(a.outstanding));
  const colors = ["#d64545", "#e2726f", "#eb9c99", "#f4c5c3"];
  const top = withDue.slice(0, 4).map((d, i) => ({ label: d.dealer_code, value: Number(d.outstanding), color: colors[i] }));
  const rest = withDue.slice(4).reduce((sum, d) => sum + Number(d.outstanding), 0);
  if (rest > 0) top.push({ label: "Others", value: rest, color: "#f8dede" });
  return top;
}

function dealersPieSlices(rows) {
  const ownerCount = rows.filter((d) => d.tag === "owner").length;
  const grantedCount = rows.length - ownerCount;
  const slices = [];
  if (ownerCount > 0) slices.push({ label: "Owner", value: ownerCount, color: "#7B2D8B" });
  if (grantedCount > 0) slices.push({ label: "Granted access", value: grantedCount, color: "#c98a1a" });
  return slices;
}

function ordersPieSlices(orders) {
  const byDealer = {};
  orders.forEach((o) => {
    const key = o.dealer_code || o.dealer_name;
    byDealer[key] = (byDealer[key] || 0) + Number(o.total || 0);
  });
  const sorted = Object.entries(byDealer).sort((a, b) => b[1] - a[1]);
  const colors = ["#7B2D8B", "#9c5ba8", "#c9a8d4", "#e3cdea"];
  const top = sorted.slice(0, 4).map(([label, value], i) => ({ label, value, color: colors[i] }));
  const rest = sorted.slice(4).reduce((sum, [, v]) => sum + v, 0);
  if (rest > 0) top.push({ label: "Others", value: rest, color: "#f2e9f5" });
  return top;
}

function itemSalesPieSlices(items) {
  const sorted = [...items].sort((a, b) => Number(b.qty) - Number(a.qty));
  const colors = ["#7B2D8B", "#9c5ba8", "#c9a8d4", "#e3cdea"];
  const top = sorted.slice(0, 4).map((it, i) => ({ label: it.item_name, value: Number(it.qty), color: colors[i] }));
  const rest = sorted.slice(4).reduce((sum, it) => sum + Number(it.qty), 0);
  if (rest > 0) top.push({ label: "Others", value: rest, color: "#f2e9f5" });
  return top;
}

function DealerListDetail({ title, rows, periodLabel, onExportPdf, onExportExcel, variant }) {
  const [viewMode, setViewMode] = useState("number");
  const barChart = variant === "dues" ? <TopDuesChart rows={rows} /> : <DealersSplitChart rows={rows} />;
  const pieSlices = variant === "dues" ? duesPieSlices(rows) : dealersPieSlices(rows);
  return (
    <div>
      <DetailHeader title={title} periodLabel={periodLabel} onExportPdf={onExportPdf} onExportExcel={onExportExcel} />
      <ViewToggle mode={viewMode} onChange={setViewMode} />
      {viewMode === "bar" && barChart}
      {viewMode === "pie" && (
        <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#999", marginBottom: 10 }}>Share of total</div>
          <PieChart slices={pieSlices} />
        </div>
      )}
      {viewMode === "number" && (
        <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: rows.length ? "4px 12px" : 12 }}>
          {rows.length === 0 ? (
            <div style={{ fontSize: 12, color: "#999" }}>No dealers yet.</div>
          ) : (
            rows.map((d) => (
              <div key={d.dealer_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid #f2f2f2" }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{d.dealer_code} · {d.display_name}</div>
                  <div style={{ fontSize: 10.5, color: d.tag === "owner" ? "#999" : "#7B2D8B" }}>{d.tag === "owner" ? "owner" : "granted access"}</div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 800, color: Number(d.outstanding) > 0 ? "#d64545" : "#2fa84f" }}>
                  {fmtCurrency(d.outstanding)} due
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function OrdersDetail({ orders, periodLabel, onExportPdf, onExportExcel, range }) {
  const [viewMode, setViewMode] = useState("number");
  const pieSlices = useMemo(() => ordersPieSlices(orders), [orders]);
  return (
    <div>
      <DetailHeader title="Orders" periodLabel={periodLabel} onExportPdf={onExportPdf} onExportExcel={onExportExcel} />
      <ViewToggle mode={viewMode} onChange={setViewMode} />
      {viewMode === "bar" && <OrdersBarChart orders={orders} start={range.start} end={range.end} />}
      {viewMode === "pie" && (
        <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: 12, marginBottom: 14 }}>
          <div style={{ fontSize: 11, fontWeight: 800, color: "#999", marginBottom: 10 }}>Share of order value by dealer</div>
          <PieChart slices={pieSlices} />
        </div>
      )}
      {viewMode === "number" && (
        <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: orders.length ? "4px 12px" : 12 }}>
          {orders.length === 0 ? (
            <div style={{ fontSize: 12, color: "#999" }}>No orders this period.</div>
          ) : (
            orders.map((o) => (
              <div key={o.order_id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderTop: "1px solid #f2f2f2" }}>
                <div>
                  <div style={{ fontSize: 12.5, fontWeight: 700 }}>{o.dealer_code} · {o.dealer_name}</div>
                  <div style={{ fontSize: 10.5, color: "#999" }}>{fmtDateShort(o.created_at)} · {o.status}</div>
                </div>
                <div style={{ fontSize: 12.5, fontWeight: 800 }}>{fmtCurrency(o.total)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

function TeamMemberProfile({ email, name, onBack }) {
  const [periodKey, setPeriodKey] = useState("this_month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [summary, setSummary] = useState(null);
  const [dealers, setDealers] = useState([]);
  const [items, setItems] = useState([]);
  const [ordersCount, setOrdersCount] = useState(0);
  const [orders, setOrders] = useState([]);
  const [baseLoading, setBaseLoading] = useState(true);
  const [baseError, setBaseError] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [subView, setSubView] = useState(null); // null | "dues" | "dealers" | "orders"
  const [salesOpen, setSalesOpen] = useState(true);
  const [itemsViewMode, setItemsViewMode] = useState("number");
  const [photoOpen, setPhotoOpen] = useState(false);

  const range = useMemo(() => periodRangeFor(periodKey, customFrom, customTo), [periodKey, customFrom, customTo]);
  const rangeReady = Boolean(range.start && range.end);

  // Dues (summary) and Dealers have no period of their own — neither RPC
  // even takes a date range, they're running totals — so they load as soon
  // as we know who we're looking at, independent of the period picker.
  // Previously these were bundled into the same period-gated fetch below,
  // which meant picking "Custom" and not yet filling both dates blanked
  // out Dues/Dealers too, even though the period had nothing to do with them.
  useEffect(() => {
    let cancelled = false;
    setBaseLoading(true);
    setBaseError(null);
    Promise.all([
      supabase.rpc("get_team_member_summary", { p_email: email }),
      supabase.rpc("get_team_member_dealers", { p_email: email }),
    ]).then(([s, d]) => {
      if (cancelled) return;
      if (s.error || d.error) {
        setBaseError((s.error || d.error).message);
        setBaseLoading(false);
        return;
      }
      setSummary(Array.isArray(s.data) ? s.data[0] : s.data);
      setDealers(d.data || []);
      setBaseLoading(false);
    });
    return () => { cancelled = true; };
  }, [email]);

  // Orders and item-wise sales genuinely are period-scoped, so these stay
  // gated behind rangeReady (nothing to fetch until a full range is picked).
  useEffect(() => {
    if (!rangeReady) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    Promise.all([
      supabase.rpc("get_team_member_orders_count", { p_email: email, p_start: range.start, p_end: range.end }),
      supabase.rpc("get_team_member_item_sales", { p_email: email, p_start: range.start, p_end: range.end }),
      supabase.rpc("get_team_member_orders", { p_email: email, p_start: range.start, p_end: range.end }),
    ]).then(([oc, it, ord]) => {
      if (cancelled) return;
      if (oc.error || it.error || ord.error) {
        setError((oc.error || it.error || ord.error).message);
        setLoading(false);
        return;
      }
      setOrdersCount(typeof oc.data === "number" ? oc.data : 0);
      setItems(it.data || []);
      setOrders(ord.data || []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [email, range.start, range.end, rangeReady]);

  const dealersSorted = useMemo(
    () => [...dealers].sort((a, b) => (a.display_name || "").localeCompare(b.display_name || "")),
    [dealers]
  );
  const duesSorted = useMemo(
    () => [...dealers].sort((a, b) => Number(b.outstanding || 0) - Number(a.outstanding || 0)),
    [dealers]
  );

  const periodLabel = periodKey === "custom"
    ? (rangeReady ? `${fmtDateShort(range.start)} – ${fmtDateShort(range.end)}` : "Pick a range")
    : `Period: ${PERIODS.find((p) => p.key === periodKey)?.label}`;

  const exportDealersPdf = (rows, titleLabel) => {
    exportTableToPdf({
      filename: exportFilenameFor(name, titleLabel, "pdf"),
      title: `${titleLabel} — ${name}`,
      subtitle: `Period: ${fmtDateShort(range.start)} to ${fmtDateShort(range.end)}`,
      columns: [
        { header: "Dealer code", key: "dealer_code" },
        { header: "Name", key: "display_name" },
        { header: "Type", key: "tag" },
        { header: "Outstanding", key: "outstanding", format: (v) => fmtCurrency(v) },
      ],
      rows,
    });
  };
  const exportDealersExcel = (rows, titleLabel) => {
    exportRowsToExcel({
      filename: exportFilenameFor(name, titleLabel, "xlsx"),
      sheetName: titleLabel.slice(0, 31),
      rows: rows.map((d) => ({
        "Dealer code": d.dealer_code,
        Name: d.display_name,
        Type: d.tag === "owner" ? "Owner" : "Granted access",
        Outstanding: Number(d.outstanding || 0),
      })),
    });
  };

  const exportOrders = (format) => {
    if (format === "pdf") {
      exportTableToPdf({
        filename: exportFilenameFor(name, "Orders", "pdf"),
        title: `Orders — ${name}`,
        subtitle: `Period: ${fmtDateShort(range.start)} to ${fmtDateShort(range.end)}`,
        columns: [
          { header: "Date", key: "created_at", format: (v) => fmtDateShort(v) },
          { header: "Dealer", key: "dealer_name" },
          { header: "Status", key: "status" },
          { header: "Total", key: "total", format: (v) => fmtCurrency(v) },
        ],
        rows: orders,
      });
    } else {
      exportRowsToExcel({
        filename: exportFilenameFor(name, "Orders", "xlsx"),
        sheetName: "Orders",
        rows: orders.map((o) => ({
          Date: fmtDateShort(o.created_at),
          Dealer: `${o.dealer_code} · ${o.dealer_name}`,
          Status: o.status,
          Total: Number(o.total || 0),
        })),
      });
    }
  };

  const exportItemSales = (format) => {
    if (format === "pdf") {
      exportTableToPdf({
        filename: exportFilenameFor(name, "Item-wise sales", "pdf"),
        title: `Item-wise sales — ${name}`,
        subtitle: `Period: ${fmtDateShort(range.start)} to ${fmtDateShort(range.end)}`,
        columns: [
          { header: "Item", key: "item_name" },
          { header: "Qty", key: "qty" },
          { header: "% share", key: "pct", format: (v) => `${v}%` },
        ],
        rows: items,
      });
    } else {
      exportRowsToExcel({
        filename: exportFilenameFor(name, "Item-wise sales", "xlsx"),
        sheetName: "Item sales",
        rows: items.map((it) => ({ Item: it.item_name, Qty: Number(it.qty || 0), "% share": Number(it.pct || 0) })),
      });
    }
  };

  const headerBack = subView ? () => setSubView(null) : onBack;
  const headerLabel = subView ? name : "My team";

  return (
    <div>
      <button onClick={headerBack} style={{ background: "none", border: "none", color: "#7B2D8B", fontWeight: 700, fontSize: 12.5, cursor: "pointer", padding: 0, marginBottom: 10 }}>
        ← {headerLabel}
      </button>

      {!subView && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
            <StaffAvatar photoUrl={summary?.target_photo_url} name={name} size={44} onClick={() => setPhotoOpen(true)} />
            <div>
              <div style={{ fontSize: 16, fontWeight: 800 }}>{name}</div>
              <div style={{ fontSize: 11.5, color: "#999" }}>{summary ? roleLabel(summary.target_role) : "—"} · reports up to you</div>
            </div>
          </div>
          <div style={{ fontSize: 10.5, color: "#bbb", marginBottom: 14 }}>Tap photo to view, download or share</div>

          <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, padding: 12, marginBottom: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: "#999", marginBottom: 8 }}>Period</div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {PERIOD_CHIPS.map((p) => (
                <button
                  key={p.key}
                  onClick={() => setPeriodKey(p.key)}
                  style={{
                    padding: "6px 12px", borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: "pointer",
                    background: periodKey === p.key ? "#7B2D8B" : "#fff",
                    color: periodKey === p.key ? "#fff" : "#666",
                    border: periodKey === p.key ? "1px solid #7B2D8B" : "1px solid #eadcec",
                  }}
                >
                  {p.label}
                </button>
              ))}
            </div>
            {periodKey === "custom" && (
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 10, borderTop: "1px solid #f2f2f2" }}>
                <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} style={{ flex: 1, fontSize: 12, padding: "6px 8px", borderRadius: 8, border: "1.5px solid #eadcec" }} />
                <span style={{ color: "#999", fontSize: 12 }}>to</span>
                <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} style={{ flex: 1, fontSize: 12, padding: "6px 8px", borderRadius: 8, border: "1.5px solid #eadcec" }} />
              </div>
            )}
          </div>

          {baseLoading ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#999" }}>Loading…</div>
          ) : baseError ? (
            <div style={{ padding: "20px 0", textAlign: "center", fontSize: 13, color: "#d64545" }}>Couldn't load ({baseError}).</div>
          ) : (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 16 }}>
                <StatTile
                  label="Dues to collect"
                  value={fmtCurrency(summary?.dues_total)}
                  valueColor={Number(summary?.dues_total) > 0 ? "#d64545" : "#2fa84f"}
                  onClick={() => setSubView("dues")}
                />
                <StatTile label="Dealers" value={summary?.dealer_count ?? 0} onClick={() => setSubView("dealers")} />
                <StatTile
                  label="Orders"
                  value={!rangeReady ? "—" : loading ? "…" : ordersCount}
                  onClick={() => setSubView("orders")}
                />
                <ComingSoonTile label="Target achieved" />
              </div>

              <div style={{ border: "1.5px solid #eadcec", borderRadius: 12, overflow: "hidden" }}>
                <div onClick={() => setSalesOpen((v) => !v)} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: 12, cursor: "pointer" }}>
                  <div style={{ fontSize: 13, fontWeight: 800 }}>Item-wise sales</div>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    {rangeReady && items.length > 0 && (
                      <span onClick={(e) => e.stopPropagation()} style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => exportItemSales("pdf")} style={MINI_EXPORT_BTN}>PDF</button>
                        <button onClick={() => exportItemSales("excel")} style={MINI_EXPORT_BTN}>Excel</button>
                      </span>
                    )}
                    <span style={{ fontSize: 11, color: "#999" }}>{salesOpen ? "▲" : "▼"}</span>
                  </div>
                </div>
                {salesOpen && (
                  <div style={{ borderTop: "1px solid #f2f2f2", padding: 12 }}>
                    {!rangeReady ? (
                      <div style={{ fontSize: 12, color: "#999" }}>Pick both dates to see this period.</div>
                    ) : loading ? (
                      <div style={{ fontSize: 12, color: "#999" }}>Loading…</div>
                    ) : error ? (
                      <div style={{ fontSize: 12, color: "#d64545" }}>Couldn't load ({error}).</div>
                    ) : items.length === 0 ? (
                      <div style={{ fontSize: 12, color: "#999" }}>No sales this period.</div>
                    ) : (
                      <>
                        <ViewToggle mode={itemsViewMode} onChange={setItemsViewMode} />
                        {itemsViewMode === "number" && (
                          <div>
                            {items.map((it) => (
                              <div key={it.item_name} style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, padding: "6px 0", borderTop: "1px solid #f2f2f2" }}>
                                <span>{it.item_name}</span>
                                <span style={{ color: "#999" }}>{it.qty} pc · {it.pct}%</span>
                              </div>
                            ))}
                          </div>
                        )}
                        {itemsViewMode === "bar" && (
                          <div>
                            <div style={{ fontSize: 10.5, color: "#999", marginBottom: 8 }}>Top items by quantity</div>
                            {items.map((it) => (
                              <div key={it.item_name} style={{ marginBottom: 10 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5 }}>
                                  <span>{it.item_name}</span>
                                  <span style={{ color: "#999" }}>{it.qty} pc · {it.pct}%</span>
                                </div>
                                <div style={{ height: 5, background: "#f2f2f2", borderRadius: 3, marginTop: 4, overflow: "hidden" }}>
                                  <div style={{ height: "100%", width: `${Math.min(100, Number(it.pct) || 0)}%`, background: "#7B2D8B" }} />
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {itemsViewMode === "pie" && (
                          <div>
                            <div style={{ fontSize: 10.5, color: "#999", marginBottom: 10 }}>Share of quantity sold</div>
                            <PieChart slices={itemSalesPieSlices(items)} />
                          </div>
                        )}
                      </>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}

      {subView === "dues" && (
        <DealerListDetail
          title="Dues to collect"
          rows={duesSorted}
          periodLabel={null}
          onExportPdf={() => exportDealersPdf(duesSorted, "Dues to collect")}
          onExportExcel={() => exportDealersExcel(duesSorted, "Dues to collect")}
          variant="dues"
        />
      )}
      {subView === "dealers" && (
        <DealerListDetail
          title="Dealers"
          rows={dealersSorted}
          periodLabel={null}
          onExportPdf={() => exportDealersPdf(dealersSorted, "Dealers")}
          onExportExcel={() => exportDealersExcel(dealersSorted, "Dealers")}
          variant="dealers"
        />
      )}
      {subView === "orders" && (
        <OrdersDetail
          orders={orders}
          periodLabel={periodLabel}
          onExportPdf={() => exportOrders("pdf")}
          onExportExcel={() => exportOrders("excel")}
          range={range}
        />
      )}

      {photoOpen && (
        <StaffPhotoViewer photoUrl={summary?.target_photo_url} name={name} onClose={() => setPhotoOpen(false)} />
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
