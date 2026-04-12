/// <reference lib="webworker" />

// Static imports are hoisted and evaluated BEFORE the module body, so the shim
// below would be too late to help. We therefore use dynamic imports so that the
// shim runs first, before @react-pdf/renderer (or its deps) access `window`.
(globalThis as unknown as Record<string, unknown>).window = globalThis;

// `import type` is erased at compile-time and produces no runtime code, so it
// is safe to keep as a static import.
import type { PdfWorkerInput } from "../types";

self.onmessage = async (e: MessageEvent<PdfWorkerInput>) => {
  try {
    const { registerFonts } = await import("./themes");
    const fontsDir =
      self.location.protocol === "file:"
        ? new URL("../fonts", import.meta.url).href.replace(/\/$/, "")
        : "/fonts";
    registerFonts(fontsDir);

    const [{ createElement }, { pdf }, { ChainExportDocument }, { PurchaseListDocument }] =
      await Promise.all([
        import("react"),
        import("@react-pdf/renderer"),
        import("./ChainExportDocument"),
        import("./PurchaseListDocument"),
      ]);

    const input = e.data;
    const element =
      input.kind === "chain"
        ? createElement(ChainExportDocument, { ir: input.ir, options: input.options })
        : createElement(PurchaseListDocument, {
            ir: input.ir,
            pdfColorTheme: input.pdfColorTheme,
            pdfFont: input.pdfFont,
            pdfDark: input.pdfDark,
            resolvedAppThemePalette: input.resolvedAppThemePalette,
          });

    const blob = await pdf(element as Parameters<typeof pdf>[0]).toBlob();
    const buffer = await blob.arrayBuffer();
    self.postMessage({ ok: true, buffer }, [buffer]);
  } catch (err) {
    const msg = err instanceof Error
      ? `${err.name}: ${err.message}\n${err.stack ?? "(no stack)"}`
      : String(err);
    console.error("[pdfWorker] error:", err);
    self.postMessage({ ok: false, error: msg });
  }
};
