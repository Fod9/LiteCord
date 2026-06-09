import { useCallback, useEffect, useRef, useState } from "react";

export function useResize(
  initialWidth: number,
  min: number,
  max: number,
  direction: "right" | "left" = "right",
  storageKey?: string,
) {
  const stored = storageKey ? localStorage.getItem(storageKey) : null;
  const resolved = stored ? Math.min(max, Math.max(min, Number(stored))) : initialWidth;

  const [width, setWidth] = useState(resolved);
  const widthRef = useRef(resolved);

  useEffect(() => {
    if (!storageKey) return;
    const val = localStorage.getItem(storageKey);
    if (val) {
      const n = Math.min(max, Math.max(min, Number(val)));
      widthRef.current = n;
      setWidth(n);
    }
  }, [storageKey]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      const startX = e.clientX;
      const startWidth = widthRef.current;

      const onMove = (ev: MouseEvent) => {
        const delta = direction === "right" ? ev.clientX - startX : startX - ev.clientX;
        const next = Math.min(max, Math.max(min, startWidth + delta));
        widthRef.current = next;
        setWidth(next);
      };

      const onUp = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        if (storageKey) localStorage.setItem(storageKey, String(widthRef.current));
      };

      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", onUp);
    },
    [min, max, direction, storageKey],
  );

  return { width, onMouseDown };
}
