import { useEffect, useState } from "react";
import { PERIOD_OPTIONS, periodToRange } from "../../lib/dealerCrmUtils";

const SINGLE_DATE_OPTIONS = [
  { key: "today", label: "Today" },
  { key: "custom", label: "Custom date" },
];

// Reusable period dropdown used by the Ledger and Insights tabs. Fires
// onChange({ from, to }) on mount (so the parent always has a starting
// range) and again whenever the resolved range changes — either from
// picking a preset, or from filling in both custom date fields.
export default function PeriodPicker({ onChange, singleDate = false, defaultKey = "last_3m", small = false }) {
  const [key, setKey] = useState(defaultKey);
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    if (defaultKey !== "custom") onChange(periodToRange(defaultKey));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePreset = (newKey) => {
    setKey(newKey);
    if (newKey !== "custom") onChange(periodToRange(newKey));
    else if (customFrom && (singleDate || customTo)) onChange({ from: customFrom, to: singleDate ? customFrom : customTo });
  };

  const handleCustom = (which, val) => {
    if (which === "from") setCustomFrom(val); else setCustomTo(val);
    const from = which === "from" ? val : customFrom;
    const to = singleDate ? from : which === "to" ? val : customTo;
    if (from && (singleDate || to)) onChange({ from, to });
  };

  const selectStyle = {
    fontSize: small ? 10.5 : 11.5, fontWeight: 700, color: "#7B2D8B",
    border: "1.5px solid #e6d3ea", borderRadius: 7, padding: small ? "5px 7px" : "8px 10px",
    background: "#faf5fb",
  };
  const dateStyle = {
    flex: 1, padding: "7px 8px", border: "1.5px solid #e6d3ea", borderRadius: 7,
    fontSize: 11, fontWeight: 700, color: "#333", background: "#faf5fb", minWidth: 0,
  };

  return (
    <div>
      <select value={key} onChange={(e) => handlePreset(e.target.value)} style={selectStyle}>
        {(singleDate ? SINGLE_DATE_OPTIONS : PERIOD_OPTIONS).map((o) => (
          <option key={o.key} value={o.key}>{o.label}</option>
        ))}
      </select>
      {key === "custom" && (
        <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 8 }}>
          {singleDate && <span style={{ fontSize: 11, color: "#888", flexShrink: 0 }}>As of</span>}
          <input type="date" value={customFrom} onChange={(e) => handleCustom("from", e.target.value)} style={dateStyle} />
          {!singleDate && (
            <>
              <span style={{ fontSize: 11, color: "#888" }}>to</span>
              <input type="date" value={customTo} onChange={(e) => handleCustom("to", e.target.value)} style={dateStyle} />
            </>
          )}
        </div>
      )}
    </div>
  );
}
