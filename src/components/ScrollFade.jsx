import { useRef, useEffect, useState, useCallback } from "react";

// Horizontal track — pinned to the visible bottom of the container
function HBar({ bar, onDown }) {
  if (!bar || bar.trackTop == null) return null;
  return (
    <div style={{
      position: "absolute", top: bar.trackTop, left: 0, right: 0, height: 4,
      background: "rgba(0,0,0,0.08)", borderRadius: 2, pointerEvents: "none", zIndex: 20,
    }}>
      <div style={{
        position: "absolute", left: bar.thumbOffset, width: bar.thumbSize,
        top: 0, bottom: 0, background: "rgba(0,0,0,0.4)", borderRadius: 2,
        cursor: "grab", touchAction: "none", pointerEvents: "auto",
      }} onPointerDown={e => onDown(e, "h")} />
    </div>
  );
}

// Vertical track — spans visible height of the container, on the right edge
function VBar({ bar, onDown }) {
  if (!bar || bar.trackLen == null) return null;
  return (
    <div style={{
      position: "absolute", right: 0, top: bar.trackTop, height: bar.trackLen, width: 4,
      background: "rgba(0,0,0,0.08)", borderRadius: 2, pointerEvents: "none", zIndex: 20,
    }}>
      <div style={{
        position: "absolute", top: bar.thumbOffset, height: bar.thumbSize,
        left: 0, right: 0, background: "rgba(0,0,0,0.4)", borderRadius: 2,
        cursor: "grab", touchAction: "none", pointerEvents: "auto",
      }} onPointerDown={e => onDown(e, "v")} />
    </div>
  );
}

export default function ScrollFade({ children, className, style, innerStyle, bg }) {
  const outerRef = useRef(null);
  const innerRef = useRef(null);
  const dragRef  = useRef(null);
  const [hBar, setHBar] = useState(null);
  const [vBar, setVBar] = useState(null);

  const check = useCallback(() => {
    const el    = innerRef.current;
    const outer = outerRef.current;
    if (!el || !outer) return;

    const eps  = 2;
    const rect = outer.getBoundingClientRect();
    const visTop    = Math.max(rect.top,    0);
    const visBottom = Math.min(rect.bottom, window.innerHeight);
    const visHeight = Math.max(visBottom - visTop, 0);

    // Horizontal scrollbar — track sits at visible bottom edge
    if (el.scrollWidth > el.clientWidth + eps) {
      const trackLen  = el.clientWidth;
      const thumbSize = Math.max(24, trackLen * el.clientWidth / el.scrollWidth);
      const scrollMax = el.scrollWidth - el.clientWidth;
      setHBar({
        thumbSize,
        thumbOffset: scrollMax > 0 ? (el.scrollLeft / scrollMax) * (trackLen - thumbSize) : 0,
        trackTop: visHeight > 0 ? visBottom - rect.top - 4 : null,
      });
    } else {
      setHBar(null);
    }

    // Vertical scrollbar — track spans visible height, on right edge
    if (el.scrollHeight > el.clientHeight + eps) {
      const trackLen  = visHeight;
      const thumbSize = Math.max(24, trackLen * el.clientHeight / el.scrollHeight);
      const scrollMax = el.scrollHeight - el.clientHeight;
      setVBar(visHeight > 0 ? {
        thumbSize,
        thumbOffset: scrollMax > 0 ? (el.scrollTop / scrollMax) * (trackLen - thumbSize) : 0,
        trackTop: visTop - rect.top,
        trackLen,
      } : null);
    } else {
      setVBar(null);
    }
  }, []);

  useEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    check();
    el.addEventListener("scroll", check, { passive: true });
    window.addEventListener("scroll", check, { passive: true, capture: true });
    const ro = new ResizeObserver(check);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", check);
      window.removeEventListener("scroll", check, { capture: true });
      ro.disconnect();
    };
  }, [check]);

  function onThumbDown(e, axis) {
    e.preventDefault();
    e.stopPropagation();
    const el = innerRef.current;
    if (!el) return;
    const isH     = axis === "h";
    const scrollMax = isH ? el.scrollWidth - el.clientWidth : el.scrollHeight - el.clientHeight;
    const bar     = isH ? hBar : vBar;
    dragRef.current = {
      axis,
      startPointer: isH ? e.clientX : e.clientY,
      startScroll:  isH ? el.scrollLeft : el.scrollTop,
      trackLen:     isH ? el.clientWidth : (bar?.trackLen ?? el.clientHeight),
      thumbSize:    bar?.thumbSize ?? 24,
      scrollMax,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.onpointermove = onThumbMove;
    e.currentTarget.onpointerup   = onThumbUp;
  }

  function onThumbMove(e) {
    const drag = dragRef.current;
    if (!drag) return;
    const el  = innerRef.current;
    if (!el) return;
    const isH  = drag.axis === "h";
    const delta = (isH ? e.clientX : e.clientY) - drag.startPointer;
    const range = drag.trackLen - drag.thumbSize;
    const newScroll = range > 0
      ? Math.min(Math.max(drag.startScroll + (delta / range) * drag.scrollMax, 0), drag.scrollMax)
      : 0;
    if (isH) el.scrollLeft = newScroll; else el.scrollTop = newScroll;
  }

  function onThumbUp() {
    dragRef.current = null;
  }

  return (
    <div
      ref={outerRef}
      className={className}
      style={{ position: "relative", overflow: "hidden", display: "flex", flexDirection: "column", ...style }}
    >
      <div ref={innerRef} style={{ overflow: "auto", flex: 1, minHeight: 0, ...innerStyle }}>
        {children}
      </div>
      <HBar bar={hBar} onDown={onThumbDown} />
      <VBar bar={vBar} onDown={onThumbDown} />
    </div>
  );
}
