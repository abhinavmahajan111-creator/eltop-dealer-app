import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function DealerRoute() {
  const { isDealer, isAdmin, isCustomer, sessionChecked, profileLoaded, adminChecked, session, dealerApplicationStatus } = useApp();

  // Three-phase loading gate:
  // 1. sessionChecked — wait for getSession() to resolve (session starts null on mount)
  // 2. profileLoaded  — wait for profiles table query to resolve (is_dealer flag)
  // 3. adminChecked   — wait for admins table query to resolve (isAdmin flag)
  // Without all three, a hard reload redirects before identity is known.
  if (!sessionChecked || (session?.user && (!profileLoaded || !adminChecked))) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 14, color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  if (isDealer)    return <Outlet />;
  if (isAdmin)     return <Navigate to="/admin" replace />;
  if (isCustomer)  return <Navigate to="/store" replace />;
  return <Navigate to="/login" replace />;
}
