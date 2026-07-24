import { useEffect, useState } from 'react';

/**
 * Full-screen PDF viewer with Share and Download actions.
 *
 * Props:
 *   url      — HTTPS public URL (Supabase Storage) or blob: URL fallback
 *   filename — suggested filename for download / share
 *   onClose  — called when the viewer is dismissed
 */
export default function PdfViewerModal({ url, filename, onClose }) {
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleShare() {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
      } else {
        window.open(url, '_blank');
      }
    } catch (err) {
      if (err.name !== 'AbortError') alert('Share failed: ' + err.message);
    }
  }

  async function handleDownload() {
    setDownloading(true);
    try {
      // Fetch + re-blob so the <a download> works cross-origin
      const resp = await fetch(url);
      const blob = await resp.blob();
      const blobUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(blobUrl);
    } catch (err) {
      alert('Download failed: ' + err.message);
    } finally {
      setDownloading(false);
    }
  }

  const canShareFiles = typeof navigator.canShare === 'function';

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      display: 'flex', flexDirection: 'column',
      background: '#1a1026',
    }}>
      {/* ── Top bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '10px 14px',
        background: '#6B3A73',
        flexShrink: 0,
        minHeight: 50,
      }}>
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'rgba(255,255,255,0.15)', border: 'none', color: '#fff',
            borderRadius: 8, width: 34, height: 34,
            fontSize: 18, cursor: 'pointer', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >✕</button>

        <span style={{
          color: '#e8d8f5', fontWeight: 600, fontSize: 13, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{filename}</span>

        {canShareFiles && (
          <button onClick={handleShare} style={{
            background: 'rgba(255,255,255,0.15)',
            border: '1px solid rgba(255,255,255,0.3)',
            color: '#fff', borderRadius: 8,
            padding: '7px 14px', fontSize: 13,
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>Share ↗</button>
        )}

        <button onClick={handleDownload} disabled={downloading} style={{
          background: '#fff', border: 'none',
          color: '#6B3A73', borderRadius: 8,
          padding: '7px 14px', fontSize: 13,
          fontWeight: 700, cursor: downloading ? 'wait' : 'pointer',
          whiteSpace: 'nowrap', opacity: downloading ? 0.7 : 1,
        }}>
          {downloading ? '…' : '⬇ Download'}
        </button>
      </div>

      {/* ── PDF viewer — iframe works for both HTTPS and blob URLs ── */}
      <iframe
        src={url}
        title="Price List PDF"
        style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }}
      />
    </div>
  );
}
