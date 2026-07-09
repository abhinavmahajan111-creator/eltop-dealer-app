import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function DealerRoute() {
  const { isDealer, isAdmin, isCustomer, profileLoaded, adminChecked, session } = useApp();

  // Wait for BOTH the profile fetch AND the admins-table check to complete.
  // profileLoaded alone is not enough: the admin's profile query returns PGRST116
  // (fast) before the admins query resolves, causing isAdmin to still be false at
  // decision time and incorrectly redirecting the admin to /login.
  if (session?.user && (!profileLoaded || !adminChecked)) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 14, color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  if (isDealer)   return <Outlet />;
  if (isAdmin)    return <Navigate to="/admin" replace />;
  if (isCustomer) return <Navigate to="/store" replace />;
  return <Navigate to="/login" replace />;
}
