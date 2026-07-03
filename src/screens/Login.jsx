import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

// ── Portal definitions ────────────────────────────────────────────────────────
const PORTALS = [
  {
    id:       "retail",
    icon:     "🛍️",
    title:    "Retail Customer",
    subtitle: "Browse & purchase at MRP",
    color:    "#2563EB",
    bg:       "#EFF6FF",
    action:   "store",
  },
  {
    id:       "dealer",
    icon:     "🤝",
    title:    "Channel Partner",
    subtitle: "Dealer pricing, orders & account",
    color:    "#7C3AED",
    bg:       "#F5F3FF",
    action:   "otp",
  },
  {
    id:       "sales",
    icon:     "📊",
    title:    "Sales Executive",
    subtitle: "Manage dealers & sales orders",
    color:    "#059669",
    bg:       "#ECFDF5",
    action:   "password",
  },
  {
    id:       "logistics",
    icon:     "🚚",
    title:    "Logistics & Dispatch",
    subtitle: "Warehouse, dispatch & inventory",
    color:    "#D97706",
    bg:       "#FFFBEB",
    action:   "password",
  },
  {
    id:       "admin",
    icon:     "⚙️",
    title:    "Administrator",
    subtitle: "Full system access & controls",
    color:    "#DC2626",
    bg:       "#FEF2F2",
    action:   "admin",
  },
  {
    id:       "backoffice",
    icon:     "🗂️",
    title:    "Back Office",
    subtitle: "Operations, reports & support",
    color:    "#475569",
    bg:       "#F8FAFC",
    action:   "password",
  },
];

// ── Admin email/password login ────────────────────────────────────────────────
function AdminForm({ portal, onBack }) {
  const navigate = useNavigate();
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy]         = useState(false);
  const [error, setError]       = useState("");

  const handleSubmit = async () => {
    if (!email.trim() || !password) return;
    setBusy(true);
    setError("");
    if (!isSupabaseConfigured) {
      navigate("/admin");
      return;
    }
    const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (err) { setError(err.message); setBusy(false); return; }
    navigate("/admin");
  };

  return (
    <FormShell portal={portal} onBack={onBack}>
      <input
        type="email"
        placeholder="Admin email address"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={inputStyle}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        onKeyDown={e => e.key === "Enter" && handleSubmit()}
        style={inputStyle}
      />
      {error && <div style={errorStyle}>{error}</div>}
      <button
        onClick={handleSubmit}
        disabled={busy || !email.trim() || !password}
        style={submitStyle(portal.color)}
      >
        {busy ? "Signing in…" : "Sign In"}
      </button>
    </FormShell>
  );
}

// ── OTP login (Channel Partner) ───────────────────────────────────────────────
function OtpForm({ portal, onBack }) {
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, authBusy, authError } = useApp();
  const [step, setStep]             = useState(1);
  const [emailInput, setEmailInput] = useState("");
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  const goOtp = async () => {
    const ok = await sendOtp(emailInput.trim());
    if (ok) setStep(2);
  };

  const verify = async () => {
    const otp = otpRefs.map(r => r.current?.value || "").join("");
    const ok  = await verifyOtp(otp);
    if (ok) navigate("/dashboard");
  };

  const handleOtpKey = (e, i) => {
    if (e.target.value && i < otpRefs.length - 1) otpRefs[i + 1].current?.focus();
  };

  return (
    <FormShell portal={portal} onBack={() => { setStep(1); onBack(); }}>
      {step === 1 ? (
        <>
          <input
            type="email"
            placeholder="Enter your dealer email"
            value={emailInput}
            onChange={e => setEmailInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && goOtp()}
            style={inputStyle}
          />
          {authError && <div style={errorStyle}>{authError}</div>}
          <button
            onClick={goOtp}
            disabled={authBusy || !emailInput.trim()}
            style={submitStyle(portal.color)}
          >
            {authBusy ? "Sending…" : "Send OTP"}
          </button>
        </>
      ) : (
        <>
          <p style={{ fontSize: 13, color: "#555", margin: "0 0 14px" }}>
            OTP sent to <strong>{emailInput}</strong>
          </p>
          <div style={{ display: "flex", gap: 8, justifyContent: "center", marginBottom: 16 }}>
            {otpRefs.map((ref, i) => (
              <input
                key={i}
                ref={ref}
                maxLength={1}
                onInput={e => handleOtpKey(e, i)}
                style={{
                  width: 40, height: 48, textAlign: "center", fontSize: 20, fontWeight: 700,
                  border: `2px solid ${portal.color}`, borderRadius: 8, outline: "none",
                }}
              />
            ))}
          </div>
          {authError && <div style={errorStyle}>{authError}</div>}
          <button
            onClick={verify}
            disabled={authBusy}
            style={submitStyle(portal.color)}
          >
            {authBusy ? "Verifying…" : "Verify & Login"}
          </button>
          <div
            onClick={goOtp}
            style={{ fontSize: 12, color: portal.color, cursor: "pointer", textAlign: "center", marginTop: 10 }}
          >
            Resend OTP
          </div>
        </>
      )}
    </FormShell>
  );
}

// ── Placeholder password form (Sales, Logistics, Back Office) ─────────────────
function PasswordForm({ portal, onBack }) {
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");

  return (
    <FormShell portal={portal} onBack={onBack}>
      <input
        type="email"
        placeholder="Work email address"
        value={email}
        onChange={e => setEmail(e.target.value)}
        style={inputStyle}
      />
      <input
        type="password"
        placeholder="Password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        style={inputStyle}
      />
      <button
        disabled
        style={{ ...submitStyle(portal.color), opacity: 0.6, cursor: "not-allowed" }}
      >
        Sign In (Coming Soon)
      </button>
      <p style={{ fontSize: 11, color: "#aaa", textAlign: "center", marginTop: 8 }}>
        {portal.title} portal is under setup. Contact your administrator.
      </p>
    </FormShell>
  );
}

