import { supabase } from "../lib/supabase";

// Staff profile photos live in their own bucket, one object per staff
// member at "<email>/photo.<ext>" (upsert: true so re-uploading just
// replaces it) — same shape as AdminDealers.jsx's dealer-media uploader.
// RLS on storage.objects (see supabase/migrations/dealer_access_control.sql
// section 17) only lets a staff member write under their own email, or an
// admin write under anyone's.
const BUCKET = "staff-media";

export async function uploadStaffPhoto(email, file) {
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${email}/photo.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  // Cache-bust — same path gets reused on every re-upload, so without this
  // the browser (and any CDN) would keep serving the old cached image.
  return `${data.publicUrl}?t=${Date.now()}`;
}
