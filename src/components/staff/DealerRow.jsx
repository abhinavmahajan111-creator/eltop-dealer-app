// Shared dealer list row — originally lived only in SalesDashboard.jsx's
// inline "My Dealers / Parties" section, pulled out here so the new
// dedicated "My Dealers" and "Dues to collect" pages (opened from the
// dashboard's stat tiles) can render the exact same row without
// duplicating the locked-ledger badge / "New" field-dealer badge logic.
function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

export default function DealerRow({ dealer, onClick }) {
  const territories = Array.isArray(dealer.territory) ? dealer.territory : [];
  return (
    <div
      onClick={onClick}
      style={{ display: "flex", alignItems: "center", gap: 12, padding: "13px 16px", borderBottom: "1px solid #f2f2f2", cursor: "pointer" }}
    >
      <div style={{
        width: 36, height: 36, borderRadius: 10, background: "#f3e6f6", color: "#7B2D8B",
        display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800, fontSize: 13, flexShrink: 0,
      }}>
        {initials(dealer.name)}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          {dealer.name || "Unnamed"}{dealer.alias_name ? ` (${dealer.alias_name})` : ""}
          {dealer.dealer_kind && dealer.dealer_kind !== "profile" && (
            <span style={{ fontSize: 9.5, fontWeight: 800, color: "#c98400", background: "#fff4e0", borderRadius: 999, padding: "2px 7px" }}>
              🆕 New
            </span>
          )}
        </div>
        <div style={{ fontSize: 11.5, color: "#999", marginTop: 1 }}>
          {dealer.dealer_code || "—"}{territories.length ? ` · ${territories.join(", ")}` : ""}
          {dealer.owner_name ? ` · ${dealer.dealer_kind && dealer.dealer_kind !== "profile" ? "added by" : "owner"}: ${dealer.owner_name}` : ""}
        </div>
      </div>
      {dealer.has_ledger_access === false ? (
        <div style={{ display: "flex", alignItems: "center", gap: 4, flexShrink: 0, background: "#f3f3f3", borderRadius: 999, padding: "4px 10px" }}>
          <span style={{ fontSize: 11 }}>🔒</span>
          <span style={{ fontSize: 10.5, fontWeight: 700, color: "#888" }}>Locked</span>
        </div>
      ) : (
        <div style={{ fontSize: 12, fontWeight: 700, color: dealer.outstanding > 0 ? "#d64545" : "#2fa84f", whiteSpace: "nowrap" }}>
          ₹{Number(dealer.outstanding || 0).toLocaleString("en-IN")}
        </div>
      )}
      <div style={{ color: "#ccc", fontSize: 14, marginLeft: 2 }}>›</div>
    </div>
  );
}
