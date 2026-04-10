import fs from "fs";
import os from "os";
import path from "path";
import { dialog } from "electron";
import AdmZip from "adm-zip";
import { applyPatches, enablePatches, type Patch } from "immer";
import { customAlphabet } from "nanoid";
import { alphanumeric } from "nanoid-dictionary";
import { addRecentFile, findRecentByPath } from "./settings";
import { convertChain } from "@/chain/conversion";
import type { ElectronChainOpenResult } from "../../src/types/electron";

enablePatches();

const nanoid = customAlphabet(alphanumeric, 16);

// ── Open chain state — owned entirely by the IPC layer ────────────────────────

type OpenChain = {
  /** Absolute path to the .chain file, or null for an unsaved new chain. */
  filePath: string | null;
  /** Last-known chain data — base for patch application on save. */
  data: unknown;
  /** Absolute path to the temp images directory for this chain. */
  tempDir: string;
};

let openChain: OpenChain | null = null;

// ── Temp dir helpers ──────────────────────────────────────────────────────────

function makeTempDir(): string {
  const id = nanoid();
  const dir = path.join(os.tmpdir(), `chainmaker-${id}`, "images");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// ── Zip helpers ───────────────────────────────────────────────────────────────

function loadZip(filePath: string): { chain: unknown; imagePaths: Record<string, string>; tempDir: string } {
  const zip = new AdmZip(filePath);
  const dataEntry = zip.getEntry("data.json");
  if (!dataEntry) throw new Error("Invalid .chain file: missing data.json");

  const raw = JSON.parse(zip.readAsText(dataEntry)) as Record<string, unknown>;
  const isLegacy = raw.versionNumber !== "3.0";
  const chain = isLegacy ? convertChain(raw as object) : raw;

  const tempDir = makeTempDir();
  const imagePaths: Record<string, string> = {};

  for (const entry of zip.getEntries()) {
    const isNewImages = entry.entryName.startsWith("images/");
    const isOldImages = isLegacy && entry.entryName.startsWith("user_images/");
    if ((!isNewImages && !isOldImages) || entry.isDirectory) continue;
    const filename = path.basename(entry.entryName);
    const imageId = filename.replace(/\.[^.]+$/, "");
    const destPath = path.join(tempDir, filename);
    zip.extractEntryTo(entry, tempDir, false, true);
    imagePaths[imageId] = `file:///${destPath.replace(/\\/g, "/")}`;
  }

  // For legacy .chain files, patch altform image references using the old
  // numeric alt-form ID, which matches the filename in user_images/.
  if (isLegacy) {
    const altforms = (chain as { altforms?: { O?: Record<string, unknown> } }).altforms?.O;
    if (altforms) {
      for (const [key, af] of Object.entries(altforms)) {
        if (imagePaths[key]) {
          (af as Record<string, unknown>).image = { type: "internal", imgId: key };
        }
      }
    }
  }

  return { chain, imagePaths, tempDir };
}

/** Deletes temp images that are no longer referenced by any alt-form in the chain. */
function pruneOrphanedImages(chain: unknown, tempDir: string): void {
  if (!fs.existsSync(tempDir)) return;
  const altforms = (chain as { altforms?: { O?: Record<string, unknown> } })?.altforms?.O ?? {};
  const referenced = new Set<string>();
  for (const af of Object.values(altforms)) {
    const img = (af as { image?: { type?: string; imgId?: string } })?.image;
    if (img?.type === "internal" && img.imgId) referenced.add(img.imgId);
  }
  for (const filename of fs.readdirSync(tempDir)) {
    const imageId = filename.replace(/\.[^.]+$/, "");
    if (!referenced.has(imageId)) {
      fs.unlinkSync(path.join(tempDir, filename));
    }
  }
}

/** Strips internal images from all alt-forms. Returns modified chain + whether any were stripped. */
function stripInternalImages(chain: unknown): { chain: unknown; hadImages: boolean } {
  const altforms = (chain as { altforms?: { O?: Record<string, unknown> } })?.altforms?.O;
  if (!altforms) return { chain, hadImages: false };
  let hadImages = false;
  const stripped = JSON.parse(JSON.stringify(chain)) as typeof chain;
  const strippedAltforms = (stripped as { altforms: { O: Record<string, unknown> } }).altforms.O;
  for (const key of Object.keys(strippedAltforms)) {
    const af = strippedAltforms[key] as { image?: { type?: string } };
    if (af?.image?.type === "internal") {
      delete af.image;
      hadImages = true;
    }
  }
  return { chain: stripped, hadImages };
}

function writeJson(filePath: string, chain: unknown): void {
  const tmp = filePath + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(chain, null, 2), "utf-8");
  fs.renameSync(tmp, filePath);
}

