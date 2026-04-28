import fs from "fs";
import os from "os";
import path from "path";
import crypto from "crypto";
import { dialog, app } from "electron";
import { execFile } from "child_process";
import { promisify } from "util";
import AdmZip from "adm-zip";
import sharp from "sharp";

const execFileAsync = promisify(execFile);

/** Resolves the Ghostscript binary path for both dev and packaged builds. */
function getGsBinaryPath(): string {
  const binaryName = process.platform === "win32" ? "gswin64c.exe" : "gs";
  const rel = path.join("node_modules", "compress-pdf", "bin", "gs", "bin", binaryName);
  if (app.isPackaged) {
    // Binary is extracted from the asar to app.asar.unpacked via asarUnpack config.
    return path.join(process.resourcesPath, "app.asar.unpacked", rel);
  }
  // Dev: node_modules lives at the project root (app.getAppPath()).
  return path.join(app.getAppPath(), rel);
}

/** Runs Ghostscript to compress a PDF buffer. Returns the original buffer if compression makes it larger. */
async function compressPdf(input: Buffer): Promise<Buffer> {
  const gsBin = getGsBinaryPath();
  const tmpIn = path.join(os.tmpdir(), `gs-in-${crypto.randomUUID()}.pdf`);
  const tmpOut = path.join(os.tmpdir(), `gs-out-${crypto.randomUUID()}.pdf`);
  try {
    fs.writeFileSync(tmpIn, input);
    await execFileAsync(gsBin, [
      "-q", "-dNOPAUSE", "-dBATCH", "-dSAFER",
      "-dSimulateOverprint=true",
      "-sDEVICE=pdfwrite",
      "-dCompatibilityLevel=1.4",
      "-dPDFSETTINGS=/ebook",
      "-dEmbedAllFonts=true",
      "-dSubsetFonts=true",
      "-dAutoRotatePages=/None",
      "-dColorImageDownsampleType=/Bicubic",
      "-dColorImageResolution=100",
      "-dGrayImageDownsampleType=/Bicubic",
      "-dGrayImageResolution=100",
      "-dMonoImageDownsampleType=/Bicubic",
      "-dMonoImageResolution=100",
      `-sOutputFile=${tmpOut}`,
      "-sOwnerPassword=",
      "-sUserPassword=",
      tmpIn,
    ]);
    return fs.readFileSync(tmpOut);
  } finally {
    try { fs.unlinkSync(tmpIn); } catch { /* already gone */ }
    try { fs.unlinkSync(tmpOut); } catch { /* not written */ }
  }
}
import { getSettings, setSettings } from "./settings";
import type { ElectronJumpDocLoadResult, ElectronJumpDocMeta, ElectronJumpDocSaveMeta } from "../../src/types/electron";

// ── In-memory state ───────────────────────────────────────────────────────────

// The UUID of the jumpdoc currently open in the editor (only one at a time).
let currentJumpdocId: string | null = null;

// Pending (unsaved) jumpdocs: UUID → { data, pdfTempPath }
const pendingJumpdocs = new Map<string, { data: unknown; pdfTempPath: string }>();
const pendingJumpdocIds = new Set<string>();
// UUID → real filePath, set after the first save of a pending jumpdoc.
const pendingJumpdocToSaved = new Map<string, string>();
// UUID → filePath for jumpdocs loaded from disk.
const jumpdocIdToPath = new Map<string, string>();
// filePath → UUID (reverse, for stable ID reuse).
const jumpdocPathToId = new Map<string, string>();
// Cache of last-written data — used by saveJumpdocMeta to re-write the zip.
const jumpdocCache = new Map<string, unknown>();
// Cache of gallery metadata (attributes, nsfw) loaded/set per UUID.
const jumpdocMetaCache = new Map<string, ElectronJumpDocSaveMeta>();

// ── Temp dir helpers ──────────────────────────────────────────────────────────

