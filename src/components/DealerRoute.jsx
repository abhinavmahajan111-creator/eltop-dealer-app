import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function DealerRoute() {
  const { isDealer, isAdmin, isCustomer, isStaff, sessionChecked, profileLoaded, adminChecked, staffChecked, session, dealerApplicationStatus } = useApp();

  // Four-phase loading gate:
  // 1. sessionChecked — wait for getSession() to resolve (session starts null on mount)
  // 2. profileLoaded  — wait for profiles table query to resolve (is_dealer flag)
  // 3. adminChecked   — wait for admins table query to resolve (isAdmin flag)
  // 4. staffChecked   — wait for staff_profiles query to resolve (isStaff flag)
  // Without all four, a hard reload redirects before identity is known.
  if (!sessionChecked || (session?.user && (!profileLoaded || !adminChecked || !staffChecked))) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 14, color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  if (isDealer) {
    // Mirror the same approved-or-legacy check used in Store.jsx's isApprovedDealer.
    // Pending dealers (pending_details / under_review / rejected) land on /store
    // where the existing "application incomplete" banner handles the UX.
    const isApproved = dealerApplicationStatus === 'approved' || dealerApplicationStatus === 'none';
    return isApproved ? <Outlet /> : <Navigate to="/store" replace />;
  }
  if (isAdmin)     return <Navigate to="/admin" replace />;
  if (isStaff)     return <Navigate to="/staff" replace />;
  if (isCustomer)  return <Navigate to="/store" replace />;
  return <Navigate to="/login" replace />;
}
