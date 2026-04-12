import { contextBridge, ipcRenderer } from "electron";
import path from "path";
import fs from "fs";

// Module-level map so offMenuEvent can remove the exact wrapper registered by onMenuEvent.
const menuWrappers = new Map<string, Map<Function, (...args: unknown[]) => void>>();

// ── FOUC prevention ───────────────────────────────────────────────────────────
// Read the config file synchronously before the renderer starts so the
// inline theme script in __root.tsx can apply settings without a flash.

const userDataPath: string = ipcRenderer.sendSync("get-user-data-path") as string;

let electronSettings: Record<string, unknown> = {};
try {
  const configPath = path.join(userDataPath, "chainmaker-config.json");
  const raw = fs.readFileSync(configPath, "utf-8");
  const parsed = JSON.parse(raw) as { settings?: Record<string, unknown> };
  electronSettings = parsed.settings ?? {};
} catch {
  // Config not yet created — defaults will be applied by the inline script
}

contextBridge.exposeInMainWorld("__ELECTRON_SETTINGS__", electronSettings);

// ── Context bridge API ────────────────────────────────────────────────────────

contextBridge.exposeInMainWorld("electronAPI", {
  chains: {
    initNewChain: (chainData: unknown) => ipcRenderer.invoke("chains:initNewChain", chainData),
    openFilePicker: () => ipcRenderer.invoke("chains:openFilePicker"),
    loadChain: () => ipcRenderer.invoke("chains:loadChain"),
    saveChain: (data: unknown) => ipcRenderer.invoke("chains:saveChain", data),
    autosaveChain: (data: unknown) => ipcRenderer.invoke("chains:autosaveChain", data),
    saveChainAs: () => ipcRenderer.invoke("chains:saveChainAs"),
    closeChain: () => ipcRenderer.invoke("chains:closeChain"),
    removeRecent: (id: string) => ipcRenderer.invoke("chains:removeRecent", id),
  },
  jumpdocs: {
    getJumpdocFolder: () => ipcRenderer.invoke("jumpdocs:getJumpdocFolder"),
    setJumpdocFolder: () => ipcRenderer.invoke("jumpdocs:setJumpdocFolder"),
    listJumpdocs: () => ipcRenderer.invoke("jumpdocs:listJumpdocs"),
    loadJumpdoc: (filePath: string) => ipcRenderer.invoke("jumpdocs:loadJumpdoc", filePath),
    openJumpdocFilePicker: () => ipcRenderer.invoke("jumpdocs:openJumpdocFilePicker"),
    openAndPrepare: () => ipcRenderer.invoke("jumpdocs:openAndPrepare"),
    saveJumpdoc: (id: string, data: unknown) =>
      ipcRenderer.invoke("jumpdocs:saveJumpdoc", id, data),
    autosaveJumpdoc: (data: unknown) =>
      ipcRenderer.invoke("jumpdocs:autosaveJumpdoc", data),
    saveJumpdocAs: (id: string, data: unknown) =>
      ipcRenderer.invoke("jumpdocs:saveJumpdocAs", id, data),
    saveJumpdocMeta: (id: string, meta: unknown) =>
      ipcRenderer.invoke("jumpdocs:saveJumpdocMeta", id, meta),
    uploadJumpdocThumb: (id: string) =>
      ipcRenderer.invoke("jumpdocs:uploadJumpdocThumb", id),
    saveJumpdocThumb: (id: string, base64: string, ext: string) =>
      ipcRenderer.invoke("jumpdocs:saveJumpdocThumb", id, base64, ext),
  },
  images: {
    uploadImage: () => ipcRenderer.invoke("images:uploadImage"),
    deleteImage: (imageId: string) => ipcRenderer.invoke("images:deleteImage", imageId),
  },
  settings: {
    getSettings: () => ipcRenderer.invoke("settings:getSettings"),
    setSettings: (patch: unknown) => ipcRenderer.invoke("settings:setSettings", patch),
  },
  recentFiles: {
    getRecentFiles: () => ipcRenderer.invoke("recentFiles:getRecentFiles"),
    addRecentFile: (record: unknown) => ipcRenderer.invoke("recentFiles:addRecentFile", record),
    removeRecentFile: (id: string) => ipcRenderer.invoke("recentFiles:removeRecentFile", id),
  },
  onSettingsChanged: (cb: (settings: unknown) => void) => {
    ipcRenderer.on("settings:changed", (_e, settings) => cb(settings));
  },
  onMenuEvent: (channel: string, cb: (...args: unknown[]) => void) => {
    const wrapper = (_e: unknown, ...args: unknown[]) => cb(...args);
    if (!menuWrappers.has(channel)) menuWrappers.set(channel, new Map());
    menuWrappers.get(channel)!.set(cb, wrapper);
    ipcRenderer.on(channel, wrapper);
  },
  offMenuEvent: (channel: string, cb: (...args: unknown[]) => void) => {
    const wrapper = menuWrappers.get(channel)?.get(cb);
    if (wrapper) {
      ipcRenderer.removeListener(channel, wrapper);
      menuWrappers.get(channel)!.delete(cb);
    }
  },
  onBeforeClose: (cb: () => void) => {
    ipcRenderer.on("app:before-close", cb);
  },
  confirmClose: () => {
    ipcRenderer.send("app:confirm-close");
  },
  onUpdaterEvent: (channel: "update-available" | "download-progress" | "update-downloaded", cb: (payload: unknown) => void) => {
    ipcRenderer.on(`updater:${channel}`, (_e, payload) => cb(payload));
  },
});