function jumpdocTempDir(id: string): string {
  return path.join(os.tmpdir(), `chainmaker-jd-${id}`);
}

function getOrAssignId(filePath: string): string {
  const existing = jumpdocPathToId.get(filePath);
  if (existing) return existing;
  const id = crypto.randomUUID();
  jumpdocPathToId.set(filePath, id);
  jumpdocIdToPath.set(id, filePath);
  return id;
}

function resolveFilePath(id: string): string | undefined {
  let p = pendingJumpdocToSaved.get(id) ?? jumpdocIdToPath.get(id);
  if (p) return p;

  const folder = getSettings().jumpdocFolder;
  if (!folder || !fs.existsSync(folder)) return undefined;

  const index = readIndex(folder);
  for (const filename of Object.keys(index.entries)) {
    const entry = index.entries[filename];
    if (entry.id === id) {
      const fullPath = path.join(folder, filename);
      jumpdocIdToPath.set(id, fullPath);
      jumpdocPathToId.set(fullPath, id);
      return fullPath;
    }
  }

  // Fallback: full scan if not in index. listJumpdocs() populates the maps.
  listJumpdocs();
  return jumpdocIdToPath.get(id);
}

// ── Index helpers ─────────────────────────────────────────────────────────────

type IndexEntry = {
  id: string;
  createdAt: number;
  mtime: number;
  name: string;
  author: string[];
  version?: string;
  /** Relative path within the jumpdoc folder, e.g. "_thumbs/uuid.jpg", or null. */
  thumbFile: string | null;
  /** Timestamp of last thumb write */
  thumbMtime?: number;
  attributes?: ElectronJumpDocSaveMeta["attributes"];
  nsfw?: boolean;
};

type JumpdocIndex = {
  version: 1;
  entries: Record<string, IndexEntry>; // keyed by basename e.g. "Worm.jumpdoc"
};

function indexPath(folder: string): string {
  return path.join(folder, "_index.json");
}

function thumbsDir(folder: string): string {
  return path.join(folder, "_thumbs");
}

function readIndex(folder: string): JumpdocIndex {
  try {
    const raw = fs.readFileSync(indexPath(folder), "utf-8");
    const parsed = JSON.parse(raw) as Partial<JumpdocIndex>;
    if (parsed.version === 1 && parsed.entries) return parsed as JumpdocIndex;
  } catch { /* missing or corrupt — start fresh */ }
  return { version: 1, entries: {} };
}

function writeIndex(folder: string, index: JumpdocIndex): void {
  const tmp = indexPath(folder) + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(index, null, 2), "utf-8");
  fs.renameSync(tmp, indexPath(folder));
}

/**
 * Reads meta.json from a zip and extracts the thumbnail (if any) to the
 * _thumbs folder. Returns the updated index entry.
 */
