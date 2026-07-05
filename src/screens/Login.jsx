import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function Login() {
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, authBusy, authError } = useApp();
  const [role, setRole]             = useState("Guest");
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
          <button className="btn" onClick={() => navigate("/store")}>
            Continue to Store →
          </button>
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
      <img
        src="/assets/fan%20man%20eltop.png"
        alt="Fanman"
        style={{ position: 'absolute', bottom: 60, right: -20, height: 120, width: 'auto', zIndex: 10, pointerEvents: 'none' }}
        onError={e => { e.target.style.display = 'none'; }}
      />
    </div>
  );
}
