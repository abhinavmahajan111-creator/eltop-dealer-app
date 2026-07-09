import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { useApp } from "../context/AppContext";

export default function AdminRoute() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const { isDealer, isCustomer, profileLoaded } = useApp();

  useEffect(() => {
    if (!isSupabaseConfigured) {
      setIsAdmin(true);
      setIsLoggedIn(true);
      setChecking(false);
      return;
    }

    // Resolve the real session first, then check the admins table.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!session?.user) {
        setChecking(false);
        return;
      }
      setIsLoggedIn(true);
      supabase
        .from("admins")
        .select("id")
        .eq("id", session.user.id)
        .maybeSingle()
        .then(({ data, error }) => {
          console.log("[AdminRoute] user id:", session.user.id);
          console.log("[AdminRoute] admins query result:", data, "error:", error);
          console.log("[AdminRoute] isAdmin:", Boolean(data));
          setIsAdmin(Boolean(data));
          setChecking(false);
        });
    });
  }, []);

  // Wait for both the admins-table check AND the AppContext profile fetch to
  // resolve before redirecting. profileLoaded false means we don't yet know if
  // the session belongs to a dealer, customer, or neither — redirecting during
  // that window would use incomplete identity information.
  if (checking || (isLoggedIn && !isAdmin && !profileLoaded)) {
    return (
      <div className="admin-app">
        <div className="admin-loading">Checking access&hellip;</div>
      </div>
    );
  }

  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!isAdmin && isDealer) return <Navigate to="/dashboard" replace />;
  if (!isAdmin && isCustomer) return <Navigate to="/store" replace />;
  if (!isAdmin) return <Navigate to="/login" replace />;

  return <Outlet />;
}
