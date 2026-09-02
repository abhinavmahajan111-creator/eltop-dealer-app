// Helpers for the Sales check-in/check-out visit flow: GPS capture,
// burning a geo-tag onto a captured photo (canvas overlay — more reliable
// than relying on EXIF, which mobile browsers frequently strip), and
// uploading the result to the "visit-media" Storage bucket.
//
// Photos/video are captured via <input type="file" accept="image/*"
// capture="environment"> (and accept="video/*" for the clip) rather than a
// custom getUserMedia/MediaRecorder pipeline — simpler and far more
// reliable across mobile browsers, especially iOS Safari. This also means
// there's no way to hard-cap the video at exactly 5 seconds; the UI guides
// the rep to keep it short and does a soft (non-blocking) duration check
// instead of rejecting longer clips outright.

import { supabase } from "../lib/supabase";

const BUCKET = "visit-media";

// Promisified geolocation with a sane timeout. Resolves { latitude,
// longitude } or rejects with an Error carrying a human-readable message.
export function getCurrentPosition({ timeout = 10000 } = {}) {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Location isn't available on this device/browser."));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude }),
      (err) => {
        const msg = err && err.code === 1
          ? "Location permission denied. Enable location access to check in."
          : "Couldn't get your location. Move to an open area and try again.";
        reject(new Error(msg));
      },
      { enableHighAccuracy: true, timeout, maximumAge: 0 }
    );
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Couldn't read that photo.")); };
    img.src = url;
  });
}

// Draws the captured photo onto a canvas (downscaled if very large, to
// keep uploads reasonable) with a geo-tag bar burned onto the bottom:
// lat/long, timestamp, and an optional label (e.g. "Duty On", "Shop
// Board"). Returns a Promise<Blob> (image/jpeg).
export async function tagPhoto(file, { latitude, longitude, label } = {}) {
  const img = await loadImage(file);
  const MAX_DIM = 1600;
  let { width, height } = img;
  if (width > MAX_DIM || height > MAX_DIM) {
    const scale = MAX_DIM / Math.max(width, height);
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(img, 0, 0, width, height);
  URL.revokeObjectURL(img.src);

  const barHeight = Math.max(46, Math.round(height * 0.09));
  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.fillRect(0, height - barHeight, width, barHeight);

  const pad = Math.round(barHeight * 0.18);
  const line1FontSize = Math.max(11, Math.round(barHeight * 0.32));
  const line2FontSize = Math.max(9, Math.round(barHeight * 0.24));
  ctx.fillStyle = "#fff";
  ctx.textBaseline = "top";

  const timestamp = new Date().toLocaleString("en-IN", {
    day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit",
  });
  const coordsText = latitude != null && longitude != null
    ? `${Number(latitude).toFixed(6)}, ${Number(longitude).toFixed(6)}`
    : "Location unavailable";

  ctx.font = `700 ${line1FontSize}px Arial, sans-serif`;
  ctx.fillText(label ? `${label} · ${coordsText}` : coordsText, pad, height - barHeight + pad);
  ctx.font = `400 ${line2FontSize}px Arial, sans-serif`;
  ctx.fillText(timestamp, pad, height - barHeight + pad + line1FontSize + 4);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Couldn't process that photo."))),
      "image/jpeg",
      0.86
    );
  });
}

// Uploads a Blob/File to the visit-media bucket under a per-visit path and
// returns its public URL. `kind` is a short filename hint, e.g.
// "duty-on", "board", "shop", "card", "video".
export async function uploadVisitMedia(blobOrFile, { dealerId, kind, ext }) {
  const resolvedExt = ext || (blobOrFile.type && blobOrFile.type.includes("video") ? "webm" : "jpg");
  const path = `${dealerId}/${Date.now()}-${kind}.${resolvedExt}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, blobOrFile, {
    upsert: true,
    contentType: blobOrFile.type || undefined,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

// Soft (non-blocking) duration check for the shop-interior video — mobile
// browsers can't reliably be forced to cap recording length, so this just
// warns rather than rejects. Resolves the duration in seconds, or null if
// it couldn't be determined.
export function getVideoDuration(file) {
  return new Promise((resolve) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    const url = URL.createObjectURL(file);
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(isFinite(video.duration) ? video.duration : null);
    };
    video.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
    video.src = url;
  });
}
