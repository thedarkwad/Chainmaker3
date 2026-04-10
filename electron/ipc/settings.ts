import fs from "fs";
import path from "path";
import { app } from "electron";
import type { ElectronLocalSettings, ElectronRecentFile } from "../../src/types/electron";

// ── Config schema ─────────────────────────────────────────────────────────────

type Config = {
  settings: ElectronLocalSettings;
  recentFiles: ElectronRecentFile[];
};

const DEFAULTS: Config = {
  settings: {
    autosave: true,
    theme: "indigo",
    dark: true,
    scale: 100,
    units: "imperial",
    jumpdocFolder: null,
  },
  recentFiles: [],
};

// ── File path ─────────────────────────────────────────────────────────────────

function configPath(): string {
  return path.join(app.getPath("userData"), "chainmaker-config.json");
}

// ── Read / write ──────────────────────────────────────────────────────────────

export function readConfig(): Config {
  try {
    const raw = fs.readFileSync(configPath(), "utf-8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return {
      settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
      recentFiles: parsed.recentFiles ?? [],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * Reads config synchronously without requiring `app` to be ready.
 * Used by the preload script for FOUC prevention.
 */
export function readConfigSync(userDataPath: string): Config {
  try {
    const p = path.join(userDataPath, "chainmaker-config.json");
    const raw = fs.readFileSync(p, "utf-8");
    const parsed = JSON.parse(raw) as Partial<Config>;
    return {
      settings: { ...DEFAULTS.settings, ...(parsed.settings ?? {}) },
      recentFiles: parsed.recentFiles ?? [],
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function writeConfig(config: Config): void {
  const p = configPath();
  const tmp = p + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(config, null, 2), "utf-8");
  fs.renameSync(tmp, p);
}

// ── IPC handlers ──────────────────────────────────────────────────────────────

export function getSettings(): ElectronLocalSettings {
  return readConfig().settings;
}

export function setSettings(patch: Partial<ElectronLocalSettings>): void {
  const config = readConfig();
  config.settings = { ...config.settings, ...patch };
  writeConfig(config);
}

export function getRecentFiles(): ElectronRecentFile[] {
  return readConfig().recentFiles;
}

export function addRecentFile(record: ElectronRecentFile): void {
  const config = readConfig();
  // Deduplicate by id, keep most recent first, cap at 20
  const filtered = config.recentFiles.filter((f) => f.id !== record.id && f.filePath !== record.filePath);
  config.recentFiles = [record, ...filtered].slice(0, 20);
  writeConfig(config);
}

export function removeRecentFile(id: string): void {
  const config = readConfig();
  config.recentFiles = config.recentFiles.filter((f) => f.id !== id);
  writeConfig(config);
}

/** Returns the recentFile record for a given routing UUID, or undefined. */
export function findRecentById(id: string): ElectronRecentFile | undefined {
  return readConfig().recentFiles.find((f) => f.id === id);
}

/** Returns the recentFile record for a given file path, or undefined. */
export function findRecentByPath(filePath: string): ElectronRecentFile | undefined {
  return readConfig().recentFiles.find((f) => f.filePath === filePath);
}
