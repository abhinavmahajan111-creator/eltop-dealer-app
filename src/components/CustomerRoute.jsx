import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function CustomerRoute() {
  const { isCustomer, isDealer, sessionChecked, profileLoaded, adminChecked, session } = useApp();

  if (!sessionChecked || (session?.user && (!profileLoaded || !adminChecked))) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 14, color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  if (isCustomer || isDealer) return <Outlet />;
  return <Navigate to="/store" replace />;
}
