// Helpers for the Sales check-in/check-out visit flow: GPS capture and
// uploading captured media to the "visit-media" Storage bucket.
//
// Photos and video are captured live via getUserMedia (see
// components/staff/CameraCapture.jsx) rather than a file/gallery picker —
// there's no way to substitute an old or fake photo, since capture and
// the geo-tag/timestamp burn-in both happen at the moment of shooting.
// The shop-interior video recording auto-stops at 5 seconds (see
// MAX_VIDEO_SECONDS in CameraCapture.jsx); getVideoDuration() below is
// only used as an extra safety-net check after the fact.

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

// Uploads a Blob/File to the visit-media bucket under a per-folder path and
// returns its public URL. `folder` scopes the path — a dealer id for
// shop check-in/out media, or a fixed folder like "day-start" for the
// bike/vehicle meter-reading photo, which isn't tied to any dealer.
// `kind` is a short filename hint, e.g. "duty-on", "board", "shop",
// "card", "video", "meter".
export async function uploadVisitMedia(blobOrFile, { folder, kind, ext }) {
  const resolvedExt = ext || (blobOrFile.type && blobOrFile.type.includes("video") ? "webm" : "jpg");
  const path = `${folder}/${Date.now()}-${kind}.${resolvedExt}`;
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