// ── Shared form shell ─────────────────────────────────────────────────────────
function FormShell({ portal, onBack, children }) {
  return (
    <div style={{
      marginTop: 24,
      background: "#fff",
      borderRadius: 16,
      border: `2px solid ${portal.color}`,
      padding: "24px 28px 20px",
      boxShadow: `0 4px 24px ${portal.color}22`,
      animation: "slideDown .22s ease",
      maxWidth: 400,
      width: "100%",
      boxSizing: "border-box",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
        <span style={{ fontSize: 22 }}>{portal.icon}</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 800, color: portal.color }}>{portal.title}</div>
          <div style={{ fontSize: 11, color: "#888" }}>{portal.subtitle}</div>
        </div>
      </div>
      {children}
      <button
        onClick={onBack}
        style={{
          background: "none", border: "none", cursor: "pointer",
          fontSize: 12, color: "#888", marginTop: 14, padding: 0,
          display: "flex", alignItems: "center", gap: 4,
        }}
      >
        ← Change Portal
      </button>
    </div>
  );
}

// ── Shared styles ─────────────────────────────────────────────────────────────
const inputStyle = {
  width: "100%", boxSizing: "border-box",
  padding: "10px 14px", marginBottom: 12,
  border: "1.5px solid #e2e8f0", borderRadius: 8,
  fontSize: 14, fontFamily: "inherit", outline: "none",
  display: "block",
};

const errorStyle = {
  fontSize: 12, color: "#DC2626", marginBottom: 10, fontWeight: 500,
};

const submitStyle = (color) => ({
  width: "100%", padding: "11px 0", border: "none", borderRadius: 8,
  background: color, color: "#fff", fontSize: 14, fontWeight: 700,
  cursor: "pointer", fontFamily: "inherit",
});

// ── Portal card ───────────────────────────────────────────────────────────────
function PortalCard({ portal, selected, onClick }) {
  const [hovered, setHovered] = useState(false);
  const isActive = selected?.id === portal.id;

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: isActive ? portal.bg : "#fff",
        border: `2px solid ${isActive ? portal.color : hovered ? portal.color + "66" : "#e2e8f0"}`,
        borderRadius: 14,
        padding: "20px 18px",
        cursor: "pointer",
        transition: "all .18s ease",
        transform: hovered && !isActive ? "translateY(-2px)" : "none",
        boxShadow: isActive
          ? `0 4px 20px ${portal.color}33`
          : hovered
            ? "0 4px 14px rgba(0,0,0,.09)"
            : "0 1px 4px rgba(0,0,0,.06)",
        userSelect: "none",
      }}
    >
      <div style={{ fontSize: 32, marginBottom: 10, lineHeight: 1 }}>{portal.icon}</div>
      <div style={{ fontSize: 14, fontWeight: 800, color: isActive ? portal.color : "#1e293b", marginBottom: 4 }}>
        {portal.title}
      </div>
      <div style={{ fontSize: 11, color: "#94a3b8", lineHeight: 1.4 }}>{portal.subtitle}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function Login() {
  const navigate    = useNavigate();
  const [selected, setSelected] = useState(null);

  const handleSelect = (portal) => {
    if (portal.action === "store") { navigate("/store"); return; }
    setSelected(portal);
  };

  const handleBack = () => setSelected(null);

  const renderForm = () => {
    if (!selected) return null;
    switch (selected.action) {
      case "otp":      return <OtpForm      portal={selected} onBack={handleBack} />;
      case "admin":    return <AdminForm    portal={selected} onBack={handleBack} />;
      case "password": return <PasswordForm portal={selected} onBack={handleBack} />;
      default:         return null;
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "#F8FAFC",
      display: "flex", flexDirection: "column", alignItems: "center",
      overflowY: "auto", padding: "40px 16px 60px",
    }}>
      <style>{`
        @keyframes slideDown {
          from { opacity: 0; transform: translateY(-10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes fadeIn {
          from { opacity: 0; } to { opacity: 1; }
        }
        .portal-grid {
          display: grid;
          grid-template-columns: repeat(3, 1fr);
          gap: 14px;
          width: 100%;
          max-width: 680px;
        }
        @media (max-width: 640px) {
          .portal-grid { grid-template-columns: repeat(2, 1fr); }
        }
        @media (max-width: 400px) {
          .portal-grid { grid-template-columns: 1fr; }
        }
      `}</style>

      {/* Header */}
      <div style={{ textAlign: "center", marginBottom: 36, animation: "fadeIn .3s ease" }}>
        <img
          src="/assets/eltop-logo.png.jpg"
          alt="Eltop"
          style={{ height: 60, width: "auto", marginBottom: 16, objectFit: "contain" }}
          onError={e => { e.target.style.display = "none"; }}
        />
        <h1 style={{ fontSize: 22, fontWeight: 900, color: "#1e293b", margin: "0 0 6px" }}>
          Welcome to Eltop by Embassy
        </h1>
        <p style={{ fontSize: 13, color: "#64748b", margin: 0 }}>
          Select your portal to continue
        </p>
      </div>

      {/* Portal grid */}
      <div
        className="portal-grid"
        style={{ opacity: selected ? 0.55 : 1, transition: "opacity .2s ease" }}
      >
        {PORTALS.map(portal => (
          <PortalCard
            key={portal.id}
            portal={portal}
            selected={selected}
            onClick={() => handleSelect(portal)}
          />
        ))}
      </div>

      {/* Form area */}
      {renderForm()}
    </div>
  );
}