function buildIndexEntry(
  folder: string,
  filename: string,
  filePath: string,
  mtime: number,
  existingId: string | undefined,
  existingCreatedAt: number | undefined,
): IndexEntry | null {
  try {
    const zip = new AdmZip(filePath);
    const metaEntry = zip.getEntry("meta.json");
    if (!metaEntry) return null;

    const meta = JSON.parse(zip.readAsText(metaEntry)) as {
      name?: string;
      author?: string | string[];
      version?: string;
      attributes?: Record<string, unknown>;
      nsfw?: boolean;
    };

    // Also read data.json for version if not in meta.
    const dataEntry = zip.getEntry("data.json");
    const dataVersion = dataEntry
      ? (JSON.parse(zip.readAsText(dataEntry)) as { version?: string }).version
      : undefined;

    const name = meta.name ?? filename.replace(/\.jumpdoc$/i, "");
    const author = Array.isArray(meta.author)
      ? meta.author
      : meta.author
        ? meta.author.split(",").map((s: string) => s.trim()).filter(Boolean)
        : [];
    const version = (meta.version ?? dataVersion ?? "").trim() || undefined;
    const attributes = meta.attributes
      ? {
          genre: Array.isArray(meta.attributes.genre) ? (meta.attributes.genre as string[]) : [],
          medium: Array.isArray(meta.attributes.medium) ? (meta.attributes.medium as string[]) : [],
          franchise: Array.isArray(meta.attributes.franchise) ? (meta.attributes.franchise as string[]) : [],
          supernaturalElements: Array.isArray(meta.attributes.supernaturalElements) ? (meta.attributes.supernaturalElements as string[]) : [],
        }
      : undefined;
    const nsfw = typeof meta.nsfw === "boolean" ? meta.nsfw : undefined;

    const id = existingId ?? crypto.randomUUID();
    const createdAt = existingCreatedAt ?? fs.statSync(filePath).birthtimeMs;

    // Extract thumbnail if present.
    let thumbFile: string | null = null;
    for (const entry of zip.getEntries()) {
      if (/^thumb\.[a-z]+$/i.test(entry.entryName) && !entry.isDirectory) {
        const ext = path.extname(entry.entryName);
        const thumbsFolder = thumbsDir(folder);
        fs.mkdirSync(thumbsFolder, { recursive: true });
        const thumbFilename = `${id}${ext}`;
        zip.extractEntryTo(entry, thumbsFolder, false, true, false, thumbFilename);
        thumbFile = path.join("_thumbs", thumbFilename);
        break;
      }
    }

    // Register the ID↔path maps.
    jumpdocIdToPath.set(id, filePath);
    jumpdocPathToId.set(filePath, id);

    return { id, createdAt, mtime, name, author, ...(version ? { version } : {}), thumbFile, ...(attributes ? { attributes } : {}), ...(nsfw !== undefined ? { nsfw } : {}) };
  } catch {
    return null;
  }
}

/** Updates a single index entry after a save, without re-reading the zip. */
function updateIndexEntry(folder: string, filePath: string, data: unknown, id: string): void {
  const filename = path.basename(filePath);
  const index = readIndex(folder);
  const mtime = fs.statSync(filePath).mtimeMs;
  const existing = index.entries[filename];
  const name = (data as { name?: string }).name ?? filename.replace(/\.jumpdoc$/i, "");
  const author = (data as { author?: string | string[] }).author ?? [];
  const authorArr = Array.isArray(author)
    ? author
    : author ? String(author).split(",").map((s) => s.trim()).filter(Boolean) : [];
  const version = ((data as { version?: string }).version ?? "").trim() || undefined;

  const meta = jumpdocMetaCache.get(id);
  index.entries[filename] = {
    id,
    createdAt: existing?.createdAt ?? fs.statSync(filePath).birthtimeMs,
    mtime,
    name,
    author: authorArr,
    ...(version ? { version } : {}),
    thumbFile: existing?.thumbFile ?? null,
    ...(existing?.thumbMtime !== undefined ? { thumbMtime: existing.thumbMtime } : {}),
    ...(meta ? { attributes: meta.attributes, nsfw: meta.nsfw } : {
      attributes: existing?.attributes,
      nsfw: existing?.nsfw,
    }),
  };
  writeIndex(folder, index);
}

// ── Public IPC handlers ───────────────────────────────────────────────────────

export function getJumpdocFolder(): string | null {
  return getSettings().jumpdocFolder;
}

