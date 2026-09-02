import { useRef } from "react";

// A single required-photo capture slot: shows a thumbnail once chosen, a
// ✓ once done. Uses the native camera via capture="environment" — far
// more reliable across mobile browsers than a custom getUserMedia
// pipeline. Shared between the dealer detail check-in/out flow and the
// dashboard "Check In" (pick-a-dealer-first) flow.
export default function PhotoSlot({ label, file, onChange, disabled }) {
  const inputRef = useRef(null);
  const previewUrl = file ? URL.createObjectURL(file) : null;
  return (
    <div style={{ textAlign: "center" }}>
      <div
        onClick={() => !disabled && inputRef.current?.click()}
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
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        disabled={disabled}
        onChange={(e) => onChange(e.target.files?.[0] || null)}
        style={{ display: "none" }}
      />
    </div>
  );
}
