import { NavLink } from "react-router-dom";

const ITEMS = [
  { to: "/dashboard", icon: "\u{1F3E0}", label: "Home" },
  { to: "/catalogue", icon: "\u{1F4D8}", label: "Catalogue" },
  { to: "/cart", icon: "\u{1F6D2}", label: "Cart" },
  { to: "/ledger", icon: "\u{1F4CB}", label: "Ledger" },
  { to: "/profile", icon: "\u{1F464}", label: "Profile" },
];

export default function BottomNav() {
  return (
    <div className="bottomnav">
      {ITEMS.map((item) => (
        <NavLink
          key={item.to}
          to={item.to}
          className={({ isActive }) => "navitem" + (isActive ? " active" : "")}
        >
          <span className="ic">{item.icon}</span>
          {item.label}
        </NavLink>
      ))}
    </div>
  );
}