function writeZip(filePath: string, chain: unknown, tempDir: string): void {
  const zip = new AdmZip();
  zip.addFile("data.json", Buffer.from(JSON.stringify(chain, null, 2), "utf-8"));

  if (fs.existsSync(tempDir)) {
    for (const filename of fs.readdirSync(tempDir)) {
      const full = path.join(tempDir, filename);
      if (fs.statSync(full).isFile()) {
        zip.addLocalFile(full, "images");
      }
    }
  }

  const tmp = filePath + ".tmp";
  zip.writeZip(tmp);
  fs.renameSync(tmp, filePath);
}

// ── Public IPC handlers ───────────────────────────────────────────────────────

/** Stores a new chain in memory. File dialog deferred to first save. */
export function initNewChain(chainData: unknown): void {
  openChain = { filePath: null, data: chainData, tempDir: makeTempDir() };
}

/** Opens the OS file picker for .chain or .json files, sets open state. */
export async function openFilePicker(): Promise<ElectronChainOpenResult | null> {
  const result = await dialog.showOpenDialog({
    title: "Open Chain",
    filters: [
      { name: "ChainMaker Files", extensions: ["chain", "json"] },
      { name: "ChainMaker Chain", extensions: ["chain"] },
      { name: "JSON", extensions: ["json"] },
    ],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;
  return loadChainFromPath(result.filePaths[0]);
}

/** Loads a .chain or .json file directly. */
export function loadChainFromPath(filePath: string): ElectronChainOpenResult {
  let chain: unknown;
  let imagePaths: Record<string, string> = {};
  let tempDir: string;

  if (filePath.toLowerCase().endsWith(".json")) {
    const raw = JSON.parse(fs.readFileSync(filePath, "utf-8")) as Record<string, unknown>;
    chain = raw.versionNumber === "3.0" ? raw : convertChain(raw as object);
    tempDir = makeTempDir();
  } else {
    ({ chain, imagePaths, tempDir } = loadZip(filePath));
  }

  const name = (chain as { name?: string }).name ?? "Untitled";
  openChain = { filePath, data: chain, tempDir };

  let record = findRecentByPath(filePath);
  if (!record) {
    record = { id: nanoid(), name, filePath };
  } else if (record.name !== name) {
    record = { ...record, name };
  }
  addRecentFile(record);

  return { id: record.id, name, filePath, chain, imagePaths };
}

/** Returns the currently open chain data and image paths from the temp dir. */
export function loadChain(): { chain: unknown; imagePaths: Record<string, string> } {
  if (!openChain) throw new Error("No chain is currently open");
  const imagePaths: Record<string, string> = {};
  const { tempDir } = openChain;
  if (fs.existsSync(tempDir)) {
    for (const filename of fs.readdirSync(tempDir)) {
      const full = path.join(tempDir, filename);
      if (fs.statSync(full).isFile()) {
        const imageId = filename.replace(/\.[^.]+$/, "");
        imagePaths[imageId] = `file:///${full.replace(/\\/g, "/")}`;
      }
    }
  }
  return { chain: openChain.data, imagePaths };
}

/** Applies patches and writes to disk. Shows save dialog if no file yet. */
export async function saveChain(patches: Patch[]): Promise<{ ok: boolean }> {
  if (!openChain) return { ok: false };

  let updated: unknown;
  try {
    updated = patches.length > 0
      ? applyPatches(openChain.data as object, patches)
      : openChain.data;
  } catch {
    return { ok: false };
  }

  const isJson = (fp: string) => fp.toLowerCase().endsWith(".json");

  // First save of a new chain — show dialog.
  if (!openChain.filePath) {
    const name = (updated as { name?: string }).name ?? "Untitled";
    const dialogResult = await dialog.showSaveDialog({
      title: "Save Chain",
      defaultPath: name.replace(/[<>:"/\\|?*]/g, "_") + ".chain",
      filters: [
        { name: "ChainMaker Chain", extensions: ["chain"] },
        { name: "JSON (no images)", extensions: ["json"] },
      ],
    });
    if (dialogResult.canceled || !dialogResult.filePath) return { ok: false };

    const filePath = /\.(chain|json)$/i.test(dialogResult.filePath)
      ? dialogResult.filePath
      : dialogResult.filePath + ".chain";

    if (isJson(filePath)) {
      const { chain: stripped, hadImages } = stripInternalImages(updated);
      if (hadImages) {
        const confirm = await dialog.showMessageBox({
          type: "warning", buttons: ["Save anyway", "Cancel"], defaultId: 1,
          message: "Strip uploaded images?",
          detail: "JSON files cannot store uploaded images. Internal images will be removed from alt-forms.",
        });
        if (confirm.response !== 0) return { ok: false };
      }
      writeJson(filePath, stripped);
      openChain.filePath = filePath;
      openChain.data = stripped;
    } else {
      pruneOrphanedImages(updated, openChain.tempDir);
      writeZip(filePath, updated, openChain.tempDir);
      openChain.filePath = filePath;
      openChain.data = updated;
    }
    addRecentFile({ id: nanoid(), name, filePath });
    return { ok: true };
  }

  // Subsequent saves — write to existing location.
  if (isJson(openChain.filePath)) {
    const { chain: stripped } = stripInternalImages(updated);
    writeJson(openChain.filePath, stripped);
    openChain.data = stripped;
  } else {
    pruneOrphanedImages(updated, openChain.tempDir);
    writeZip(openChain.filePath, updated, openChain.tempDir);
    openChain.data = updated;
  }

  // Update name in recent files if it changed.
  const newName = (updated as { name?: string }).name ?? "Untitled";
  const record = findRecentByPath(openChain.filePath);
  if (record && record.name !== newName) {
    addRecentFile({ ...record, name: newName });
  }

  return { ok: true };
}

/** Shows Save As dialog, writes to new location, updates open state. */
export async function saveChainAs(): Promise<{ ok: boolean }> {
  if (!openChain) return { ok: false };

  const name = (openChain.data as { name?: string }).name ?? "Untitled";
  const result = await dialog.showSaveDialog({
    title: "Save Chain As",
    defaultPath: name.replace(/[<>:"/\\|?*]/g, "_") + ".chain",
    filters: [
      { name: "ChainMaker Chain", extensions: ["chain"] },
      { name: "JSON (no images)", extensions: ["json"] },
    ],
  });
  if (result.canceled || !result.filePath) return { ok: false };

  const newFilePath = /\.(chain|json)$/i.test(result.filePath)
    ? result.filePath
    : result.filePath + ".chain";

  if (newFilePath.toLowerCase().endsWith(".json")) {
    const { chain: stripped, hadImages } = stripInternalImages(openChain.data);
    if (hadImages) {
      const confirm = await dialog.showMessageBox({
        type: "warning", buttons: ["Save anyway", "Cancel"], defaultId: 1,
        message: "Strip uploaded images?",
        detail: "JSON files cannot store uploaded images. Internal images will be removed from alt-forms.",
      });
      if (confirm.response !== 0) return { ok: false };
    }
    writeJson(newFilePath, stripped);
    openChain.filePath = newFilePath;
    openChain.data = stripped;
  } else {
    writeZip(newFilePath, openChain.data, openChain.tempDir);
    openChain.filePath = newFilePath;
  }

  let record = findRecentByPath(newFilePath);
  if (!record) record = { id: nanoid(), name, filePath: newFilePath };
  addRecentFile(record);

  return { ok: true };
}

export function removeChainFromRecent(_id: string): void {
  // Recent chain management deferred — no-op for now.
}

export async function duplicateChain(_id: string): Promise<{ id: string; filePath: string } | null> {
  return null;
}

// ── Image upload ──────────────────────────────────────────────────────────────

export async function uploadImage(): Promise<{ id: string; url: string } | null> {
  const tempDir = openChain?.tempDir;
  if (!tempDir) return null;

  const result = await dialog.showOpenDialog({
    title: "Select Image",
    filters: [{ name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "avif"] }],
    properties: ["openFile"],
  });
  if (result.canceled || !result.filePaths[0]) return null;

  const srcPath = result.filePaths[0];
  const ext = path.extname(srcPath).toLowerCase();
  const id = nanoid();
  const filename = `${id}${ext}`;
  const destPath = path.join(tempDir, filename);

  fs.mkdirSync(tempDir, { recursive: true });
  fs.copyFileSync(srcPath, destPath);

  return { id, url: `file:///${destPath.replace(/\\/g, "/")}` };
}

export function deleteImage(imageId: string): void {
  const tempDir = openChain?.tempDir;
  if (!tempDir || !fs.existsSync(tempDir)) return;
  for (const filename of fs.readdirSync(tempDir)) {
    if (filename.replace(/\.[^.]+$/, "") === imageId) {
      fs.unlinkSync(path.join(tempDir, filename));
      return;
    }
  }
}
