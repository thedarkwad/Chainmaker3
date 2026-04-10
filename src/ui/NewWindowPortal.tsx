/**
 * NewWindowPortal — renders children into a new browser window via React Portal.
 *
 * The new window shares the same JS context as the opener (no "noopener"),
 * so React contexts, Zustand stores, and future postMessage APIs all work.
 * Stylesheets and the <html> element's attributes (including theme classes)
 * are copied from the main document and kept in sync.
 *
 * WindowDocumentContext is provided with the popup's document so that
 * DOM-aware APIs (e.g. pdfjs ownerDocument) can target the right document.
 */

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { WindowDocumentContext } from "./WindowDocumentContext";

export type NewWindowPortalProps = {
  children: React.ReactNode;
  title?: string;
  width?: number;
  height?: number;
  /** Called when the user closes the window (NOT when the component unmounts). */
  onClose?: () => void;
};

export function NewWindowPortal({
  children,
  title,
  width = 960,
  height = 860,
  onClose,
}: NewWindowPortalProps) {
  // Store both the mount element and the popup's document together so the
  // context value and the portal target are always in sync.
  const [portalTarget, setPortalTarget] = useState<{
    el: HTMLElement;
    doc: Document;
  } | null>(null);

  const winRef = useRef<Window | null>(null);
  // Stable ref so the close handler always calls the latest callback.
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    const win = window.open("", "_blank", `width=${width},height=${height}`);
    if (!win) {
      // Pop-up blocked — treat as immediate user close.
      onCloseRef.current?.();
      return;
    }
    winRef.current = win;

    // ── Copy html attributes (theme class, data-* attributes, etc.) ──────────
    const srcHtml = document.documentElement;
    const syncHtmlAttrs = () => {
      for (const attr of Array.from(srcHtml.attributes)) {
        win.document.documentElement.setAttribute(attr.name, attr.value);
      }
    };
    syncHtmlAttrs();

    // ── Set base URL so relative paths (fonts, images, etc.) resolve correctly ─
    const base = win.document.createElement("base");
    base.href = window.location.origin + "/";
    win.document.head.appendChild(base);

    // ── Copy all stylesheets from the main document ───────────────────────────
    // Use link.href (property) for <link> elements — it's always the resolved
    // absolute URL, unlike the raw href attribute which may be relative and
    // fail to resolve in about:blank even with the <base> tag above.
    for (const node of Array.from(
      document.querySelectorAll('link[rel="stylesheet"], style'),
    )) {
      if (node.tagName === "LINK") {
        const newLink = win.document.createElement("link");
        newLink.rel = "stylesheet";
        newLink.href = (node as HTMLLinkElement).href; // absolute URL
        win.document.head.appendChild(newLink);
      } else {
        win.document.head.appendChild(node.cloneNode(true));
      }
    }

    if (title) win.document.title = title;

    // ── Body / mount element ─────────────────────────────────────────────────
    win.document.body.style.margin = "0";
    win.document.body.style.overflow = "hidden";
    const div = win.document.createElement("div");
    div.style.cssText = "height:100dvh;display:flex;flex-direction:column;overflow:hidden;";
    win.document.body.appendChild(div);
    setPortalTarget({ el: div, doc: win.document });

    // ── Sync html attributes when the main document's theme changes ──────────
    const attrObserver = new MutationObserver(syncHtmlAttrs);
    attrObserver.observe(srcHtml, { attributes: true });

    // ── Detect when the USER closes the pop-out window ────────────────────────
    // Use a named function so we can remove it before programmatic close,
    // preventing onClose from firing when the component unmounts.
    const handleBeforeUnload = () => {
      clearInterval(closePoll);
      onCloseRef.current?.();
    };
    win.addEventListener("beforeunload", handleBeforeUnload);

    // Belt-and-suspenders poll in case beforeunload doesn't fire (e.g. some browsers).
    const closePoll = setInterval(() => {
      if (win.closed) {
        clearInterval(closePoll);
        onCloseRef.current?.();
      }
    }, 400);

    return () => {
      // Null out portalTarget first so React doesn't try to render into a closed window's DOM.
      setPortalTarget(null);
      attrObserver.disconnect();
      clearInterval(closePoll);
      if (!win.closed) {
        // Remove the listener BEFORE closing so our own programmatic close
        // doesn't trigger onClose (which would corrupt parent state in StrictMode).
        win.removeEventListener("beforeunload", handleBeforeUnload);
        win.close();
      }
    };
    // Intentionally empty deps — the window lives for the lifetime of this portal instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!portalTarget) return null;
  return (
    <WindowDocumentContext.Provider value={portalTarget.doc}>
      {createPortal(children, portalTarget.el)}
    </WindowDocumentContext.Provider>
  );
}
