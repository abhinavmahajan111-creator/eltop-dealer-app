import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function Login() {
  const navigate = useNavigate();
  const { sendOtp, verifyOtp, authBusy, authError } = useApp();
  const [step, setStep] = useState(1);
  const [emailInput, setEmailInput] = useState("");
  const otpRefs = [useRef(), useRef(), useRef(), useRef(), useRef(), useRef()];

  async function goOtp() {
    const e = emailInput.trim();
    const ok = await sendOtp(e);
    if (ok) setStep(2);
  }

  async function verify() {
    const otp = otpRefs.map((r) => r.current?.value || "").join("");
    const ok = await verifyOtp(otp);
    if (ok) navigate("/dashboard");
  }

  function handleOtpInput(e, i) {
    if (e.target.value && i < otpRefs.length - 1) {
      otpRefs[i + 1].current?.focus();
    }
  }

  return (
    <div className="screen" id="screen-login">
      <div className="content">
        <div className="login-logo">ET</div>
        <div className="login-title">Welcome, Dealer</div>
        <div className="login-sub">Login to manage your orders</div>

        {step === 1 && (
          <div>
            <input
              type="email"
              placeholder="Enter Email Address"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
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
                  onInput={(e) => handleOtpInput(e, i)}
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
      </div>
    </div>
  );
}
