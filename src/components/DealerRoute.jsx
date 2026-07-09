import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function DealerRoute() {
  const { isDealer, isAdmin, isCustomer, profileLoaded, session } = useApp();

  // Wait for profile fetch to complete before deciding.
  // Without session?.user check, anonymous visitors (profileLoaded stays false)
  // would spin forever instead of falling through to /login immediately.
  if (session?.user && !profileLoaded) {
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
