import { useState } from "react";
import { isSupabaseConfigured, supabase } from "../lib/supabase";

const wrap = { minHeight: "100vh", background: "#f5f5f5", fontFamily: "inherit", padding: "0 0 40px" };
const card = { background: "#fff", borderRadius: 12, padding: "20px 22px", boxShadow: "0 2px 8px rgba(0,0,0,.06)", marginBottom: 14 };
const inp  = { width: "100%", boxSizing: "border-box", padding: "11px 14px", borderRadius: 8, border: "1.5px solid #ddd", fontSize: 14, fontFamily: "inherit", outline: "none" };
const btn  = { width: "100%", padding: "12px", borderRadius: 8, border: "none", background: "#7B2D8B", color: "#fff", fontWeight: 700, fontSize: 15, cursor: "pointer" };

export default function ContactSupport() {
  const [form, setForm]     = useState({ name: "", contact: "", payment_id: "", description: "" });
  const [busy, setBusy]     = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState("");

  const set = (k) => (e) => setForm(prev => ({ ...prev, [k]: e.target.value }));

  const handleSubmit = async () => {
    if (!form.contact.trim()) { setError("Please enter your phone number or email so we can reach you."); return; }
    if (!form.description.trim()) { setError("Please describe the issue."); return; }
    setError("");
    setBusy(true);

    if (isSupabaseConfigured) {
      const { error: dbErr } = await supabase.from("support_requests").insert([{
        name:        form.name.trim() || null,
        contact:     form.contact.trim(),
        payment_id:  form.payment_id.trim() || null,
        description: form.description.trim(),
      }]);

      if (dbErr) {
        console.error("[support] insert failed:", dbErr);
        setError("Could not submit your request. Please WhatsApp us at 9310159139 directly.");
        setBusy(false);
        return;
      }

      // Fire-and-forget notification to Sumaksh — requires send-support-notification edge function
      supabase.functions.invoke("send-support-notification", {
        body: {
          name:        form.name.trim() || "—",
          contact:     form.contact.trim(),
          payment_id:  form.payment_id.trim() || null,
          description: form.description.trim(),
        },
      }).catch(() => {/* notification is best-effort */});
    }

    setBusy(false);
    setDone(true);
  };

  const header = (
    <div style={{ background: "#7B2D8B", padding: "20px 24px", color: "#fff", marginBottom: 24 }}>
      <div style={{ maxWidth: 520, margin: "0 auto" }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Payment or Order Issue?</div>
        <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>Eltop by Embassy — we'll look into it and get back to you</div>
      </div>
    </div>
  );

  if (done) return (
    <div style={wrap}>
      {header}
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 16px" }}>
        <div style={{ ...card, textAlign: "center", padding: "40px 24px" }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>✅</div>
          <div style={{ fontWeight: 800, fontSize: 18, color: "#1e293b", marginBottom: 10 }}>We've received your report</div>
          <div style={{ fontSize: 14, color: "#64748b", lineHeight: 1.6, marginBottom: 24 }}>
            Our team will review it and reach out on the contact you provided. For urgent issues, WhatsApp us directly at{" "}
            <a href="https://wa.me/919310159139" target="_blank" rel="noreferrer" style={{ color: "#7B2D8B", fontWeight: 700, textDecoration: "none" }}>
              9310159139
            </a>.
          </div>
          <button style={{ ...btn, maxWidth: 240, margin: "0 auto" }} onClick={() => window.history.back()}>
            ← Go Back
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div style={wrap}>
      {header}
      <div style={{ maxWidth: 520, margin: "0 auto", padding: "0 16px" }}>
        <div style={card}>
          <div style={{ fontSize: 13, color: "#64748b", marginBottom: 20, lineHeight: 1.6 }}>
            If your payment was deducted but you didn't receive an order confirmation, or if you have any other order-related issue — fill in the form below. We check this daily.
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>
              Your Name <span style={{ color: "#94a3b8", fontWeight: 400 }}>(optional)</span>
            </label>
            <input style={inp} placeholder="e.g. Ravi Sharma" value={form.name} onChange={set("name")} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>
              Phone or Email <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <input style={inp} placeholder="10-digit mobile or email address" value={form.contact} onChange={set("contact")} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>
              Razorpay Payment ID / UPI Reference <span style={{ color: "#94a3b8", fontWeight: 400 }}>(if you have it)</span>
            </label>
            <input style={inp} placeholder="e.g. pay_TGoiPVAhKCvFJM or UPI ref" value={form.payment_id} onChange={set("payment_id")} />
            <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
              Found in your bank SMS, UPI app, or the Razorpay payment confirmation screen.
            </div>
          </div>

          <div style={{ marginBottom: 20 }}>
            <label style={{ fontSize: 12, fontWeight: 600, color: "#555", display: "block", marginBottom: 4 }}>
              Describe the issue <span style={{ color: "#dc2626" }}>*</span>
            </label>
            <textarea
              style={{ ...inp, resize: "vertical", minHeight: 100 }}
              placeholder="e.g. I paid ₹2,199 at 2:30pm, money was deducted, but I never received an order confirmation."
              value={form.description}
              onChange={set("description")}
            />
          </div>

          {error && <div style={{ fontSize: 13, color: "#dc2626", marginBottom: 14, lineHeight: 1.5 }}>{error}</div>}

          <button style={{ ...btn, opacity: busy ? 0.7 : 1 }} onClick={handleSubmit} disabled={busy}>
            {busy ? "Submitting…" : "Submit Report"}
          </button>

          <div style={{ marginTop: 16, fontSize: 12, color: "#94a3b8", textAlign: "center" }}>
            Or reach us directly:{" "}
            <a href="https://wa.me/919310159139" target="_blank" rel="noreferrer" style={{ color: "#7B2D8B", fontWeight: 600, textDecoration: "none" }}>
              WhatsApp 9310159139
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
