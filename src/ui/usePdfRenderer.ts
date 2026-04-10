/**
 * usePdfRenderer — shared PDF loading, rendering, and zoom logic.
 *
 * Pages are rendered once at RENDER_SCALE and never re-rendered when zoom
 * changes. The consumer applies `displayScale = zoom / RENDER_SCALE` as a
 * CSS transform so zooming only triggers a style change, not a canvas repaint.
 *
 * Also handles:
 *  - Lazy text-layer rendering via IntersectionObserver
 *  - Pinch-to-zoom with scroll anchored to the pinch midpoint (no jitter)
 *  - Scroll-position preservation when zoom changes via buttons
 */

import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { TextLayer } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFDocumentProxy, PageViewport } from "pdfjs-dist";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";

import workerSrc from "pdfjs-dist/legacy/build/pdf.worker.mjs?url";
import "pdfjs-dist/web/pdf_viewer.css";

pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

export const MIN_ZOOM = 0.3;
export const MAX_ZOOM = 2.5;
/** Step size for +/- zoom buttons (5%). Buttons also snap to nearest multiple. */
export const ZOOM_STEP = 0.05;
/** Pages are always rendered at this scale; CSS scale handles the rest. */
export const RENDER_SCALE = 1.5;
export const PAGE_GAP = 16;

export type PageInfo = { width: number; height: number };

export type UsePdfRendererResult = {
  scrollRef: React.RefObject<HTMLDivElement | null>;
  canvasRefs: React.MutableRefObject<(HTMLCanvasElement | null)[]>;
  textLayerRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  pageWrapperRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  ioRef: React.MutableRefObject<IntersectionObserver | null>;
  pages: PageInfo[];
  /** Current zoom level as a plain float (e.g. 1.0 = 100%). */
  zoom: number;
  /** Fraction to apply as CSS transform scale when rendering each page. */
  displayScale: number;
  error: string | null;
  /**
   * Change zoom while preserving scroll position. `updater` receives and
   * returns the zoom value. Use this instead of setting zoom directly.
   */
  changeZoom: (updater: (prev: number) => number) => void;
};

