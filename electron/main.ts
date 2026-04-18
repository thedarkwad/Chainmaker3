import { app, BrowserWindow, dialog, ipcMain, Menu, protocol } from "electron";
import contextMenu from "electron-context-menu";
import { autoUpdater } from "electron-updater";
import type { MenuItemConstructorOptions } from "electron";
import path from "path";
import {
  openFilePicker,
  loadChain,
  loadChainFromPath,
  saveChain,
  autosaveChain,
  saveChainAs,
  closeChain,
  initNewChain,
  removeChainFromRecent,
  uploadImage,
  deleteImage,
} from "./ipc/chains";
import {
  getJumpdocFolder,
  setJumpdocFolder,
  listJumpdocs,
  loadJumpdoc,
  openJumpdocFilePicker,
  openJumpdocFromPath,
  initNewJumpdoc,
  saveJumpdoc,
  autosaveJumpdoc,
  saveJumpdocAs,
  saveJumpdocMeta,
  uploadJumpdocThumb,
  saveJumpdocThumb,
} from "./ipc/jumpdocs";
import {
  getSettings,
  setSettings,
  getRecentFiles,
  addRecentFile,
  removeRecentFile,
} from "./ipc/settings";
import type { ElectronLocalSettings, ElectronRecentFile } from "../src/types/electron";

// ── Dev / prod helpers ────────────────────────────────────────────────────────

// Must be called before app.whenReady() to take effect.
app.commandLine.appendSwitch("disable-ime");
app.commandLine.appendSwitch("disable-renderer-accessibility");

const isDev = !app.isPackaged;

contextMenu({ showInspectElement: isDev });
const RENDERER_DEV_URL = "http://localhost:5174";
const RENDERER_PROD_PATH = path.join(__dirname, "../dist-electron-renderer/index.electron.html");

// ── Window creation ───────────────────────────────────────────────────────────

let mainWindow: BrowserWindow | null = null;

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 900,
    minWidth: 600,
    minHeight: 600,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      // Allow loading file:// images from temp dir
      webSecurity: false,
    },
    show: false,
    titleBarStyle: "default",
  });

  if (isDev) {
    mainWindow.loadURL(RENDERER_DEV_URL);
  } else {
    mainWindow.loadFile(RENDERER_PROD_PATH);
  }
  if (isDev) mainWindow.webContents.openDevTools();

  mainWindow.once("ready-to-show", () => mainWindow?.show());

  // Ask the renderer to confirm before closing if there are unsaved changes.
  let closeConfirmed = false;
  mainWindow.on("close", (event) => {
    if (closeConfirmed) return;
    event.preventDefault();
    mainWindow?.webContents.send("app:before-close");
  });

  ipcMain.once("app:confirm-close", () => {
    closeConfirmed = true;
    mainWindow?.close();
  });

  mainWindow.on("closed", () => {
    mainWindow = null;
  });

  mainWindow.webContents.on("did-create-window", (win) => {
    win.setMenu(null);
  });
}

// ── Preferences menu ──────────────────────────────────────────────────────────

const THEMES = [
  { id: "rose", label: "Rose" },
  { id: "imperial", label: "Crimson" },
  { id: "hazard", label: "Hazard" },
  { id: "autumn", label: "Autumn" },
  { id: "desert-rose", label: "Desert" },
  { id: "copper", label: "Copper" },
  { id: "amber", label: "Amber" },
  { id: "toxic", label: "Toxic" },
  { id: "emerald", label: "Emerald" },
  { id: "seafoam", label: "Seafoam" },
  { id: "neon", label: "Neon" },
  { id: "arctic", label: "Arctic" },
  { id: "indigo", label: "Indigo" },
  { id: "azure", label: "Azure" },
  { id: "void", label: "Void" },
  { id: "faerie", label: "Faerie" },
  { id: "mana", label: "Mana" },
  { id: "rgb", label: "RGB" },
];

const SCALES = [75, 87, 100, 112, 125];

