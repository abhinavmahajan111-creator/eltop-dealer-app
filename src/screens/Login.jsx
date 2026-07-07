import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function Login() {
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, authBusy, authError, deactivatedAccount, clearDeactivated } = useApp();
  const [role, setRole]             = useState("Guest");
  const [showFanmanModal, setShowFanmanModal] = useState(false);
  const [step, setStep]             = useState(1);
  const [emailInput, setEmailInput] = useState("");
  const [resendCooldown, setResendCooldown] = useState(0);
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

  const isGuest = role === "Guest";

  function handleRoleChange(e) {
    setRole(e.target.value);
    setStep(1);
    setEmailInput("");
    otpRefs.forEach(r => { if (r.current) r.current.value = ""; });
  }

  async function goOtp() {
    const ok = await sendOtp(emailInput.trim());
    if (ok) setStep(2);
    startCooldown(60);
  }

  async function verify() {
    const otp = otpRefs.map(r => r.current?.value || "").join("");
    const ok  = await verifyOtp(otp);
    if (ok) navigate(role === "Administrator" ? "/admin" : "/dashboard");
  }

  function handleOtpInput(e, i) {
    if (e.target.value && i < otpRefs.length - 1) otpRefs[i + 1].current?.focus();
  }

  return (
    <div className="screen" id="screen-login">
      <div className="content">
        <div className="login-logo">ET</div>
        <div className="login-title">Welcome, Dealer</div>
        <div className="login-sub">Login to manage your orders</div>

        {deactivatedAccount && (
          <div style={{ background: '#fdecea', border: '1px solid #e74c3c', borderRadius: 12, padding: '16px 18px', marginBottom: 20, fontSize: 14, color: '#7b241c', lineHeight: 1.5 }}>
            <div style={{ fontWeight: 800, marginBottom: 6 }}>Account Deactivated</div>
            Your dealer account is currently deactivated. We've notified the admin to review restoring your access. Please check back later.
            <div style={{ marginTop: 10 }}>
              <button onClick={clearDeactivated} style={{ background: 'none', border: 'none', color: '#e74c3c', fontWeight: 700, cursor: 'pointer', fontSize: 13, padding: 0, textDecoration: 'underline' }}>
                Try a different account
              </button>
            </div>
          </div>
        )}

        <select
          value={role}
          onChange={handleRoleChange}
          style={{
            width: "100%", boxSizing: "border-box",
            padding: "10px 12px", marginBottom: 16,
            border: "1.5px solid #ddd", borderRadius: 10,
            fontSize: 14, fontFamily: "inherit",
            background: "#fff", color: "#111",
            appearance: "auto",
          }}
        >
          <option value="Guest">Guest</option>
          <option value="Channel Partner">Channel Partner</option>
          <option value="Sales Executive">Sales Executive</option>
          <option value="Logistics & Dispatch">Logistics &amp; Dispatch</option>
          <option value="Administrator">Administrator</option>
          <option value="Back Office">Back Office</option>
        </select>

        {isGuest ? (
          <>
            <button className="btn" onClick={() => navigate("/store")}>
              Continue to Store →
            </button>
            <img
              src="/assets/fan%20man%20eltop.png"
              alt="Fanman"
              style={{ display: 'block', margin: '20px auto 0 auto', height: 150, width: 'auto', cursor: 'pointer', transition: 'transform 0.2s' }}
              onClick={() => setShowFanmanModal(true)}
              onMouseEnter={e => { e.target.style.transform = 'scale(1.05)'; }}
              onMouseLeave={e => { e.target.style.transform = 'scale(1)'; }}
              onError={e => { e.target.style.display = 'none'; }}
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
                  onChange={e => setEmailInput(e.target.value)}
                />
                {authError && (
                  <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{authError}</div>
                )}
                <button className="btn" onClick={goOtp} disabled={authBusy || !emailInput.trim()}>
                  {authBusy ? "Sending..." : "Send OTP"}
                </button>
              </div>
            )}

            {step === 2 && (
              <div>
                <div className="login-sub" style={{ marginBottom: 14 }}>
                  OTP sent to <b>{emailInput}</b>
                </div>
                <div className="otp-row">
                  {otpRefs.map((ref, i) => (
                    <input
                      key={i}
                      ref={ref}
                      maxLength={1}
                      className="otp-box"
                      onInput={e => handleOtpInput(e, i)}
                    />
                  ))}
                </div>
                {authError && (
                  <div style={{ color: "var(--red)", fontSize: 12, marginBottom: 10 }}>{authError}</div>
                )}
                <button className="btn" onClick={verify} disabled={authBusy}>
                  {authBusy ? "Verifying..." : "Verify & Login"}
                </button>
                {resendCooldown > 0
                  ? <div className="resend" style={{ opacity: 0.5, cursor: 'default' }}>Resend OTP in {resendCooldown}s</div>
                  : <div className="resend" onClick={goOtp}>Resend OTP</div>
                }
              </div>
            )}
          </>
        )}
      </div>

      {/* Fanman Modal */}
      {showFanmanModal && (
        <div onClick={() => setShowFanmanModal(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 9999 }}>
          <div onClick={e => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            <img src="/assets/fan%20man%20eltop.png" alt="Eltop Fanman" style={{ height: '70vh', maxHeight: 500, width: 'auto', objectFit: 'contain' }} />
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', justifyContent: 'center' }}>
              <a href="/assets/fan%20man%20eltop.png" download="Eltop-Fanman.png" title="Download" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: '#7B2D8B', color: 'white', textDecoration: 'none', fontSize: 22 }}>⬇️</a>
              <button title="Share" onClick={async () => { if (navigator.share) { await navigator.share({ title: 'Hey I am Eltop Fanman! 🎉', text: 'Check out Eltop Fanman - brand mascot of Eltop by Embassy!', url: window.location.origin + '/store' }); } else { navigator.clipboard.writeText(window.location.origin + '/store'); alert('Link copied!'); } }} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: '#FF0000', color: 'white', border: 'none', cursor: 'pointer', fontSize: 22 }}>🔗</button>
              <button title="Close" onClick={() => setShowFanmanModal(false)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 48, height: 48, borderRadius: '50%', background: '#333', color: 'white', border: 'none', cursor: 'pointer', fontSize: 22 }}>✕</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
