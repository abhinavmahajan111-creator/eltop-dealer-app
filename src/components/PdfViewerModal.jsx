import { useState } from 'react';

/**
 * PDF action sheet — shown after PDF is ready in Supabase Storage.
 *
 * Props:
 *   url      — HTTPS public URL (Supabase Storage)
 *   filename — suggested filename for download / share
 *   onClose  — called when dismissed
 */
export default function PdfViewerModal({ url, filename, onClose }) {
  const [downloading, setDownloading] = useState(false);

  function handleOpen() {
    window.open(url, '_blank');
  }

  async function handleDownload() {
    setDownloading(true);
    try {
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

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
      }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '16px 16px 0 0',
          padding: '24px 24px 36px',
          width: '100%', maxWidth: 480,
        }}
      >
        {/* Handle bar */}
        <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 2, margin: '0 auto 20px' }} />

        {/* PDF icon + filename */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 24 }}>
          <div style={{
            width: 52, height: 52, borderRadius: 12, flexShrink: 0,
            background: '#f5eefb', display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26,
          }}>📄</div>
          <div>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#1e293b', marginBottom: 3 }}>
              Price List Ready
            </div>
            <div style={{ fontSize: 12, color: '#64748b', wordBreak: 'break-all' }}>{filename}</div>
          </div>
        </div>

        {/* Primary action: Open */}
        <button
          onClick={handleOpen}
          style={{
            width: '100%', padding: '14px', marginBottom: 12,
            background: '#7B2D8B', border: 'none', borderRadius: 10,
            color: '#fff', fontWeight: 700, fontSize: 15,
            cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Open PDF ↗
        </button>

        {/* Secondary actions row */}
        <div style={{ display: 'flex', gap: 10 }}>
          <button
            onClick={handleDownload}
            disabled={downloading}
            style={{
              flex: 1, padding: '12px',
              background: 'none', border: '1.5px solid #7B2D8B', borderRadius: 10,
              color: '#7B2D8B', fontWeight: 700, fontSize: 14,
              cursor: downloading ? 'wait' : 'pointer',
              opacity: downloading ? 0.6 : 1, fontFamily: 'inherit',
            }}
          >
            {downloading ? '…' : '⬇ Download'}
          </button>
          <button
            onClick={handleShare}
            style={{
              flex: 1, padding: '12px',
              background: 'none', border: '1.5px solid #94a3b8', borderRadius: 10,
              color: '#475569', fontWeight: 600, fontSize: 14,
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Share ↗
          </button>
        </div>
      </div>
    </div>
  );
}
