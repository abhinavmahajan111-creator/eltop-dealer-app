import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import ScrollFade from "../components/ScrollFade";
import { generatePriceListPDF } from "../utils/generatePriceListPDF";
import PdfViewerModal from "../components/PdfViewerModal";

// Same fallback logic as Store.jsx: prefer image_urls, fall back to image_url
function getImages(p) {
  let urls = p.image_urls;
  if (urls != null) {
    if (typeof urls === "string") { try { urls = JSON.parse(urls); } catch { urls = [urls]; } }
    if (Array.isArray(urls)) { const f = urls.filter(Boolean); if (f.length > 0) return f; }
    else if (urls) return [urls];
  }
  return p.image_url ? [p.image_url] : [];
}
function getFirstImage(p) { return getImages(p)[0] || null; }

const EMPTY_FORM = {
  id: null, name: "", mrp: "", dlp: "", price: "", unit: "pc", stock: "",
  hsn_code: "", category: "", standard_packing: "", video_url: "", image_urls: [],
  // Rich detail fields
  about_item: [],
  brand: "", colour: "", style: "", dimensions: "", room_type: "",
  special_features: "", recommended_use: "", mounting_type: "",
  power_source: "", material: "", wattage: "", voltage: "",
  warranty: "", weight: "",
  features_specs: {}, item_details: {},
};

// ── Collapsible section wrapper ───────────────────────────────────────────────
function Section({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, marginBottom: 12, overflow: "hidden" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#f8f9fc", cursor: "pointer", userSelect: "none", fontWeight: 700, fontSize: 13, color: "#334155" }}
      >
        <span>{title}</span>
        <span style={{ fontSize: 11 }}>{open ? "▲" : "▼"}</span>
      </div>
      {open && <div style={{ padding: "14px 14px 10px" }}>{children}</div>}
    </div>
  );
}

// ── Bullet list editor ────────────────────────────────────────────────────────
function BulletEditor({ items, onChange }) {
  const add = () => onChange([...items, ""]);
  const remove = (i) => onChange(items.filter((_, idx) => idx !== i));
  const update = (i, val) => onChange(items.map((x, idx) => idx === i ? val : x));
  return (
    <div>
      {items.map((item, i) => (
        <div key={i} style={{ display: "flex", gap: 6, marginBottom: 6, alignItems: "center" }}>
          <span style={{ color: "#94a3b8", fontSize: 14 }}>•</span>
          <input
            value={item}
            onChange={e => update(i, e.target.value)}
            placeholder={`Point ${i + 1}`}
            style={{ flex: 1, marginBottom: 0, fontSize: 13 }}
          />
          <button type="button" onClick={() => remove(i)} style={{ background: "none", border: "none", color: "#e74c3c", cursor: "pointer", fontSize: 16, padding: "0 4px", lineHeight: 1 }}>✕</button>
        </div>
      ))}
      <button type="button" onClick={add} style={{ fontSize: 12, color: "#7B2D8B", background: "none", border: "1px dashed #7B2D8B", borderRadius: 6, padding: "4px 12px", cursor: "pointer", marginTop: 2 }}>+ Add point</button>
    </div>
  );
}

// ── Fixed predefined specs editor ────────────────────────────────────────────
const SPEC_FIELDS = [
  { key: "Power Source",     suggestions: ["Electric", "Battery", "Solar", "Manual", "AC/DC"] },
  { key: "Room Type",        suggestions: ["Kitchen", "Bedroom", "Living Room", "Bathroom", "Office", "Outdoor", "All Rooms"] },
  { key: "Mounting Type",    suggestions: ["Ceiling Mount", "Wall Mount", "Floor Mount", "Table Top", "Recessed", "Surface Mount"] },
  { key: "Special Features", suggestions: [] },
  { key: "Recommended Use",  suggestions: [] },
  { key: "Colour",           suggestions: ["White", "Black", "Silver", "Brown", "Ivory", "Chrome", "Gold"] },
  { key: "Style",            suggestions: ["Classic", "Modern", "Premium", "Standard", "Decorative", "Industrial"] },
  { key: "Material",         suggestions: ["Aluminium", "Plastic", "Steel", "Copper", "ABS", "Iron", "Brass", "Mixed"] },
  { key: "Wattage",          suggestions: ["5W", "10W", "15W", "20W", "40W", "60W", "75W", "100W"] },
  { key: "Voltage",          suggestions: ["12V", "24V", "110V", "220V", "240V", "110-240V"] },
  { key: "Speed",            suggestions: ["3 Speed", "5 Speed", "Variable", "300 RPM", "400 RPM"] },
  { key: "Capacity",         suggestions: [] },
  { key: "Warranty",         suggestions: ["6 Months", "1 Year", "2 Years", "3 Years", "5 Years"] },
  { key: "Weight",           suggestions: [] },
  { key: "Dimensions",       suggestions: [] },
];

