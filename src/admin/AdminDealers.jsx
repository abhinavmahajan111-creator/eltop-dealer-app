import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function AdminDealers() {
  const [dealers, setDealers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);

  const loadDealers = () => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    setLoading(true);
    supabase
      .from("profiles")
      .select("id, name, email, created_at, is_blocked")
      .order("created_at", { ascending: false })
      .then(({ data, error }) => {
        if (!error && data) setDealers(data);
        setLoading(false);
      });
  };

  useEffect(() => {
    loadDealers();
  }, []);

  const toggleBlocked = async (dealer) => {
    setSavingId(dealer.id);
    const nextBlocked = !dealer.is_blocked;
    await supabase.from("profiles").update({ is_blocked: nextBlocked }).eq("id", dealer.id);
    setDealers((prev) =>
      prev.map((d) => (d.id === dealer.id ? { ...d, is_blocked: nextBlocked } : d))
    );
    setSavingId(null);
  };

  return (
    <div className="admin-page">
      <h1 className="admin-title">Dealers</h1>
      {loading ? (
        <div className="admin-loading">Loading&hellip;</div>
      ) : dealers.length === 0 ? (
        <div className="admin-empty">No dealers yet.</div>
      ) : (
        <div className="admin-table-wrap">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Email</th>
                <th>Created</th>
                <th>Status</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {dealers.map((d) => (
                <tr key={d.id}>
                  <td>{d.name}</td>
                  <td>{d.email || "—"}</td>
                  <td>{new Date(d.created_at).toLocaleDateString()}</td>
                  <td>
                    <span className={`badge ${d.is_blocked ? "pending" : "delivered"}`}>
                      {d.is_blocked ? "Blocked" : "Active"}
                    </span>
                  </td>
                  <td className="admin-row-actions">
                    <button
                      className="admin-link danger"
                      disabled={savingId === d.id}
                      onClick={() => toggleBlocked(d)}
                    >
                      {d.is_blocked ? "Unblock" : "Block"}
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
