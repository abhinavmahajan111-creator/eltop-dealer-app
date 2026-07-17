import { useRef, useEffect, useState, useCallback } from "react";

const BADGE = {
  position: "absolute",
  pointerEvents: "none",
  zIndex: 20,
  background: "rgba(0,0,0,0.45)",
  borderRadius: 6,
  padding: "3px 5px",
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  lineHeight: 1,
  gap: 1,
  minWidth: 26,
};

const CHEVRON = { left: "‹", right: "›", top: "‹", bottom: "›" };
const CHEVRON_ROTATE = { left: "", right: "", top: "rotate(-90deg)", bottom: "rotate(90deg)" };

const BADGE_POS = {
  right:  { right:  6, top: "50%", transform: "translateY(-50%)" },
  left:   { left:   6, top: "50%", transform: "translateY(-50%)" },
  top:    { top:    6, left: "50%", transform: "translateX(-50%)" },
  bottom: { bottom: 6, left: "50%", transform: "translateX(-50%)" },
};

function ScrollBadge({ dir }) {
  return (
    <div style={{ ...BADGE, ...BADGE_POS[dir] }}>
      <span style={{ color: "#fff", fontSize: 9, fontWeight: 600, letterSpacing: "0.3px" }}>pg</span>
      <span style={{ color: "#fff", fontSize: 15, transform: CHEVRON_ROTATE[dir], display: "block" }}>
        {CHEVRON[dir]}
      </span>
    </div>
  );
}

/**
 * Drop-in wrapper that shows a single floating scroll-hint badge per edge.
 * One centered badge per direction — not repeated per row.
 *
 * Props:
 *   className   — applied to the outer div (for visual CSS)
 *   style       — extra inline styles for the outer div
 *   innerStyle  — inline styles for the inner scrollable div
 *   bg          — accepted but unused (kept for call-site compatibility)
 *   children    — scrollable content
 */
export default function ScrollFade({ children, className, style, innerStyle, bg }) {
  const innerRef = useRef(null);
  const [edges, setEdges] = useState({ left: false, right: false, top: false, bottom: false });

  const check = useCallback(() => {
    const el = innerRef.current;
    if (!el) return;
    const eps = 2;
    setEdges({
      left:   el.scrollLeft > eps,
      right:  el.scrollLeft < el.scrollWidth  - el.clientWidth  - eps,
      top:    el.scrollTop  > eps,
      bottom: el.scrollTop  < el.scrollHeight - el.clientHeight - eps,
    });
  }, []);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    check();
    el.addEventListener("scroll", check, { passive: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", check); ro.disconnect(); };
  }, [check]);

  return (
    <div
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
    >
      <div ref={innerRef} style={{ overflow: "auto", ...innerStyle }}>
        {children}
      </div>
      {edges.right  && <ScrollBadge dir="right"  />}
      {edges.left   && <ScrollBadge dir="left"   />}
      {edges.top    && <ScrollBadge dir="top"    />}
      {edges.bottom && <ScrollBadge dir="bottom" />}
    </div>
  );
}
