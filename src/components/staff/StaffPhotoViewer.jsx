import { downloadImageAsFile } from "../../utils/productMedia";

// Full-size staff photo viewer — same fixed-overlay lightbox pattern
// ProductDetailView.jsx already uses for product images, with a Share
// button added (Web Share API with the actual image file when the device
// supports sharing files; falls back to just downloading it otherwise).
export default function StaffPhotoViewer({ photoUrl, name, onClose }) {
  if (!photoUrl) return null;

  const handleShare = async () => {
    try {
      const response = await fetch(photoUrl);
      const blob = await response.blob();
      const file = new File([blob], `${(name || "staff-photo").replace(/\s+/g, "_")}.jpg`, { type: blob.type || "image/jpeg" });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: name || "Staff photo" });
        return;
      }
    } catch (_) {
      // fall through to download
    }
    downloadImageAsFile(photoUrl, name || "staff-photo");
  };

  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,.85)", zIndex: 2000, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 20 }}
    >
      <div style={{ position: "absolute", top: 16, right: 16, display: "flex", gap: 10 }} onClick={(e) => e.stopPropagation()}>
        <button
          onClick={() => downloadImageAsFile(photoUrl, name || "staff-photo")}
          style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}
        >
          ⬇️ Download
        </button>
        <button
          onClick={handleShare}
          style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}
        >
          📤 Share
        </button>
        <button
          onClick={onClose}
          style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, width: 36, height: 36, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          ✕
        </button>
      </div>
      <img
        src={photoUrl}
        alt={name || ""}
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "min(360px, 90vw)", maxHeight: "70vh", borderRadius: 12, objectFit: "cover" }}
      />
      {name && <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginTop: 14 }}>{name}</div>}
    </div>
  );
}
