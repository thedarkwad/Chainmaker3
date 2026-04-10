// Electron replacement for @/api/jumpdocs.
// Reads .jumpdoc files from a local folder instead of fetching from the server.

export type { SaveResult, SaveStatus } from "@/api/types";

export type JumpDocAttributes = {
  genre: string[];
  medium: string[];
  franchise: string[];
  // supernaturalElements: string[];
};

export type JumpDocSummary = {
  _id: string;
  /** In Electron, publicUid is the absolute file path of the .jumpdoc file. */
  publicUid: string;
  name: string;
  author: string[];
  createdAt: string;
  updatedAt: string;
  published: boolean;
  imageUrl?: string;
  attributes: JumpDocAttributes;
  isOwner?: boolean;
};

export type JumpDocGalleryParams = {
  page: number;
  pageSize: number;
  sortKey: "name" | "updatedAt" | "createdAt";
  sortDir: "asc" | "desc";
  search?: string;
  idToken?: string;
};

export type JumpDocGalleryPage = {
  docs: JumpDocSummary[];
  total: number;
};

function getAPI() {
  return window.electronAPI?.jumpdocs;
}

const EMPTY_ATTRS: JumpDocAttributes = {
  genre: [],
  medium: [],
  franchise: [],
  // supernaturalElements: [],
};

/**
 * Lists published jumpdocs — in Electron this scans the configured local folder.
 * Filtering is done client-side (search param is ignored server-side).
 */
export async function listPublishedJumpDocs(
  params: { data: JumpDocGalleryParams } | JumpDocGalleryParams,
): Promise<JumpDocGalleryPage> {
  // Support both the createServerFn-style { data: ... } wrapper and direct call
  const p = "data" in params ? params.data : params;
  const api = getAPI();
  if (!api) return { docs: [], total: 0 };

  const metas = await api.listJumpdocs();

  // Local search filtering
  const search = (p.search ?? "").toLowerCase().trim();
  let filtered = metas;
  if (search) {
    filtered = metas.filter(
      (m) =>
        m.name.toLowerCase().includes(search) ||
        m.author.some((a) => a.toLowerCase().includes(search)),
    );
  }

  // Sorting (local .jumpdocs only support name sort meaningfully)
  if (p.sortKey === "name") {
    filtered = [...filtered].sort((a, b) =>
      p.sortDir === "asc" ? a.name.localeCompare(b.name) : b.name.localeCompare(a.name),
    );
  }

  // Pagination
  const total = filtered.length;
  const page = p.page ?? 1;
  const pageSize = p.pageSize ?? 24;
  const paged = filtered.slice((page - 1) * pageSize, page * pageSize);

  const docs: JumpDocSummary[] = paged.map((m) => ({
    _id: m.filePath,
    publicUid: m.filePath,
    name: m.name,
    author: m.author,
    createdAt: "",
    updatedAt: "",
    published: true,
    nsfw: m.nsfw ?? false,
    attributes: m.attributes ?? EMPTY_ATTRS,
    ...(m.imageUrl ? { imageUrl: m.imageUrl } : {}),
  }));

  return { docs, total };
}

/** Loads a single jumpdoc by its UUID. The IPC layer resolves UUID → file path internally. */
export async function loadJumpDoc(
  params: { data: { publicUid: string; idToken?: string } } | { publicUid: string },
) {
  const publicUid = "data" in params ? params.data.publicUid : params.publicUid;
  const api = getAPI();
  if (!api) throw new Error("Electron API not available");

  const result = await api.loadJumpdoc(publicUid);
  return {
    contents: result.data,
    edits: 0,
    docMongoId: publicUid,
    published: true,
    attributes: result.attributes ?? EMPTY_ATTRS,
    nsfw: result.nsfw ?? false,
    imageId: null,
    imageUrl: result.thumbTempPath ?? null,
    pdfUrl: result.pdfTempPath,
  };
}

// ── Stubs for web-only functions ──────────────────────────────────────────────

export async function listJumpDocs(_idToken: string) {
  return [];
}

export async function saveJumpDoc(
  params: unknown,
): Promise<
  | { status: "ok"; edits: number }
  | { status: "bad_patches" | "not_found" | "conflict" | "unauthorized" }
> {
  const { docMongoId, patches } = (params as { data: { docMongoId: string; patches: unknown[] } })
    .data;
  const api = getAPI();
  const result = await api?.saveJumpdoc(docMongoId, patches);
  return result?.ok ? { status: "ok", edits: 1 } : { status: "bad_patches" };
}

export async function deleteJumpDoc(_params: unknown) {
  return { status: "ok" as const };
}

export async function forceReplaceJumpDoc(_params: unknown) {
  return { status: "ok" as const, edits: 0 };
}

export async function publishJumpDoc(params: unknown) {
  const { docMongoId, attributes, nsfw } = (
    params as { data: { docMongoId: string; attributes: JumpDocAttributes; nsfw: boolean } }
  ).data;
  const api = getAPI();
  if (api)
    await api.saveJumpdocMeta(docMongoId, {
      attributes: { ...attributes, supernaturalElements: [] },
      nsfw,
    });
  return { status: "ok" as const };
}

export async function createJumpDoc(_params: unknown): Promise<{ publicUid: string }> {
  throw new Error("JumpDoc creation not available in desktop app");
}

export async function getPublishedJumpDocSummary(_params: unknown): Promise<null> {
  return null;
}

export async function getJumpDocPdfUrl(
  _params: unknown,
): Promise<{ pdfUrl: string | null; name: string }> {
  return { pdfUrl: null, name: "" };
}

export async function buildJumpDocZip(
  _params: unknown,
): Promise<{ zipBase64: string; name: string }> {
  return { zipBase64: "", name: "" };
}

export async function importJumpDoc(_params: unknown): Promise<{ publicUid: string }> {
  throw new Error("importJumpDoc is not available in Electron.");
}
