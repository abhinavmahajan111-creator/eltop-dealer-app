import { createClient } from '@supabase/supabase-js';

// Returns a service-role-signed upload URL so the browser can upload a PDF
// directly to Supabase Storage without going through browser-side RLS.
//
// Required Vercel env var (server-only, NOT VITE_ prefixed):
//   SUPABASE_SERVICE_ROLE_KEY  — found in Supabase → Project Settings → API
//
// The URL used is VITE_SUPABASE_URL (already set in Vercel for the frontend).

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { storagePath, role } = req.body || {};
  if (!storagePath || !role) {
    return res.status(400).json({ error: 'Missing storagePath or role' });
  }

  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    console.error('[upload-pdf-url] missing env vars — SUPABASE_SERVICE_ROLE_KEY not configured');
    return res.status(500).json({ error: 'SUPABASE_SERVICE_ROLE_KEY not configured on server' });
  }

  try {
    const admin = createClient(supabaseUrl, serviceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // upsert:true lets the signed URL overwrite an existing file at the same path
    const { data, error } = await admin.storage
      .from('price-lists')
      .createSignedUploadUrl(storagePath, { upsert: true });

    if (error) {
      console.error('[upload-pdf-url] createSignedUploadUrl error:', error);
      return res.status(500).json({ error: error.message });
    }

    const { data: { publicUrl } } = admin.storage
      .from('price-lists')
      .getPublicUrl(storagePath);

    res.status(200).json({
      signedUrl: data.signedUrl,
      token:     data.token,
      path:      data.path,
      publicUrl,
    });
  } catch (err) {
    console.error('[upload-pdf-url] unexpected error:', err);
    res.status(500).json({ error: err.message });
  }
}
