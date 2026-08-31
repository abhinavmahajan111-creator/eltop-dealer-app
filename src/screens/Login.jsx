import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { isSupabaseConfigured, supabase } from "../lib/supabase";
import { staffRolePath } from "../utils/staffRoles";

// Four top-level login choices — decided 31 Aug 2026. No per-department
// dropdown listing every individual role (that used to list 7 options
// including 3 separate staff roles — confusing for whoever's logging in).
// Everyone from the company logs in through "Staff" with their own email;
// the app looks up their role/department AFTER auth (staff_profiles), the
// same way it already looks up dealer_application_status to decide what a
// dealer sees. Still a single dropdown, same as before — just 4 options
// instead of 7, with Guest preselected.
const TOP_LEVEL_OPTIONS = [
  { value: "Guest",    label: "Guest" },
  { value: "Customer", label: "Existing Customer" },
  { value: "Dealer",   label: "Dealer" },
  { value: "Staff",    label: "Staff" },
];

export default function Login() {
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, authBusy, authError, deactivatedAccount, clearDeactivated, blockedAccount, clearBlocked, markBlocked, refreshProfile } = useApp();

  const [topLevel, setTopLevel]     = useState("Guest"); // 'Guest' | 'Customer' | 'Dealer' | 'Staff'
  const [dealerMode, setDealerMode] = useState("existing"); // 'existing' | 'new'
  const [step, setStep]             = useState(1);
  const [emailInput, setEmailInput] = useState("");
  const [localError, setLocalError] = useState("");
  const [localBusy, setLocalBusy] = useState(false);
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

  const isGuest    = topLevel === "Guest";
  const isCustomer = topLevel === "Customer";
  const isDealer   = topLevel === "Dealer";
  const isStaff    = topLevel === "Staff";

  function resetFlowState() {
    setStep(1);
    setEmailInput("");
    setLocalError("");
    setDealerMismatch(false);
    setDealerMode("existing");
    otpRefs.forEach(r => { if (r.current) r.current.value = ""; });
  }

  function handleTopLevelChange(e) {
    setTopLevel(e.target.value);
    resetFlowState();
  }

  async function goOtp() {
    setLocalError("");
    // Lowercase consistently: staff_profiles.email is always stored lowercase
    // (AdminStaff.jsx lowercases on insert), and the same lowercase string
    // gets sent to Supabase Auth here so auth.users.email matches it too —
    // otherwise a browser that auto-capitalizes ("ABC@X.com") would fail the
    // staff lookup even though the person typed the right email.
    const email = emailInput.trim().toLowerCase();

    if (isStaff && isSupabaseConfigured) {
      // Pre-OTP gate: is this email a registered, active staff member?
      // Uses a security-definer function (not a direct table read) so the
      // staff roster — names, roles, reporting lines — is never exposed to
      // an unauthenticated request; it only ever returns true/false.
      const { data, error } = await supabase.rpc("is_staff_email", { check_email: email });
      if (error) {
        setLocalError("Unable to verify your account. Please try again.");
        return;
      }
      if (!data) {
        setLocalError("This email isn't registered as staff. Contact admin to get added.");
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

    // Cover the insert → refreshProfile → navigate window with a spinner so the
    // login screen never flashes stale state while async work is in progress.
    setLocalBusy(true);

    // OTP verified → mark this profile's email as confirmed.
    // The on_auth_user_created trigger creates the profiles row at signInWithOtp time
    // (before OTP verification), so we mark it verified here when the OTP actually succeeds.
    let authUser = null;
    if (isSupabaseConfigured) {
      const { data: authData } = await supabase.auth.getUser();
      authUser = authData?.user || null;
      if (authUser) {
        await supabase.from('profiles').update({ email_verified: true }).eq('id', authUser.id);
      }
    }

    // ── Admin (checked first, regardless of which of the four buttons was
    // used to log in — an admins-table row always wins) ──
    if (isSupabaseConfigured && authUser) {
      const { data: adminRow } = await supabase.from('admins').select('id').eq('id', authUser.id).maybeSingle();
      if (adminRow) { navigate("/admin"); return; }
    }

    // ── Customer ──
    if (isCustomer) {
      if (isSupabaseConfigured) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          const { data: existing } = await supabase
            .from("profiles").select("id, is_dealer").eq("id", user.id).maybeSingle();
          if (!existing) {
            // No profile yet — create one as a plain customer.
            await supabase.from("profiles").insert({ id: user.id, email: user.email, is_dealer: false, name: "" });
          }
          // Existing profile (dealer or not) — never touch is_dealer here.
          // Logging in via "Customer" must not silently change an account's
          // dealer status; that's an admin-only action (Dealers & Customers
          // → Promote/Downgrade). Previously this unconditionally flipped
          // is_dealer to false, which meant a dealer who mis-picked
          // "Customer" on the login screen silently lost dealer access with
          // no warning.
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
          .from("profiles").select("is_dealer, is_blocked, dealer_application_status").eq("id", user.id).maybeSingle();
        // Non-PGRST116 error = actual query failure (network/RLS) — do not treat as "not a dealer"
        if (profErr && profErr.code !== "PGRST116") {
          setLocalError("Unable to verify your dealer account. Please try again.");
          await supabase.auth.signOut();
          setLocalBusy(false);
          setStep(1);
          return;
        }
        if (prof?.is_dealer === true) {
          if (prof?.is_blocked) {
            markBlocked();
            await supabase.auth.signOut();
            setLocalBusy(false);
            setStep(1);
            return;
          }
          const das = prof?.dealer_application_status;
          const isApproved = das === 'approved' || das === 'none' || !das;
          navigate(isApproved ? "/dashboard" : "/store");
        } else {
          await supabase.auth.signOut();
          setDealerMismatch(true);
          setLocalBusy(false);
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
            .from("profiles").select("id, is_dealer, is_blocked").eq("id", user.id).maybeSingle();
          if (prof?.is_dealer === true) {
            if (prof?.is_blocked) {
              markBlocked();
              await supabase.auth.signOut();
              setLocalBusy(false);
              setStep(1);
              return;
            }
            // Already a full dealer — just log them in, don't overwrite anything
            navigate("/dashboard");
          } else if (prof) {
            // Profile exists but not a dealer — upgrade it
            const { error: updateErr } = await supabase.from("profiles")
              .update({ is_dealer: true, dealer_application_status: "pending_details" })
              .eq("id", user.id);
            if (updateErr) {
              console.error('[new-dealer-signup] update error:', updateErr);
              setLocalError("Could not save your application. Please try again.");
              await supabase.auth.signOut();
              setLocalBusy(false);
              setStep(1);
              return;
            }
            await refreshProfile();
            navigate("/store");
          } else {
            // No profile yet — create one
            const { error: insertErr } = await supabase.from("profiles").insert({
              id:                        user.id,
              email:                     user.email,
              is_dealer:                 true,
              dealer_application_status: "pending_details",
              name:                      "",
            });
            if (insertErr) {
              console.error('[new-dealer-signup] insert error:', insertErr);
              setLocalError("Could not create your account. Please try again.");
              await supabase.auth.signOut();
              setLocalBusy(false);
              setStep(1);
              return;
            }
            await refreshProfile();
            navigate("/store");
          }
        }
      } else {
        navigate("/store");
      }
      return;
    }

    // ── Staff ──
    if (isStaff) {
      if (isSupabaseConfigured) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
          // Link this staff_profiles row to the auth id on first successful
          // login (the row starts with id = null — Admin creates it by
          // email only, before the person ever logs in). ilike (not eq) so
          // this never depends on exact case matching between what Supabase
          // Auth stored and what's in staff_profiles.
          const { error: linkErr } = await supabase
            .from("staff_profiles").update({ id: user.id }).ilike("email", user.email).is("id", null);
          if (linkErr) console.error('[staff-login] link error:', linkErr);

          const { data: sp, error: spErr } = await supabase
            .from("staff_profiles").select("role, is_active").eq("id", user.id).maybeSingle();
          if (spErr || !sp) {
            console.error('[staff-login] lookup failed:', { linkErr, spErr, email: user.email, id: user.id });
            setLocalError(
              "Unable to verify your staff account" +
              (linkErr?.message || spErr?.message ? ` (${linkErr?.message || spErr?.message})` : "") +
              ". Please try again or contact admin."
            );
            await supabase.auth.signOut();
            setLocalBusy(false);
            setStep(1);
            return;
          }
          if (!sp.is_active) {
            setLocalError("Your staff account has been deactivated. Contact admin.");
            await supabase.auth.signOut();
            setLocalBusy(false);
            setStep(1);
            return;
          }
          navigate(staffRolePath(sp.role));
        }
      } else {
        navigate("/staff");
      }
      return;
    }

    // Fallback — shouldn't normally be reached (every branch above returns).
    navigate("/store");
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
    : isStaff  ? "Staff Login"
    : "Welcome to Eltop";
  const subText = isCustomer ? "Sign in or create your account"
    : isDealer ? (dealerMode === "new" ? "Register as a new dealer" : "Login to your dealer account")
    : isStaff  ? "Login with your company email"
    : "Browse Eltop products";

  const formContent = (
    <>
      {blockedAccount && (
        <div style={{ background: "#fdecea", border: "1px solid #e74c3c", borderRadius: 12, padding: "16px 18px", marginBottom: 20, fontSize: 14, color: "#7b241c", lineHeight: 1.5 }}>
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Account Blocked</div>
          Your dealer account has been blocked by admin. Please contact support to resolve this.
          <div style={{ marginTop: 10 }}>
            <button onClick={clearBlocked} style={{ background: "none", border: "none", color: "#e74c3c", fontWeight: 700, cursor: "pointer", fontSize: 13, padding: 0, textDecoration: "underline" }}>
              Try a different account
            </button>
          </div>
        </div>
      )}
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

      <select value={topLevel} onChange={handleTopLevelChange}
        style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", marginBottom: 16, border: "1.5px solid #ddd", borderRadius: 10, fontSize: 14, fontFamily: "inherit", background: "#fff", color: "#111", appearance: "auto" }}>
        {TOP_LEVEL_OPTIONS.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      {dealerMismatch && (
            <div style={{ background: "#fdecea", border: "1px solid #e74c3c", borderRadius: 12, padding: "16px 18px", marginBottom: 20, fontSize: 14, color: "#7b241c", lineHeight: 1.5 }}>
              <div style={{ fontWeight: 800, marginBottom: 6 }}>No dealer account found</div>
              No dealer account is linked to <b>{emailInput}</b>. Double-check for a typo — a single wrong character means a different inbox.
              <div style={{ marginTop: 12, display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button
                  onClick={() => { setDealerMismatch(false); setEmailInput(""); setStep(1); otpRefs.forEach(r => { if (r.current) r.current.value = ""; }); }}
                  style={{ background: "#fff", border: "1.5px solid #e74c3c", color: "#7b241c", fontWeight: 700, cursor: "pointer", fontSize: 13, padding: "6px 14px", borderRadius: 8 }}
                >
                  ← Try a different email
                </button>
                <button
                  onClick={() => { setDealerMismatch(false); setDealerMode("new"); setStep(1); }}
                  style={{ background: "#7B2D8B", border: "none", color: "#fff", fontWeight: 700, cursor: "pointer", fontSize: 13, padding: "6px 14px", borderRadius: 8 }}
                >
                  Register as new dealer →
                </button>
              </div>
            </div>
          )}

          {/* Dealer sub-choice */}
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
                  <div className="login-sub" style={{ marginBottom: 14, overflowWrap: 'break-word', wordBreak: 'break-all' }}>OTP sent to <b>{emailInput}</b></div>
                  <div className="otp-row">
                    {otpRefs.map((ref, i) => (
                      <input key={i} ref={ref} maxLength={1} className="otp-box"
                        onInput={e => handleOtpInput(e, i)} onKeyDown={e => handleOtpKeyDown(e, i)} />
                    ))}
                  </div>
                  {(localError || authError) && (
                    <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{localError || authError}</div>
                  )}
                  <button className="btn" onClick={verify} disabled={authBusy || localBusy}>
                    {authBusy ? "Verifying..." : localBusy ? "Setting up account..." : "Verify & Login"}
                  </button>
                  {resendCooldown > 0
                    ? <div className="resend" style={{ opacity: 0.5, cursor: "default" }}>Resend OTP in {resendCooldown}s</div>
                    : <div className="resend" onClick={goOtp}>Resend OTP</div>}
                </div>
              )}
            </>
          )}
    </>
  );

  return (
    <div className="login-root">
      <style>{`
        .login-root {
          min-height: 100vh;
          min-height: 100dvh;
          display: flex;
          background: #f5f5f7;
          font-family: 'Segoe UI', Arial, sans-serif;
          color: var(--text);
        }
        /* Mobile: gold border visual identity (no width constraint) */
        @media (max-width: 639px) {
          .login-root {
            border: 5px solid #E8A800;
            border-radius: 24px;
          }
        }
        /* Left brand panel — hidden on mobile, shown on desktop */
        .login-brand {
          display: none;
        }
        @media (min-width: 640px) {
          .login-brand {
            display: flex;
            flex: 1;
            background: linear-gradient(160deg, #7B2D8B, #3D0A2C);
            flex-direction: column;
            align-items: center;
            justify-content: center;
            padding: 60px 48px;
            color: #fff;
            text-align: center;
            min-height: 100vh;
            min-height: 100dvh;
          }
          .login-form-panel {
            width: 560px;
            flex-shrink: 0;
          }
        }
        .login-form-panel {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          padding: 40px 24px;
        }
        .login-card {
          background: #fff;
          border-radius: 16px;
          padding: 44px 36px;
          width: 100%;
          max-width: 480px;
          box-shadow: 0 4px 24px rgba(0,0,0,.08);
        }
        @media (max-width: 639px) {
          .login-card {
            box-shadow: 0 2px 12px rgba(0,0,0,.06);
            padding: 28px 22px;
          }
        }
        /* Card typography and form elements */
        .login-card .login-title { font-size: 34px; margin-bottom: 8px; }
        .login-card .login-sub   { font-size: 20px; margin-bottom: 30px; }
        .login-card input        { font-size: 17px; padding: 17px; margin-bottom: 16px; }
        .login-card .otp-row input { margin-bottom: 0; font-size: 22px; padding: 15px 0; }
        .login-card .btn         { font-size: 20px; padding: 18px; }
        .login-card .resend      { font-size: 15px; }
        /* Reuse existing shared styles for otp-row */
      `}</style>

      {/* ── Left brand panel (desktop only) ── */}
      <div className="login-brand">
        <img
          src="/assets/ELTOP%20LOGO.png"
          alt="Eltop by Embassy"
          style={{ height: 110, width: "auto", filter: "brightness(0) invert(1)", marginBottom: 24 }}
          onError={e => e.target.style.display = "none"}
        />
        <div style={{ fontSize: 42, fontWeight: 800, letterSpacing: 0.5, marginBottom: 10 }}>Eltop by Embassy</div>
        <div style={{ fontSize: 24, opacity: 0.8, marginBottom: 44, maxWidth: 360, lineHeight: 1.5 }}>
          Premium Fans · Geysers · Home Appliances
        </div>
        <img
          src="/assets/fan%20man%20eltop.png"
          alt="Eltop Fanman"
          style={{ height: 320, width: "auto" }}
          onError={e => e.target.style.display = "none"}
        />
      </div>

      {/* ── Right form panel ── */}
      <div className="login-form-panel">
        <div className="login-card">
          {/* Mobile: logo at top (fixed height = no CLS) */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <img
              src="/assets/ELTOP%20LOGO.png"
              alt="Eltop"
              style={{ height: 52, width: "auto", display: "inline-block" }}
              onError={e => e.target.style.display = "none"}
            />
          </div>
          <div className="login-title">{titleText}</div>
          <div className="login-sub">{subText}</div>
          <div style={{ marginTop: 20 }}>{formContent}</div>
        </div>
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