export async function setJumpdocFolder(): Promise<string | null> {
  const result = await dialog.showOpenDialog({
    title: "Select JumpDoc Folder",
    properties: ["openDirectory"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  const folder = result.filePaths[0];
  setSettings({ jumpdocFolder: folder });
  return folder;
}

export function listJumpdocs(): ElectronJumpDocMeta[] {
  const folder = getSettings().jumpdocFolder;
  if (!folder || !fs.existsSync(folder)) return [];

  let filenames: string[];
  try {
    filenames = fs.readdirSync(folder);
  } catch {
    return [];
  }

  const index = readIndex(folder);
  let indexDirty = false;
  const seenFilenames = new Set<string>();

  const results: ElectronJumpDocMeta[] = [];

  for (const filename of filenames) {
    if (!filename.toLowerCase().endsWith(".jumpdoc")) continue;
    const filePath = path.join(folder, filename);
    seenFilenames.add(filename);

    let mtime: number;
    try {
      mtime = fs.statSync(filePath).mtimeMs;
    } catch {
      continue;
    }

    const cached = index.entries[filename];

    if (cached && cached.mtime === mtime) {
      // Cache hit — restore ID maps and use cached metadata.
      jumpdocIdToPath.set(cached.id, filePath);
      jumpdocPathToId.set(filePath, cached.id);
      if (cached.createdAt === undefined) {
        cached.createdAt = fs.statSync(filePath).birthtimeMs;
        index.entries[filename] = cached;
        indexDirty = true;
      }

      const tmpDir = jumpdocTempDir(cached.id);
      if (fs.existsSync(tmpDir)) {
        const tmpThumb = fs.readdirSync(tmpDir).find((f) => /^thumb\./i.test(f));
        if (tmpThumb) {
          const tmpThumbPath = path.join(tmpDir, tmpThumb);
          const tmpMtime = fs.statSync(tmpThumbPath).mtimeMs;
          const existingThumbPath = cached.thumbFile ? path.join(folder, cached.thumbFile) : null;
          const existingMtime = existingThumbPath && fs.existsSync(existingThumbPath)
            ? fs.statSync(existingThumbPath).mtimeMs
            : 0;
          if (tmpMtime > existingMtime) {
            const thumbsFolder = thumbsDir(folder);
            fs.mkdirSync(thumbsFolder, { recursive: true });
            const ext = path.extname(tmpThumb);
            // Remove any existing thumbs for this id.
            for (const f of fs.readdirSync(thumbsFolder)) {
              if (f.startsWith(cached.id)) fs.unlinkSync(path.join(thumbsFolder, f));
            }
            const thumbFilename = `${cached.id}${ext}`;
            fs.copyFileSync(tmpThumbPath, path.join(thumbsFolder, thumbFilename));
            cached.thumbFile = path.join("_thumbs", thumbFilename);
            index.entries[filename] = cached;
            indexDirty = true;
          }
        }
      }

      const thumbPath = cached.thumbFile
        ? `file:///${path.join(folder, cached.thumbFile).replace(/\\/g, "/")}${cached.thumbMtime ? `?t=${cached.thumbMtime}` : ""}`
        : undefined;
      results.push({ filePath: cached.id, name: cached.name, author: cached.author, version: cached.version, imageUrl: thumbPath, attributes: cached.attributes, nsfw: cached.nsfw, createdAt: cached.createdAt, updatedAt: cached.mtime });
    } else {
      // Cache miss — read zip, extract thumb, update index.
      const entry = buildIndexEntry(folder, filename, filePath, mtime, cached?.id, cached?.createdAt);
      if (!entry) continue;
      index.entries[filename] = entry;
      indexDirty = true;
      const thumbPath = entry.thumbFile
        ? `file:///${path.join(folder, entry.thumbFile).replace(/\\/g, "/")}${entry.thumbMtime ? `?t=${entry.thumbMtime}` : ""}`
        : undefined;
      results.push({ filePath: entry.id, name: entry.name, author: entry.author, version: entry.version, imageUrl: thumbPath, attributes: entry.attributes, nsfw: entry.nsfw, createdAt: entry.createdAt, updatedAt: entry.mtime });
    }
  }

  // Remove stale index entries and orphaned thumbs for deleted files.
  for (const filename of Object.keys(index.entries)) {
    if (!seenFilenames.has(filename)) {
      const stale = index.entries[filename];
      if (stale.thumbFile) {
        const thumbPath = path.join(folder, stale.thumbFile);
        try { fs.unlinkSync(thumbPath); } catch { /* already gone */ }
      }
      delete index.entries[filename];
      indexDirty = true;
    }
  }

  if (indexDirty) writeIndex(folder, index);

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

async function registerJumpdocFromPdf(pdfPath: string): Promise<{ filePath: string }> {
  const id = crypto.randomUUID();
  const name = path.basename(pdfPath, ".pdf").replace(/[<>:"/\\|?*]/g, "_");
  const data = {
    name, url: "", author: "",
    duration: { days: 0, months: 0, years: 10 },
    originCategories: {
      fId: 4,
      O: {
        0: { name: "Age", singleLine: true, multiple: false, options: [] },
        1: { name: "Gender", singleLine: true, multiple: false, options: [] },
        2: { name: "Location", singleLine: false, multiple: false },
        3: { name: "Origin", singleLine: false, multiple: false, providesDiscounts: true },
      },
    },
    origins: { fId: 0, O: {} },
    currencies: {
      fId: 1,
      O: {
        0: { name: "CP", abbrev: "CP", budget: 1000, essential: true, discountFreeThreshold: 100 },
      },
    },
    purchaseSubtypes: {
      fId: 2,
      O: {
        0: { name: "Perk", stipend: [], type: 0, essential: true, allowSubpurchases: false, placement: "normal", defaultCurrency: 0 },
        1: { name: "Item", stipend: [], type: 1, essential: true, allowSubpurchases: false, placement: "normal", defaultCurrency: 0 },
      },
    },
    availableCurrencyExchanges: [],
    availablePurchases: { fId: 0, O: {} },
    availableCompanions: { fId: 0, O: {} },
    availableDrawbacks: { fId: 0, O: {} },
    availableScenarios: { fId: 0, O: {} },
  };
  const tmpDir = jumpdocTempDir(id);
  fs.mkdirSync(tmpDir, { recursive: true });
  const pdfDest = path.join(tmpDir, "pdf.pdf");

  console.log(`[pdf] reading: ${pdfPath}`);
  const raw = fs.readFileSync(pdfPath);
  console.log(`[pdf] read ${raw.length} bytes — starting Ghostscript compression (resolution: ebook)…`);
  const compressStart = Date.now();

  console.log(`[pdf] gs binary: ${getGsBinaryPath()}`);
  let compressed: Buffer;
  try {
    compressed = await compressPdf(raw);
    console.log(`[pdf] Ghostscript finished in ${Date.now() - compressStart}ms`);
  } catch (err) {
    console.error(`[pdf] Ghostscript threw after ${Date.now() - compressStart}ms:`, err);
    throw err;
  }

  const savedBytes = raw.length - compressed.length;
  const savedPct = ((savedBytes / raw.length) * 100).toFixed(1);
  if (compressed.length < raw.length) {
    console.log(`[pdf] compressed ${raw.length} → ${compressed.length} bytes (saved ${savedPct}%) — writing to ${pdfDest}`);
    fs.writeFileSync(pdfDest, compressed);
  } else {
    console.log(`[pdf] compression had no effect (${raw.length} bytes) — copying original to ${pdfDest}`);
    fs.copyFileSync(pdfPath, pdfDest);
  }
  console.log(`[pdf] done, temp path: ${pdfDest}`);

  const pdfTempPath = `file:///${pdfDest.replace(/\\/g, "/")}`;
  pendingJumpdocs.set(id, { data, pdfTempPath });
  pendingJumpdocIds.add(id);
  jumpdocCache.set(id, data);
  return { filePath: id };
}

export async function initNewJumpdoc(
  onPdfSelected?: () => void,
): Promise<{ filePath: string } | null> {
  const result = await dialog.showOpenDialog({
    title: "Select PDF",
    filters: [{ name: "PDF", extensions: ["pdf"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  onPdfSelected?.();
  return await registerJumpdocFromPdf(result.filePaths[0]);
}

/** Opens a .jumpdoc file by path (e.g. from a file-association open), returns its stable ID. */
export function openJumpdocFromPath(filePath: string): { filePath: string } {
  const id = getOrAssignId(filePath);
  currentJumpdocId = id;
  return { filePath: id };
}

export async function openJumpdocFilePicker(
  onPdfSelected?: () => void,
): Promise<{ filePath: string } | null> {
  const result = await dialog.showOpenDialog({
    title: "Open JumpDoc",
    filters: [{ name: "JumpDoc or PDF", extensions: ["jumpdoc", "pdf"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  if (result.filePaths[0].toLowerCase().endsWith(".pdf")) {
    onPdfSelected?.();
    return await registerJumpdocFromPdf(result.filePaths[0]);
  }
  return { filePath: getOrAssignId(result.filePaths[0]) };
}

export function loadJumpdoc(id: string): ElectronJumpDocLoadResult & { isPending: boolean } {
  currentJumpdocId = id;
  const pending = pendingJumpdocs.get(id);
  if (pending) return { data: pending.data, pdfTempPath: pending.pdfTempPath, isPending: true };

  const filePath = resolveFilePath(id);
  if (!filePath) throw new Error("JumpDoc not found");

  const zip = new AdmZip(filePath);

  const dataEntry = zip.getEntry("data.json");
  if (!dataEntry) throw new Error("Invalid .jumpdoc file: missing data.json");
  const data = JSON.parse(zip.readAsText(dataEntry)) as unknown;

  // Read gallery metadata from meta.json.
  let savedMeta: ElectronJumpDocSaveMeta | undefined;
  const metaEntry = zip.getEntry("meta.json");
  if (metaEntry) {
    try {
      const raw = JSON.parse(zip.readAsText(metaEntry)) as Record<string, unknown>;
      if (raw.attributes && typeof raw.attributes === "object") {
        const a = raw.attributes as Record<string, unknown>;
        savedMeta = {
          attributes: {
            genre: Array.isArray(a.genre) ? (a.genre as string[]) : [],
            medium: Array.isArray(a.medium) ? (a.medium as string[]) : [],
            franchise: Array.isArray(a.franchise) ? (a.franchise as string[]) : [],
            supernaturalElements: Array.isArray(a.supernaturalElements) ? (a.supernaturalElements as string[]) : [],
          },
          nsfw: typeof raw.nsfw === "boolean" ? raw.nsfw : false,
        };
        jumpdocMetaCache.set(id, savedMeta);
      }
    } catch { /* corrupt meta — use defaults */ }
  }

  const tmpDir = jumpdocTempDir(id);
  fs.mkdirSync(tmpDir, { recursive: true });

  const pdfEntry = zip.getEntry("pdf.pdf");
  if (!pdfEntry) throw new Error("Invalid .jumpdoc file: missing pdf.pdf");
  zip.extractEntryTo(pdfEntry, tmpDir, false, true);

  // Extract thumbnail to temp dir if present, and return its URL.
  let thumbTempPath: string | undefined;
  for (const entry of zip.getEntries()) {
    if (/^thumb\.[a-z]+$/i.test(entry.entryName) && !entry.isDirectory) {
      zip.extractEntryTo(entry, tmpDir, false, true);
      thumbTempPath = `file:///${path.join(tmpDir, entry.entryName).replace(/\\/g, "/")}`;
      break;
    }
  }

  jumpdocCache.set(id, data);
  return {
    data,
    pdfTempPath: `file:///${path.join(tmpDir, "pdf.pdf").replace(/\\/g, "/")}`,
    isPending: false,
    ...(thumbTempPath ? { thumbTempPath } : {}),
    ...(savedMeta ? { attributes: savedMeta.attributes, nsfw: savedMeta.nsfw } : {}),
  };
}

/** Opens a file picker and copies the selected image to the jumpdoc's temp dir as thumb.{ext}. */
export async function uploadJumpdocThumb(id: string): Promise<{ url: string } | null> {
  const tmpDir = jumpdocTempDir(id);
  if (!fs.existsSync(tmpDir)) return null;

  const result = await dialog.showOpenDialog({
    title: "Select Thumbnail Image",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "avif"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;

  const srcPath = result.filePaths[0];

  for (const f of fs.readdirSync(tmpDir)) {
    if (/^thumb\./i.test(f)) fs.unlinkSync(path.join(tmpDir, f));
  }

  const avif = await sharp(fs.readFileSync(srcPath)).avif({ quality: 80 }).toBuffer();
  const destPath = path.join(tmpDir, "thumb.avif");
  fs.writeFileSync(destPath, avif);
  return { url: `file:///${destPath.replace(/\\/g, "/")}` };
}

export async function saveJumpdocThumb(
  id: string,
  base64: string,
): Promise<{ url: string } | null> {
  const uuid = jumpdocPathToId.get(id) ?? id;
  const tmpDir = jumpdocTempDir(uuid);
  if (!fs.existsSync(tmpDir)) return null;

  const avif = await sharp(Buffer.from(base64, "base64")).avif({ quality: 80 }).toBuffer();

  for (const f of fs.readdirSync(tmpDir)) {
    if (/^thumb\./i.test(f)) fs.unlinkSync(path.join(tmpDir, f));
  }
  const tmpThumbPath = path.join(tmpDir, "thumb.avif");
  fs.writeFileSync(tmpThumbPath, avif);

  const filePath = jumpdocIdToPath.get(uuid);
  if (filePath) {
    const folder = path.dirname(filePath);
    const filename = path.basename(filePath);
    const thumbsFolder = thumbsDir(folder);
    fs.mkdirSync(thumbsFolder, { recursive: true });
    for (const f of fs.readdirSync(thumbsFolder)) {
      if (f.startsWith(uuid)) fs.unlinkSync(path.join(thumbsFolder, f));
    }
    const thumbFilename = `${uuid}.avif`;
    fs.writeFileSync(path.join(thumbsFolder, thumbFilename), avif);
    const index = readIndex(folder);
    const entry = index.entries[filename];
    if (entry) {
      entry.thumbFile = path.join("_thumbs", thumbFilename);
      entry.thumbMtime = Date.now();
      writeIndex(folder, index);
    }
  }

  return { url: `file:///${tmpThumbPath.replace(/\\/g, "/")}?t=${Date.now()}` };
}

async function writeJumpdocZip(destPath: string, data: unknown, id: string): Promise<void> {
  const tmpDir = jumpdocTempDir(id);
  const pdfPath = path.join(tmpDir, "pdf.pdf");
  if (!fs.existsSync(pdfPath)) throw new Error("PDF not found in temp dir");

  const name = (data as { name?: string }).name ?? "Untitled";
  const author = (data as { author?: unknown }).author ?? [];
  const saved = jumpdocMetaCache.get(id);
  const meta = {
    name,
    author,
    version: "1.0",
    ...(saved ? { attributes: saved.attributes, nsfw: saved.nsfw } : {}),
  };

  const zip = new AdmZip();
  zip.addFile("data.json", Buffer.from(JSON.stringify(data, null, 2), "utf-8"));
  zip.addFile("meta.json", Buffer.from(JSON.stringify(meta, null, 2), "utf-8"));
  zip.addLocalFile(pdfPath, "", "pdf.pdf");

  // Compress thumbnail to avif and include in zip.
  for (const f of fs.readdirSync(tmpDir)) {
    if (/^thumb\.[a-z]+$/i.test(f)) {
      const raw = fs.readFileSync(path.join(tmpDir, f));
      const compressed = await sharp(raw)
        .resize({ width: 512, height: 512, fit: "inside", withoutEnlargement: true })
        .avif({ quality: 90 })
        .toBuffer();
      zip.addFile("thumb.avif", compressed);
      break;
    }
  }

  const tmp = destPath + ".tmp";
  zip.writeZip(tmp);
  fs.renameSync(tmp, destPath);
}

export async function saveJumpdoc(id: string, data: unknown): Promise<{ ok: boolean }> {
  if (pendingJumpdocIds.has(id)) {
    const name = (data as { name?: string }).name ?? "Untitled";
    const dialogResult = await dialog.showSaveDialog({
      title: "Save JumpDoc",
      defaultPath: name.replace(/[<>:"/\\|?*]/g, "_") + ".jumpdoc",
      filters: [{ name: "JumpDoc", extensions: ["jumpdoc"] }],
    });
    if (dialogResult.canceled || !dialogResult.filePath) return { ok: false };

    const filePath = dialogResult.filePath.endsWith(".jumpdoc")
      ? dialogResult.filePath
      : dialogResult.filePath + ".jumpdoc";

    await writeJumpdocZip(filePath, data, id);
    jumpdocCache.set(id, data);
    pendingJumpdocIds.delete(id);
    pendingJumpdocToSaved.set(id, filePath);
    jumpdocIdToPath.set(id, filePath);
    jumpdocPathToId.set(filePath, id);

    const folder = path.dirname(filePath);
    updateIndexEntry(folder, filePath, data, id);
    return { ok: true };
  }

  const filePath = resolveFilePath(id);
  if (!filePath) return { ok: false };

  await writeJumpdocZip(filePath, data, id);
  jumpdocCache.set(id, data);

  const folder = path.dirname(filePath);
  updateIndexEntry(folder, filePath, data, id);
  return { ok: true };
}

export async function saveJumpdocAs(id: string, data: unknown): Promise<{ ok: boolean }> {
  const name = (data as { name?: string }).name ?? "Untitled";
  const dialogResult = await dialog.showSaveDialog({
    title: "Save JumpDoc As",
    defaultPath: name.replace(/[<>:"/\\|?*]/g, "_") + ".jumpdoc",
    filters: [{ name: "JumpDoc", extensions: ["jumpdoc"] }],
  });
  if (dialogResult.canceled || !dialogResult.filePath) return { ok: false };

  const filePath = dialogResult.filePath.endsWith(".jumpdoc")
    ? dialogResult.filePath
    : dialogResult.filePath + ".jumpdoc";

  await writeJumpdocZip(filePath, data, id);
  jumpdocCache.set(id, data);
  pendingJumpdocIds.delete(id);
  pendingJumpdocToSaved.set(id, filePath);
  jumpdocIdToPath.set(id, filePath);
  jumpdocPathToId.set(filePath, id);

  const folder = path.dirname(filePath);
  updateIndexEntry(folder, filePath, data, id);
  return { ok: true };
}

export async function autosaveJumpdoc(data: unknown): Promise<{ ok: boolean }> {
  const id = currentJumpdocId;
  if (!id || pendingJumpdocIds.has(id)) return { ok: false };
  const filePath = resolveFilePath(id);
  if (!filePath) return { ok: false };
  await writeJumpdocZip(filePath, data, id);
  jumpdocCache.set(id, data);
  const folder = path.dirname(filePath);
  updateIndexEntry(folder, filePath, data, id);
  return { ok: true };
}

export async function saveJumpdocMeta(id: string, meta: ElectronJumpDocSaveMeta): Promise<{ ok: boolean }> {
  const filePath = resolveFilePath(id);
  if (!filePath) return { ok: false };

  jumpdocMetaCache.set(id, meta);

  // Re-write the zip with updated meta.json (content unchanged).
  let data = jumpdocCache.get(id);
  if (!data) {
    try {
      const zip = new AdmZip(filePath);
      const entry = zip.getEntry("data.json");
      if (!entry) return { ok: false };
      data = JSON.parse(zip.readAsText(entry)) as unknown;
      jumpdocCache.set(id, data);
    } catch { return { ok: false }; }
  }

  await writeJumpdocZip(filePath, data, id);

  const folder = path.dirname(filePath);
  updateIndexEntry(folder, filePath, data, id);
  return { ok: true };
}
