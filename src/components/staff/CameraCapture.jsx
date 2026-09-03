import { useEffect, useRef, useState } from "react";
import { getCurrentPosition } from "../../utils/visitMedia";

// Live camera capture — no file input anywhere, so there's no "choose from
// gallery" fallback a rep could use to submit an old/fake photo. Every
// photo is captured straight from a live getUserMedia stream and has its
// geo-coordinates + timestamp burned directly onto the pixels before it's
// handed back, so the tag can't be stripped or edited out afterward.
//
// CameraPhotoSlot renders like the old PhotoSlot (a square preview box —
// tap to open the camera, shows the captured photo once done, tap again
// to retake) but the `file` prop/`onChange` callback now carry a Blob
// produced here instead of a File chosen from a picker.
//
// CameraVideoSlot is the equivalent for the short shop-interior video,
// using MediaRecorder instead of a canvas snapshot.

const MODAL_STYLE = {
  position: "fixed", inset: 0, background: "#000", zIndex: 100,
  display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
};

function CameraModal({ title, videoRef, error, hint, children, onClose }) {
  return (
    <div style={MODAL_STYLE}>
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 16px", color: "#fff", fontSize: 12.5, fontWeight: 700 }}>
        <span>{title}</span>
        <button onClick={onClose} style={{ background: "rgba(255,255,255,0.15)", border: "none", color: "#fff", borderRadius: "50%", width: 32, height: 32, fontSize: 16, cursor: "pointer" }}>✕</button>
      </div>
      {hint && (
        <div style={{ position: "absolute", top: 54, left: 0, right: 0, textAlign: "center", color: "#fff", fontSize: 11, opacity: 0.8 }}>{hint}</div>
      )}
      <video ref={videoRef} autoPlay playsInline muted style={{ width: "100%", maxHeight: "70vh", objectFit: "cover", background: "#111" }} />
      <div style={{ position: "absolute", bottom: 26, left: 0, right: 0, display: "flex", justifyContent: "center", gap: 16 }}>
        {children}
      </div>
      {error && (
        <div style={{ position: "absolute", bottom: 100, left: 20, right: 20, background: "rgba(214,69,69,0.9)", color: "#fff", fontSize: 12, fontWeight: 700, padding: "10px 14px", borderRadius: 10, textAlign: "center" }}>
          {error}
        </div>
      )}
    </div>
  );
}

function useCameraStream(open, wantsAudio) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setError(null);
    navigator.mediaDevices
      ?.getUserMedia({ video: { facingMode: { ideal: "environment" } }, audio: !!wantsAudio })
      .then((stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) videoRef.current.srcObject = stream;
      })
      .catch((err) => {
        if (!cancelled) setError("Could not access the camera (" + err.message + "). Camera permission is required — there's no gallery fallback.");
      });
    return () => {
      cancelled = true;
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  }, [open, wantsAudio]);

  return { videoRef, streamRef, error };
}

function drawGeotagBar(ctx, width, height, { coordsText, timestamp }) {
  const barHeight = Math.max(40, Math.round(height * 0.09));
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, height - barHeight, width, barHeight);
  const pad = Math.round(barHeight * 0.18);
  const line1 = Math.max(11, Math.round(barHeight * 0.32));
  const line2 = Math.max(9, Math.round(barHeight * 0.24));
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "top";
  ctx.font = `700 ${line1}px Arial, sans-serif`;
  ctx.fillText(coordsText, pad, height - barHeight + pad);
  ctx.font = `400 ${line2}px Arial, sans-serif`;
  ctx.fillText(timestamp, pad, height - barHeight + pad + line1 + 4);
}

function geotagLabel(coords) {
  const timestamp = new Date().toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const coordsText = coords ? `${coords.latitude.toFixed(6)}, ${coords.longitude.toFixed(6)}` : "Location unavailable";
  return { coordsText, timestamp };
}

