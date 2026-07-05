import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function Login() {
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, authBusy, authError } = useApp();
  const [role, setRole]             = useState("Guest");
  const [showFanmanModal, setShowFanmanModal] = useState(false);
  const [step, setStep]             = useState(1);
  const [emailInput, setEmailInput] = useState("");
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

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
                <div className="resend" onClick={goOtp}>Resend OTP</div>
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
              <a href="/assets/fan%20man%20eltop.png" download="Eltop-Fanman.png" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, background: '#7B2D8B', color: 'white', textDecoration: 'none', fontWeight: 'bold', fontSize: 14 }}>⬇️ Download</a>
              <a href={`https://wa.me/?text=${encodeURIComponent('Hey! Check out Eltop Fanman - our brand mascot! 🎉 ' + window.location.origin + '/assets/fan%20man%20eltop.png')}`} target="_blank" rel="noreferrer" style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, background: '#25D366', color: 'white', textDecoration: 'none', fontWeight: 'bold', fontSize: 14 }}>📱 Share on WhatsApp</a>
              <button onClick={async () => { if (navigator.share) { await navigator.share({ title: 'Eltop Fanman', text: 'Hey I am Eltop Fanman! 🎉', url: window.location.origin + '/assets/fan%20man%20eltop.png' }); } else { navigator.clipboard.writeText(window.location.origin + '/assets/fan%20man%20eltop.png'); alert('Link copied!'); } }} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 8, background: '#FF0000', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}>🔗 Share Link</button>
              <button onClick={() => setShowFanmanModal(false)} style={{ padding: '10px 20px', borderRadius: 8, background: '#333', color: 'white', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: 14 }}>✕ Close</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
