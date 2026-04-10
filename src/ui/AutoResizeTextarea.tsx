import { ClipboardEvent, TextareaHTMLAttributes, useEffect, useRef } from "react";

type Props = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  /** When true, pasted text has isolated single newlines collapsed to spaces.
   *  Double (paragraph) newlines are preserved. */
  stripPastedNewlines?: boolean;
  /** Minimum number of visible rows before auto-grow kicks in.
   *  Defaults to the HTML textarea default of 2. Pass 1 to start at a single line. */
  minRows?: number;
};

/** A textarea that automatically grows to fit its content. */
export function AutoResizeTextarea({
  className,
  stripPastedNewlines,
  onPaste,
  minRows,
  ...props
}: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const resize = () => {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    };
    resize(); // initial size on mount
    el.addEventListener("input", resize);
    return () => el.removeEventListener("input", resize);
  }, []);

  const handlePaste = (e: ClipboardEvent<HTMLTextAreaElement>) => {
    if (stripPastedNewlines) {
      e.preventDefault();
      const raw = e.clipboardData.getData("text");
      // Collapse 3+ newlines → 2, then replace isolated single newlines with a space
      const cleaned = raw
        .replace(/\n{3,}/g, "\n\n")
        .replace(/(?<!\n)\n(?!\n)/g, " ");
      document.execCommand("insertText", false, cleaned);
    }
    onPaste?.(e);
  };

  return (
    <textarea
      rows={minRows}
      {...props}
      ref={ref}
      style={{ overflowY: "hidden", resize: "none" }}
      className={className}
      onPaste={handlePaste}
    />
  );
}
