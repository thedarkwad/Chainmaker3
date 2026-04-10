// Electron replacement for @/app/state/localSettings.
// Reads/writes settings via the IPC config file instead of localStorage.

import { useCallback, useEffect, useState } from "react";
import type { LocalSettings } from "@/app/state/localSettings";
import { ThemeSetting } from "@/app/ThemeSetting";

export type { LocalSettings };

const DEFAULTS: LocalSettings = {
  autosave: true,
  theme: "azure",
  dark: true,
  scale: 100,
  units: "imperial",
};

function getAPI() {
  return window.electronAPI?.settings;
}

function toLocalSettings(s: Awaited<ReturnType<NonNullable<ReturnType<typeof getAPI>>["getSettings"]>>): LocalSettings {
  return {
    autosave: s.autosave ?? DEFAULTS.autosave,
    theme: (s.theme as ThemeSetting) ?? DEFAULTS.theme,
    dark: s.dark ?? DEFAULTS.dark,
    scale: s.scale ?? DEFAULTS.scale,
    units: s.units ?? DEFAULTS.units,
  };
}

export function useLocalSettings() {
  const [settings, setSettings] = useState<LocalSettings>(DEFAULTS);

  useEffect(() => {
    getAPI()?.getSettings().then((s) => setSettings(toLocalSettings(s))).catch(console.error);

    // Sync when settings change via the native Preferences menu
    window.electronAPI?.onSettingsChanged((s) => setSettings(toLocalSettings(s)));
  }, []);

  const update = useCallback((patch: Partial<LocalSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      getAPI()?.setSettings(patch).catch(console.error);
      return next;
    });
  }, []);

  return [settings, update] as const;
}
