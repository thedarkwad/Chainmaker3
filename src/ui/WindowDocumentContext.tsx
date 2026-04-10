/**
 * Provides the Document of the window the component is rendering into.
 * Defaults to the main window's document; NewWindowPortal overrides it
 * with the popup window's document so pdfjs and other DOM-aware APIs
 * can inject resources (fonts, canvases, etc.) into the right document.
 */
import { createContext, useContext } from "react";

export const WindowDocumentContext = createContext<Document>(
  typeof document !== "undefined" ? document : (null as unknown as Document),
);

export function useWindowDocument(): Document {
  return useContext(WindowDocumentContext);
}
