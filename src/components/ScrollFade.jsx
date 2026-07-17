import { useRef, useEffect, useState, useCallback } from "react";

const DIRS = ["left", "right", "top", "bottom"];

const GRADIENT = {
  left:   (bg) => `linear-gradient(to right, ${bg}, transparent)`,
  right:  (bg) => `linear-gradient(to left,  ${bg}, transparent)`,
  top:    (bg) => `linear-gradient(to bottom, ${bg}, transparent)`,
  bottom: (bg) => `linear-gradient(to top,   ${bg}, transparent)`,
};

const CHEVRON = { left: "‹", right: "›", top: "›", bottom: "›" };
const ROTATE  = { left: "", right: "", top: "rotate(-90deg)", bottom: "rotate(90deg)" };

const OVERLAY_BASE = { position: "absolute", pointerEvents: "none", zIndex: 10, display: "flex", alignItems: "center", justifyContent: "center" };
const OVERLAY_POS = {
  left:   { top: 0, bottom: 0, left:   0, width:  28 },
  right:  { top: 0, bottom: 0, right:  0, width:  28 },
  top:    { left: 0, right: 0, top:    0, height: 28 },
  bottom: { left: 0, right: 0, bottom: 0, height: 28 },
};

function FadeEdge({ dir, bg }) {
  return (
    <div style={{ ...OVERLAY_BASE, ...OVERLAY_POS[dir], background: GRADIENT[dir](bg) }}>
      <span style={{ color: "#999", fontSize: 13, lineHeight: 1, opacity: 0.65, display: "block", transform: ROTATE[dir] }}>
        {CHEVRON[dir]}
      </span>
    </div>
  );
}

/**
 * Drop-in wrapper that adds faded scroll-edge indicators on any axis.
 *
 * Props:
 *   className   — applied to the outer div (for visual CSS like border-radius, shadow)
 *   style       — extra inline styles for the outer div
 *   innerStyle  — inline styles for the inner scrollable div (e.g. maxHeight, flex)
 *   bg          — background color string used for the gradient fade (default "#fff")
 *   children    — scrollable content
 */
export default function ScrollFade({ children, className, style, innerStyle, bg = "#fff" }) {
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
      {DIRS.map(d => edges[d] && <FadeEdge key={d} dir={d} bg={bg} />)}
    </div>
  );
}
