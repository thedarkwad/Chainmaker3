import { create } from "zustand";

/**
 * Lightweight cache mapping image MongoDB _ids to their public URLs.
 * Populated in bulk when a chain loads; updated individually when the user
 * picks or removes an image on an alt-form.
 */
type ImageUrlCacheState = {
  urls: Record<string, string>;
  setUrls: (urls: Record<string, string>) => void;
  setUrl: (imgId: string, url: string) => void;
  removeUrl: (imgId: string) => void;
};

export const useImageUrlCache = create<ImageUrlCacheState>((set) => ({
  urls: {},
  setUrls: (urls) => set({ urls }),
  setUrl: (imgId, url) =>
    set((s) => ({ urls: { ...s.urls, [imgId]: url } })),
  removeUrl: (imgId) =>
    set((s) => {
      const next = { ...s.urls };
      delete next[imgId];
      return { urls: next };
    }),
}));

/** Returns the resolved URL for an internal image id, or "" if not yet cached. */
export function useImageUrl(imgId: string | undefined): string {
  return useImageUrlCache((s) => (imgId ? (s.urls[imgId] ?? "") : ""));
}
