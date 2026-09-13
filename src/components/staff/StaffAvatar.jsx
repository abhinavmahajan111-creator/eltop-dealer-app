import { useRef, useState } from "react";

function initials(name) {
  if (!name) return "?";
  return name.trim().split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

// One avatar component covering every place a staff photo shows up:
//   - plain view (My team tree cards) — just photoUrl/name, no props below
//   - clickable view (a team member's profile header) — pass onClick, opens
//     StaffPhotoViewer in the parent
//   - editable (your own dashboard header, or an admin editing a staff row)
//     — pass editable + onUpload(file); shows a small camera badge, tapping
//     the avatar opens a native file picker instead of calling onClick
export default function StaffAvatar({ photoUrl, name, size = 40, editable = false, uploading = false, onUpload, onClick, dark = false }) {
  const inputRef = useRef(null);
  const [broken, setBroken] = useState(false);
  const showPhoto = photoUrl && !broken;

  const handlePick = () => {
    if (editable && inputRef.current) inputRef.current.click();
    else if (onClick) onClick();
  };

  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <div
        onClick={handlePick}
        style={{
          width: size, height: size, borderRadius: "50%", overflow: "hidden",
          background: dark ? "rgba(255,255,255,0.25)" : "#f3e6f6",
          color: dark ? "#fff" : "#7B2D8B",
          border: dark ? "2px solid rgba(255,255,255,0.6)" : "none",
          display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: size * 0.36, fontWeight: 800,
          cursor: editable || onClick ? "pointer" : "default",
        }}
      >
        {showPhoto ? (
          <img
            src={photoUrl}
            alt=""
            onError={() => setBroken(true)}
            style={{ width: "100%", height: "100%", objectFit: "cover", display: "block", opacity: uploading ? 0.5 : 1 }}
          />
        ) : (
          initials(name)
        )}
      </div>
      {editable && (
        <div
          onClick={handlePick}
          style={{
            position: "absolute", bottom: -1, right: -1, width: Math.max(16, size * 0.36), height: Math.max(16, size * 0.36),
            borderRadius: "50%", background: "#7B2D8B", border: "2px solid #fff",
            display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer",
          }}
        >
          <span style={{ fontSize: Math.max(8, size * 0.22), lineHeight: 1 }} aria-hidden="true">📷</span>
        </div>
      )}
      {editable && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          hidden
          onChange={(e) => {
            const file = e.target.files && e.target.files[0];
            e.target.value = "";
            if (file && onUpload) onUpload(file);
          }}
        />
      )}
    </div>
  );
}
