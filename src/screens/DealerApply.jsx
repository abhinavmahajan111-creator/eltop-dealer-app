import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useApp } from "../context/AppContext";
import { supabase } from "../lib/supabase";
import { CameraPhotoSlot, CameraVideoSlot } from "../components/staff/CameraCapture";
import {
  DEALER_DOC_FIELDS,
  DEALER_DOC_FIELD_GST,
  uploadDealerMedia,
  uploadDealerDocument,
  getDealerDocumentUrl,
} from "../utils/dealerDocuments";

// Plain file-picker tile for identity documents (Aadhaar / PAN / GST
// certificate) — unlike the photo/video tiles below, these are scanned
// copies of existing paper documents, not something to capture live, so
// there's no camera/geotag flow here, just an upload + a "tap to view"
// state once one is on file.
function DocumentTile({ label, hasFile, uploading, onPick, onView }) {
  const ref = useRef();
  return (
    <div style={{ textAlign: "center" }}>
      <div
        onClick={() => { if (uploading) return; if (hasFile) onView(); else ref.current?.click(); }}
        style={{
          width: "100%", aspectRatio: "1", borderRadius: 10, overflow: "hidden",
          border: hasFile ? "2px solid #2fa84f" : "1.5px dashed #ccc",
          background: hasFile ? "#eafaf0" : "#fafafa",
          display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
          cursor: "pointer", position: "relative", padding: 6,
        }}
      >
        <span style={{ fontSize: 22 }}>{uploading ? "⏳" : hasFile ? "📄" : "📎"}</span>
        {hasFile && !uploading && (
          <span style={{ fontSize: 9.5, color: "#2fa84f", fontWeight: 700, textAlign: "center" }}>Uploaded — tap to view</span>
        )}
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#666", marginTop: 5 }}>{label}</div>
      <input
        ref={ref} type="file" accept="image/*,application/pdf" style={{ display: "none" }}
        onChange={(e) => { const f = e.target.files[0]; e.target.value = ""; if (f) onPick(f); }}
      />
    </div>
  );
}