function SpecsEditor({ data, onChange }) {
  // __hidden is stored inside features_specs as an array of hidden field keys
  const hidden = new Set(Array.isArray(data?.__hidden) ? data.__hidden : []);

  const set = (k, v) => {
    if (v === "") {
      const d = { ...data }; delete d[k]; onChange(d);
    } else {
      onChange({ ...data, [k]: v });
    }
  };

  const toggleVisibility = (k) => {
    const next = new Set(hidden);
    if (next.has(k)) next.delete(k); else next.add(k);
    onChange({ ...data, __hidden: [...next] });
  };

  return (
    <div>
      {SPEC_FIELDS.map(({ key, suggestions }) => {
        const listId = `spec-${key.replace(/\s+/g, "-")}`;
        const isHidden = hidden.has(key);
        return (
          <div key={key} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <label style={{ width: 160, fontSize: 12, fontWeight: 600, color: "#64748b", flexShrink: 0 }}>{key}</label>
            <input
              list={listId}
              value={data?.[key] ?? ""}
              onChange={e => set(key, e.target.value)}
              placeholder="—"
              style={{ flex: 1, marginBottom: 0, fontSize: 13, opacity: isHidden ? 0.45 : 1 }}
            />
            {suggestions.length > 0 && (
              <datalist id={listId}>
                {suggestions.map(s => <option key={s} value={s} />)}
              </datalist>
            )}
            <button
              type="button"
              onClick={() => toggleVisibility(key)}
              style={{
                padding: "5px 12px", borderRadius: 6, flexShrink: 0, whiteSpace: "nowrap",
                border: isHidden ? "1px solid #ccc" : "1px solid #7B2D8B",
                background: isHidden ? "#f5f5f5" : "#f0e8f8",
                color: isHidden ? "#999" : "#7B2D8B",
                cursor: "pointer", fontSize: 12,
              }}
            >
              {isHidden ? "🙈 Hidden" : "👁 Visible"}
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Bulk edit columns definition ──────────────────────────────────────────────
const BULK_COLS = [
  { key: "name",             label: "Name",      type: "text",   removable: false },
  { key: "dlp",              label: "DLP (₹)",   type: "number", removable: true  },
  { key: "mrp",              label: "MRP (₹)",   type: "number", removable: true  },
  { key: "stock",            label: "Stock",     type: "number", removable: true  },
  { key: "standard_packing", label: "Packing",   type: "number", removable: true  },
];
// Fields from Single Edit that can be added on demand (complex/rich-text fields excluded)
const BULK_OPTIONAL_COLS = [
  { key: "hsn_code", label: "HSN Code", type: "text",   removable: true },
  { key: "category", label: "Category", type: "select", removable: true },
  { key: "unit",     label: "Unit",     type: "text",   removable: true },
];
const ALL_BULK_COLS = [...BULK_COLS, ...BULK_OPTIONAL_COLS];

function autoResize(el) {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
}

// ── Image lightbox — shared by BulkEditModal and edit-form thumbnail ──────────
async function downloadImage(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `eltop-product.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  } catch {
    // silently fail — image may be unreachable in this context
  }
}

async function shareImage(url) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const ext = (blob.type.split("/")[1] || "jpg").replace("jpeg", "jpg");
    const file = new File([blob], `eltop-product.${ext}`, { type: blob.type });
    if (navigator.share) {
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: "Product Image" });
      } else {
        await navigator.share({ url });
      }
    } else {
      await navigator.clipboard.writeText(url);
      return "copied";
    }
  } catch {
    // user cancelled share or clipboard blocked — ignore
  }
}

function ImageLightbox({ images, startIndex = 0, onClose }) {
  const [idx, setIdx] = useState(startIndex);
  const [imgLoaded, setImgLoaded] = useState(false);
  const src = images[idx];
  const isMulti = images.length > 1;

  const [dlBusy, setDlBusy] = useState(false);
  const [shareLabel, setShareLabel] = useState("Share");

  // Batch idx + imgLoaded reset in one render so no stale-image frame exists
  const navigate = (newIdx) => { setIdx(newIdx); setImgLoaded(false); };

  // Reset when caller opens lightbox for a different product
  useEffect(() => { setIdx(startIndex); setImgLoaded(false); }, [startIndex]);

  // Preload entire gallery into browser cache as soon as lightbox opens
  useEffect(() => {
    images.forEach(url => { new Image().src = url; });
  }, [images]);

  // Arrow-key navigation (separate from Escape which callers handle)
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "ArrowLeft")  navigate(Math.max(0, idx - 1));
      if (e.key === "ArrowRight") navigate(Math.min(images.length - 1, idx + 1));
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [idx, images.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDownload = async (e) => {
    e.stopPropagation();
    setDlBusy(true);
    await downloadImage(src);
    setDlBusy(false);
  };

  const handleShare = async (e) => {
    e.stopPropagation();
    setShareLabel("…");
    const result = await shareImage(src);
    setShareLabel(result === "copied" ? "Copied!" : "Share");
    if (result === "copied") setTimeout(() => setShareLabel("Share"), 2000);
  };

  const btnStyle = {
    background: "rgba(255,255,255,0.15)", border: "1px solid rgba(255,255,255,0.35)",
    color: "#fff", borderRadius: 20, padding: "8px 20px", cursor: "pointer",
    fontSize: 13, fontWeight: 600, whiteSpace: "nowrap",
  };

  const arrowStyle = {
    position: "absolute", top: "50%", transform: "translateY(-50%)",
    background: "rgba(0,0,0,0.45)", border: "none", borderRadius: "50%",
    width: 44, height: 44, color: "#fff", fontSize: 22, cursor: "pointer",
    display: "flex", alignItems: "center", justifyContent: "center",
    lineHeight: 1,
  };

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1100,
        background: "rgba(0,0,0,0.78)",
        display: "flex", flexDirection: "column",
        alignItems: "center", justifyContent: "center", gap: 16,
      }}
    >
      {/* "Pic X of N" counter */}
      {isMulti && (
        <div style={{
          position: "absolute", top: 16, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.45)", color: "#fff", fontSize: 12, fontWeight: 600,
          padding: "4px 12px", borderRadius: 12, whiteSpace: "nowrap",
        }}>
          {idx + 1} / {images.length}
        </div>
      )}

      {/* Left arrow — hidden at first image */}
      {isMulti && idx > 0 && (
        <button
          style={{ ...arrowStyle, left: 16 }}
          onClick={e => { e.stopPropagation(); navigate(idx - 1); }}
        >‹</button>
      )}

      {/* Right arrow — hidden at last image */}
      {isMulti && idx < images.length - 1 && (
        <button
          style={{ ...arrowStyle, right: 16 }}
          onClick={e => { e.stopPropagation(); navigate(idx + 1); }}
        >›</button>
      )}

      {/* Loading placeholder — same size as image area, visible only while loading */}
      {!imgLoaded && (
        <div onClick={e => e.stopPropagation()} style={{
          width: "min(300px, 90vw)", minHeight: 180,
          display: "flex", alignItems: "center", justifyContent: "center",
          color: "rgba(255,255,255,0.35)", fontSize: 13, letterSpacing: 1,
        }}>
          Loading…
        </div>
      )}

      {/* key={idx} forces a fresh DOM node on navigation, so the browser can't
          keep painting the old image while the new src loads */}
      <img
        key={idx}
        src={src}
        alt=""
        onLoad={() => setImgLoaded(true)}
        onClick={e => e.stopPropagation()}
        style={{
          display: imgLoaded ? "block" : "none",
          maxWidth: "min(300px, 90vw)", maxHeight: "75vh",
          borderRadius: 12, objectFit: "contain",
          boxShadow: "0 8px 40px rgba(0,0,0,.5)",
        }}
      />
      <div onClick={e => e.stopPropagation()} style={{ display: "flex", gap: 10 }}>
        <button style={btnStyle} onClick={handleDownload} disabled={dlBusy}>
          {dlBusy ? "…" : "⬇ Download"}
        </button>
        <button style={btnStyle} onClick={handleShare}>
          ↗ {shareLabel}
        </button>
      </div>
    </div>
  );
}

// ── Bulk edit modal ───────────────────────────────────────────────────────────
function BulkEditModal({ rows, onClose, onSaved, existingCategories }) {
  // Uncontrolled inputs: initial values stored in a ref (not state) so
  // keystrokes don't trigger React re-renders of all N rows.
  const initialDrafts = useRef(
    Object.fromEntries(rows.map(p => [p.id, {
      name:             p.name             ?? "",
      dlp:              p.dlp              ?? "",
      mrp:              p.mrp              ?? "",
      stock:            p.stock            ?? 0,
      standard_packing: p.standard_packing ?? "",
      hsn_code:         p.hsn_code         ?? "",
      category:         p.category         ?? "",
      unit:             p.unit             ?? "pc",
    }]))
  );

  const [cellErrors, setCellErrors] = useState({});
  const [saving,    setSaving]    = useState(false);
  const [saveError, setSaveError] = useState("");
  const [bigImg,    setBigImg]    = useState(null);

  // ── Visible column keys (reorderable + removable, persisted to localStorage) ──
  const DEFAULT_COL_KEYS = BULK_COLS.map(c => c.key);
  const [visibleColKeys, setVisibleColKeys] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("eltop-bulk-col-order") || "null");
      if (Array.isArray(saved) && saved.length > 0 &&
          saved.every(k => ALL_BULK_COLS.some(c => c.key === k))) return saved;
    } catch {}
    return DEFAULT_COL_KEYS;
  });
  const [addFieldOpen, setAddFieldOpen] = useState(false);
  const [dropTarget, setDropTarget] = useState(null);
  const dragKeyRef = useRef(null);

  const orderedCols = visibleColKeys.map(k => ALL_BULK_COLS.find(c => c.key === k)).filter(Boolean);
  // Show any removable column (default or optional) that isn't currently visible
  const availableToAdd = ALL_BULK_COLS.filter(c => c.removable !== false && !visibleColKeys.includes(c.key));

  const saveColOrder = (next) => {
    try { localStorage.setItem("eltop-bulk-col-order", JSON.stringify(next)); } catch {}
  };

  const addCol = (key) => {
    setVisibleColKeys(prev => {
      if (prev.includes(key)) return prev;
      const next = [...prev, key];
      saveColOrder(next);
      return next;
    });
    setAddFieldOpen(false);
  };

  const removeCol = (key) => {
    setVisibleColKeys(prev => {
      const next = prev.filter(k => k !== key);
      saveColOrder(next);
      return next;
    });
  };

  const moveCol = (key, dir) => {
    setVisibleColKeys(prev => {
      const i = prev.indexOf(key);
      const j = i + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      saveColOrder(next);
      return next;
    });
  };

  const onColDragStart = (key) => (e) => {
    dragKeyRef.current = key;
    e.dataTransfer.effectAllowed = "move";
  };
  const onColDragOver = (key) => (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (key !== dragKeyRef.current) setDropTarget(key);
  };
  const onColDrop = (key) => (e) => {
    e.preventDefault();
    const from = dragKeyRef.current;
    setDropTarget(null);
    dragKeyRef.current = null;
    if (!from || from === key) return;
    setVisibleColKeys(prev => {
      const next = [...prev];
      const fromIdx = next.indexOf(from);
      const toIdx   = next.indexOf(key);
      next.splice(fromIdx, 1);
      next.splice(toIdx, 0, from);
      saveColOrder(next);
      return next;
    });
  };
  const onColDragEnd = () => { setDropTarget(null); dragKeyRef.current = null; };

  const inputRefs    = useRef({});
  const saveButtonRef = useRef(null);

  // Size all name textareas once after mount
  useEffect(() => {
    rows.forEach(p => autoResize(inputRefs.current[`${p.id}-name`]));
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Close on Escape
  const bigImgRef = useRef(null);
  useEffect(() => { bigImgRef.current = bigImg; }, [bigImg]);
  useEffect(() => {
    const handler = (e) => {
      if (e.key === "Escape") {
        if (bigImgRef.current) setBigImg(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Close add-field dropdown on outside click
  useEffect(() => {
    if (!addFieldOpen) return;
    const handler = (e) => {
      if (!e.target.closest("[data-add-field-root]")) setAddFieldOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [addFieldOpen]);

  const getValue = (id, field) => inputRefs.current[`${id}-${field}`]?.value ?? "";

  const validate = () => {
    const errors = {};
    let hasError = false;
    for (const p of rows) {
      const rowErrors = {};
      if (visibleColKeys.includes("name") && !String(getValue(p.id, "name") || "").trim()) {
        rowErrors.name = "Required";
        hasError = true;
      }
      ["dlp", "mrp", "stock", "standard_packing"].filter(f => visibleColKeys.includes(f)).forEach(f => {
        const v = getValue(p.id, f);
        if (v !== "" && (isNaN(Number(v)) || Number(v) < 0)) {
          rowErrors[f] = "Must be ≥ 0";
          hasError = true;
        }
      });
      if (Object.keys(rowErrors).length) errors[p.id] = rowErrors;
    }
    return hasError ? errors : null;
  };

  const handleSave = async () => {
    setCellErrors({});
    const errors = validate();
    if (errors) { setCellErrors(errors); return; }
    setSaving(true);
    setSaveError("");

    const CHUNK = 20;
    const failedNames = [];

    for (let i = 0; i < rows.length; i += CHUNK) {
      const chunk = rows.slice(i, i + CHUNK);
      const results = await Promise.allSettled(chunk.map(p => {
        // Build update object from ONLY currently visible columns
        const upd = {};
        for (const key of visibleColKeys) {
          const val = getValue(p.id, key);
          if (key === "name")             upd.name             = String(val).trim();
          else if (key === "dlp")         upd.dlp              = val !== "" ? Number(val) : null;
          else if (key === "mrp")         upd.mrp              = val !== "" ? Number(val) : null;
          else if (key === "stock")       upd.stock            = Number(val) || 0;
          else if (key === "standard_packing") upd.standard_packing = val !== "" ? Number(val) : null;
          else if (key === "hsn_code")    upd.hsn_code         = val || null;
          else if (key === "category")    upd.category         = val || null;
          else if (key === "unit")        upd.unit             = val || "pc";
        }
        return supabase.from("products").update(upd).eq("id", p.id);
        // If a product was deleted between selection and save, .update().eq('id', ...) is a no-op
        // (0 rows matched, no error) — it's silently skipped and won't appear in the refreshed table.
      }));

      results.forEach((res, idx) => {
        if (res.status === "rejected" || res.value?.error) {
          failedNames.push(chunk[idx].name);
        }
      });
    }

    setSaving(false);
    if (failedNames.length > 0) {
      setSaveError(`Failed to save: ${failedNames.slice(0, 3).join(", ")}${failedNames.length > 3 ? ` (+${failedNames.length - 3} more)` : ""}. Please try again.`);
      return;
    }
    onSaved();
  };

  const handleKeyDown = (e, rowIdx, colKey) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (rowIdx + 1 < rows.length) {
      const nextInput = inputRefs.current[`${rows[rowIdx + 1].id}-${colKey}`];
      if (nextInput) { nextInput.focus(); nextInput.select(); }
    } else {
      saveButtonRef.current?.focus();
    }
  };

  if (rows.length === 0) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0, zIndex: 1000,
        background: "rgba(0,0,0,.5)",
        display: "flex", alignItems: "center", justifyContent: "center",
        padding: 16,
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: "#fff", borderRadius: 16,
          width: "100%", maxWidth: 900,
          maxHeight: "90vh", overflow: "hidden", display: "flex", flexDirection: "column",
          boxShadow: "0 8px 40px rgba(0,0,0,.2)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "18px 24px 14px", borderBottom: "1px solid #e2e8f0", display: "flex", justifyContent: "space-between", alignItems: "flex-start", flexShrink: 0, gap: 12 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16, color: "#111" }}>
              Bulk Edit — {rows.length} product{rows.length !== 1 ? "s" : ""}
            </div>
            <div style={{ fontSize: 12, color: "#64748b", marginTop: 3 }}>
              Values are pre-filled with current data. Enter moves down the same column. Changes are saved as absolute values.
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {/* + Add field */}
            {availableToAdd.length > 0 && (
              <div style={{ position: "relative" }} data-add-field-root="">
                <button
                  onClick={() => setAddFieldOpen(o => !o)}
                  style={{
                    background: "none", border: "1px solid #c4b5d0", borderRadius: 6,
                    padding: "5px 10px", cursor: "pointer", fontSize: 12,
                    color: "var(--red-dark)", fontWeight: 600, whiteSpace: "nowrap",
                  }}
                >+ Add field</button>
                {addFieldOpen && (
                  <div style={{
                    position: "absolute", right: 0, top: "calc(100% + 4px)",
                    background: "#fff", border: "1px solid #e2e8f0", borderRadius: 8,
                    boxShadow: "0 4px 16px rgba(0,0,0,.12)", zIndex: 20, minWidth: 140, overflow: "hidden",
                  }}>
                    {availableToAdd.map(col => (
                      <div
                        key={col.key}
                        onClick={() => addCol(col.key)}
                        style={{
                          padding: "9px 14px", cursor: "pointer", fontSize: 13,
                          color: "#334155", borderBottom: "1px solid #f1f5f9",
                        }}
                        onMouseEnter={e => e.currentTarget.style.background = "#f8f4f8"}
                        onMouseLeave={e => e.currentTarget.style.background = ""}
                      >
                        {col.label}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
            <button onClick={onClose} style={{ background: "none", border: "none", fontSize: 20, cursor: "pointer", color: "#94a3b8", lineHeight: 1, padding: "0 4px" }}>✕</button>
          </div>
        </div>

        {/* Scrollable table */}
        <ScrollFade bg="#fff" style={{ flex: 1, minHeight: 0 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", minWidth: 560 }}>
            <thead>
              <tr style={{ position: "sticky", top: 0, background: "#f8f9fc", zIndex: 2 }}>
                <th style={{ padding: "10px 4px 10px 10px", fontSize: 11, fontWeight: 700, textAlign: "left", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", width: 28 }}>#</th>
                <th style={{ padding: "10px 6px 10px 6px", fontSize: 11, fontWeight: 700, textAlign: "left", color: "#64748b", textTransform: "uppercase", letterSpacing: "0.5px", borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap", width: 40 }}>IMG</th>
                {orderedCols.map((col) => {
                  const colIdx = visibleColKeys.indexOf(col.key);
                  const isDragTarget = dropTarget === col.key && dragKeyRef.current !== col.key;
                  return (
                    <th
                      key={col.key}
                      draggable
                      onDragStart={onColDragStart(col.key)}
                      onDragOver={onColDragOver(col.key)}
                      onDrop={onColDrop(col.key)}
                      onDragEnd={onColDragEnd}
                      style={{
                        padding: "10px 10px 10px 8px",
                        fontSize: 11, fontWeight: 700, textAlign: "left", color: "#64748b",
                        textTransform: "uppercase", letterSpacing: "0.5px",
                        borderBottom: "1px solid #e2e8f0", whiteSpace: "nowrap",
                        cursor: "grab", userSelect: "none",
                        borderLeft: isDragTarget ? "3px solid #6c47ff" : "3px solid transparent",
                        background: isDragTarget ? "#f0edff" : undefined,
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
                        <span style={{ color: "#c7c7d4", fontSize: 10, letterSpacing: 0 }}>⠿</span>
                        {col.label}
                        <span style={{ display: "inline-flex", gap: 1, marginLeft: 1 }}>
                          {colIdx > 0 && (
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => { e.stopPropagation(); moveCol(col.key, -1); }}
                              title="Move left"
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "#94a3b8", fontSize: 11, lineHeight: 1 }}
                            >◂</button>
                          )}
                          {colIdx < visibleColKeys.length - 1 && (
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => { e.stopPropagation(); moveCol(col.key, +1); }}
                              title="Move right"
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "#94a3b8", fontSize: 11, lineHeight: 1 }}
                            >▸</button>
                          )}
                          {col.removable !== false && (
                            <button
                              onMouseDown={e => e.stopPropagation()}
                              onClick={e => { e.stopPropagation(); removeCol(col.key); }}
                              title={`Remove ${col.label} column`}
                              style={{ background: "none", border: "none", cursor: "pointer", padding: "0 2px", color: "#e74c3c", fontSize: 11, lineHeight: 1, opacity: 0.6 }}
                            >✕</button>
                          )}
                        </span>
                      </div>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {rows.map((p, rowIdx) => {
                const init = initialDrafts.current[p.id];
                const errs = cellErrors[p.id] || {};
                const thumb = getFirstImage(p);
                return (
                  <tr key={p.id} style={{ borderBottom: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "5px 4px 5px 10px", verticalAlign: "middle", width: 28, color: "#94a3b8", fontSize: 12, fontWeight: 600, textAlign: "right" }}>
                      {rowIdx + 1}
                    </td>
                    <td
                      style={{ padding: "5px 6px 5px 6px", verticalAlign: "middle", width: 40, cursor: thumb ? "pointer" : "default" }}
                      onClick={() => { if (thumb) setBigImg({ images: getImages(p), index: 0 }); }}
                    >
                      {thumb && <img src={thumb} alt="" style={{ width: 28, height: 28, objectFit: "cover", borderRadius: 4, display: "block" }} />}
                    </td>
                    {orderedCols.map(({ key, type }) => (
                      <td key={key} style={{ padding: "5px 6px 5px 10px", verticalAlign: "top" }}>
                        {key === "name" ? (
                          <textarea
                            ref={el => { inputRefs.current[`${p.id}-${key}`] = el; }}
                            defaultValue={init.name}
                            onChange={e => autoResize(e.target)}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handleKeyDown(e, rowIdx, key)}
                            rows={1}
                            style={{
                              width: "100%", fontSize: 13, resize: "none", overflow: "hidden",
                              border: errs[key] ? "1.5px solid #e74c3c" : "1.5px solid #e2e8f0",
                              borderRadius: 6, padding: "5px 8px", boxSizing: "border-box",
                              minWidth: 160, fontFamily: "inherit", display: "block", lineHeight: 1.4,
                            }}
                          />
                        ) : type === "select" && key === "category" ? (
                          <select
                            ref={el => { inputRefs.current[`${p.id}-${key}`] = el; }}
                            defaultValue={init.category}
                            style={{
                              width: "100%", fontSize: 13,
                              border: "1.5px solid #e2e8f0",
                              borderRadius: 6, padding: "5px 8px", boxSizing: "border-box",
                              minWidth: 120, background: "#fff",
                            }}
                          >
                            <option value="">— Category —</option>
                            {(existingCategories || []).map(c => (
                              <option key={c} value={c}>{c}</option>
                            ))}
                          </select>
                        ) : (
                          <input
                            ref={el => { inputRefs.current[`${p.id}-${key}`] = el; }}
                            type={type}
                            defaultValue={init[key]}
                            onFocus={e => e.target.select()}
                            onKeyDown={e => handleKeyDown(e, rowIdx, key)}
                            style={{
                              width: "100%", marginBottom: 0, fontSize: 13,
                              border: errs[key] ? "1.5px solid #e74c3c" : "1.5px solid #e2e8f0",
                              borderRadius: 6, padding: "5px 8px", boxSizing: "border-box",
                              minWidth: 80,
                            }}
                          />
                        )}
                        {errs[key] && (
                          <div style={{ fontSize: 10, color: "#e74c3c", marginTop: 2, paddingLeft: 2 }}>{errs[key]}</div>
                        )}
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </ScrollFade>

        {/* Enlarged image lightbox */}
        {bigImg && <ImageLightbox images={bigImg.images} startIndex={bigImg.index} onClose={() => setBigImg(null)} />}

        {/* Footer */}
        <div style={{ padding: "14px 24px 18px", borderTop: "1px solid #e2e8f0", flexShrink: 0 }}>
          {saveError && (
            <div style={{ marginBottom: 10, fontSize: 13, color: "#c0392b", background: "#fdecea", padding: "8px 12px", borderRadius: 8 }}>
              {saveError}
            </div>
          )}
          <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
            <button className="btn small outline" type="button" onClick={onClose}>Cancel</button>
            <button
              ref={saveButtonRef}
              className="btn small"
              type="button"
              disabled={saving}
              onClick={handleSave}
              style={{ minWidth: 100, background: "#7B2D8B", color: "#fff", border: "none" }}
            >
              {saving ? "Saving…" : "Save All"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function AdminProducts() {
  const location = useLocation();
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [editingCategory, setEditingCategory] = useState(null);
  const [categoryNewName, setCategoryNewName] = useState("");
  const [showNewCategory, setShowNewCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [itemDetailsVisibility, setItemDetailsVisibility] = useState({
    brand: true, colour: true, style: true, warranty: true,
    weight: true, dimensions: true, material: true, wattage: true,
    voltage: true, power_source: true, mounting_type: true,
    room_type: true, special_features: true, recommended_use: true,
  });
  const fileInputRef = useRef(null);

  // ── Bulk-edit state ───────────────────────────────────────────────────────
  const [selected, setSelected] = useState(new Set());
  const [bulkOpen, setBulkOpen] = useState(false);

  // ── Thumbnail lightboxes ─────────────────────────────────────────────────
  const [formBigImg,  setFormBigImg]  = useState(null);
  const [tableBigImg, setTableBigImg] = useState(null);

  // ── Discount columns (local-only calculation tool, never persisted) ──────
  const [discountCols, setDiscountCols] = useState([]);
  const [addColOpen,   setAddColOpen]   = useState(false);
  const [pendingPct,   setPendingPct]   = useState("");
  const discountColCounter = useRef(0);

  // ── Price List PDF ────────────────────────────────────────────────────────
  const [pdfBusy,               setPdfBusy]               = useState(false);
  const [includePdfDiscountCols, setIncludePdfDiscountCols] = useState(false);
  const [pdfViewer,              setPdfViewer]              = useState(null); // { blobUrl, filename }

  // ── Regenerate Price Lists (pre-generate for customers + dealers) ─────────
  const [regenBusy,    setRegenBusy]    = useState(false);
  const [regenStatus,  setRegenStatus]  = useState(null); // { ok, message, at }

  async function handleRegenerate() {
    setRegenBusy(true);
    setRegenStatus(null);
    try {
      // Generate customer + dealer PDFs in parallel, upload + upsert cache (waitForUpload=true)
      const [custResult, dealerResult] = await Promise.all([
        generatePriceListPDF({ role: 'customer', returnBlob: true, waitForUpload: true }),
        generatePriceListPDF({ role: 'dealer',   returnBlob: true, waitForUpload: true }),
      ]);
      const ok = !!(custResult.publicUrl && dealerResult.publicUrl);
      setRegenStatus({ ok, at: new Date() });
    } catch (err) {
      setRegenStatus({ ok: false, error: err.message, at: new Date() });
    } finally {
      setRegenBusy(false);
    }
  }

  const addDiscountCol = () => {
    const pct = parseFloat(pendingPct);
    if (isNaN(pct) || pct <= 0 || pct >= 100) return;
    discountColCounter.current += 1;
    setDiscountCols(prev => [...prev, { id: discountColCounter.current, pct }]);
    setPendingPct("");
    setAddColOpen(false);
  };
  const removeDiscountCol = (id) => setDiscountCols(prev => prev.filter(c => c.id !== id));

  // ── Category collapse state ───────────────────────────────────────────────
  const [collapsedCats, setCollapsedCats] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("eltop-collapsed-cats") || "null");
      if (Array.isArray(saved)) return new Set(saved);
    } catch {}
    return new Set();
  });
  const toggleCatCollapse = (cat) => {
    setCollapsedCats(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat); else next.add(cat);
      try { localStorage.setItem("eltop-collapsed-cats", JSON.stringify([...next])); } catch {}
      return next;
    });
  };

  // ── Sticky header measurement ─────────────────────────────────────────────
  const theadRef    = useRef(null);
  const [theadH,    setTheadH]    = useState(0);
  const [tableMaxH, setTableMaxH] = useState(0);
  // Measure after products load (thead isn't in DOM until products array is non-empty)
  const measureTable = useCallback(() => {
    if (!theadRef.current) return;
    setTheadH(theadRef.current.offsetHeight);
    const tableTop = theadRef.current.closest("table").getBoundingClientRect().top;
    setTableMaxH(window.innerHeight - tableTop - 40);
  }, []);
  useEffect(() => { measureTable(); }, [products.length, measureTable]); // eslint-disable-line
  useEffect(() => {
    window.addEventListener("resize", measureTable);
    return () => window.removeEventListener("resize", measureTable);
  }, [measureTable]);

  const toggleItemDetailVisibility = (key) =>
    setItemDetailsVisibility(prev => ({ ...prev, [key]: !prev[key] }));

  const existingCategories = useMemo(
    () => [...new Set(products.map(p => p.category).filter(Boolean))].sort(),
    [products]
  );

  const loadProducts = () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("products")
      .select("id, name, mrp, dlp, price, unit, stock, hsn_code, category, standard_packing, image_urls, image_url, video_url, about_item, brand, colour, style, dimensions, room_type, special_features, recommended_use, mounting_type, power_source, material, wattage, voltage, warranty, weight, features_specs, item_details")
      .order("category", { nullsFirst: true })
      .order("name")
      .then(({ data, error: err }) => {
        if (!err && data) setProducts(data);
        setLoading(false);
      });
  };

  useEffect(() => { loadProducts(); }, []);

  // Sidebar "Products" link sends resetAt in location.state — mirror AdminDealers pattern
  useEffect(() => {
    if (!location.state?.resetAt) return;
    resetForm();
    setBulkOpen(false);
  }, [location.state?.resetAt]); // eslint-disable-line react-hooks/exhaustive-deps

  // Escape dismisses the form thumbnail lightbox
  useEffect(() => {
    const handler = (e) => { if (e.key === "Escape") setFormBigImg(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM); setError(""); setFormOpen(false);
    setShowNewCategory(false); setNewCategoryName("");
  };

  const handleEdit = (p) => {
    setForm({
      id: p.id,
      name: p.name,
      mrp: p.mrp ?? "",
      dlp: p.dlp ?? "",
      price: p.price ?? "",
      unit: p.unit || "pc",
      stock: p.stock,
      hsn_code: p.hsn_code || "",
      category: p.category || "",
      standard_packing: p.standard_packing ?? "",
      video_url: p.video_url || "",
      image_urls: Array.isArray(p.image_urls) ? p.image_urls : [],
      about_item: Array.isArray(p.about_item) ? p.about_item : [],
      brand: p.brand || "", colour: p.colour || "", style: p.style || "",
      dimensions: p.dimensions || "", room_type: p.room_type || "",
      special_features: p.special_features || "", recommended_use: p.recommended_use || "",
      mounting_type: p.mounting_type || "", power_source: p.power_source || "",
      material: p.material || "", wattage: p.wattage || "", voltage: p.voltage || "",
      warranty: p.warranty || "", weight: p.weight || "",
      features_specs: p.features_specs || {},
      item_details: {},
    });
    // Load item_details values (support both old flat and new { values, visibility } structures)
    const idSrc = p.item_details || {};
    const idVals = idSrc.values || idSrc; // if new structure, use .values; else use flat
    const DETAIL_KEYS = ["brand","colour","style","warranty","weight","dimensions","material","wattage","voltage","power_source","mounting_type","room_type","special_features","recommended_use"];
    const loadedVis = idSrc.visibility || {};
    const vis = {};
    DETAIL_KEYS.forEach(k => { vis[k] = loadedVis[k] !== false; });
    setItemDetailsVisibility(vis);
    // Populate form fields from item_details.values (or fall back to top-level columns)
    setForm(prev => ({
      ...prev,
      brand: idVals.brand || p.brand || "",
      colour: idVals.colour || p.colour || "",
      style: idVals.style || p.style || "",
      warranty: idVals.warranty || p.warranty || "",
      weight: idVals.weight || p.weight || "",
      dimensions: idVals.dimensions || p.dimensions || "",
      material: idVals.material || p.material || "",
      wattage: idVals.wattage || p.wattage || "",
      voltage: idVals.voltage || p.voltage || "",
      power_source: idVals.power_source || p.power_source || "",
      mounting_type: idVals.mounting_type || p.mounting_type || "",
      room_type: idVals.room_type || p.room_type || "",
      special_features: idVals.special_features || p.special_features || "",
      recommended_use: idVals.recommended_use || p.recommended_use || "",
    }));
    setError("");
    setShowNewCategory(false); setNewCategoryName("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) { setError("Name and price are required."); return; }
    setSaving(true);
    setError("");
    const payload = {
      name:      form.name,
      mrp:       form.mrp      !== "" ? Number(form.mrp)   : null,
      dlp:       form.dlp      !== "" ? Number(form.dlp)   : null,
      price:     form.price    !== "" ? Number(form.price)  : null,
      unit:      form.unit     || "pc",
      stock:     Number(form.stock) || 0,
      hsn_code:  form.hsn_code || null,
      category:         form.category || null,
      standard_packing: form.standard_packing !== "" ? Number(form.standard_packing) : null,
      video_url:        form.video_url || null,
      image_urls: form.image_urls,
      about_item: form.about_item.filter(Boolean),
      brand: form.brand || null, colour: form.colour || null, style: form.style || null,
      dimensions: form.dimensions || null, room_type: form.room_type || null,
      special_features: form.special_features || null, recommended_use: form.recommended_use || null,
      mounting_type: form.mounting_type || null, power_source: form.power_source || null,
      material: form.material || null, wattage: form.wattage || null, voltage: form.voltage || null,
      warranty: form.warranty || null, weight: form.weight || null,
      features_specs: Object.keys(form.features_specs || {}).length ? form.features_specs : null,
      item_details: (() => {
        const DETAIL_KEYS = ["brand","colour","style","warranty","weight","dimensions","material","wattage","voltage","power_source","mounting_type","room_type","special_features","recommended_use"];
        const values = {};
        DETAIL_KEYS.forEach(k => { if (form[k]) values[k] = form[k]; });
        const visibility = { ...itemDetailsVisibility };
        return Object.keys(values).length ? { values, visibility } : null;
      })(),
    };
    const { data: saved, error: err } = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id).select().maybeSingle()
      : await supabase.from("products").insert(payload).select().single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    if (form.id) {
      // Update succeeded — return to list view
      resetForm();
    } else if (saved) {
      setForm((prev) => ({ ...prev, id: saved.id }));
      setFormOpen(false);
    }
    loadProducts();
  };

  const handleImageUpload = async (e) => {
    const files = Array.from(e.target.files);
    if (!form.id) { setError("Save the product first before uploading images."); return; }
    const remaining = 9 - form.image_urls.length;
    if (remaining <= 0) { setError("Maximum 9 images reached."); return; }
    const toUpload = files.slice(0, remaining);
    setUploading(true);
    setError("");
    const newUrls = [...form.image_urls];
    for (const file of toUpload) {
      const path = `${form.id}/${Date.now()}-${file.name.replace(/\s+/g, "_")}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { upsert: false });
      if (upErr) { setError(upErr.message); break; }
      const { data: { publicUrl } } = supabase.storage
        .from("product-images")
        .getPublicUrl(path);
      newUrls.push(publicUrl);
    }
    await supabase.from("products").update({ image_urls: newUrls }).eq("id", form.id);
    setForm((prev) => ({ ...prev, image_urls: newUrls }));
    setProducts((prev) =>
      prev.map((p) => (p.id === form.id ? { ...p, image_urls: newUrls } : p))
    );
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleImageDelete = async (index) => {
    const url = form.image_urls[index];
    const newUrls = form.image_urls.filter((_, i) => i !== index);
    const pathMatch = url.match(/product-images\/(.+)$/);
    if (pathMatch) {
      await supabase.storage.from("product-images").remove([pathMatch[1]]);
    }
    await supabase.from("products").update({ image_urls: newUrls }).eq("id", form.id);
    setForm((prev) => ({ ...prev, image_urls: newUrls }));
    setProducts((prev) =>
      prev.map((p) => (p.id === form.id ? { ...p, image_urls: newUrls } : p))
    );
  };

  const moveImage = async (index, dir) => {
    const newUrls = [...form.image_urls];
    const swap = index + dir;
    if (swap < 0 || swap >= newUrls.length) return;
    [newUrls[index], newUrls[swap]] = [newUrls[swap], newUrls[index]];
    await supabase.from("products").update({ image_urls: newUrls }).eq("id", form.id);
    setForm((prev) => ({ ...prev, image_urls: newUrls }));
  };

  const handleCategoryRename = async (oldName, newName) => {
    if (!newName.trim() || newName === oldName) { setEditingCategory(null); return; }
    const { error: err } = await supabase
      .from("products")
      .update({ category: newName.trim() })
      .eq("category", oldName);
    if (!err) {
      setProducts(prev => prev.map(p => p.category === oldName ? { ...p, category: newName.trim() } : p));
      setEditingCategory(null);
    }
  };

  const handleDuplicate = async (p) => {
    const payload = {
      name: `${p.name} (Copy)`,
      category: p.category || null,
      mrp: p.mrp ?? null, dlp: p.dlp ?? null, price: p.price ?? null,
      unit: p.unit || "pc",
      stock: 0,
      hsn_code: p.hsn_code || null,
      standard_packing: p.standard_packing ?? null,
      video_url: p.video_url || null,
      image_url:  p.image_url  || null,
      image_urls: p.image_urls ?? [],
      about_item: p.about_item ?? [],
      brand: p.brand || null, colour: p.colour || null, style: p.style || null,
      dimensions: p.dimensions || null, room_type: p.room_type || null,
      special_features: p.special_features || null, recommended_use: p.recommended_use || null,
      mounting_type: p.mounting_type || null, power_source: p.power_source || null,
      material: p.material || null, wattage: p.wattage || null, voltage: p.voltage || null,
      warranty: p.warranty || null, weight: p.weight || null,
      features_specs: p.features_specs || null,
      item_details: p.item_details || null,
    };
    const { data: created, error: err } = await supabase
      .from("products").insert(payload).select().single();
    if (err) { setError(`Duplicate failed: ${err.message}`); return; }
    loadProducts();
    handleEdit(created);
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await supabase.from("products").delete().eq("id", id);
    if (form.id === id) resetForm();
    loadProducts();
  };

  // Group products by category, filtered by search query
  const grouped = useMemo(() => {
    const q = search.trim().toLowerCase();
    const map = new Map();
    products.forEach((p) => {
      if (q && ![p.name, p.category, p.hsn_code].some((f) => f?.toLowerCase().includes(q))) return;
      const cat = p.category?.trim() || "Uncategorised";
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat).push(p);
    });
    return Array.from(map.entries());
  }, [products, search]);

  // ── Selection helpers ─────────────────────────────────────────────────────
  const allVisibleIds = useMemo(() => grouped.flatMap(([, rows]) => rows.map(p => p.id)), [grouped]);
  const allVisibleSelected = allVisibleIds.length > 0 && allVisibleIds.every(id => selected.has(id));
  const someVisibleSelected = allVisibleIds.some(id => selected.has(id));

  const toggleAll = () => {
    setSelected(prev => {
      const s = new Set(prev);
      if (allVisibleSelected) allVisibleIds.forEach(id => s.delete(id));
      else allVisibleIds.forEach(id => s.add(id));
      return s;
    });
  };

  const toggleCat = (catIds) => {
    const allIn = catIds.every(id => selected.has(id));
    setSelected(prev => {
      const s = new Set(prev);
      if (allIn) catIds.forEach(id => s.delete(id));
      else catIds.forEach(id => s.add(id));
      return s;
    });
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  };

  // ── Table column count: [checkbox, Img, Name, MRP, DLP, Unit, Packing, Stock, ...discountCols, Edit]
  const TABLE_COLS = 9 + discountCols.length;

  return (
    <div className="admin-page">
      {pdfViewer && (
        <PdfViewerModal
          blobUrl={pdfViewer.blobUrl}
          filename={pdfViewer.filename}
          onClose={() => { URL.revokeObjectURL(pdfViewer.blobUrl); setPdfViewer(null); }}
        />
      )}
      {/* ── Page header: search | Products | + Add Product ── */}
      <div className="products-page-header">
        {/* LEFT — search bar */}
        <div className="ph-search" style={{ justifySelf: "start" }}>
          {!form.id && !formOpen && products.length > 0 && (
            <div style={{ position: "relative", width: 180 }}>
              <input
                type="text"
                placeholder="Search…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{ width: "100%", paddingRight: search ? 28 : undefined, boxSizing: "border-box" }}
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  style={{
                    position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
                    background: "none", border: "none", cursor: "pointer",
                    color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: 0,
                  }}
                  title="Clear"
                >✕</button>
              )}
            </div>
          )}
        </div>

        {/* CENTER — heading always centered */}
        <h1 className="ph-title admin-title" style={{ textAlign: "center" }}>Products</h1>

        {/* RIGHT — Add Product + Price List buttons */}
        <div className="ph-btn" style={{ justifySelf: "end", display: "flex", alignItems: "center", gap: 8 }}>
          {!form.id && !formOpen && (
            <>
              <button
                onClick={async () => {
                  setPdfBusy(true);
                  try {
                    const result = await generatePriceListPDF({
                      role: 'admin',
                      discountCols,
                      includeDiscountCols: includePdfDiscountCols,
                      returnBlob: true,
                    });
                    const blobUrl = URL.createObjectURL(result.blob);
                    setPdfViewer({ blobUrl, filename: result.filename });
                  } catch (err) {
                    alert('Could not generate PDF: ' + err.message);
                  } finally {
                    setPdfBusy(false);
                  }
                }}
                disabled={pdfBusy}
                style={{
                  background: 'none',
                  border: '1.5px solid var(--red-dark)',
                  color: 'var(--red-dark)',
                  borderRadius: 8,
                  padding: '7px 12px',
                  cursor: pdfBusy ? 'wait' : 'pointer',
                  fontWeight: 700,
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  opacity: pdfBusy ? 0.6 : 1,
                }}
              >
                {pdfBusy ? '...' : '⬇ Price List'}
              </button>
              <button
                onClick={handleRegenerate}
                disabled={regenBusy}
                title="Pre-generate customer + dealer PDFs so customers get instant access"
                style={{
                  background: regenBusy ? '#f3e8ff' : '#7B2D8B',
                  border: 'none',
                  color: regenBusy ? '#7B2D8B' : '#fff',
                  borderRadius: 8,
                  padding: '7px 12px',
                  cursor: regenBusy ? 'wait' : 'pointer',
                  fontWeight: 700,
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                }}
              >
                {regenBusy ? '⏳ Generating…' : '🔄 Regenerate PDFs'}
              </button>
              <button className="btn" onClick={() => setFormOpen(true)}>
                + Add Product
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── Regenerate status banner ── */}
      {regenStatus && (
        <div style={{
          margin: '0 0 12px',
          padding: '10px 16px',
          borderRadius: 8,
          background: regenStatus.ok ? '#f0fdf4' : '#fef2f2',
          border: `1px solid ${regenStatus.ok ? '#86efac' : '#fca5a5'}`,
          color: regenStatus.ok ? '#166534' : '#991b1b',
          fontSize: 13, fontWeight: 600,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <span>
            {regenStatus.ok
              ? `✅ Price lists updated — ${Math.round((Date.now() - regenStatus.at) / 1000)}s ago. Customers will now get instant PDF access.`
              : `❌ Regeneration failed: ${regenStatus.error}`}
          </span>
          <button onClick={() => setRegenStatus(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 16, color: 'inherit', padding: '0 4px' }}>×</button>
        </div>
      )}

      {/* ── PDF discount-col toggle (only when discount cols are active and form is closed) ── */}
      {!form.id && !formOpen && discountCols.length > 0 && (
        <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0 2px", fontSize: 12, color: "var(--muted)" }}>
          <input
            id="pdf-disc-toggle"
            type="checkbox"
            checked={includePdfDiscountCols}
            onChange={e => setIncludePdfDiscountCols(e.target.checked)}
            style={{ cursor: "pointer", accentColor: "var(--red-dark)" }}
          />
          <label htmlFor="pdf-disc-toggle" style={{ cursor: "pointer", userSelect: "none" }}>
            Include custom discount columns in Price List PDF
          </label>
        </div>
      )}

      {/* ── Basic info form (new product or editing existing) ── */}
      {(formOpen || form.id) && (
        <form className="admin-form" onSubmit={handleSubmit}>
          {form.id && (() => {
            const p = products.find(x => x.id === form.id);
            const img = p ? getFirstImage(p) : null;
            return img ? (
              <div style={{ display: "flex", alignItems: "flex-start", paddingTop: 2 }}>
                <span className="admin-img-hover-wrap" onClick={() => setFormBigImg({ images: getImages(p), index: 0 })} style={{ cursor: "zoom-in" }}>
                  <img src={img} alt="" style={{ width: 48, height: 48, objectFit: "cover", borderRadius: 8, display: "block" }} />
                  <span className="admin-img-hover-preview"><img src={img} alt="" /></span>
                </span>
              </div>
            ) : null;
          })()}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 3 }}>Product Name</label>
            <input
              type="text" placeholder="e.g. LED Ceiling Fan 48″" value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 3 }}>Category</label>
            <select
              value={showNewCategory ? "__new__" : (form.category || "")}
              onChange={e => {
                if (e.target.value === "__new__") {
                  setShowNewCategory(true);
                  setNewCategoryName("");
                  setForm({ ...form, category: "" });
                } else {
                  setShowNewCategory(false);
                  setNewCategoryName("");
                  setForm({ ...form, category: e.target.value });
                }
              }}
              style={{ marginBottom: showNewCategory ? 6 : undefined, textTransform: "uppercase" }}
            >
              <option value="">— Select category —</option>
              {existingCategories.map(c => <option key={c} value={c}>{c}</option>)}
              <option value="__new__">+ Create New Category</option>
            </select>
          </div>
          {showNewCategory && (
            <div>
              <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 3 }}>New Category Name</label>
              <input
                type="text"
                placeholder="Enter new category name"
                value={newCategoryName}
                autoFocus
                onChange={e => {
                  setNewCategoryName(e.target.value);
                  setForm({ ...form, category: e.target.value });
                }}
              />
            </div>
          )}
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 3 }}>MRP (₹)</label>
            <input
              type="number" placeholder="e.g. 1799" value={form.mrp}
              onChange={(e) => setForm({ ...form, mrp: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 3 }}>DLP — Dealer List Price (₹)</label>
            <input
              type="number" placeholder="e.g. 1450" value={form.dlp}
              onChange={(e) => setForm({ ...form, dlp: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 3 }}>HSN Code</label>
            <input
              type="text" placeholder="e.g. 94054090" value={form.hsn_code}
              onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 3 }}>Unit</label>
            <input
              type="text" placeholder="e.g. pc, box, set" value={form.unit}
              onChange={(e) => setForm({ ...form, unit: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 3 }}>Standard Packing (pcs/box)</label>
            <input
              type="number" placeholder="e.g. 12" value={form.standard_packing}
              onChange={(e) => setForm({ ...form, standard_packing: e.target.value })}
            />
          </div>
          <div>
            <label style={{ display: "block", fontSize: 11, fontWeight: 600, color: "#64748b", marginBottom: 3 }}>Stock</label>
            <input
              type="number" placeholder="0" value={form.stock}
              onChange={(e) => setForm({ ...form, stock: e.target.value })}
            />
          </div>
          {/* ── Rich detail sections (shown when editing existing product) ── */}
          {form.id && (<>
            <Section title="📝 About This Item">
              <BulletEditor
                items={form.about_item}
                onChange={v => setForm({ ...form, about_item: v })}
              />
            </Section>

            <Section title="⚡ Features & Specs">
              <SpecsEditor
                data={form.features_specs}
                onChange={v => setForm({ ...form, features_specs: v })}
              />
            </Section>

            <Section title="📦 Item Details">
              {[
                ["Brand", "brand", "Eltop by Embassy", ["Eltop", "Eltop by Embassy", "Embassy Electricals"]],
                ["Colour", "colour", "e.g. White, Black", ["White","Black","Silver","Gold","Chrome","Bronze","Beige","Grey","Brown","Copper","Ivory","Off White","Matte Black","Matte White"]],
                ["Style", "style", "e.g. Modern, Traditional", ["Modern","Contemporary","Traditional","Minimalist","Industrial","Rustic","Classic","Vintage","Scandinavian","Art Deco"]],
                ["Warranty", "warranty", "e.g. 1 Year", ["6 Months","1 Year","2 Years","3 Years","5 Years","Lifetime","No Warranty"]],
                ["Weight", "weight", "e.g. 2.5 kg", []],
                ["Dimensions", "dimensions", "L x W x H cm", []],
                ["Material", "material", "e.g. Aluminium, ABS", ["Aluminium","Stainless Steel","ABS Plastic","Polycarbonate","Glass","Brass","Iron","Copper","Wood","Ceramic","Acrylic","PVC"]],
                ["Wattage", "wattage", "e.g. 60W", ["5W","7W","9W","12W","15W","18W","24W","36W","40W","60W","100W","150W","200W"]],
                ["Voltage", "voltage", "e.g. 220V", ["12V","24V","110V","220V","230V","240V","110-240V"]],
                ["Power Source", "power_source", "", ["AC Power","DC Power","Battery","Solar","USB","Hardwired","Corded Electric","Cordless"]],
                ["Mounting Type", "mounting_type", "", ["Ceiling","Wall","Floor","Surface","Recessed","Track","Pendant","Flush Mount","Semi-Flush","Chandelier","Sconce","Under Cabinet","Portable","Stem"]],
                ["Room Type", "room_type", "", ["Living Room","Bedroom","Kitchen","Bathroom","Office","Dining Room","Hallway","Outdoor","Garage","Basement","Study","Children Room","Commercial"]],
                ["Special Features", "special_features", "", ["Dimmable","Smart Compatible","Energy Saving","Waterproof","Heat Resistant","Anti-Glare","Remote Control","Touch Control","Timer","Motion Sensor","Color Changing","Night Light"]],
                ["Recommended Use", "recommended_use", "", ["Indoor","Outdoor","Indoor & Outdoor","Residential","Commercial","Industrial"]],
              ].map(([label, key, ph, suggestions]) => (
                <div key={key} style={{ display: "grid", gridTemplateColumns: "160px 1fr auto", gap: 8, marginBottom: 8, alignItems: "center" }}>
                  <label style={{ fontSize: 12, fontWeight: 600, color: "#64748b" }}>{label}</label>
                  <div style={{ position: "relative" }}>
                    <input
                      list={`idl-${key}`}
                      value={form[key]}
                      onChange={e => setForm({ ...form, [key]: e.target.value })}
                      placeholder={ph}
                      style={{ marginBottom: 0, fontSize: 13, width: "100%" }}
                    />
                    {suggestions.length > 0 && (
                      <datalist id={`idl-${key}`}>
                        {suggestions.map(s => <option key={s} value={s} />)}
                      </datalist>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleItemDetailVisibility(key)}
                    title={itemDetailsVisibility[key] ? "Hide on store" : "Show on store"}
                    style={{ background: "none", border: "1px solid #e2e8f0", borderRadius: 6, cursor: "pointer", fontSize: 16, padding: "2px 8px", color: itemDetailsVisibility[key] ? "#7B2D8B" : "#94a3b8" }}
                  >
                    {itemDetailsVisibility[key] ? "👁" : "🙈"}
                  </button>
                </div>
              ))}
            </Section>
          </>)}

          <div className="admin-form-actions">
            <button className="btn small" type="submit" disabled={saving}>
              {saving ? "Saving…" : form.id ? "Update Product" : "Add Product"}
            </button>
            {form.id && (
              <button
                className="btn small outline danger"
                type="button"
                onClick={() => handleDelete(form.id)}
                style={{ color: "#c0392b", borderColor: "#c0392b" }}
              >
                Delete Product
              </button>
            )}
            <button className="btn small outline" type="button" onClick={resetForm}>✕ Cancel</button>
          </div>
          {error && <div className="admin-error">{error}</div>}
        </form>
      )}

      {/* ── Media section (only visible when editing) ── */}
      {form.id && (
        <div className="admin-media-section">
          <div className="admin-media-title">Media — {form.name}</div>

          <div className="admin-media-row">
            <label className="admin-media-label">&#127910; YouTube / Vimeo URL</label>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={form.video_url}
                onChange={(e) => setForm({ ...form, video_url: e.target.value })}
                style={{ flex: 1, marginBottom: 0 }}
              />
              <button
                className="btn small"
                type="button"
                onClick={async () => {
                  await supabase.from("products")
                    .update({ video_url: form.video_url || null })
                    .eq("id", form.id);
                }}
              >Save</button>
            </div>
          </div>

          <div className="admin-media-label" style={{ marginTop: 16 }}>
            &#128247; Images ({form.image_urls.length}/9)
          </div>
          {form.image_urls.length === 0 && (() => {
            const p = products.find(x => x.id === form.id);
            const legacy = p?.image_url || null;
            return legacy ? (
              <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 10, padding: "10px 12px", background: "#f8f9fc", borderRadius: 8, border: "1px solid #e2e8f0" }}>
                <img src={legacy} alt="current" onClick={() => setFormBigImg({ images: getImages(p), index: 0 })} style={{ width: 60, height: 60, objectFit: "contain", borderRadius: 6, background: "#fff", border: "1px solid #e2e8f0", cursor: "zoom-in" }} />
                <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.5 }}>
                  <strong style={{ color: "#334155" }}>Current image (legacy)</strong><br />
                  This image is stored in the legacy field and shown as the product thumbnail everywhere.<br />
                  Upload via "Add image" below to manage it in the gallery.
                </div>
              </div>
            ) : null;
          })()}
          <div className="admin-img-grid">
            {form.image_urls.map((url, i) => (
              <div key={url} className="admin-img-thumb">
                {i === 0 && <span className="admin-img-badge">Main</span>}
                <img src={url} alt={`img-${i}`} />
                <div className="admin-img-controls">
                  <button className="admin-img-btn" title="Move left" disabled={i === 0} onClick={() => moveImage(i, -1)}>&#8592;</button>
                  <button className="admin-img-btn danger" title="Delete" onClick={() => handleImageDelete(i)}>&#10005;</button>
                  <button className="admin-img-btn" title="Move right" disabled={i === form.image_urls.length - 1} onClick={() => moveImage(i, 1)}>&#8594;</button>
                </div>
              </div>
            ))}
            {form.image_urls.length < 9 && (
              <div className="admin-img-add" onClick={() => fileInputRef.current?.click()}>
                {uploading ? "Uploading…" : <><span style={{ fontSize: 28 }}>+</span><br />Add image</>}
              </div>
            )}
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={handleImageUpload} />
        </div>
      )}

      {/* ── Table — hidden while editing a product ── */}

      {/* ── Product table grouped by category — hidden while editing ── */}
      {!form.id && (loading ? (
        <div className="admin-loading">Loading…</div>
      ) : products.length === 0 ? (
        <div className="admin-empty">No products yet.</div>
      ) : grouped.length === 0 ? (
        <div className="admin-empty">No products match "{search}".</div>
      ) : (
        <>
        {/* ── Discount-column toolbar ── */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
          {addColOpen ? (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
              <input
                type="number"
                min="1" max="99" step="0.5"
                placeholder="e.g. 36"
                value={pendingPct}
                autoFocus
                onChange={e => setPendingPct(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") addDiscountCol(); if (e.key === "Escape") { setAddColOpen(false); setPendingPct(""); } }}
                style={{ width: 80, padding: "4px 8px", fontSize: 13, borderRadius: 6, border: "1px solid #c4b5d0" }}
              />
              <span style={{ fontSize: 13, color: "#64748b" }}>%</span>
              <button
                onClick={addDiscountCol}
                style={{ background: "var(--red-dark)", color: "#fff", border: "none", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
              >Add</button>
              <button
                onClick={() => { setAddColOpen(false); setPendingPct(""); }}
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 16, lineHeight: 1, padding: "0 4px" }}
                title="Cancel"
              >✕</button>
            </span>
          ) : (
            <button
              onClick={() => { setAddColOpen(true); setPendingPct(""); }}
              style={{ background: "none", border: "1px dashed #c4b5d0", borderRadius: 6, padding: "4px 12px", cursor: "pointer", fontSize: 13, color: "var(--red-dark)", fontWeight: 600 }}
            >+ Add column</button>
          )}
        </div>

        <ScrollFade className="admin-table-wrap" bg="#fff" style={tableMaxH ? { maxHeight: tableMaxH } : undefined}>
          <table className="admin-table">
            <thead ref={theadRef}>
              <tr style={{ position: "sticky", top: 0, zIndex: 4, boxShadow: "0 2px 4px rgba(0,0,0,0.08)" }}>
                <th style={{ width: 36, textAlign: "center" }}>
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    ref={el => { if (el) el.indeterminate = someVisibleSelected && !allVisibleSelected; }}
                    onChange={toggleAll}
                    title="Select all visible products"
                    style={{ cursor: "pointer", width: 15, height: 15 }}
                  />
                </th>
                <th>Img</th>
                <th>Name</th>
                <th>MRP</th>
                <th>DLP</th>
                <th>Unit</th>
                <th>Packing</th>
                <th>Stock</th>
                {discountCols.map(col => (
                  <th key={col.id} style={{ minWidth: 70, textAlign: "right", whiteSpace: "nowrap", paddingRight: 10 }}>
                    <div style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: 0, position: "relative", paddingRight: 16 }}>
                      <span style={{ fontSize: 12, fontWeight: 700, lineHeight: 1.2 }}>{col.pct}%</span>
                      <span style={{ fontSize: 10, color: "var(--muted)", lineHeight: 1.2 }}>Disc.</span>
                      <button
                        onClick={() => removeDiscountCol(col.id)}
                        title={`Remove ${col.pct}% column`}
                        style={{ position: "absolute", top: -4, right: -2, background: "none", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 11, lineHeight: 1, padding: 0 }}
                      >✕</button>
                    </div>
                  </th>
                ))}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([cat, rows]) => {
                const catIds = rows.map(p => p.id);
                const catAllSelected = catIds.every(id => selected.has(id));
                const catSomeSelected = catIds.some(id => selected.has(id));
                return [
                  <tr key={`cat-${cat}`}
                    style={{ position: "sticky", top: theadH, zIndex: 3, cursor: "pointer" }}
                    onClick={() => { if (editingCategory !== cat) toggleCatCollapse(cat); }}
                  >
                    {/* Per-category select-all checkbox in the checkbox column */}
                    <td style={{ background: "var(--red-dark)", textAlign: "center", padding: "5px 8px" }}
                        onClick={e => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={catAllSelected}
                        ref={el => { if (el) el.indeterminate = catSomeSelected && !catAllSelected; }}
                        onChange={() => toggleCat(catIds)}
                        title={`Select all in ${cat}`}
                        style={{ cursor: "pointer", width: 15, height: 15 }}
                      />
                    </td>
                    <td colSpan={TABLE_COLS - 1} style={{
                      background: "var(--red-dark)", color: "#fff",
                      fontWeight: 700, fontSize: 12, padding: "5px 10px",
                      letterSpacing: "0.5px", textTransform: "uppercase",
                    }}>
                      {editingCategory === cat ? (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <input
                            value={categoryNewName}
                            onChange={e => setCategoryNewName(e.target.value)}
                            onKeyDown={e => { if (e.key === "Enter") handleCategoryRename(cat, categoryNewName); if (e.key === "Escape") setEditingCategory(null); }}
                            autoFocus
                            style={{ fontWeight: 700, fontSize: 12, background: "transparent", border: "1px solid rgba(255,255,255,.7)", color: "#fff", padding: "2px 6px", borderRadius: 4, outline: "none", letterSpacing: "0.5px", textTransform: "uppercase", width: 180 }}
                          />
                          <button onClick={e => { e.stopPropagation(); handleCategoryRename(cat, categoryNewName); }} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>✓</button>
                          <button onClick={e => { e.stopPropagation(); setEditingCategory(null); }} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 13 }}>✗</button>
                        </span>
                      ) : (
                        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                          <span style={{ fontSize: 10, opacity: 0.8, userSelect: "none", minWidth: 10 }}>
                            {collapsedCats.has(cat) ? "▶" : "▼"}
                          </span>
                          {cat}
                          <span
                            onClick={e => { e.stopPropagation(); setEditingCategory(cat); setCategoryNewName(cat); }}
                            title="Rename category"
                            style={{ marginLeft: 4, cursor: "pointer", fontSize: 12, opacity: 0.7, textTransform: "none", letterSpacing: 0 }}
                          >✏️</span>
                        </span>
                      )}
                    </td>
                  </tr>,
                  ...(collapsedCats.has(cat) ? [] : rows.map((p) => (
                    <tr key={p.id} style={form.id === p.id ? { background: "#f8f4f8" } : selected.has(p.id) ? { background: "#faf7ff" } : {}}>
                      <td style={{ textAlign: "center" }}>
                        <input
                          type="checkbox"
                          checked={selected.has(p.id)}
                          onChange={() => toggleOne(p.id)}
                          style={{ cursor: "pointer", width: 15, height: 15 }}
                        />
                      </td>
                      <td>
                        {(() => { const img = getFirstImage(p); return img ? (
                          <span className="admin-img-hover-wrap" onClick={() => setTableBigImg({ images: getImages(p), index: 0 })} style={{ cursor: "zoom-in" }}>
                            <img src={img} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, display: "block" }} />
                            <span className="admin-img-hover-preview"><img src={img} alt="" /></span>
                          </span>
                        ) : (
                          <span style={{ color: "#ccc", fontSize: 22 }}>&#128247;</span>
                        ); })()}
                      </td>
                      <td>{p.name}</td>
                      <td>{p.mrp != null ? `₹${Number(p.mrp).toLocaleString()}` : "—"}</td>
                      <td>{p.dlp != null ? `₹${Number(p.dlp).toLocaleString()}` : "—"}</td>
                      <td>{p.unit || "pc"}</td>
                      <td>{p.standard_packing ? `${p.standard_packing} pcs` : "—"}</td>
                      <td>{p.stock}</td>
                      {discountCols.map(col => {
                        const dlp = Number(p.dlp ?? p.price ?? 0);
                        const val = Math.round(dlp * (1 - col.pct / 100));
                        return (
                          <td key={col.id} style={{ textAlign: "right", paddingRight: 10, fontVariantNumeric: "tabular-nums" }}>
                            {dlp > 0 ? `₹${val.toLocaleString()}` : "—"}
                          </td>
                        );
                      })}
                      <td className="admin-row-actions">
                        <button className="admin-link" onClick={() => handleEdit(p)}>Edit</button>
                        <button className="admin-link" onClick={() => handleDuplicate(p)}>Duplicate</button>
                      </td>
                    </tr>
                  ))),
                ];
              })}
            </tbody>
          </table>
        </ScrollFade>
        </>
      ))}

      {/* ── Floating bulk-edit button (shown when products are selected, not in single-edit mode) ── */}
      {!form.id && selected.size > 0 && (
        <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 100, display: "flex", gap: 8, alignItems: "center" }}>
          <button
            onClick={() => setBulkOpen(true)}
            style={{
              background: "#7B2D8B", color: "#fff", border: "none",
              borderRadius: 10, padding: "12px 20px", cursor: "pointer",
              fontWeight: 700, fontSize: 14,
              boxShadow: "0 4px 20px rgba(123,45,139,.4)",
            }}
          >
            ✏️ Edit Selected ({selected.size})
          </button>
          <button
            onClick={() => setSelected(new Set())}
            title="Clear selection"
            style={{
              background: "#fff", border: "1px solid #e2e8f0",
              borderRadius: 10, padding: "12px 14px", cursor: "pointer",
              color: "#64748b", fontSize: 16, lineHeight: 1,
              boxShadow: "0 2px 8px rgba(0,0,0,.08)",
            }}
          >✕</button>
        </div>
      )}

      {/* ── Bulk edit modal ── */}
      {bulkOpen && (
        <BulkEditModal
          rows={products.filter(p => selected.has(p.id))}
          onClose={() => setBulkOpen(false)}
          onSaved={() => { setBulkOpen(false); setSelected(new Set()); loadProducts(); }}
          existingCategories={existingCategories}
        />
      )}

      {/* Form thumbnail lightbox — tap-to-enlarge for mobile */}
      {formBigImg && <ImageLightbox images={formBigImg.images} startIndex={formBigImg.index} onClose={() => setFormBigImg(null)} />}

      {/* Table thumbnail lightbox */}
      {tableBigImg && <ImageLightbox images={tableBigImg.images} startIndex={tableBigImg.index} onClose={() => setTableBigImg(null)} />}
    </div>
  );
}
