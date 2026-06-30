import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const EMPTY_FORM = { id: null, name: "", price: "", unit: "", stock: "" };

export default function AdminProducts() {
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const loadProducts = () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("products")
      .select("id, name, price, unit, stock")
      .order("id")
      .then(({ data, error: err }) => {
        if (!err && data) setProducts(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadProducts();
  }, []);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setError("");
  };

  const handleEdit = (p) => {
    setForm({ id: p.id, name: p.name, price: p.price, unit: p.unit || "", stock: p.stock });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.price) {
      setError("Name and price are required.");
      return;
    }
    setSaving(true);
    setError("");

    const payload = {
      name: form.name,
      price: Number(form.price),
      unit: form.unit,
      stock: Number(form.stock) || 0,
    };

    const { error: err } = form.id
      ? await supabase.from("products").update(payload).eq("id", form.id)
      : await supabase.from("products").insert(payload);

    setSaving(false);
    if (err) {
      setError(err.message);
      return;
    }
    resetForm();
    loadProducts();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Delete this product?")) return;
    await supabase.from("products").delete().eq("id", id);
    loadProducts();
  };

  return (
    <div className="admin-page">
      <h1 className="admin-title">Products</h1>

      <form className="admin-form" onSubmit={handleSubmit}>
        <input
          type="text"
          placeholder="Product name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="number"
          placeholder="Price"
          value={form.price}
          onChange={(e) => setForm({ ...form, price: e.target.value })}
        />
        <input
          type="text"
          placeholder="Unit (e.g. pc, box)"
          value={form.unit}
          onChange={(e) => setForm({ ...form, unit: e.target.value })}
        />
        <input
          type="number"
          placeholder="Stock"
          value={form.stock}
          onChange={(e) => setForm({ ...form, stock: e.target.value })}
        />
        <div className="admin-form-actions">
          <button className="btn small" type="submit" disabled={saving}>
            {saving ? "Saving…" : form.id ? "Update Product" : "Add Product"}
          </button>
          {form.id && (
            <button className="btn small outline" type="button" onClick={resetForm}>
              Cancel
            </button>
          )}
        </div>
        {error && <div className="admin-error">{error}</div>}
      </form>

      {loading ? (
        <div className="admin-loading">Loading&hellip;</div>
      ) : products.length === 0 ? (
        <div className="admin-empty">No products yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Price</th>
                <th>Unit</th>
                <th>Stock</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {products.map((p) => (
                <tr key={p.id}>
                  <td>{p.name}</td>
                  <td>Rs. {Number(p.price).toLocaleString()}</td>
                  <td>{p.unit || "—"}</td>
                  <td>{p.stock}</td>
                  <td className="admin-row-actions">
                    <button className="admin-link" onClick={() => handleEdit(p)}>
                      Edit
                    </button>
                    <button className="admin-link danger" onClick={() => handleDelete(p.id)}>
                      Delete
                    </button>
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
