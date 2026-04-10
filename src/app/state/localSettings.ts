import { useCallback, useState } from "react";
import { ThemeSetting } from "../ThemeSetting";

// ── Type ──────────────────────────────────────────────────────────────────────

export type LocalSettings = {
  /** Auto-save the chain after every mutation. */
  autosave: boolean;
  /** UI color theme. Empty string = default. */
  theme: ThemeSetting;
  /** Dark mode enabled. */
  dark: boolean;
  /** UI scale as a percentage (75 / 87 / 100 / 112 / 125). */
  scale: number;
  /** Measurement unit system. */
  units: "imperial" | "metric";
};

// ── Storage ───────────────────────────────────────────────────────────────────

const STORAGE_KEY = "chainmaker_settings";

const DEFAULTS: LocalSettings = {
  autosave: true,
  theme: "azure",
  dark: true,
  scale: 100,
  units: "imperial",
};

function load(): LocalSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    return { ...DEFAULTS, ...(JSON.parse(raw) as Partial<LocalSettings>) };
  } catch {
    return { ...DEFAULTS };
  }
}

function persist(settings: LocalSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore (private browsing or quota exceeded)
  }
}

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLocalSettings() {
  const [settings, setSettings] = useState<LocalSettings>(load);

  const update = useCallback((patch: Partial<LocalSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      persist(next);
      return next;
    });
  }, []);

  return [settings, update] as const;
}
