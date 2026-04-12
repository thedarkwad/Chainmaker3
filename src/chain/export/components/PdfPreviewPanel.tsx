import { Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import type { PdfWorkerInput } from "../types";

type Props = {
  data: PdfWorkerInput;
  filename: string;
};

export function PdfPreviewPanel({ data, filename }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const workerRef = useRef<Worker | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    // Terminate any in-flight worker from a previous render.
    workerRef.current?.terminate();

    // Revoke the previous blob URL to free memory.
    if (blobUrlRef.current) {
      URL.revokeObjectURL(blobUrlRef.current);
      blobUrlRef.current = null;
    }

    setBlobUrl(null);
    setError(null);
    setLoading(true);

    const worker = new Worker(new URL("../pdf/pdfWorker.ts", import.meta.url), {
      type: "module",
    });
    workerRef.current = worker;

    worker.onmessage = (e: MessageEvent<{ ok: true; buffer: ArrayBuffer } | { ok: false; error: string }>) => {
      if (!e.data.ok) console.error("[PdfPreviewPanel] worker error:", e.data.error);
      if (e.data.ok) {
        const blob = new Blob([e.data.buffer], { type: "application/pdf" });
        const url = URL.createObjectURL(blob);
        blobUrlRef.current = url;
        setBlobUrl(url);
      } else {
        setError(e.data.error);
      }
      setLoading(false);
      worker.terminate();
      workerRef.current = null;
    };

    worker.onerror = (e) => {
      console.error("[PdfPreviewPanel] worker onerror:", e);
      setError(e.message);
      setLoading(false);
      worker.terminate();
      workerRef.current = null;
    };

    worker.postMessage(data);

    return () => {
      worker.terminate();
      workerRef.current = null;
    };
  // Re-run whenever `data` identity changes (i.e. Generate is clicked).
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  // Revoke blob URL on unmount.
  useEffect(() => {
    return () => {
      if (blobUrlRef.current) {
        URL.revokeObjectURL(blobUrlRef.current);
      }
    };
  }, []);

  return (
    <div className="flex flex-col h-full gap-2">
      <div className="flex items-center gap-2 justify-end shrink-0">
        {blobUrl && !loading && (
          <a
            href={blobUrl}
            download={filename}
            className="flex items-center gap-1.5 px-3 py-1 text-sm rounded border border-edge bg-surface hover:bg-tint transition-colors no-underline text-ink"
          >
            Download PDF
          </a>
        )}
      </div>
      <div className="flex-1 min-h-0 rounded border border-edge overflow-hidden">
        {loading ? (
          <div className="flex h-full items-center justify-center gap-2 text-sm text-muted">
            <Loader2 size={18} className="animate-spin" />
            Generating PDF…
          </div>
        ) : error ? (
          <div className="flex h-full items-center justify-center text-sm text-danger">
            {error}
          </div>
        ) : blobUrl ? (
          <iframe
            src={`${blobUrl}#toolbar=0&navpanes=0&scrollbar=0`}
            width="100%"
            height="100%"
            className="border-0"
          />
        ) : null}
      </div>
    </div>
  );
}
