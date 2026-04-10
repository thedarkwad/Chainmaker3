import { createContext, useContext, useEffect } from "react";
import { type LocalSettings, useLocalSettings } from "@/app/state/localSettings";

type ThemeContextValue = {
  settings: LocalSettings;
  updateSettings: (patch: Partial<LocalSettings>) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [settings, updateSettings] = useLocalSettings();

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute("data-theme", settings.theme);
    if (settings.dark) html.setAttribute("data-dark", "");
    else html.removeAttribute("data-dark");
    html.style.fontSize = settings.scale !== 100 ? `${settings.scale}%` : "";
  }, [settings.theme, settings.dark, settings.scale]);

  return (
    <ThemeContext.Provider value={{ settings, updateSettings }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
