import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

const NAV_ITEMS = [
  { to: "/admin", label: "Dashboard", icon: "\u{1F4CA}" },
  { to: "/admin/orders", label: "Orders", icon: "\u{1F4E6}" },
  { to: "/admin/products", label: "Products", icon: "\u{1F6CE}\u{FE0F}" },
  { to: "/admin/dealers", label: "Dealers", icon: "\u{1F465}" },
];

export default function AdminLayout() {
  const navigate = useNavigate();
  const { signOut } = useApp();

  const handleLogout = async () => {
    await signOut();
    navigate("/login");
  };

  return (
    <div className="admin-app">
      <aside className="admin-sidebar">
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
