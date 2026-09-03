import { useEffect, useState } from "react";
import { getCurrentPosition } from "../../utils/visitMedia";

// Proactively surfaces the device's location-permission state above the
// check-in/check-out flow, instead of only finding out via a failed
// "permission denied" error after tapping Check In. Browsers show the
// native OS/browser permission dialog at most once per site (on the first
// geolocation call made inside a real user gesture) — so:
//   - permission not yet decided ("prompt") → show a button; tapping it
//     calls getCurrentPosition() from a click handler, which is what
//     actually triggers that native dialog.
//   - permission already denied → no JS API can re-open that dialog, the
//     rep has to flip it in their browser/OS settings, so we spell out
//     exactly how and offer a "Retry" once they're back.
// Renders nothing once permission is granted (or while first checking).

function checkStatus(setStatus) {
  if (!navigator.geolocation) {
    setStatus("unsupported");
    return;
  }
  if (!navigator.permissions || !navigator.permissions.query) {
    // Permissions API isn't available (older Safari) — we can't know the
    // state ahead of time, so just offer the "Enable" button; the actual
    // getCurrentPosition() call will sort it out either way.
    setStatus("prompt");
    return;
  }
  navigator.permissions
    .query({ name: "geolocation" })
    .then((result) => {
      setStatus(result.state); // "granted" | "denied" | "prompt"
      result.onchange = () => setStatus(result.state);
    })
    .catch(() => setStatus("prompt"));
}

export default function LocationPermissionBanner() {
  const [status, setStatus] = useState("checking");
  const [requesting, setRequesting] = useState(false);

  useEffect(() => {
    checkStatus(setStatus);
  }, []);

  if (status === "checking" || status === "granted") return null;

  const handleEnable = () => {
    setRequesting(true);
    getCurrentPosition()
      .catch(() => {})
      .finally(() => {
        setRequesting(false);
        checkStatus(setStatus);
      });
  };

  if (status === "denied") {
    return (
      <div style={{ background: "#fdeceb", border: "1.5px solid #e8b4ae", borderRadius: 10, padding: "12px 14px", marginBottom: 14 }}>
        <div style={{ fontSize: 12.5, fontWeight: 800, color: "#c0392b", marginBottom: 6 }}>📍 Location access is off for this site</div>
        <div style={{ fontSize: 11.5, color: "#8a4a44", lineHeight: 1.6, marginBottom: 10 }}>
          Your browser only asks once, and it was declined — so check-in can't confirm you're at the dealer. To fix it:
          <br />• iPhone: Settings → Privacy &amp; Security → Location Services → Safari Websites → Allow. Or tap "aA" in the address bar → Website Settings → Location → Allow.
          <br />• Android Chrome: tap the 🔒 icon next to the address bar → Permissions → Location → Allow.
        </div>
        <button
          onClick={handleEnable}
          disabled={requesting}
          style={{ padding: "8px 14px", border: "1.5px solid #c0392b", borderRadius: 8, background: "#fff", color: "#c0392b", fontSize: 12, fontWeight: 800, cursor: requesting ? "default" : "pointer" }}
        >
          {requesting ? "Checking…" : "I've turned it on — Retry"}
        </button>
      </div>
    );
  }

  // "prompt" or "unsupported" — worth a try either way, since a browser
  // that lacks the Permissions API may still support geolocation fine.
  return (
    <div style={{ background: "#f8f0f9", border: "1.5px solid #d9b8e0", borderRadius: 10, padding: "12px 14px", marginBottom: 14, display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
      <div style={{ flex: 1, minWidth: 180, fontSize: 11.5, color: "#7B2D8B", fontWeight: 600, lineHeight: 1.5 }}>
        📍 We need your location to check you in at a dealer.
      </div>
      <button
        onClick={handleEnable}
        disabled={requesting}
        style={{ padding: "9px 14px", border: "none", borderRadius: 8, background: "#7B2D8B", color: "#fff", fontSize: 12, fontWeight: 800, cursor: requesting ? "default" : "pointer", flexShrink: 0 }}
      >
        {requesting ? "Requesting…" : "Enable Location Access"}
      </button>
    </div>
  );
}
