import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const STAFF_ROLE_MAP = {
  "Sales Executive":      "sales_executive",
  "Logistics & Dispatch": "logistics",
  "Back Office":          "back_office",
};

export default function Login() {
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, authBusy, authError, deactivatedAccount, clearDeactivated } = useApp();

  const [role, setRole]             = useState("Guest");
  const [dealerMode, setDealerMode] = useState("existing"); // 'existing' | 'new'
  const [step, setStep]             = useState(1);
  const [emailInput, setEmailInput] = useState("");
  const [localError, setLocalError] = useState("");
  const [dealerMismatch, setDealerMismatch] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const [showFanmanModal, setShowFanmanModal] = useState(false);
  const cooldownRef = useRef(null);
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  useEffect(() => () => clearInterval(cooldownRef.current), []);

  function startCooldown(seconds) {
    clearInterval(cooldownRef.current);
    setResendCooldown(seconds);
    cooldownRef.current = setInterval(() => {
      setResendCooldown(prev => {
        if (prev <= 1) { clearInterval(cooldownRef.current); return 0; }
        return prev - 1;
      });
    }, 1000);
  }

  const isGuest    = role === "Guest";
  const isCustomer = role === "Customer / My Account";
  const isDealer   = role === "Channel Partner";
  const isAdmin    = role === "Administrator";
  const isStaff    = role in STAFF_ROLE_MAP;

  function handleRoleChange(e) {
    setRole(e.target.value);
    setStep(1);
    setEmailInput("");
    setLocalError("");
    setDealerMismatch(false);
    setDealerMode("existing");
    otpRefs.forEach(r => { if (r.current) r.current.value = ""; });
  }

  async function goOtp() {
    setLocalError("");
    const email = emailInput.trim();

    if (isStaff && isSupabaseConfigured) {
      const staffRole = STAFF_ROLE_MAP[role];
      const { data, error } = await supabase
        .from("staff")
        .select("role")
        .ilike("email", email)
        .eq("role", staffRole)
        .maybeSingle();
      // error (non-null) covers both genuine query failure AND multiple-row conflicts
      if (error) {
        setLocalError("Unable to verify your account. Please try again.");
        return;
      }
      if (!data) {
        setLocalError(`You're not registered as a ${role}. Contact admin for clarification.`);
        return;
      }
    }

    const ok = await sendOtp(email);
    if (ok) { setStep(2); startCooldown(30); }
  }

  async function verify() {
    setLocalError("");
    const otp = otpRefs.map(r => r.current?.value || "").join("");
    const ok  = await verifyOtp(otp);
    if (!ok) return;

    // ── Customer ──
    if (isCustomer) {
      if (isSupabaseConfigured) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: existing } = await supabase
            .from("profiles").select("id, is_dealer").eq("id", user.id).maybeSingle();
          if (existing) {
            if (existing.is_dealer !== false)
              await supabase.from("profiles").update({ is_dealer: false }).eq("id", user.id);
          } else {
            await supabase.from("profiles").insert({ id: user.id, email: user.email, is_dealer: false, name: "" });
          }
        }
      }
      navigate("/my-account");
      return;
    }

    // ── Existing Dealer ──
    if (isDealer && dealerMode === "existing") {
      if (isSupabaseConfigured) {
        const { data: { user } } = await supabase.auth.getUser();
        const { data: prof, error: profErr } = await supabase
          .from("profiles").select("is_dealer").eq("id", user.id).maybeSingle();
        // Non-PGRST116 error = actual query failure (network/RLS) — do not treat as "not a dealer"
        if (profErr && profErr.code !== "PGRST116") {
          setLocalError("Unable to verify your dealer account. Please try again.");
          await supabase.auth.signOut();
          setStep(1);
          return;
        }
        if (prof?.is_dealer === true) {
          navigate("/dashboard");
        } else {
          await supabase.auth.signOut();
          setDealerMismatch(true);
          setStep(1);
        }
      } else {
        navigate("/dashboard");
      }
      return;
    }

    // ── New Dealer Signup ──
    if (isDealer && dealerMode === "new") {
      if (isSupabaseConfigured) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: prof } = await supabase
            .from("profiles").select("id, is_dealer").eq("id", user.id).maybeSingle();
          if (prof?.is_dealer === true) {
            // Already a full dealer — just log them in, don't overwrite anything
            navigate("/dashboard");
          } else if (prof) {
            // Profile exists but not a dealer — upgrade it
            await supabase.from("profiles")
              .update({ is_dealer: true, dealer_application_status: "pending_details" })
              .eq("id", user.id);
            navigate("/store");
          } else {
            // No profile yet — create one
            await supabase.from("profiles").insert({
              id:                        user.id,
              email:                     user.email,
              is_dealer:                 true,
              dealer_application_status: "pending_details",
              name:                      "",
            });
            navigate("/store");
          }
        }
      } else {
        navigate("/store");
      }
      return;
    }

    // ── Admin / Staff ──
    navigate(isAdmin ? "/admin" : "/dashboard");
  }

  function handleOtpInput(e, i) {
    if (e.target.value && i < otpRefs.length - 1) otpRefs[i + 1].current?.focus();
  }
  function handleOtpKeyDown(e, i) {
    if (e.key === "Backspace") {
      if (e.target.value) { e.target.value = ""; }
      else if (i > 0) { const p = otpRefs[i - 1].current; if (p) { p.value = ""; p.focus(); } }
      e.preventDefault();
    }
  }

  const titleText = isCustomer ? "My Account"
    : isDealer ? "Channel Partner"
    : "Welcome, Dealer";
  const subText = isCustomer
    ? "Sign in or create your account"
    : isDealer
    ? (dealerMode === "new" ? "Register as a new dealer" : "Login to your dealer account")
    : "Login to manage your orders";

  return (
    <div className="screen" id="screen-login">
      <div className="content">
        <div className="login-logo">ET</div>
        <div className="login-title">{titleText}</div>
        <div className="login-sub">{subText}</div>

        {deactivatedAccount && (
          <div style={{ background: "#fdecea", border: "1px solid #e74c3c", borderRadius: 12, padding: "16px 18px", marginBottom: 20, fontSize: 14, color: "#7b241c", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Account Deactivated</div>
            Your dealer account is currently deactivated. We've notified the admin to review restoring your access. Please check back later.
            <div style={{ marginTop: 10 }}>
              <button onClick={clearDeactivated} style={{ background: "none", border: "none", color: "#e74c3c", fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0, textDecoration: "underline" }}>
                Try a different account
              </button>
            </div>
          </div>
        )}

        {dealerMismatch && (
          <div style={{ background: "#fdecea", border: "1px solid #e74c3c", borderRadius: 12, padding: "16px 18px", marginBottom: 20, fontSize: 14, color: "#7b241c", lineHeight: 1.5 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Not registered as a dealer</div>
            <b>{emailInput}</b> is not registered as an existing dealer. If you'd like to become a dealer, sign up below.
            <div style={{ marginTop: 10 }}>
              <button
                onClick={() => { setDealerMismatch(false); setDealerMode("new"); setStep(1); }}
                style={{ background: "#7B2D8B", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, padding: "6px 14px", borderRadius: 8 }}
              >
                Register as New Dealer →
              </button>
            </div>
          </div>
        )}

        <select value={role} onChange={handleRoleChange}
          style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", marginBottom: 16, border: "1.5px solid #ddd", borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#111", appearance: "auto" }}>
          <option value="Guest">Guest</option>
          <option value="Customer / My Account">Customer / My Account</option>
          <option value="Channel Partner">Channel Partner</option>
          <option value="Sales Executive">Sales Executive</option>
          <option value="Logistics & Dispatch">Logistics &amp; Dispatch</option>
          <option value="Administrator">Administrator</option>
          <option value="Back Office">Back Office</option>
        </select>

        {/* Channel Partner sub-choice */}
        {isDealer && !dealerMismatch && (
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            {[["existing", "Existing Dealer"], ["new", "New Dealer — Sign Up"]].map(([mode, label]) => (
              <button key={mode}
                onClick={() => { setDealerMode(mode); setStep(1); setLocalError(""); otpRefs.forEach(r => { if (r.current) r.current.value = ""; }); }}
                style={{
                  flex: 1, padding: "8px 6px", borderRadius: 8, fontSize: 12, fontWeight: 700,
                  cursor: "pointer", fontFamily: "inherit",
                  background: dealerMode === mode ? "#7B2D8B" : "transparent",
                  color: dealerMode === mode ? "#fff" : "#7B2D8B",
                  border: "1.5px solid #7B2D8B",
                }}>
                {label}
              </button>
            ))}
          </div>
        )}

        {isGuest ? (
          <>
            <button className="btn" onClick={() => navigate("/store")}>Continue to Store →</button>
            <img
              src="/assets/fan%20man%20eltop.png"
              alt="Fanman"
              style={{ display: "block", margin: "20px auto 0 auto", height: 150, width: "auto", cursor: "pointer", transition: "transform 0.2s" }}
              onClick={() => setShowFanmanModal(true)}
              onMouseEnter={e => { e.target.style.transform = "scale(1.05)"; }}
              onMouseLeave={e => { e.target.style.transform = "scale(1)"; }}
              onError={e => { e.target.style.display = "none"; }}
            />
          </>
        ) : (
          <>
            {step === 1 && (
              <div>
                <input
                  type="email"
                  placeholder="Enter Email Address"
                  value={emailInput}
                  onChange={e => { setEmailInput(e.target.value); setLocalError(""); setDealerMismatch(false); }}
                />
                {(localError || authError) && (
                  <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{localError || authError}</div>
                )}
                <button className="btn" onClick={goOtp} disabled={authBusy || !emailInput.trim()}>
                  {authBusy ? "Checking..." : "Send OTP"}
                </button>
              </div>
            )}
            {step === 2 && (
              <div>
                <div className="login-sub" style={{ marginBottom: 14 }}>OTP sent to <b>{emailInput}</b></div>
                <div className="otp-row">
                  {otpRefs.map((ref, i) => (
                    <input key={i} ref={ref} maxLength={1} className="otp-box"
                      onInput={e => handleOtpInput(e, i)} onKeyDown={e => handleOtpKeyDown(e, i)} />
                  ))}
                </div>
                {(localError || authError) && (
                  <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{localError || authError}</div>
                )}
                <button className="btn" onClick={verify} disabled={authBusy}>
                  {authBusy ? "Verifying..." : "Verify & Login"}
                </button>
                {resendCooldown > 0
                  ? <div className="resend" style={{ opacity: 0.5, cursor: "default" }}>Resend OTP in {resendCooldown}s</div>
                  : <div className="resend" onClick={goOtp}>Resend OTP</div>}
              </div>
            )}
          </>
        )}
      </div>

      {showFanmanModal && (
        <div onClick={() => setShowFanmanModal(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.9)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 20 }}>
            <img src="/assets/fan%20man%20eltop.png" alt="Eltop Fanman" style={{ height: "70vh", maxHeight: 500, width: "auto", objectFit: "contain" }} />
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", justifyContent: "center" }}>
              <a href="/assets/fan%20man%20eltop.png" download="Eltop-Fanman.png" title="Download" style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", background: "#7B2D8B", color: "white", textDecoration: "none", fontSize: 22 }}>⬇️</a>
              <button title="Share" onClick={async () => { if (navigator.share) { await navigator.share({ title: "Hey I am Eltop Fanman! 🎉", text: "Check out Eltop Fanman!", url: window.location.origin + "/store" }); } else { navigator.clipboard.writeText(window.location.origin + "/store"); alert("Link copied!"); } }} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", background: "#FF0000", color: "white", border: "none", cursor: "pointer", fontSize: 22 }}>🔗</button>
              <button title="Close" onClick={() => setShowFanmanModal(false)} style={{ display: "flex", alignItems: "center", justifyContent: "center", width: 48, height: 48, borderRadius: "50%", background: "#333", color: "white", border: "none", cursor: "pointer", fontSize: 22 }}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