export function usePdfRenderer({
  url,
  ownerDocument: ownerDoc,
}: {
  url: string | null;
  ownerDocument?: Document;
}): UsePdfRendererResult {
  const scrollRef = useRef<HTMLDivElement>(null);
  const canvasRefs = useRef<(HTMLCanvasElement | null)[]>([]);
  const textLayerRefs = useRef<(HTMLDivElement | null)[]>([]);
  const pageWrapperRefs = useRef<(HTMLDivElement | null)[]>([]);
  const textLayerInitRef = useRef<Set<number>>(new Set());
  const ioRef = useRef<IntersectionObserver | null>(null);
  const renderTasksRef = useRef<{ cancel: () => void }[]>([]);
  // Queued scroll restore — applied synchronously before next paint after zoom changes.
  const pendingScrollRef = useRef<(() => void) | null>(null);

  const [pages, setPages] = useState<PageInfo[]>([]);
  const [zoom, setZoom] = useState(1.0);
  const zoomRef = useRef(zoom);
  const hasSetInitialZoom = useRef(false);
  zoomRef.current = zoom;
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxy | null>(null);
  const [error, setError] = useState<string | null>(null);

  const pinchRef = useRef<{ initialDistance: number; initialZoom: number } | null>(null);

  const displayScale = zoom / RENDER_SCALE;

  // ── Load PDF ───────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!url) return;
    hasSetInitialZoom.current = false;
    setZoom(1.0);
    setError(null);
    setPages([]);
    setPdfDoc((prev) => {
      prev?.destroy();
      return null;
    });

    let ignore = false;
    let loadedDoc: PDFDocumentProxy | null = null;
    let activeTask: { destroy: () => void } | null = null;

    // file:// URLs can't be fetched by the pdfjs worker (CORS restriction).
    // Read the bytes in the renderer first and pass raw data instead.
    (async () => {
      let source: Parameters<typeof pdfjs.getDocument>[0];
      if (url.startsWith("file:")) {
        const buf = await fetch(url).then((r) => r.arrayBuffer());
        source = { data: new Uint8Array(buf) };
      } else {
        source = { url, withCredentials: false };
      }
      if (ignore) return;
      if (ownerDoc) (source as Record<string, unknown>).ownerDocument = ownerDoc;

      const task = pdfjs.getDocument(source);
      activeTask = task;
      task.promise.then(
        (loaded) => {
          if (ignore) {
            loaded.destroy();
            return;
          }
          loadedDoc = loaded;
          setPdfDoc(loaded);
        },
        (err) => {
          if (ignore) return;
          setError(`Failed to load PDF: ${String(err?.message ?? err)}`);
        },
      );
    })().catch(() => {});

    return () => {
      ignore = true;
      if (loadedDoc) loadedDoc.destroy();
      else activeTask?.destroy();
    };
  }, [url, ownerDoc]);

  // ── Render pages at RENDER_SCALE — runs once per PDF, not on zoom change ──

  useEffect(() => {
    if (!pdfDoc) return;

    for (const t of renderTasksRef.current) t.cancel();
    renderTasksRef.current = [];

    let cancelled = false;
    const newPages: PageInfo[] = [];

    async function renderAll() {
      for (let i = 1; i <= pdfDoc!.numPages; i++) {
        if (cancelled) break;

        let page;
        try {
          page = await pdfDoc!.getPage(i);
        } catch {
          // Page fetch failed (e.g. doc destroyed mid-render) — skip.
          continue;
        }

        const viewport: PageViewport = page.getViewport({ scale: RENDER_SCALE });
        newPages.push({ width: viewport.width, height: viewport.height });
        if (cancelled) break;

        // flushSync so the canvas ref is available immediately after setState.
        flushSync(() => setPages([...newPages]));
        if (cancelled) break;

        const canvas = canvasRefs.current[i - 1];
        if (!canvas) continue;
        canvas.width = viewport.width;
        canvas.height = viewport.height;

        const task = page.render({ canvas, viewport });
        renderTasksRef.current[i - 1] = task;
        try {
          await task.promise;
        } catch {
          // Cancelled render — expected on unmount or URL change.
        }
      }
    }

    renderAll().catch(() => {});
    return () => {
      cancelled = true;
      for (const t of renderTasksRef.current) t.cancel();
      renderTasksRef.current = [];
    };
  }, [pdfDoc]);

  // ── Lazy text layers via IntersectionObserver — no zoom dependency ─────────

  useEffect(() => {
    if (!pdfDoc) return;

    for (const container of textLayerRefs.current) {
      if (container) container.innerHTML = "";
    }
    textLayerInitRef.current = new Set();

    let cancelled = false;

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const pageIdx = Number((entry.target as HTMLElement).dataset.pageIdx);
          if (textLayerInitRef.current.has(pageIdx)) continue;
          textLayerInitRef.current.add(pageIdx);

          const textContainer = textLayerRefs.current[pageIdx];
          if (!textContainer) continue;

          pdfDoc
            .getPage(pageIdx + 1)
            .then((page) => {
              if (cancelled) return;
              const viewport = page.getViewport({ scale: RENDER_SCALE });
              return page.getTextContent().then((textContent) => {
                if (cancelled) return;
                textContainer.innerHTML = "";
                const textLayer = new TextLayer({
                  textContentSource: textContent,
                  container: textContainer,
                  viewport,
                });
                textLayer.render().catch(() => {});
              });
            })
            .catch(() => {});
        }
      },
      { root: scrollRef.current, rootMargin: "300px" },
    );

    ioRef.current = observer;
    for (const el of pageWrapperRefs.current) {
      if (el) observer.observe(el);
    }

    return () => {
      cancelled = true;
      observer.disconnect();
      ioRef.current = null;
    };
  }, [pdfDoc]);

  // ── Apply pending scroll before next paint after any zoom change ──────────

  useLayoutEffect(() => {
    if (!pendingScrollRef.current) return;
    pendingScrollRef.current();
    pendingScrollRef.current = null;
  }, [zoom]);

  // ── Pinch-to-zoom — anchors scroll to pinch midpoint to avoid jitter ──────

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const getDistance = (touches: TouchList): number => {
      const dx = touches[0].clientX - touches[1].clientX;
      const dy = touches[0].clientY - touches[1].clientY;
      return Math.sqrt(dx * dx + dy * dy);
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        pinchRef.current = {
          initialDistance: getDistance(e.touches),
          initialZoom: zoomRef.current,
        };
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      // Block scroll, swipe, and any other touch move while pinching.
      if (pinchRef.current) e.preventDefault();
      if (e.touches.length !== 2 || !pinchRef.current) return;

      const dist = getDistance(e.touches);
      const targetZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
        pinchRef.current.initialZoom * (dist / pinchRef.current.initialDistance),
      ));

      // Anchor both axes to the midpoint between the two fingers.
      const midX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
      const midY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
      const containerRect = el.getBoundingClientRect();
      const midXFromLeft = midX - containerRect.left;
      const midYFromTop = midY - containerRect.top;
      const ratioX = el.scrollWidth > 0 ? (el.scrollLeft + midXFromLeft) / el.scrollWidth : 0;
      const ratioY = el.scrollHeight > 0 ? (el.scrollTop + midYFromTop) / el.scrollHeight : 0;

      pendingScrollRef.current = () => {
        el.scrollLeft = ratioX * el.scrollWidth - midXFromLeft;
        el.scrollTop = ratioY * el.scrollHeight - midYFromTop;
      };
      setZoom(targetZoom);
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (e.touches.length < 2) pinchRef.current = null;
    };

    el.addEventListener("touchstart", onTouchStart, { passive: true });
    el.addEventListener("touchmove", onTouchMove, { passive: false });
    el.addEventListener("touchend", onTouchEnd, { passive: true });
    el.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener("touchstart", onTouchStart);
      el.removeEventListener("touchmove", onTouchMove);
      el.removeEventListener("touchend", onTouchEnd);
      el.removeEventListener("touchcancel", onTouchEnd);
    };
  }, []); // stable: reads zoom via ref, queues scroll via pendingScrollRef

  // ── Trackpad pinch-to-zoom via wheel+ctrlKey — anchored to cursor position ─

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();

      const containerRect = el.getBoundingClientRect();
      const cursorXFromLeft = e.clientX - containerRect.left;
      const cursorYFromTop = e.clientY - containerRect.top;
      const ratioX = el.scrollWidth > 0 ? (el.scrollLeft + cursorXFromLeft) / el.scrollWidth : 0;
      const ratioY = el.scrollHeight > 0 ? (el.scrollTop + cursorYFromTop) / el.scrollHeight : 0;

      pendingScrollRef.current = () => {
        el.scrollLeft = ratioX * el.scrollWidth - cursorXFromLeft;
        el.scrollTop = ratioY * el.scrollHeight - cursorYFromTop;
      };

      setZoom((prev) =>
        Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, prev * Math.pow(0.993, e.deltaY))),
      );
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []); // stable: reads via refs, queues scroll via pendingScrollRef

  // ── Fit-width initial zoom — runs once after the first page is available ───

  useLayoutEffect(() => {
    if (pages.length === 0 || hasSetInitialZoom.current) return;
    const el = scrollRef.current;
    if (!el || el.clientWidth === 0) return;
    // pages[0].width is at RENDER_SCALE; un-scale to get intrinsic CSS width,
    // then compute the zoom that fills the container.
    const fitZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM,
      (el.clientWidth / pages[0].width) * RENDER_SCALE,
    ));
    hasSetInitialZoom.current = true;
    setZoom(fitZoom);
  }, [pages]);

  // ── changeZoom — wraps setZoomIdx with scroll-ratio preservation ──────────

  const changeZoom = useCallback((updater: (prev: number) => number) => {
    const el = scrollRef.current;
    if (el) {
      // Anchor both axes to the center of the visible viewport.
      const midXFromLeft = el.clientWidth / 2;
      const midYFromTop = el.clientHeight / 2;
      const ratioX = el.scrollWidth > 0 ? (el.scrollLeft + midXFromLeft) / el.scrollWidth : 0;
      const ratioY = el.scrollHeight > 0 ? (el.scrollTop + midYFromTop) / el.scrollHeight : 0;
      pendingScrollRef.current = () => {
        el.scrollLeft = ratioX * el.scrollWidth - midXFromLeft;
        el.scrollTop = ratioY * el.scrollHeight - midYFromTop;
      };
    }
    setZoom((prev) => {
      // Snap to nearest ZOOM_STEP multiple before stepping so button increments
      // are always clean regardless of where continuous pinch left the zoom.
      const snapped = Math.round(prev / ZOOM_STEP) * ZOOM_STEP;
      return Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, updater(snapped)));
    });
  }, []);

  return {
    scrollRef,
    canvasRefs,
    textLayerRefs,
    pageWrapperRefs,
    zoom,
    ioRef,
    pages,
    displayScale,
    error,
    changeZoom,
  };
}
