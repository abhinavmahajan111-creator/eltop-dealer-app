import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";

export default function Login() {
  const navigate = useNavigate();
  const { setMobile } = useApp();
  const [step, setStep] = useState(1);
  const [mobileInput, setMobileInput] = useState("");
  const otpRefs = [useRef(), useRef(), useRef(), useRef()];

  function goOtp() {
    const m = mobileInput || "9876543210";
    setMobile(m);
    setStep(2);
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
              type="tel"
              maxLength={10}
              placeholder="Enter Mobile Number"
              value={mobileInput}
              onChange={(e) => setMobileInput(e.target.value)}
            />
            <button className="btn" onClick={goOtp}>Send OTP</button>
          </div>
        )}

        {step === 2 && (
          <div>
            <div className="login-sub" style={{ marginBottom: 14 }}>
              OTP sent to <b>+91 {mobileInput || "9876543210"}</b>
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
            <button className="btn" onClick={() => navigate("/dashboard")}>
              Verify &amp; Login
            </button>
            <div className="resend">Resend OTP</div>
          </div>
        )}
      </div>
    </div>
  );
}
