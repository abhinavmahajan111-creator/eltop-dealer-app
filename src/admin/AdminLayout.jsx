import { useState, useEffect } from "react";
import { NavLink, Outlet, useNavigate, useLocation } from "react-router-dom";
import { useApp } from "../context/AppContext";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: "\u{1F4CA}" },
  { to: "/admin/orders", label: "Orders", icon: "\u{1F4E6}" },
  { to: "/admin/products", label: "Products", icon: "\u{1F6CE}\u{FE0F}" },
  { to: "/admin/dealers", label: "Dealers & Customers", icon: "\u{1F465}" },
  { to: "/admin/health", label: "Health Check", icon: "\u{1F6A8}" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signOut } = useApp();
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Close drawer whenever the route changes (handles back-button too)
  useEffect(() => {
    setDrawerOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="admin-app">
      {/* Hamburger — mobile only, hidden on desktop via CSS */}
      <button
        className="admin-hamburger"
        onClick={() => setDrawerOpen(true)}
        aria-label="Open menu"
      >
        ☰
      </button>

      {/* Overlay — only in DOM when drawer is open */}
      {drawerOpen && (
        <div className="admin-sidebar-overlay" onClick={closeDrawer} />
      )}

      <aside className={`admin-sidebar${drawerOpen ? " open" : ""}`}>
        {/* Close button — mobile only, hidden on desktop via CSS */}
        <button className="admin-sidebar-close" onClick={closeDrawer} aria-label="Close menu">
          ✕
        </button>

        <div className="admin-logo">Eltop Admin</div>
        <nav className="admin-nav">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.to === "/admin"}
              className={({ isActive }) =>
                "admin-navitem" + (isActive ? " active" : "")
              }
              onClick={(e) => {
                if (item.to === "/admin/dealers" || item.to === "/admin/products") {
                  e.preventDefault();
                  navigate(item.to, { state: { resetAt: Date.now() } });
                }
                closeDrawer();
              }}
            >
              <span className="ic">{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button className="admin-logout" onClick={handleLogout}>
          Log out
        </button>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}
