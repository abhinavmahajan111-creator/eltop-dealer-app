import { useEffect, useRef, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const EMPTY_FORM = {
  id: null, name: "", price: "", unit: "", stock: "", video_url: "", image_urls: [],
};

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  const loadProducts = () => {
    if (!isSupabaseConfigured) { setLoading(false); return; }
    setLoading(true);
    supabase
      .from("products")
      .select("id, name, price, unit, stock, image_urls, video_url")
      .order("id")
      .then(({ data, error: err }) => {
        if (!err && data) setProducts(data);
        setLoading(false);
      });
  };

  useEffect(() => { loadProducts(); }, []);

  const resetForm = () => { setForm(EMPTY_FORM); setError(""); };

  const handleEdit = (p) => {
    setForm({
      id: p.id,
      name: p.name,
      price: p.price,
      unit: p.unit || "",
      stock: p.stock,
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
      name: form.name,
      price: Number(form.price),
      unit: form.unit,
      stock: Number(form.stock) || 0,
      video_url: form.video_url || null,
      image_urls: form.image_urls,
    };
    const { data: saved, error: err } = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id).select().single()
      : await supabase.from("products").insert(payload).select().single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    // If new product, switch to edit mode so images can be uploaded
    if (!form.id && saved) {
      setForm((prev) => ({ ...prev, id: saved.id }));
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
    // Best-effort remove from storage
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

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await supabase.from("products").delete().eq("id", id);
    if (form.id === id) resetForm();
    loadProducts();
  };

  return (
    <div className="admin-page">
      <h1 className="admin-title">Products</h1>

      {/* ── Basic info form ── */}
      <form className="admin-form" onSubmit={handleSubmit}>
        <input
          type="text" placeholder="Product name" value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="number" placeholder="Price" value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <input
          type="text" placeholder="Unit (e.g. pc, box)" value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
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
            <button className="btn small outline" type="button" onClick={resetForm}>Cancel</button>
          )}
        </div>
        {error && <div className="admin-error">{error}</div>}
      </form>

      {/* ── Media section (only visible when editing) ── */}
      {form.id && (
        <div className="admin-media-section">
          <div className="admin-media-title">Media — {form.name}</div>

          {/* Video URL */}
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

          {/* Image thumbnails */}
          <div className="admin-media-label" style={{ marginTop: 16 }}>
            &#128247; Images ({form.image_urls.length}/9)
          </div>
          <div className="admin-img-grid">
            {form.image_urls.map((url, i) => (
              <div key={url} className="admin-img-thumb">
                {i === 0 && <span className="admin-img-badge">Main</span>}
                <img src={url} alt={`img-${i}`} />
                <div className="admin-img-controls">
                  <button
                    className="admin-img-btn"
                    title="Move left"
                    disabled={i === 0}
                    onClick={() => moveImage(i, -1)}
                  >&#8592;</button>
                  <button
                    className="admin-img-btn danger"
                    title="Delete"
                    onClick={() => handleImageDelete(i)}
                  >&#10005;</button>
                  <button
                    className="admin-img-btn"
                    title="Move right"
                    disabled={i === form.image_urls.length - 1}
                    onClick={() => moveImage(i, 1)}
                  >&#8594;</button>
                </div>
              </div>
            ))}
            {form.image_urls.length < 9 && (
              <div
                className="admin-img-add"
                onClick={() => fileInputRef.current?.click()}
              >
                {uploading ? "Uploading…" : <><span style={{ fontSize: 28 }}>+</span><br />Add image</>}
              </div>
            )}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            style={{ display: "none" }}
            onChange={handleImageUpload}
          />
        </div>
      )}

      {/* ── Product table ── */}
      {loading ? (
        <div className="admin-loading">Loading…</div>
      ) : products.length === 0 ? (
        <div className="admin-empty">No products yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Img</th>
                <th>Name</th>
                <th>Price</th>
                <th>Unit</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id} style={form.id === p.id ? { background: "#f8f4f8" } : {}}>
                  <td>
                    {p.image_urls?.[0]
                      ? <img src={p.image_urls[0]} alt="" style={{ width: 40, height: 40, objectFit: "cover", borderRadius: 6 }} />
                      : <span style={{ color: "#ccc", fontSize: 22 }}>&#128247;</span>}
                  </td>
                  <td>{p.name}</td>
                  <td>Rs. {Number(p.price).toLocaleString()}</td>
                  <td>{p.unit || "—"}</td>
                  <td>{p.stock}</td>
                  <td className="admin-row-actions">
                    <button className="admin-link" onClick={() => handleEdit(p)}>Edit</button>
                    <button className="admin-link danger" onClick={() => handleDelete(p.id)}>Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
