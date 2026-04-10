import { Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { LocalSettings } from "@/app/state/localSettings";
import { THEMES } from "../ThemeSetting";

// ── Primitives ────────────────────────────────────────────────────────────────

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={value}
      onClick={() => onChange(!value)}
      className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
        value ? "bg-accent" : "bg-edge"
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
          value ? "translate-x-4.5" : "translate-x-0.5"
        }`}
      />
    </button>
  );
}

function SegControl<T extends string | number>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded border border-edge overflow-hidden shrink-0">
      {options.map((opt) => (
        <button
          key={String(opt.value)}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`flex-1 px-2 py-0.5 text-xs transition-colors whitespace-nowrap ${
            value === opt.value
              ? "bg-accent text-white font-medium"
              : "bg-surface text-muted hover:bg-accent/10"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-xs text-muted shrink-0">{label}</span>
      {children}
    </div>
  );
}

// ── Scale slider ──────────────────────────────────────────────────────────────

function ScaleSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center gap-2 shrink-0">
      <input
        type="range"
        min={75}
        max={125}
        step={5}
        value={value}
        onChange={(e) => onChange(e.target.valueAsNumber)}
        className="w-28 accent-accent"
      />
      <span className="text-xs text-muted w-8 text-right">{value}%</span>
    </div>
  );
}

// ── Constants ─────────────────────────────────────────────────────────────────

const UNIT_OPTIONS = [
  { value: "imperial" as const, label: "Imperial" },
  { value: "metric" as const, label: "Metric" },
];

// ── SettingsDropdown ──────────────────────────────────────────────────────────

export function SettingsDropdown({
  settings,
  onUpdate,
}: {
  settings: LocalSettings;
  onUpdate: (patch: Partial<LocalSettings>) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setIsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  return (
    <div ref={ref} className="relative">
      <button
        title="Settings"
        onClick={() => setIsOpen((v) => !v)}
        className={`p-1.5 rounded transition-colors ${
          isOpen ? " bg-white/20" : "opacity-70 hover:opacity-100"
        }`}
      >
        <Settings size={17} />
      </button>

      {isOpen && (
        <div className="absolute top-full right-0 mt-1 z-200 bg-surface border border-edge rounded-lg shadow-lg p-3 w-60 flex flex-col gap-2.5">
          <Row label="Autosave">
            <Toggle value={settings.autosave} onChange={(v) => onUpdate({ autosave: v })} />
          </Row>

          <Row label="Appearance">
            <SegControl
              value={settings.dark ? "dark" : "light"}
              options={[
                { value: "light", label: "Light" },
                { value: "dark", label: "Dark" },
              ]}
              onChange={(v) => onUpdate({ dark: v === "dark" })}
            />
          </Row>

          <Row label="Theme">
            <select
              value={settings.theme}
              onChange={(e) => onUpdate({ theme: e.target.value as LocalSettings["theme"] })}
              className="text-xs rounded px-2 py-0.5 border border-edge bg-surface text-ink! focus:outline-none focus:border-accent-ring"
            >
              {THEMES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </select>
          </Row>

          <Row label="Scale">
            <ScaleSlider value={settings.scale} onChange={(v) => onUpdate({ scale: v })} />
          </Row>

          <Row label="Units">
            <SegControl
              value={settings.units}
              options={UNIT_OPTIONS}
              onChange={(v) => onUpdate({ units: v })}
            />
          </Row>
        </div>
      )}
    </div>
  );
}
