import { useEffect, useMemo, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const EMPTY_FORM = {
  id: null, name: "", mrp: "", dlp: "", price: "", unit: "pc", stock: "",
  hsn_code: "", category: "", standard_packing: "", video_url: "", image_urls: [],
};

export default function AdminProducts() {
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
  const fileInputRef = useRef(null);

  const loadProducts = () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("products")
      .select("id, name, mrp, dlp, price, unit, stock, hsn_code, category, standard_packing, image_urls, video_url")
      .order("category", { nullsFirst: true })
      .order("name")
      .then(({ data, error: err }) => {
        if (!err && data) setProducts(data);
        setLoading(false);
      });
  };

  useEffect(() => { loadProducts(); }, []);

  const resetForm = () => { setForm(EMPTY_FORM); setError(""); setFormOpen(false); };

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
    });
    setError("");
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
    };
    const { data: saved, error: err } = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id).select().single()
      : await supabase.from("products").insert(payload).select().single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    if (!form.id && saved) {
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

  return (
    <div className="admin-page">
      <h1 className="admin-title">Products</h1>

      {/* ── Add Product toggle ── */}
      {!form.id && !formOpen && (
        <button className="btn" style={{ marginBottom: 20, width: "fit-content" }} onClick={() => setFormOpen(true)}>
          + Add Product
        </button>
      )}

      {/* ── Basic info form (new product or editing existing) ── */}
      {(formOpen || form.id) && (
        <form className="admin-form" onSubmit={handleSubmit}>
          <input
            type="text" placeholder="Product name" value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            type="text" placeholder="Category (e.g. Geysers, Fans)" value={form.category}
            onChange={(e) => setForm({ ...form, category: e.target.value })}
          />
          <input
            type="number" placeholder="MRP (₹)" value={form.mrp}
            onChange={(e) => setForm({ ...form, mrp: e.target.value })}
          />
          <input
            type="number" placeholder="DLP — Dealer List Price (₹)" value={form.dlp}
            onChange={(e) => setForm({ ...form, dlp: e.target.value })}
          />
          <input
            type="text" placeholder="HSN Code" value={form.hsn_code}
            onChange={(e) => setForm({ ...form, hsn_code: e.target.value })}
          />
          <input
            type="text" placeholder="Unit (e.g. pc, box)" value={form.unit}
            onChange={(e) => setForm({ ...form, unit: e.target.value })}
          />
          <input
            type="number" placeholder="Standard Packing (pcs/box, e.g. 12)" value={form.standard_packing}
            onChange={(e) => setForm({ ...form, standard_packing: e.target.value })}
          />
          <input
            type="number" placeholder="Stock" value={form.stock}
            onChange={(e) => setForm({ ...form, stock: e.target.value })}
          />
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

      {/* ── Search bar ── */}
      {!form.id && products.length > 0 && (
        <div style={{ position: "relative", maxWidth: 400, marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Search products by name, category, HSN…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ width: "100%", paddingRight: 32, boxSizing: "border-box" }}
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

      {/* ── Product table grouped by category ── */}
      {loading ? (
        <div className="admin-loading">Loading…</div>
      ) : products.length === 0 ? (
        <div className="admin-empty">No products yet.</div>
      ) : grouped.length === 0 ? (
        <div className="admin-empty">No products match "{search}".</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Img</th>
                <th>Name</th>
                <th>MRP</th>
                <th>DLP</th>
                <th>Unit</th>
                <th>Packing</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {grouped.map(([cat, rows]) => [
                <tr key={`cat-${cat}`}>
                  <td colSpan={7} style={{
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
                        <button onClick={() => handleCategoryRename(cat, categoryNewName)} style={{ background: "rgba(255,255,255,.2)", border: "none", color: "#fff", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontWeight: 700, fontSize: 13 }}>✓</button>
                        <button onClick={() => setEditingCategory(null)} style={{ background: "rgba(255,255,255,.15)", border: "none", color: "#fff", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 13 }}>✗</button>
                      </span>
                    ) : (
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        {cat}
                        <span
                          onClick={() => { setEditingCategory(cat); setCategoryNewName(cat); }}
                          title="Rename category"
                          style={{ marginLeft: 4, cursor: "pointer", fontSize: 12, opacity: 0.7, textTransform: "none", letterSpacing: 0 }}
                        >✏️</span>
                      </span>
                    )}
                  </td>
                </tr>,
                ...rows.map((p) => (
                  <tr key={p.id} style={form.id === p.id ? { background: "#f8f4f8" } : {}}>
                    <td>
                      {p.image_urls?.[0] ? (
                        <span className="admin-img-hover-wrap">
                          <img src={p.image_urls[0]} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6, display: "block" }} />
                          <span className="admin-img-hover-preview">
                            <img src={p.image_urls[0]} alt="" />
                          </span>
                        </span>
                      ) : (
                        <span style={{ color: "#ccc", fontSize: 22 }}>&#128247;</span>
                      )}
                    </td>
                    <td>{p.name}</td>
                    <td>{p.mrp != null ? `₹${Number(p.mrp).toLocaleString()}` : "—"}</td>
                    <td>{p.dlp != null ? `₹${Number(p.dlp).toLocaleString()}` : "—"}</td>
                    <td>{p.unit || "pc"}</td>
                    <td>{p.standard_packing ? `${p.standard_packing} pcs` : "—"}</td>
                    <td>{p.stock}</td>
                    <td className="admin-row-actions">
                      <button className="admin-link" onClick={() => handleEdit(p)}>Edit</button>
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