export default function DealerApply() {
  const navigate = useNavigate();
  const { session, dealer, isDealer, dealerApplicationStatus, profileLoaded, refreshProfile } = useApp();

  const [busy, setBusy] = useState({});      // { [fieldKey]: true } while that tile is uploading
  const [regType, setRegType] = useState(dealer?.registration_type === "Registered" ? "Registered" : "Unregistered");
  const [gstin, setGstin] = useState(dealer?.gstin || "");
  const [savingGstin, setSavingGstin] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Once the profile has loaded, redirect away if this account has
  // nothing to apply for (already approved / not actually a dealer) —
  // mirrors the same guard pattern DealerRoute/DealerProfileRoute use.
  useEffect(() => {
    if (!profileLoaded) return;
    if (!isDealer) { navigate("/store", { replace: true }); return; }
    if (dealerApplicationStatus === "approved" || dealerApplicationStatus === "none") {
      navigate("/store", { replace: true });
    }
  }, [profileLoaded, isDealer, dealerApplicationStatus, navigate]);

  useEffect(() => {
    setRegType(dealer?.registration_type === "Registered" ? "Registered" : "Unregistered");
    setGstin(dealer?.gstin || "");
  }, [dealer?.registration_type, dealer?.gstin]);

  if (!session) return null;

  const dealerId = session.user.id;
  const fields = regType === "Registered" ? [...DEALER_DOC_FIELDS, DEALER_DOC_FIELD_GST] : DEALER_DOC_FIELDS;

  async function saveField(field, value) {
    const { error: rpcError } = await supabase.rpc("update_my_dealer_field", { p_field: field, p_value: value });
    if (rpcError) throw rpcError;
  }

  async function handleRegTypeChange(next) {
    setRegType(next);
    setError("");
    try {
      await saveField("registration_type", next);
      await refreshProfile();
    } catch (e) {
      setError("Couldn't save registration type: " + e.message);
    }
  }

  async function handleGstinBlur() {
    if (gstin === (dealer?.gstin || "")) return;
    setSavingGstin(true);
    setError("");
    try {
      await saveField("gstin", gstin);
      await refreshProfile();
    } catch (e) {
      setError("Couldn't save GSTIN: " + e.message);
    }
    setSavingGstin(false);
  }

  async function handleMediaCapture(key, blob) {
    setBusy((p) => ({ ...p, [key]: true }));
    setError("");
    try {
      const url = await uploadDealerMedia(dealerId, key, blob);
      await saveField(key, url);
      await refreshProfile();
    } catch (e) {
      setError(`Upload failed (${key}): ` + e.message);
    }
    setBusy((p) => ({ ...p, [key]: false }));
  }

  async function handleDocumentPick(key, file) {
    setBusy((p) => ({ ...p, [key]: true }));
    setError("");
    try {
      const path = await uploadDealerDocument(dealerId, key, file);
      await saveField(key, path);
      await refreshProfile();
    } catch (e) {
      setError(`Upload failed (${key}): ` + e.message);
    }
    setBusy((p) => ({ ...p, [key]: false }));
  }

  async function handleDocumentView(key) {
    try {
      const url = await getDealerDocumentUrl(dealer?.[key]);
      if (url) window.open(url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setError("Couldn't open document: " + e.message);
    }
  }

  const missing = fields.filter((f) => !dealer?.[f.key]).map((f) => f.label);
  if (regType === "Registered" && !(gstin || "").trim()) missing.push("GSTIN");
  const complete = missing.length === 0;

  async function handleSubmit() {
    setSubmitting(true);
    setError("");
    try {
      const { error: rpcError } = await supabase.rpc("submit_dealer_application");
      if (rpcError) throw rpcError;
      await refreshProfile();
      setSubmitted(true);
    } catch (e) {
      setError(e.message || "Couldn't submit your application — please try again.");
    }
    setSubmitting(false);
  }

  if (submitted) {
    return (
      <div className="screen" id="screen-dealer-apply">
        <div className="topbar">
          <span className="back" onClick={() => navigate("/store")}>&#8592;</span>
          <h1>Application Submitted</h1>
        </div>
        <div className="content" style={{ textAlign: "center", paddingTop: 40 }}>
          <div style={{ fontSize: 48, marginBottom: 12 }}>✅</div>
          <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 8 }}>Documents submitted!</div>
          <div style={{ fontSize: 13, color: "#666", marginBottom: 24, lineHeight: 1.5 }}>
            Our team will review your application within 24–48 hours. You'll see dealer pricing unlock automatically once approved — or contact your sales person if you need help sooner.
          </div>
          <button className="btn" onClick={() => navigate("/store")}>Back to Store</button>
        </div>
      </div>
    );
  }

  return (
    <div className="screen" id="screen-dealer-apply">
      <div className="topbar">
        <span className="back" onClick={() => navigate("/store")}>&#8592;</span>
        <h1>Complete Your Application</h1>
      </div>

      <div className="content">
        <div style={{ fontSize: 12.5, color: "#666", marginBottom: 16, lineHeight: 1.5 }}>
          Upload these documents so our team can verify your shop and unlock dealer pricing. Photos and videos are captured live from your camera — no gallery uploads — so please have your shop, owner, and staff ready.
        </div>

        {error && (
          <div style={{ background: "#fee2e2", color: "#991b1b", border: "1.5px solid #fca5a5", borderRadius: 8, padding: "9px 12px", fontSize: 12, fontWeight: 600, marginBottom: 14 }}>
            {error}
          </div>
        )}

        <div className="list-card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 10 }}>
            Shop Registration Type
          </div>
          <div style={{ display: "flex", gap: 8, marginBottom: regType === "Registered" ? 12 : 0 }}>
            {["Unregistered", "Registered"].map((opt) => (
              <button
                key={opt}
                onClick={() => handleRegTypeChange(opt)}
                style={{
                  flex: 1, padding: "8px 10px", borderRadius: 8, fontSize: 12.5, fontWeight: 700,
                  cursor: "pointer",
                  border: regType === opt ? "2px solid var(--purple, #7B2D8B)" : "1.5px solid #ddd",
                  background: regType === opt ? "var(--purple-tint, #f3e4f5)" : "#fff",
                  color: regType === opt ? "var(--purple, #7B2D8B)" : "#666",
                }}
              >
                {opt}
              </button>
            ))}
          </div>
          {regType === "Registered" && (
            <div>
              <input
                value={gstin}
                onChange={(e) => setGstin(e.target.value.toUpperCase())}
                onBlur={handleGstinBlur}
                placeholder="Enter GSTIN"
                style={{ width: "100%", marginBottom: 0 }}
              />
              {savingGstin && <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4 }}>Saving…</div>}
            </div>
          )}
        </div>

        <div className="list-card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
            Identity Documents
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {fields.filter((f) => f.kind === "document").map((f) => (
              <DocumentTile
                key={f.key}
                label={f.label}
                hasFile={Boolean(dealer?.[f.key])}
                uploading={Boolean(busy[f.key])}
                onPick={(file) => handleDocumentPick(f.key, file)}
                onView={() => handleDocumentView(f.key)}
              />
            ))}
          </div>
        </div>

        <div className="list-card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
            Photos
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12 }}>
            {fields.filter((f) => f.kind === "photo").map((f) => (
              <div key={f.key} style={{ position: "relative" }}>
                {/* file is always null here — CameraPhotoSlot's own preview needs a
                    real Blob (it calls URL.createObjectURL on it), and the uploaded
                    blob is discarded right after upload. Already-uploaded state and
                    the busy spinner are drawn as overlays instead, on top of the
                    slot's own (otherwise-empty) tile. */}
                <CameraPhotoSlot
                  label={f.label}
                  file={null}
                  disabled={Boolean(busy[f.key])}
                  onChange={(blob) => handleMediaCapture(f.key, blob)}
                />
                {dealer?.[f.key] && !busy[f.key] && (
                  <img src={dealer[f.key]} alt={f.label} style={{ position: "absolute", inset: 0, width: "100%", aspectRatio: "1", objectFit: "cover", borderRadius: 10, pointerEvents: "none" }} />
                )}
                {dealer?.[f.key] && !busy[f.key] && (
                  <span style={{ position: "absolute", top: 4, right: 4, background: "#2fa84f", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
                )}
                {busy[f.key] && (
                  <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(255,255,255,.7)", borderRadius: 10, fontSize: 20 }}>⏳</div>
                )}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 10 }}>Tap a tile to open the camera. Tap again to retake.</div>
        </div>

        <div className="list-card" style={{ padding: 14, marginBottom: 16 }}>
          <div style={{ fontSize: 11, color: "var(--muted)", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.5px", marginBottom: 12 }}>
            Videos
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {fields.filter((f) => f.kind === "video").map((f) => (
              <CameraVideoSlot
                key={f.key}
                label={f.label}
                maxSeconds={f.maxSeconds}
                file={dealer?.[f.key] ? "done" : (busy[f.key] ? "uploading" : null)}
                disabled={Boolean(busy[f.key])}
                onChange={(blob) => handleMediaCapture(f.key, blob)}
              />
            ))}
          </div>
        </div>

        {!complete && (
          <div style={{ fontSize: 12, color: "#92400E", background: "#FEF3C7", border: "1.5px solid #F59E0B", borderRadius: 8, padding: "9px 12px", marginBottom: 14, fontWeight: 600 }}>
            Still needed: {missing.join(", ")}
          </div>
        )}

        <button className="btn" disabled={!complete || submitting} onClick={handleSubmit} style={{ opacity: !complete || submitting ? 0.6 : 1 }}>
          {submitting ? "Submitting…" : "Submit for Review"}
        </button>
      </div>
    </div>
  );
}
