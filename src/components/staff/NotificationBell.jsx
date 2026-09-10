import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "../../lib/supabase";

// Lightweight in-app notification bell — the in-app half of the "in app
// alert plus notification on email" decision (§5.4 of the Dealer Access
// Control design doc, 10 Sep 2026). Today the only notification kind is
// 'ledger_access_granted' (fired from grant_dealer_access()), but the
// list/mark-read RPCs are generic so future kinds slot in with no client
// change needed.

function formatWhen(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  const diffMs = Date.now() - d.getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function NotificationBell({ dark }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const boxRef = useRef(null);

  const load = () => {
    supabase.rpc("get_my_notifications", { p_limit: 30 }).then(({ data, error }) => {
      if (!error) setItems(data || []);
      setLoaded(true);
    });
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 60000); // light poll, no live-push infra here
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onClickOutside = (e) => {
      if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, [open]);

  const unread = items.filter((n) => !n.read_at).length;

  const handleToggle = () => {
    setOpen((v) => !v);
  };

  const handleItemClick = async (n) => {
    if (!n.read_at) {
      supabase.rpc("mark_notification_read", { p_id: n.id }).then(() => load());
    }
    setOpen(false);
    if (n.dealer_id) navigate(`/staff/sales/dealer/${n.dealer_id}`);
  };

  const handleMarkAllRead = async () => {
    await supabase.rpc("mark_all_notifications_read");
    load();
  };

  const bellColor = dark ? "#fff" : "#7B2D8B";

  return (
    <div ref={boxRef} style={{ position: "relative" }}>
      <button
        onClick={handleToggle}
        style={{
          position: "relative", background: dark ? "rgba(255,255,255,0.15)" : "#f3e6f6",
          border: dark ? "1.5px solid rgba(255,255,255,0.4)" : "1.5px solid #eadcec",
          borderRadius: 999, width: 34, height: 34, display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer", color: bellColor, fontSize: 15,
        }}
        aria-label="Notifications"
      >
        🔔
        {unread > 0 && (
          <span style={{
            position: "absolute", top: -3, right: -3, minWidth: 16, height: 16, borderRadius: 999,
            background: "#d64545", color: "#fff", fontSize: 9.5, fontWeight: 800,
            display: "flex", alignItems: "center", justifyContent: "center", padding: "0 3px", border: "1.5px solid #fff",
          }}>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div style={{
          position: "absolute", top: 40, right: 0, width: 300, maxHeight: 360, overflowY: "auto",
          background: "#fff", border: "1.5px solid #eadcec", borderRadius: 12, boxShadow: "0 8px 28px rgba(0,0,0,0.18)",
          zIndex: 50,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "10px 12px", borderBottom: "1px solid #f2f2f2" }}>
            <div style={{ fontSize: 12.5, fontWeight: 800, color: "#333" }}>Notifications</div>
            {unread > 0 && (
              <button onClick={handleMarkAllRead} style={{ background: "none", border: "none", color: "#7B2D8B", fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0 }}>
                Mark all read
              </button>
            )}
          </div>
          {!loaded ? (
            <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: "#999" }}>Loading…</div>
          ) : items.length === 0 ? (
            <div style={{ padding: "20px 12px", textAlign: "center", fontSize: 12, color: "#999" }}>Nothing yet.</div>
          ) : (
            items.map((n) => (
              <div
                key={n.id}
                onClick={() => handleItemClick(n)}
                style={{
                  padding: "10px 12px", borderBottom: "1px solid #f6f6f6", cursor: "pointer",
                  background: n.read_at ? "#fff" : "#f8f0f9",
                }}
              >
                <div style={{ fontSize: 12, fontWeight: 700, color: "#333" }}>{n.title}</div>
                {n.body && <div style={{ fontSize: 11.5, color: "#666", marginTop: 2, lineHeight: 1.4 }}>{n.body}</div>}
                <div style={{ fontSize: 10, color: "#aaa", marginTop: 3 }}>{formatWhen(n.created_at)}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
