import { supabase } from "../lib/supabase";

// Dealer onboarding uploads live in two buckets:
//
//  - "dealer-media" (public): owner/staff/shop photos + the two onboarding
//    videos. Same bucket AdminDealers.jsx already writes to on the
//    dealer's behalf (uploadFile() there) — this file adds the
//    self-service half, now that a dealer can also write into their own
//    "<their-uid>/<key>.<ext>" folder (see
//    supabase/migrations/dealer_onboarding_documents.sql).
//  - "dealer-documents" (private): Aadhaar / PAN / GST certificate. Kept
//    out of the public bucket since these are identity documents, not
//    photos — only the owning dealer or an admin can read them, and only
//    via a short-lived signed URL, never a public one.

const MEDIA_BUCKET = "dealer-media";
const DOC_BUCKET = "dealer-documents";

function extFor(blobOrFile, fallback) {
  const name = blobOrFile?.name;
  if (name && name.includes(".")) return name.split(".").pop().toLowerCase();
  const type = blobOrFile?.type || "";
  if (type.includes("jpeg") || type.includes("jpg")) return "jpg";
  if (type.includes("png")) return "png";
  if (type.includes("webm")) return "webm";
  if (type.includes("mp4")) return "mp4";
  if (type.includes("quicktime")) return "mov";
  if (type.includes("pdf")) return "pdf";
  return fallback;
}

// Photos/videos captured via CameraPhotoSlot/CameraVideoSlot come back as
// bare Blobs (no .name), so this always resolves *some* extension via the
// blob's MIME type rather than assuming a File.
export async function uploadDealerMedia(dealerId, key, blobOrFile) {
  const ext = extFor(blobOrFile, "jpg");
  const path = `${dealerId}/${key}.${ext}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(path, blobOrFile, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(MEDIA_BUCKET).getPublicUrl(path);
  // Cache-bust — the path is reused on every re-upload (upsert), so
  // without this the browser would keep showing the old cached image.
  return `${data.publicUrl}?t=${Date.now()}`;
}

// Identity documents (file-picker uploads, not live camera captures) —
// returns the storage *path*, not a URL, since the bucket is private and
// there is no public URL to hand back.
export async function uploadDealerDocument(dealerId, key, file) {
  const ext = extFor(file, "jpg");
  const path = `${dealerId}/${key}.${ext}`;
  const { error } = await supabase.storage.from(DOC_BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  return path;
}

// Resolves a stored dealer-documents path into a short-lived signed URL
// for viewing/downloading. Called on demand (not cached) by whoever is
// displaying the document — the dealer's own upload screen or an admin's
// review screen; the storage RLS policy only allows the owning dealer or
// an admin to successfully sign a URL for a given path.
export async function getDealerDocumentUrl(path) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(DOC_BUCKET).createSignedUrl(path, 3600);
  if (error) throw error;
  return data.signedUrl;
}

// The unified onboarding checklist (same set for every shop type, plus
// one GST-only extra) — shared between the dealer-facing upload screen
// and anything that needs to describe/label the same fields consistently.
export const DEALER_DOC_FIELDS = [
  { key: "doc_aadhaar", label: "Aadhaar Card", kind: "document" },
  { key: "doc_pan", label: "PAN Card", kind: "document" },
  { key: "owner_photo", label: "Owner Photo", kind: "photo" },
  { key: "staff1_photo", label: "Staff Photo", kind: "photo" },
  { key: "shop_outside_photo", label: "Shop Outside Photo", kind: "photo" },
  { key: "shop_board_photo", label: "Shop Board Photo", kind: "photo" },
  { key: "shop_video", label: "Shop Inside Video (5s)", kind: "video", maxSeconds: 5 },
  { key: "intro_video", label: "Intro Video (15s)", kind: "video", maxSeconds: 15 },
];

export const DEALER_DOC_FIELD_GST = { key: "doc_gst_cert", label: "GST Certificate", kind: "document" };
