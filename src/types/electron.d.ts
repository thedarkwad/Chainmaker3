// Type declarations for the Electron context bridge API and injected globals.
// This file is included in the Electron renderer build only.

export {};

declare global {
  interface Window {
    /** Injected by preload.ts synchronously before first paint — used by the FOUC-prevention script. */
    __ELECTRON_SETTINGS__?: {
      autosave?: boolean;
      theme?: string;
      dark?: boolean;
      scale?: number;
      units?: string;
      jumpdocFolder?: string | null;
    };
    /** Context bridge API exposed by preload.ts. */
    electronAPI?: ElectronAPI;
  }
}

// ── Shared types ──────────────────────────────────────────────────────────────

export type ElectronLocalSettings = {
  autosave: boolean;
  theme: string;
  dark: boolean;
  scale: number;
  units: "imperial" | "metric";
  jumpdocFolder: string | null;
};

export type ElectronRecentFile = {
  id: string;
  name: string;
  filePath: string;
};

export type ElectronJumpDocMeta = {
  /** Absolute path to the .jumpdoc file — used as publicUid in gallery summaries. */
  filePath: string;
  name: string;
  author: string[];
  imageUrl?: string;
  attributes?: ElectronJumpDocSaveMeta["attributes"];
  nsfw?: boolean;
  createdAt?: number;
  updatedAt?: number;
};

export type ElectronJumpDocSaveMeta = {
  attributes: {
    genre: string[];
    medium: string[];
    franchise: string[];
    supernaturalElements: string[];
  };
  nsfw: boolean;
};

export type ElectronJumpDocLoadResult = {
  /** Full JumpDoc data.json contents. */
  data: unknown;
  /** Absolute file:// URL to the extracted PDF in the temp directory. */
  pdfTempPath: string;
  /** file:// URL of the extracted thumbnail, if one exists in the zip. */
  thumbTempPath?: string;
  /** Gallery/filter metadata stored in meta.json. */
  attributes?: ElectronJumpDocSaveMeta["attributes"];
  nsfw?: boolean;
};

export type ElectronChainOpenResult = {
  /** UUID used as the routing publicUid. */
  id: string;
  name: string;
  /** Absolute path to the .chain file. */
  filePath: string;
  /** Full Chain data.json contents. */
  chain: unknown;
  /** Map of imageId → file:// URL pointing to the extracted temp images. */
  imagePaths: Record<string, string>;
};

// ── Context bridge API ────────────────────────────────────────────────────────

type ElectronAPI = {
  /** Called by the main process when settings change via the native Preferences menu. */
  onSettingsChanged(cb: (settings: ElectronLocalSettings) => void): void;
  /** Subscribe to a main-process menu event (e.g. "menu:save"). */
  onMenuEvent(channel: string, cb: (...args: unknown[]) => void): void;
  /** Unsubscribe from a main-process menu event. */
  offMenuEvent(channel: string, cb: (...args: unknown[]) => void): void;
  /** Called by main process before the window closes — renderer should confirm or abort. */
  onBeforeClose(cb: () => void): void;
  /** Renderer calls this to confirm that the window may close. */
  confirmClose(): void;
  chains: {
    /** Stores a new chain in memory without writing a file. File dialog deferred to first save. */
    initNewChain(chainData: unknown): Promise<void>;
    /** Opens the OS file picker for *.chain files and loads the selected file. */
    openFilePicker(): Promise<ElectronChainOpenResult | null>;
    /** Returns the currently open chain data (set by openFilePicker or initNewChain). */
    loadChain(): Promise<{ chain: unknown; imagePaths: Record<string, string> }>;
    /** Writes chain data to disk. Shows save dialog if unsaved. */
    saveChain(data: unknown): Promise<{ ok: boolean }>;
    /** Writes chain data to the existing file path. Returns { ok: false } if no path is set yet (no dialog). */
    autosaveChain(data: unknown): Promise<{ ok: boolean }>;
    /** Shows OS save-as dialog and writes the open chain to a new location. */
    saveChainAs(): Promise<{ ok: boolean }>;
    /** Clears the open chain state — call when navigating away from the chain editor. */
    closeChain(): Promise<void>;
    /** Removes from recent files list (does not delete the file). */
    removeRecent(id: string): Promise<void>;
    /** Copies .chain zip to a new file with a new UUID + " (copy)" name suffix. */
    duplicateChain(id: string): Promise<{ id: string; filePath: string } | null>;
  };
  jumpdocs: {
    /** Returns the configured jumpdoc folder path, or null if not set. */
    getJumpdocFolder(): Promise<string | null>;
    /** Opens OS folder picker, saves selection to config, returns new path. */
    setJumpdocFolder(): Promise<string | null>;
    /** Scans the configured folder and returns one summary per *.jumpdoc file. */
    listJumpdocs(): Promise<ElectronJumpDocMeta[]>;
    /** Reads data.json and extracts pdf.pdf from the .jumpdoc zip to temp dir. */
    loadJumpdoc(filePath: string): Promise<ElectronJumpDocLoadResult & { isPending: boolean }>;
    /** Opens OS file picker for *.jumpdoc files, returns the path. */
    openJumpdocFilePicker(): Promise<{ filePath: string } | null>;
    /** Opens picker and fires menu:jumpdoc-preparing / menu:edit-jumpdoc events directly (for homescreen). */
    openAndPrepare(): Promise<void>;
    /** Writes jumpdoc data to disk. Shows save dialog on first save of a new doc. */
    saveJumpdoc(id: string, data: unknown): Promise<{ ok: boolean }>;
    /** Writes jumpdoc data to the existing file path. Returns { ok: false } if unsaved (no dialog). */
    autosaveJumpdoc(data: unknown): Promise<{ ok: boolean }>;
    /** Always opens save dialog to write jumpdoc to a new location. */
    saveJumpdocAs(id: string, data: unknown): Promise<{ ok: boolean }>;
    /** Persists gallery metadata (attributes, nsfw) to the jumpdoc zip's meta.json. */
    saveJumpdocMeta(id: string, meta: ElectronJumpDocSaveMeta): Promise<{ ok: boolean }>;
    /** Opens an image picker, copies the selected image as the jumpdoc thumbnail. */
    uploadJumpdocThumb(id: string): Promise<{ url: string } | null>;
  };
  images: {
    /** Opens OS file picker for images, copies to the open chain's temp dir, returns ID + URL. */
    uploadImage(): Promise<{ id: string; url: string } | null>;
    /** Deletes an image from the open chain's temp directory. */
    deleteImage(imageId: string): Promise<void>;
  };
  settings: {
    getSettings(): Promise<ElectronLocalSettings>;
    setSettings(patch: Partial<ElectronLocalSettings>): Promise<void>;
  };
  recentFiles: {
    getRecentFiles(): Promise<ElectronRecentFile[]>;
    addRecentFile(record: ElectronRecentFile): Promise<void>;
    removeRecentFile(id: string): Promise<void>;
  };
  onUpdaterEvent(
    channel: "update-available" | "download-progress" | "update-downloaded",
    cb: (payload: unknown) => void,
  ): void;
};
