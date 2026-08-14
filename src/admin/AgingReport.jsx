import { useEffect, useState } from "react";
import { supabase, isSupabaseConfigured } from "../lib/supabase";
import { computeAgingFromLedger, AGING_BUCKETS, BUCKET_COLOR } from "../lib/ledgerUtils";

function fmt(n) { return Number(n || 0).toLocaleString("en-IN"); }
function fmtDate(d) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}

const SORT_COLS = ["name", "dealer_code", "totalOutstanding", "weeksOld"];

export default function AgingReport() {
  const [rows, setRows]         = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [bucketFilter, setBucketFilter] = useState("all");
  const [sortCol, setSortCol]   = useState("weeksOld");
  const [sortDir, setSortDir]   = useState("desc");

  useEffect(() => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    async function load() {
      const [ledgerRes, profilesRes] = await Promise.all([
        supabase
          .from("dealer_ledger")
          .select("dealer_id, type, amount, dr_dealer, cr_dealer, voucher_date, created_at")
          .order("voucher_date", { ascending: true }),
        supabase
          .from("profiles")
          .select("id, name, dealer_code, is_dealer")
          .eq("is_dealer", true),
      ]);

      if (ledgerRes.error) { setError(ledgerRes.error.message); setLoading(false); return; }
      if (profilesRes.error) { setError(profilesRes.error.message); setLoading(false); return; }

      const profileMap = {};
      for (const p of (profilesRes.data || [])) profileMap[p.id] = p;

      // Group ledger rows by dealer_id
      const byDealer = {};
      for (const row of (ledgerRes.data || [])) {
        if (!byDealer[row.dealer_id]) byDealer[row.dealer_id] = [];
        byDealer[row.dealer_id].push(row);
      }

      const result = [];
      for (const [dealerId, ledgerRows] of Object.entries(byDealer)) {
        const aging = computeAgingFromLedger(ledgerRows);
        if (!aging) continue; // zero outstanding — skip
        const profile = profileMap[dealerId];
        result.push({
          dealerId,
          name:       profile?.name        || "(unknown)",
          dealer_code: profile?.dealer_code || "—",
          totalOutstanding: aging.totalOutstanding,
          oldestDate: aging.oldestDate,
          weeksOld:   aging.weeksOld,
          daysOld:    aging.daysOld,
          bucket:     aging.bucket,
        });
      }

      setRows(result);
      setLoading(false);
    }
    load();
  }, []);

  // Summary card counts
  const totalOutstandingAll = rows.reduce((s, r) => s + r.totalOutstanding, 0);
  const bucketCounts = AGING_BUCKETS.reduce((acc, b) => {
    acc[b] = rows.filter(r => r.bucket === b).length;
    return acc;
  }, {});

  // Filter + sort
  const filtered = rows
    .filter(r => bucketFilter === "all" || r.bucket === bucketFilter)
    .slice()
    .sort((a, b) => {
      let av = a[sortCol], bv = b[sortCol];
      if (typeof av === "string") av = av.toLowerCase();
      if (typeof bv === "string") bv = bv.toLowerCase();
      if (av < bv) return sortDir === "asc" ? -1 :  1;
      if (av > bv) return sortDir === "asc" ?  1 : -1;
      return 0;
    });

  function handleSort(col) {
    if (sortCol === col) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortCol(col); setSortDir("desc"); }
  }

  function sortLabel(col) {
    if (sortCol !== col) return " ↕";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  if (!isSupabaseConfigured) {
    return (
      <div style={{ padding: 32, color: "#888" }}>
        Supabase not configured — check your environment variables.
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 20px", maxWidth: 960, margin: "0 auto" }}>
      <h2 style={{ margin: "0 0 4px", fontSize: 22, fontWeight: 700 }}>Aging Report</h2>
      <p style={{ margin: "0 0 20px", fontSize: 13, color: "#666" }}>
        Dealers with outstanding balances, oldest-first (FIFO heuristic — credits applied to oldest debits first).
      </p>

      {loading && <div style={{ color: "#888", padding: "40px 0" }}>Loading…</div>}
      {error   && <div style={{ color: "#c0392b", padding: "12px 0" }}>Error: {error}</div>}

      {!loading && !error && (
        <>
          {/* Summary cards */}
          <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 20 }}>
            <SummaryCard
              label="Total Outstanding"
              value={`₹${fmt(Math.round(totalOutstandingAll))}`}
              color="#2c3e50"
            />
            {AGING_BUCKETS.map(b => (
              <SummaryCard
                key={b}
                label={b}
                value={`${bucketCounts[b] || 0} dealer${bucketCounts[b] !== 1 ? "s" : ""}`}
                color={BUCKET_COLOR[b]}
                active={bucketFilter === b}
                onClick={() => setBucketFilter(bucketFilter === b ? "all" : b)}
              />
            ))}
          </div>

          {/* Bucket filter pills */}
          <div style={{ display: "flex", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
            <FilterPill label="All" active={bucketFilter === "all"} onClick={() => setBucketFilter("all")} />
            {AGING_BUCKETS.map(b => (
              <FilterPill
                key={b}
                label={b}
                active={bucketFilter === b}
                color={BUCKET_COLOR[b]}
                onClick={() => setBucketFilter(b)}
              />
            ))}
          </div>

          {filtered.length === 0 ? (
            <div style={{ padding: "40px 0", textAlign: "center", color: "#888" }}>
              {rows.length === 0
                ? "No dealers with outstanding balances."
                : "No dealers in this age bucket."}
            </div>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
                <thead>
                  <tr style={{ borderBottom: "2px solid #e5e5e5", textAlign: "left" }}>
                    <Th onClick={() => handleSort("name")}>Dealer Name{sortLabel("name")}</Th>
                    <Th onClick={() => handleSort("dealer_code")}>Code{sortLabel("dealer_code")}</Th>
                    <Th onClick={() => handleSort("totalOutstanding")} right>Outstanding (₹){sortLabel("totalOutstanding")}</Th>
                    <Th>Oldest Unpaid Since</Th>
                    <Th onClick={() => handleSort("weeksOld")} right>Age{sortLabel("weeksOld")}</Th>
                    <Th>Bucket</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <tr key={r.dealerId} style={{ borderBottom: "1px solid #f0f0f0" }}>
                      <Td>{r.name}</Td>
                      <Td style={{ color: "#888", fontSize: 12 }}>{r.dealer_code}</Td>
                      <Td right style={{ fontWeight: 600 }}>₹{fmt(Math.round(r.totalOutstanding))}</Td>
                      <Td style={{ fontSize: 12, color: "#555" }}>{fmtDate(r.oldestDate)}</Td>
                      <Td right style={{ fontSize: 12, color: "#555" }}>
                        {r.weeksOld}w ({r.daysOld}d)
                      </Td>
                      <Td>
                        <span style={{
                          display: "inline-block",
                          padding: "2px 8px",
                          borderRadius: 10,
                          fontSize: 11,
                          fontWeight: 600,
                          background: BUCKET_COLOR[r.bucket] + "22",
                          color: BUCKET_COLOR[r.bucket],
                        }}>
                          {r.bucket}
                        </span>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div style={{ marginTop: 12, fontSize: 11, color: "#aaa" }}>
                {filtered.length} dealer{filtered.length !== 1 ? "s" : ""} shown
                {bucketFilter !== "all" ? ` in ${bucketFilter}` : ""} ·
                FIFO heuristic: payments applied to oldest invoices first (payment-to-invoice linking not available).
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ label, value, color, active, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        minWidth: 120,
        padding: "12px 16px",
        borderRadius: 10,
        border: `2px solid ${active ? color : "#e5e5e5"}`,
        background: active ? color + "11" : "#fafafa",
        cursor: onClick ? "pointer" : "default",
      }}
    >
      <div style={{ fontSize: 11, color: "#888", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>
        {label}
      </div>
      <div style={{ fontSize: 18, fontWeight: 700, color: color || "#2c3e50" }}>{value}</div>
    </div>
  );
}

function FilterPill({ label, active, color, onClick }) {
  const bg = active ? (color || "#2c3e50") : "#f0f0f0";
  const fg = active ? "#fff" : "#555";
  return (
    <button
      onClick={onClick}
      style={{
        padding: "4px 14px",
        borderRadius: 20,
        border: "none",
        background: bg,
        color: fg,
        cursor: "pointer",
        fontSize: 13,
        fontWeight: active ? 600 : 400,
      }}
    >
      {label}
    </button>
  );
}

function Th({ children, onClick, right }) {
  return (
    <th
      onClick={onClick}
      style={{
        padding: "8px 12px",
        fontWeight: 600,
        color: "#444",
        fontSize: 12,
        textTransform: "uppercase",
        letterSpacing: "0.04em",
        cursor: onClick ? "pointer" : "default",
        textAlign: right ? "right" : "left",
        whiteSpace: "nowrap",
        userSelect: "none",
      }}
    >
      {children}
    </th>
  );
}

function Td({ children, right, style }) {
  return (
    <td style={{ padding: "10px 12px", textAlign: right ? "right" : "left", verticalAlign: "middle", ...style }}>
      {children}
    </td>
  );
}