export function CameraPhotoSlot({ label, file, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState(null);
  const [locating, setLocating] = useState(false);
  const { videoRef, error } = useCameraStream(open, false);
  const previewUrl = file ? URL.createObjectURL(file) : null;

  const handleOpen = () => {
    if (disabled) return;
    setCoords(null);
    setLocating(true);
    getCurrentPosition().then(setCoords).catch(() => setCoords(null)).finally(() => setLocating(false));
    setOpen(true);
  };

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video) return;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    drawGeotagBar(ctx, canvas.width, canvas.height, geotagLabel(coords));
    canvas.toBlob((blob) => { if (blob) onChange(blob); }, "image/jpeg", 0.86);
    setOpen(false);
  };

  return (
    <div style={{ textAlign: "center" }}>
      <div
        onClick={handleOpen}
        style={{
          width: "100%", aspectRatio: "1", borderRadius: 10, overflow: "hidden",
          border: file ? "2px solid #2fa84f" : "1.5px dashed #ccc",
          background: file ? "#000" : "#fafafa",
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: disabled ? "default" : "pointer", position: "relative",
        }}
      >
        {previewUrl ? (
          <img src={previewUrl} alt={label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        ) : (
          <span style={{ fontSize: 22, color: "#bbb" }}>📷</span>
        )}
        {file && (
          <span style={{ position: "absolute", top: 4, right: 4, background: "#2fa84f", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>
        )}
      </div>
      <div style={{ fontSize: 10.5, fontWeight: 700, color: "#666", marginTop: 5 }}>{label}</div>

      {open && (
        <CameraModal
          title="Take photo"
          videoRef={videoRef}
          error={error}
          hint={locating ? "📍 Getting your location…" : coords ? "📍 Location locked" : "📍 Location unavailable"}
          onClose={() => setOpen(false)}
        >
          <button
            onClick={handleCapture}
            style={{ width: 66, height: 66, borderRadius: "50%", background: "#fff", border: "4px solid rgba(255,255,255,0.4)", cursor: "pointer" }}
          />
        </CameraModal>
      )}
    </div>
  );
}

// Hard cap on the shop-interior video — recording auto-stops at this many
// seconds, so there's no way to submit a long clip (previously this was
// only a soft, after-the-fact warning; now it's enforced live).
const MAX_VIDEO_SECONDS = 5;

export function CameraVideoSlot({ label = "Record 5s video of shop interior", file, onChange, disabled }) {
  const [open, setOpen] = useState(false);
  const [recording, setRecording] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(MAX_VIDEO_SECONDS);
  const { videoRef, streamRef, error } = useCameraStream(open, true);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);
  const stopTimeoutRef = useRef(null);
  const tickIntervalRef = useRef(null);

  const clearTimers = () => {
    if (stopTimeoutRef.current) { clearTimeout(stopTimeoutRef.current); stopTimeoutRef.current = null; }
    if (tickIntervalRef.current) { clearInterval(tickIntervalRef.current); tickIntervalRef.current = null; }
  };

  // Timers are tied to the camera modal's lifetime, not the component's —
  // clear them whenever the modal closes for any reason (stop button,
  // auto-stop, or the ✕ close button), so a reopened modal always starts
  // its own fresh 5s window.
  useEffect(() => {
    if (!open) clearTimers();
    return () => { if (!open) clearTimers(); };
  }, [open]);

  const handleOpen = () => {
    if (disabled) return;
    setSecondsLeft(MAX_VIDEO_SECONDS);
    setOpen(true);
  };

  const startRecording = () => {
    if (!streamRef.current) return;
    chunksRef.current = [];
    const recorder = new MediaRecorder(streamRef.current);
    recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
    recorder.onstop = () => {
      clearTimers();
      const blob = new Blob(chunksRef.current, { type: "video/webm" });
      onChange(blob);
      setOpen(false);
      setRecording(false);
    };
    recorder.start();
    recorderRef.current = recorder;
    setRecording(true);
    setSecondsLeft(MAX_VIDEO_SECONDS);

    tickIntervalRef.current = setInterval(() => {
      setSecondsLeft((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    stopTimeoutRef.current = setTimeout(() => {
      stopRecording();
    }, MAX_VIDEO_SECONDS * 1000);
  };

  const stopRecording = () => {
    clearTimers();
    if (recorderRef.current && recorderRef.current.state !== "inactive") recorderRef.current.stop();
  };

  return (
    <div>
      <div
        onClick={handleOpen}
        style={{
          display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
          border: file ? "2px solid #2fa84f" : "1.5px dashed #ccc", borderRadius: 8,
          padding: "10px", fontSize: 12.5, fontWeight: 700, color: file ? "#2fa84f" : "#888",
          cursor: disabled ? "default" : "pointer",
        }}
      >
        {file ? "✓ Video captured" : `🎥 ${label}`}
      </div>

      {open && (
        <CameraModal
          title="Record video"
          videoRef={videoRef}
          error={error}
          hint={recording ? `⏺ Recording — stops automatically in ${secondsLeft}s` : `Max ${MAX_VIDEO_SECONDS}s — recording stops automatically`}
          onClose={() => { stopRecording(); setOpen(false); }}
        >
          {!recording ? (
            <button
              onClick={startRecording}
              style={{ width: 66, height: 66, borderRadius: "50%", background: "#e23c3c", border: "4px solid rgba(255,255,255,0.4)", cursor: "pointer" }}
            />
          ) : (
            <button
              onClick={stopRecording}
              style={{ width: 66, height: 66, borderRadius: 14, background: "#e23c3c", border: "4px solid rgba(255,255,255,0.4)", cursor: "pointer" }}
            />
          )}
        </CameraModal>
      )}
    </div>
  );
}
