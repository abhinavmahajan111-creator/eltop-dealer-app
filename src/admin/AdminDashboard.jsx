import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({
    totalOrders: 0,
    revenue: 0,
    activeDealers: 0,
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setLoading(false);
      return;
    }
    let cancelled = false;

    Promise.all([
      supabase.from("orders").select("total"),
      supabase.from("profiles").select("id", { count: "exact", head: true }).eq("is_blocked", false),
    ]).then(([ordersRes, dealersRes]) => {
      if (cancelled) return;
      console.log("[AdminDashboard] orders result:", ordersRes.data, "error:", ordersRes.error);
      console.log("[AdminDashboard] dealers count:", dealersRes.count, "error:", dealersRes.error);
      const orders = ordersRes.data || [];
      const revenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
      setStats({
        totalOrders: orders.length,
        revenue,
        activeDealers: dealersRes.count || 0,
      });
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="admin-page">
      <h1 className="admin-title">Dashboard</h1>
      {loading ? (
        <div className="admin-loading">Loading&hellip;</div>
      ) : (
        <div className="admin-stat-grid">
          <div className="admin-stat-card admin-stat-card--link" onClick={() => navigate("/admin/orders")}>
            <div className="admin-stat-label">Total Orders</div>
            <div className="admin-stat-value">{stats.totalOrders}</div>
          </div>
          <div className="admin-stat-card admin-stat-card--link" onClick={() => navigate("/admin/orders")}>
            <div className="admin-stat-label">Revenue</div>
            <div className="admin-stat-value red">
              Rs. {stats.revenue.toLocaleString()}
            </div>
          </div>
          <div className="admin-stat-card admin-stat-card--link" onClick={() => navigate("/admin/dealers")}>
            <div className="admin-stat-label">Active Dealers</div>
            <div className="admin-stat-value">{stats.activeDealers}</div>
          </div>
        </div>
      )}
    </div>
  );
}
