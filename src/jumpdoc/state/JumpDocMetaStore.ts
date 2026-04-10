/**
 * JumpDocMetaStore — lightweight store for server-side JumpDoc metadata.
 *
 * This is separate from JumpDocStore (which holds document contents + undo stack).
 * These fields live on the MongoDB document, not inside `contents`.
 */
import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";

export type JumpDocAttributes = {
  genre: string[];
  medium: string[];
  franchise: string[];
  supernaturalElements: string[];
};

const EMPTY_ATTRIBUTES: JumpDocAttributes = {
  genre: [],
  medium: [],
  franchise: [],
  supernaturalElements: [],
};

type JumpDocMetaState = {
  docMongoId: string;
  published: boolean;
  nsfw: boolean;
  attributes: JumpDocAttributes;
  /** MongoDB _id of the current cover image, or null if none. */
  imageId: string | null;
  /** Public URL of the current cover image, or null if none. */
  imageUrl: string | null;
  /** Local file:// URL of the PDF (Electron only). Overrides doc.url in PdfViewer. */
  pdfUrl: string | null;
};

type JumpDocMetaStore = JumpDocMetaState & {
  setMeta: (meta: JumpDocMetaState) => void;
  setPublished: (published: boolean) => void;
  setNsfw: (nsfw: boolean) => void;
  setAttributes: (attributes: JumpDocAttributes) => void;
  setCoverImage: (imageId: string | null, imageUrl: string | null) => void;
};

export const useJumpDocMetaStore = create<JumpDocMetaStore>((set) => ({
  docMongoId: "",
  published: false,
  nsfw: false,
  attributes: EMPTY_ATTRIBUTES,
  imageId: null,
  imageUrl: null,
  pdfUrl: null,
  setMeta: (meta) => set(meta),
  setPublished: (published) => set({ published }),
  setNsfw: (nsfw) => set({ nsfw }),
  setAttributes: (attributes) => set({ attributes }),
  setCoverImage: (imageId, imageUrl) => set({ imageId, imageUrl }),
}));

export function useJumpDocMeta() {
  return useJumpDocMetaStore(
    useShallow((s) => ({
      docMongoId: s.docMongoId,
      published: s.published,
      nsfw: s.nsfw,
      attributes: s.attributes,
      imageId: s.imageId,
      imageUrl: s.imageUrl,
      pdfUrl: s.pdfUrl,
    })),
  );
}
