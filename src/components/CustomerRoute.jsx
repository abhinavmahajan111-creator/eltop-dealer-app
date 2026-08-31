import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function CustomerRoute() {
  const { isCustomer, isDealer, isStaff, sessionChecked, profileLoaded, adminChecked, staffChecked, session } = useApp();

  if (!sessionChecked || (session?.user && (!profileLoaded || !adminChecked || !staffChecked))) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 14, color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  if (isCustomer || isDealer) return <Outlet />;
  if (isStaff) return <Navigate to="/staff" replace />;
  return <Navigate to="/store" replace />;
}