function applySettings(patch: Partial<ElectronLocalSettings>): void {
  setSettings(patch);
  const updated = getSettings();
  mainWindow?.webContents.send("settings:changed", updated);
  buildMenu(); // rebuild so checkboxes/radios reflect new state
}

function buildMenu(): void {
  const s = getSettings();

  const template: MenuItemConstructorOptions[] = [
    // macOS app menu
    ...(process.platform === "darwin" ? [{ role: "appMenu" as const }] : []),
    {
      label: "File",
      submenu: [
        {
          label: "New Chain…",
          accelerator: "CmdOrCtrl+N",
          click: () => mainWindow?.webContents.send("menu:new-chain"),
        },
        {
          label: "Open Chain…",
          accelerator: "CmdOrCtrl+O",
          click: () =>
            openFilePicker().then((r) => r && mainWindow?.webContents.send("menu:open-chain", r)),
        },
        {
          label: "Open Recent Chain",
          submenu: (() => {
            const recent = getRecentFiles().slice(0, 8);
            if (recent.length === 0) {
              return [{ label: "No Recent Chains", enabled: false }];
            }
            return recent.map((f) => ({
              label: f.name,
              click: () => {
                try {
                  const r = loadChainFromPath(f.filePath);
                  mainWindow?.webContents.send("menu:open-chain", r);
                } catch (err) {
                  console.error("Failed to open recent chain:", err);
                }
              },
            }));
          })(),
        },
        { type: "separator" },
        {
          label: "New JumpDoc…",
          click: () =>
            initNewJumpdoc(() => mainWindow?.webContents.send("menu:jumpdoc-preparing"))
              .then((r) => r && mainWindow?.webContents.send("menu:new-jumpdoc", r))
              .catch(console.error),
        },
        {
          label: "Edit JumpDoc…",
          click: () =>
            openJumpdocFilePicker(() => mainWindow?.webContents.send("menu:jumpdoc-preparing"))
              .then((r) => r && mainWindow?.webContents.send("menu:edit-jumpdoc", r))
              .catch(console.error),
        },
        {
          label: "Browse JumpDocs",
          click: () => mainWindow?.webContents.send("menu:browse-jumpdocs"),
        },
        { type: "separator" },
        {
          label: "Save",
          accelerator: "CmdOrCtrl+S",
          click: () => mainWindow?.webContents.send("menu:save"),
        },
        {
          label: "Save As…",
          accelerator: "CmdOrCtrl+Shift+S",
          click: () => mainWindow?.webContents.send("menu:save-as"),
        },
        {
          label: "Close",
          accelerator: "CmdOrCtrl+W",
          click: () => mainWindow?.webContents.send("menu:close"),
        },
        { type: "separator" },
        process.platform === "darwin" ? { role: "close" as const } : { role: "quit" as const },
      ],
    },
    { role: "editMenu" },
    {
      label: "Help",
      submenu: [
        {
          label: "Check for Updates…",
          click: () => {
            userInitiatedUpdateCheck = true;
            autoUpdater.checkForUpdates().catch(() => {});
          },
        },
      ],
    },
    {
      label: "Preferences",
      submenu: [
        {
          label: "Autosave",
          type: "checkbox",
          checked: s.autosave,
          click: () => applySettings({ autosave: !s.autosave }),
        },
        { type: "separator" },
        {
          label: "Toggle Dark Mode",
          type: "checkbox",
          checked: s.dark,
          click: () => applySettings({ dark: !s.dark }),
        },
        {
          label: "Theme",
          submenu: THEMES.map((t) => ({
            label: t.label,
            type: "radio" as const,
            checked: s.theme === t.id,
            click: () => applySettings({ theme: t.id as ElectronLocalSettings["theme"] }),
          })),
        },
        {
          label: "Scale",
          submenu: SCALES.map((scale) => ({
            label: `${scale}%`,
            type: "radio" as const,
            checked: s.scale === scale,
            click: () => applySettings({ scale }),
          })),
        },
        {
          label: "Units",
          submenu: [
            {
              label: "Imperial",
              type: "radio",
              checked: s.units === "imperial",
              click: () => applySettings({ units: "imperial" }),
            },
            {
              label: "Metric",
              type: "radio",
              checked: s.units === "metric",
              click: () => applySettings({ units: "metric" }),
            },
          ],
        },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ── File open handling ────────────────────────────────────────────────────────

function handleOpenFile(filePath: string): void {
  if (!mainWindow) return;
  try {
    const result = loadChainFromPath(filePath);
    if (isDev) {
      mainWindow.loadURL(`${RENDERER_DEV_URL}/#/chain/${result.id}`);
    } else {
      mainWindow.loadFile(RENDERER_PROD_PATH, { hash: `/chain/${result.id}` });
    }
  } catch (err) {
    console.error("Failed to open file:", err);
  }
}

function handleOpenJumpdoc(filePath: string): void {
  if (!mainWindow) return;
  try {
    const result = openJumpdocFromPath(filePath);
    if (isDev) {
      mainWindow.loadURL(`${RENDERER_DEV_URL}/#/jumpdoc/${result.filePath}`);
    } else {
      mainWindow.loadFile(RENDERER_PROD_PATH, { hash: `/jumpdoc/${result.filePath}` });
    }
  } catch (err) {
    console.error("Failed to open jumpdoc:", err);
  }
}

// ── App lifecycle ─────────────────────────────────────────────────────────────

// ── Auto-updater ──────────────────────────────────────────────────────────────

let userInitiatedUpdateCheck = false;

function setupAutoUpdater(): void {
  autoUpdater.on("update-available", (info) => {
    userInitiatedUpdateCheck = false;
    mainWindow?.webContents.send("updater:update-available", info.version);
  });

  autoUpdater.on("update-not-available", () => {
    if (!userInitiatedUpdateCheck) return;
    userInitiatedUpdateCheck = false;
    dialog.showMessageBox(mainWindow!, {
      type: "info",
      title: "No Updates",
      message: "You're already on the latest version of ChainMaker.",
      buttons: ["OK"],
    });
  });

  autoUpdater.on("download-progress", (progress) => {
    mainWindow?.webContents.send("updater:download-progress", Math.floor(progress.percent));
  });

  autoUpdater.on("update-downloaded", () => {
    mainWindow?.webContents.send("updater:update-downloaded");
    dialog
      .showMessageBox(mainWindow!, {
        type: "info",
        title: "Update Ready",
        message: "A new version of ChainMaker has been downloaded. Restart to install it.",
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
      })
      .then(({ response }) => {
        if (response === 0) autoUpdater.quitAndInstall();
      });
  });

  autoUpdater.on("error", (err) => {
    console.error("Auto-updater error:", err);
    if (userInitiatedUpdateCheck) {
      userInitiatedUpdateCheck = false;
      dialog.showMessageBox(mainWindow!, {
        type: "error",
        title: "Update Error",
        message: "Failed to check for updates. Please try again later.",
        buttons: ["OK"],
      });
    }
  });

  // Check silently on startup; don't bother the user if there's nothing new.
  autoUpdater.checkForUpdates().catch(() => {});
}

app.whenReady().then(() => {
  protocol.registerFileProtocol("file", (request, callback) => {
    const url = request.url.replace("file:///", "").replace(/\//g, path.sep);
    callback({ path: decodeURIComponent(url) });
  });

  buildMenu();
  createWindow();

  if (!isDev) setupAutoUpdater();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });

  if (process.platform !== "darwin") {
    const chainArg = process.argv.find((a) => a.endsWith(".chain"));
    if (chainArg) handleOpenFile(chainArg);
    const jumpdocArg = process.argv.find((a) => a.endsWith(".jumpdoc"));
    if (jumpdocArg) handleOpenJumpdoc(jumpdocArg);
  }
});

app.on("open-file", (event, filePath) => {
  event.preventDefault();
  if (filePath.endsWith(".chain")) {
    if (mainWindow) {
      handleOpenFile(filePath);
    } else {
      app.whenReady().then(() => handleOpenFile(filePath));
    }
  } else if (filePath.endsWith(".jumpdoc")) {
    if (mainWindow) {
      handleOpenJumpdoc(filePath);
    } else {
      app.whenReady().then(() => handleOpenJumpdoc(filePath));
    }
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// ── IPC: synchronous ──────────────────────────────────────────────────────────

ipcMain.on("get-user-data-path", (event) => {
  event.returnValue = app.getPath("userData");
});

// ── IPC: async ────────────────────────────────────────────────────────────────

// Chains
ipcMain.handle("chains:openFilePicker", () => openFilePicker());
ipcMain.handle("chains:loadChain", () => loadChain());
ipcMain.handle("chains:saveChain", (_e, data: unknown) => saveChain(data));
ipcMain.handle("chains:autosaveChain", (_e, data: unknown) => autosaveChain(data));
ipcMain.handle("chains:initNewChain", (_e, chainData: unknown) => initNewChain(chainData));
ipcMain.handle("chains:removeRecent", (_e, id: string) => {
  removeChainFromRecent(id);
});
ipcMain.handle("chains:saveChainAs", () => saveChainAs());
ipcMain.handle("chains:closeChain", () => closeChain());

// Jumpdocs
ipcMain.handle("jumpdocs:getJumpdocFolder", () => getJumpdocFolder());
ipcMain.handle("jumpdocs:setJumpdocFolder", () => setJumpdocFolder());
ipcMain.handle("jumpdocs:listJumpdocs", () => listJumpdocs());
ipcMain.handle("jumpdocs:loadJumpdoc", (_e, filePath: string) => loadJumpdoc(filePath));
ipcMain.handle("jumpdocs:openJumpdocFilePicker", () => openJumpdocFilePicker());
ipcMain.handle("jumpdocs:openAndPrepare", async (event) => {
  await openJumpdocFilePicker(
    () => event.sender.send("menu:jumpdoc-preparing"),
  ).then((r) => { if (r) event.sender.send("menu:edit-jumpdoc", r); })
   .catch(console.error);
});
ipcMain.handle("jumpdocs:saveJumpdoc", (_e, id: string, data: unknown) => saveJumpdoc(id, data));
ipcMain.handle("jumpdocs:autosaveJumpdoc", (_e, data: unknown) => autosaveJumpdoc(data));
ipcMain.handle("jumpdocs:saveJumpdocAs", (_e, id: string, data: unknown) => saveJumpdocAs(id, data));
ipcMain.handle("jumpdocs:saveJumpdocMeta", (_e, id: string, meta: unknown) =>
  saveJumpdocMeta(id, meta as import("../src/types/electron").ElectronJumpDocSaveMeta),
);
ipcMain.handle("jumpdocs:uploadJumpdocThumb", (_e, id: string) => uploadJumpdocThumb(id));
ipcMain.handle("jumpdocs:saveJumpdocThumb", (_e, id: string, base64: string, ext: string) => saveJumpdocThumb(id, base64));

// Images
ipcMain.handle("images:uploadImage", () => uploadImage());
ipcMain.handle("images:deleteImage", (_e, imageId: string) => {
  deleteImage(imageId);
});

// Settings
ipcMain.handle("settings:getSettings", () => getSettings());
ipcMain.handle("settings:setSettings", (_e, patch: Parameters<typeof setSettings>[0]) => {
  setSettings(patch);
  buildMenu();
});

// Recent files
ipcMain.handle("recentFiles:getRecentFiles", () => getRecentFiles());
ipcMain.handle("recentFiles:addRecentFile", (_e, record: ElectronRecentFile) => {
  addRecentFile(record);
  buildMenu();
});
ipcMain.handle("recentFiles:removeRecentFile", (_e, id: string) => {
  removeRecentFile(id);
  buildMenu();
});
