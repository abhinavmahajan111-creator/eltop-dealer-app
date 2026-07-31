import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

// Like DealerRoute, but allows pending dealers through to /profile.
// Blocked dealers are already signed out by AppContext before this renders.
export default function DealerProfileRoute() {
  const { isDealer, isAdmin, isCustomer, sessionChecked, profileLoaded, adminChecked, session } = useApp();

  if (!sessionChecked || (session?.user && (!profileLoaded || !adminChecked))) {
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
