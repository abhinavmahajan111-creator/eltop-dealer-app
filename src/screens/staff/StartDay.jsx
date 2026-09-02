import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { isSupabaseConfigured, supabase } from "../../lib/supabase";
import { getCurrentPosition, tagPhoto, uploadVisitMedia } from "../../utils/visitMedia";
import PhotoSlot from "../../components/staff/PhotoSlot";

// "Start Day" — separate from checking in at a shop. A rep can start their
// day anywhere (no geofence): home, office, on the road. The only
// requirement is a photo of their bike/vehicle's meter (odometer) reading.
// Once the day is started, they're free to go check in at their first shop.
// One start per (IST) calendar day — see supabase/migrations/
// sales_start_day.sql. If today's day is already started, this screen
// just forwards straight to Check In.

export default function StartDay() {
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [meterFile, setMeterFile] = useState(null);
  const [starting, setStarting] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (!isSupabaseConfigured) { setChecking(false); return; }
    let cancelled = false;
    supabase.rpc("get_my_day_start").then(({ data, error }) => {
      if (cancelled) return;
      const row = Array.isArray(data) ? data[0] : data;
      if (!error && row) {
        // Already started today — nothing to do here, move on to Check In.
        navigate("/staff/sales/check-in", { replace: true });
        return;
      }
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, [navigate]);

  const handleStartDay = async () => {
    setStatus(null);
    if (!meterFile) {
      setStatus({ type: "error", message: "Take a photo of your bike/vehicle meter reading first." });
      return;
    }
    setStarting(true);
    try {
      const pos = await getCurrentPosition();
      const tagged = await tagPhoto(meterFile, { latitude: pos.latitude, longitude: pos.longitude, label: "Day Start" });
      const url = await uploadVisitMedia(tagged, { folder: "day-start", kind: "meter" });
      const { data, error } = await supabase.rpc("start_day", {
        p_latitude: pos.latitude,
        p_longitude: pos.longitude,
        p_meter_photo_url: url,
      });
      const result = Array.isArray(data) ? data[0] : data;
      if (error || !result?.success) {
        setStatus({ type: "error", message: error?.message || result?.message || "Couldn't start your day." });
        setStarting(false);
      } else {
        navigate("/staff/sales/check-in");
      }
    } catch (err) {
      setStatus({ type: "error", message: err.message || "Couldn't start your day." });
      setStarting(false);
    }
  };

  if (checking) {
    return (
      <div style={{ minHeight: "100vh", background: "#f5f5f7", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Segoe UI', Arial, sans-serif", color: "#999" }}>
        Loading…
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", background: "#f5f5f7", fontFamily: "'Segoe UI', Arial, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, #7B2D8B 0%, #a13ea9 100%)", padding: "18px 24px 34px", color: "#fff" }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: "none", border: "none", color: "#fff", opacity: 0.9, fontWeight: 700, fontSize: 13, cursor: "pointer", padding: 0, marginBottom: 12 }}
        >
          ← Back
        </button>
        <div style={{ fontSize: 20, fontWeight: 800 }}>🛵 Start Day</div>
        <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 2 }}>
          You can start your day from anywhere — just snap your bike/vehicle's meter reading.
        </div>
      </div>

      <div style={{ maxWidth: 560, margin: "-18px auto 0", padding: "0 20px 60px", position: "relative", zIndex: 2 }}>
        <div style={{ background: "#fff", borderRadius: 14, boxShadow: "0 2px 10px rgba(0,0,0,0.05)", padding: "20px 18px" }}>
          <div style={{ fontSize: 11.5, color: "#999", marginBottom: 14, lineHeight: 1.5 }}>
            This confirms you're on duty for the day. No location restriction here — check-in at shops is geofenced separately.
          </div>

          <div style={{ maxWidth: 140, margin: "0 auto 18px" }}>
            <PhotoSlot label="Meter reading" file={meterFile} onChange={setMeterFile} disabled={starting} />
          </div>

          <button
            onClick={handleStartDay}
            disabled={starting}
            style={{
              width: "100%", padding: "12px", border: "none", borderRadius: 10,
              background: starting ? "#c9a8d1" : "#7B2D8B", color: "#fff", fontSize: 14, fontWeight: 700,
              cursor: starting ? "default" : "pointer",
            }}
          >
            {starting ? "Starting your day…" : "🛵 Confirm Start Day"}
          </button>
          {status && (
            <div style={{ marginTop: 10, fontSize: 12, fontWeight: 600, color: status.type === "success" ? "#2fa84f" : "#d64545" }}>
              {status.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
