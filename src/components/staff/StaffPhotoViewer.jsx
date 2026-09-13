import { downloadImageAsFile } from "../../utils/productMedia";

// Full-size staff photo viewer — same fixed-overlay lightbox pattern
// ProductDetailView.jsx already uses for product images, with a Share
// button added (Web Share API with the actual image file when the device
// supports sharing files; falls back to just downloading it otherwise).
// Always renders something when open — previously returned null with no
// photo, so tapping an empty avatar did nothing visible and looked broken.
// Now it shows a clear "no photo yet" state instead, and only offers
// Download/Share once there's an actual photo to act on.
export default function StaffPhotoViewer({ photoUrl, name, onClose }) {
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
        {photoUrl && (
          <button
            onClick={() => downloadImageAsFile(photoUrl, name || "staff-photo")}
            style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}
          >
            ⬇️ Download
          </button>
        )}
        {photoUrl && (
          <button
            onClick={handleShare}
            style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, padding: "8px 14px", fontSize: 13, cursor: "pointer", fontFamily: "inherit", fontWeight: 700 }}
          >
            📤 Share
          </button>
        )}
        <button
          onClick={onClose}
          style={{ background: "rgba(255,255,255,.15)", border: "1px solid rgba(255,255,255,.3)", color: "#fff", borderRadius: 8, width: 36, height: 36, fontSize: 18, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          ✕
        </button>
      </div>
      {photoUrl ? (
        <img
          src={photoUrl}
          alt={name || ""}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: "min(360px, 90vw)", maxHeight: "70vh", borderRadius: 12, objectFit: "cover" }}
        />
      ) : (
        <div
          onClick={(e) => e.stopPropagation()}
          style={{ background: "#fff", borderRadius: 12, padding: "28px 24px", width: "min(280px, 84vw)", textAlign: "center" }}
        >
          <div style={{ fontSize: 28, marginBottom: 8 }}>📷</div>
          <div style={{ fontSize: 14, fontWeight: 800, color: "#1a1a1a", marginBottom: 4 }}>No photo added yet</div>
          <div style={{ fontSize: 11.5, color: "#999", lineHeight: 1.4 }}>
            {name ? `${name} hasn't` : "They haven't"} uploaded a photo yet. They can add one from their own dashboard, or an admin can add it from Admin &gt; Staff.
          </div>
        </div>
      )}
      {photoUrl && name && <div style={{ color: "#fff", fontSize: 13, fontWeight: 700, marginTop: 14 }}>{name}</div>}
    </div>
  );
}
