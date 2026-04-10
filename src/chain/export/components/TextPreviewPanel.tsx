import { useState } from "react";
import { Check, Copy } from "lucide-react";

type Props = {
  text: string;
  filename: string;
};

export function TextPreviewPanel({ text, filename }: Props) {
  const [copied, setCopied] = useState(false);

  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  function handleDownload() {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center gap-2 justify-end">
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 px-3 py-1 text-sm rounded border border-edge bg-surface hover:bg-tint transition-colors"
        >
          {copied ? <Check size={14} /> : <Copy size={14} />}
          {copied ? "Copied!" : "Copy"}
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="flex items-center gap-1.5 px-3 py-1 text-sm rounded border border-edge bg-surface hover:bg-tint transition-colors"
        >
          Download
        </button>
      </div>
      <textarea
        readOnly
        value={text}
        className="flex-1 min-h-0 font-mono text-xs p-3 rounded border border-edge bg-canvas resize-none focus:outline-none"
      />
    </div>
  );
}
