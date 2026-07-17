import { useRef, useEffect, useState, useCallback } from "react";

const BADGE_BASE = {
  position: "absolute",
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
  cursor: "pointer",
  userSelect: "none",
};

const CHEVRON  = { left: "‹", right: "›", top: "‹", bottom: "›" };
const ROTATE   = { left: "", right: "", top: "rotate(-90deg)", bottom: "rotate(90deg)" };

function ScrollBadge({ dir, top, left, onPage }) {
  const pos =
    dir === "right"  ? { right:  6, top, transform: "translateY(-50%)" } :
    dir === "left"   ? { left:   6, top, transform: "translateY(-50%)" } :
    dir === "top"    ? { top:    6, left, transform: "translateX(-50%)" } :
                       { bottom: 6, left, transform: "translateX(-50%)" };

  if (top == null && (dir === "right" || dir === "left")) return null;
  if (left == null && (dir === "top"  || dir === "bottom")) return null;

  return (
    <div style={{ ...BADGE_BASE, ...pos }} onClick={() => onPage(dir)}>
      <span style={{ color: "#fff", fontSize: 9, fontWeight: 600, letterSpacing: "0.3px" }}>pg</span>
      <span style={{ color: "#fff", fontSize: 15, display: "block", transform: ROTATE[dir] }}>
        {CHEVRON[dir]}
      </span>
    </div>
  );
}

/**
 * Drop-in wrapper that shows a single floating scroll-hint badge per edge,
 * vertically centered in the VISIBLE portion of the container (not the full
 * content height), so it stays on-screen even for tall tables.
 *
 * Props:
 *   className   — applied to the outer div (for visual CSS)
 *   style       — extra inline styles for the outer div
 *   innerStyle  — inline styles for the inner scrollable div
 *   bg          — accepted but unused (kept for call-site compatibility)
 *   children    — scrollable content
 */
function scrollPage(el, dir) {
  if (!el) return;
  if (dir === "right" || dir === "left") {
    const delta = dir === "right" ? el.clientWidth : -el.clientWidth;
    const target = Math.min(Math.max(el.scrollLeft + delta, 0), el.scrollWidth - el.clientWidth);
    el.scrollTo({ left: target, behavior: "smooth" });
  } else {
    const delta = dir === "bottom" ? el.clientHeight : -el.clientHeight;
    const target = Math.min(Math.max(el.scrollTop + delta, 0), el.scrollHeight - el.clientHeight);
    el.scrollTo({ top: target, behavior: "smooth" });
  }
}

export default function ScrollFade({ children, className, style, innerStyle, bg }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const [edges,    setEdges]    = useState({ left: false, right: false, top: false, bottom: false });
  const [badgeTop, setBadgeTop] = useState(null);  // px offset within outer div, for H badges
  const [badgeLeft, setBadgeLeft] = useState(null); // px offset within outer div, for V badges

  const check = useCallback(() => {
    const el    = innerRef.current;
    const outer = outerRef.current;
    if (!el) return;

    // Overflow detection (unchanged)
    const eps = 2;
    setEdges({
      left:   el.scrollLeft > eps,
      right:  el.scrollLeft < el.scrollWidth  - el.clientWidth  - eps,
      top:    el.scrollTop  > eps,
      bottom: el.scrollTop  < el.scrollHeight - el.clientHeight - eps,
    });

    // Badge position: center of visible portion of outer div
    if (outer) {
      const rect = outer.getBoundingClientRect();

      // Vertical center of whatever part of the container is currently on-screen
      const visTop    = Math.max(rect.top,    0);
      const visBottom = Math.min(rect.bottom,  window.innerHeight);
      setBadgeTop(visBottom > visTop ? (visTop + visBottom) / 2 - rect.top : null);

      // Horizontal center (for top/bottom badges)
      const visLeft  = Math.max(rect.left,  0);
      const visRight = Math.min(rect.right, window.innerWidth);
      setBadgeLeft(visRight > visLeft ? (visLeft + visRight) / 2 - rect.left : null);
    }
  }, []);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    check();
    el.addEventListener("scroll", check, { passive: true });
    // Page-level scroll updates the visible-center calculation
    window.addEventListener("scroll", check, { passive: true, capture: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("scroll", check, { capture: true });
      ro.disconnect();
    };
  }, [check]);

  return (
    <div
      ref={outerRef}
      className={className}
      style={{ position: "relative", overflow: "hidden", ...style }}
    >
      <div ref={innerRef} style={{ overflow: "auto", ...innerStyle }}>
        {children}
      </div>
      {edges.right  && <ScrollBadge dir="right"  top={badgeTop}   onPage={d => scrollPage(innerRef.current, d)} />}
      {edges.left   && <ScrollBadge dir="left"   top={badgeTop}   onPage={d => scrollPage(innerRef.current, d)} />}
      {edges.top    && <ScrollBadge dir="top"    left={badgeLeft} onPage={d => scrollPage(innerRef.current, d)} />}
      {edges.bottom && <ScrollBadge dir="bottom" left={badgeLeft} onPage={d => scrollPage(innerRef.current, d)} />}
    </div>
  );
}
