import { useCallback, useRef } from "react";

const MAX_LINES = 20;

export function useChatInput(onSend: (content: string) => void) {
  const ref = useRef<HTMLTextAreaElement>(null);

  const resize = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 20;
    const maxHeight = lineHeight * MAX_LINES;
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = next + "px";
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  const onKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        const value = e.currentTarget.value.trim();
        if (!value) return;
        onSend(value);
        e.currentTarget.value = "";
        resize();
      }
    },
    [onSend, resize],
  );

  return { ref, resize, onKeyDown };
}
