// Electron replacement for @/api/images.
// Images are local files stored in the chain's temp directory.
// Exports the same function signatures used by chain editor components.

export type ImageSummary = {
  _id: string;
  path: string;
  bytes: number;
  uploadType: "native" | "imagechest";
  createdAt: string;
};

function getAPI() {
  return window.electronAPI;
}

/** Resolves a single image ID to its local file:// URL. */
export async function getImagePath(imgId: string): Promise<string | null> {
  // In Electron, image paths are already cached in ImageUrlCache at load time.
  // This is only called for newly-added images, which are already in the cache.
  void imgId;
  return null;
}

/**
 * Batch-resolves image IDs to their file:// URLs.
 * In Electron, images are already in the ImageUrlCache (populated by loadChain).
 * Returns the cached entries so the route's setUrls call doesn't wipe them.
 */
export async function getImagePaths(
  params: string[] | { data: string[] },
): Promise<Record<string, string>> {
  const imgIds = Array.isArray(params) ? params : params.data;
  const { useImageUrlCache } = await import("@/chain/state/ImageUrlCache");
  const cached = useImageUrlCache.getState().urls;
  const result: Record<string, string> = {};
  for (const id of imgIds) {
    if (cached[id]) result[id] = cached[id];
  }
  return result;
}

export async function uploadImage(_data: unknown): Promise<ImageSummary> {
  const api = getAPI();
  if (!api) throw new Error("Electron API not available");
  const result = await api.images.uploadImage();
  if (!result) throw new Error("Image upload cancelled");
  return {
    _id: result.id,
    path: result.url,
    bytes: 0,
    uploadType: "native",
    createdAt: new Date().toISOString(),
  };
}

export async function listUserImages(_idToken: string): Promise<ImageSummary[]> {
  return [];
}

export type DeleteImageResult =
  | { status: "ok" }
  | { status: "not_found" }
  | { status: "unauthorized" };

export async function deleteImage(data: { imageId: string } | unknown): Promise<DeleteImageResult> {
  const api = getAPI();
  if (!api) return { status: "not_found" };
  const imageId = (data as { imageId?: string })?.imageId;
  if (!imageId) return { status: "not_found" };
  await api.images.deleteImage(imageId);
  return { status: "ok" };
}

// Stubs for web-only functions referenced by some routes
export async function uploadImgChestImage(_data: unknown): Promise<ImageSummary> {
  throw new Error("ImgChest upload not available in desktop app");
}
export async function unlinkImage(_data: unknown): Promise<DeleteImageResult> {
  return { status: "not_found" };
}
export async function getImageUsedIn(_data: unknown): Promise<unknown[]> {
  return [];
}
