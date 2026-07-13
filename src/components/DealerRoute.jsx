import { Navigate, Outlet } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function DealerRoute() {
  const { isDealer, isAdmin, isCustomer, sessionChecked, profileLoaded, adminChecked, session, dealerApplicationStatus, dealer } = useApp();

  // ── DEBUG LOGGING (remove after mobile investigation) ──
  console.log('[DealerRoute] render', {
    sessionChecked,
    profileLoaded,
    adminChecked,
    hasSession: Boolean(session?.user),
    isDealer,
    isAdmin,
    isCustomer,
    dealerApplicationStatus,
    // log the raw profile field so we can see exactly what AppContext holds
    rawDealerAppStatus: dealer?.dealer_application_status,
    ts: new Date().toISOString(),
  });

  // Three-phase loading gate:
  // 1. sessionChecked — wait for getSession() to resolve (session starts null on mount)
  // 2. profileLoaded  — wait for profiles table query to resolve (is_dealer flag)
  // 3. adminChecked   — wait for admins table query to resolve (isAdmin flag)
  // Without all three, a hard reload redirects before identity is known.
  if (!sessionChecked || (session?.user && (!profileLoaded || !adminChecked))) {
    console.log('[DealerRoute] → LOADING (gate not cleared)');
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", fontSize: 14, color: "#94a3b8" }}>
        Loading…
      </div>
    );
  }

  // Dealers with a pending/incomplete application go to /store where the status banners live.
  // 'none' = NULL in DB (existing dealers with no status set) → full access.
  // 'approved' → full access. Anything else → redirect to /store.
  if (isDealer && (dealerApplicationStatus === 'none' || dealerApplicationStatus === 'approved')) {
    console.log('[DealerRoute] → OUTLET (dashboard allowed)', { dealerApplicationStatus });
    return <Outlet />;
  }
  if (isDealer) {
    console.log('[DealerRoute] → /store (pending dealer blocked)', { dealerApplicationStatus });
    return <Navigate to="/store" replace />;
  }
  if (isAdmin)    return <Navigate to="/admin" replace />;
  if (isCustomer) return <Navigate to="/store" replace />;
  console.log('[DealerRoute] → /login (no identity)');
  return <Navigate to="/login" replace />;
}
