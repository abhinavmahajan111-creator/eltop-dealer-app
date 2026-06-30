import { useEffect, useState } from "react";
import { Navigate, Outlet } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

export default function AdminRoute() {
  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

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

  if (checking) {
    return (
      <div className="admin-app">
        <div className="admin-loading">Checking access&hellip;</div>
      </div>
    );
  }

  if (!isLoggedIn) return <Navigate to="/login" replace />;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return <Outlet />;
}
