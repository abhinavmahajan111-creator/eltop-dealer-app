import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

// Modeled directly on DealerRoute.jsx. Gates every /staff/* route: only a
// linked, active staff_profiles row gets through. Anyone else with a known
// identity is bounced to their own home; anyone unknown goes to /login.
export default function StaffRoute() {
  const { isStaff, isAdmin, isDealer, isCustomer, sessionChecked, profileLoaded, adminChecked, staffChecked, session } = useApp();

  // Four-phase loading gate — same reasoning as DealerRoute's three-phase one,
  // with staffChecked added so a staff member isn't bounced before their
  // staff_profiles row has had a chance to resolve.
  if (!sessionChecked || (session?.user && (!profileLoaded || !adminChecked || !staffChecked))) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 14, color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  if (isStaff)    return <Outlet />;
  if (isAdmin)    return <Navigate to="/admin" replace />;
  if (isDealer)   return <Navigate to="/dashboard" replace />;
  if (isCustomer) return <Navigate to="/store" replace />;
  return <Navigate to="/login" replace />;
}
