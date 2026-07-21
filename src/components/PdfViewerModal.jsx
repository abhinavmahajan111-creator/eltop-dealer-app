import { useEffect } from 'react';

/**
 * Full-screen PDF viewer with Share and Download actions.
 * Uses the browser's native <iframe> PDF viewer — handles scroll and
 * pinch-to-zoom natively on Android Chrome and desktop browsers.
 *
 * Props:
 *   blobUrl  — object URL from URL.createObjectURL(blob)
 *   filename — suggested filename for download / share
 *   onClose  — called when the viewer is dismissed
 */
export default function PdfViewerModal({ blobUrl, filename, onClose }) {
  // Prevent body scroll while modal is open
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, []);

  // Close on Escape
  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape') onClose(); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  async function handleShare() {
    try {
      const resp = await fetch(blobUrl);
      const blob = await resp.blob();
      const file = new File([blob], filename, { type: 'application/pdf' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
      } else {
        // Fallback: open in new tab
        window.open(blobUrl, '_blank');
      }
    } catch (err) {
      if (err.name !== 'AbortError') alert('Share failed: ' + err.message);
    }
  }

  function handleDownload() {
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    a.click();
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
        {/* Close */}
        <button
          onClick={onClose}
          aria-label="Close"
          style={{
            background: 'rgba(255,255,255,0.15)',
            border: 'none', color: '#fff',
            borderRadius: 8, width: 34, height: 34,
            fontSize: 18, cursor: 'pointer', lineHeight: 1,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
        >✕</button>

        {/* Filename */}
        <span style={{
          color: '#e8d8f5', fontWeight: 600, fontSize: 13, flex: 1,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{filename}</span>

        {/* Share (only if native share supports files, i.e. mobile) */}
        {canShareFiles && (
          <button
            onClick={handleShare}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '1px solid rgba(255,255,255,0.3)',
              color: '#fff', borderRadius: 8,
              padding: '7px 14px', fontSize: 13,
              cursor: 'pointer', whiteSpace: 'nowrap',
            }}
          >
            Share ↗
          </button>
        )}

        {/* Download */}
        <button
          onClick={handleDownload}
          style={{
            background: '#fff', border: 'none',
            color: '#6B3A73', borderRadius: 8,
            padding: '7px 14px', fontSize: 13,
            fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap',
          }}
        >
          ⬇ Download
        </button>
      </div>

      {/* ── PDF viewer ── */}
      <iframe
        src={blobUrl}
        title="Price List PDF"
        style={{ flex: 1, border: 'none', width: '100%', background: '#fff' }}
      />
    </div>
  );
}
