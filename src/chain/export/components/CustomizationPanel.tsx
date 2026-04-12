import { SegmentedControl } from "@/ui/SegmentedControl";
import type { ExportFormat, ExportSections, PdfColorTheme, PdfFont } from "../types";

type Props = {
  sections: ExportSections;
  pdfColorTheme: PdfColorTheme;
  pdfFont: PdfFont;
  format: ExportFormat;
  availableSupplements: string[];
  onSectionsChange: (sections: ExportSections) => void;
  onColorThemeChange: (theme: PdfColorTheme) => void;
  onFontChange: (font: PdfFont) => void;
};

const PDF_COLOR_THEMES: { value: PdfColorTheme; label: string }[] = [
  { value: "app-theme", label: "App Theme" },
  { value: "paper", label: "Paper" },
  { value: "black-and-white", label: "Black & White" },
];

const PDF_FONTS: { value: PdfFont; label: string }[] = [
  { value: "sans-serif", label: "Sans-Serif" },
  { value: "serif", label: "Serif" },
  { value: "mono", label: "Mono" },
];

function GroupLabel({ label }: { label: string }) {
  return (
    <p className="text-xs font-semibold text-muted uppercase tracking-wide mb-1">{label}</p>
  );
}

function CheckRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: () => void }) {
  return (
    <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
      <input type="checkbox" checked={checked} onChange={onChange} className="accent-accent" />
      {label}
    </label>
  );
}

export function CustomizationPanel({ sections, pdfColorTheme, pdfFont, format, availableSupplements, onSectionsChange, onColorThemeChange, onFontChange }: Props) {
  function toggle(key: keyof ExportSections) {
    onSectionsChange({ ...sections, [key]: !sections[key] });
  }

  function toggleSupplement(name: string) {
    const current = sections.supplements === "all"
      ? availableSupplements
      : sections.supplements;
    if (current.includes(name)) {
      onSectionsChange({ ...sections, supplements: current.filter((n) => n !== name) });
    } else {
      onSectionsChange({ ...sections, supplements: [...current, name] });
    }
  }

  function suppEnabled(name: string) {
    return sections.supplements === "all" || sections.supplements.includes(name);
  }

  return (
    <div className="flex flex-col gap-4">

      {/* Descriptions */}
      <section>
        <GroupLabel label="Descriptions" />
        <SegmentedControl
          value={sections.descriptions ? "normal" : "ultracompact"}
          onChange={(v) => onSectionsChange({ ...sections, descriptions: v === "normal" })}
          options={[
            { value: "normal", label: "Normal" },
            { value: "ultracompact", label: "Ultracompact" },
          ]}
        />
      </section>

      {/* Point Values */}
      <section>
        <GroupLabel label="Point Values" />
        <div className="flex flex-col gap-1">
          <CheckRow label="Show Costs" checked={sections.costs} onChange={() => toggle("costs")} />
          <CheckRow label="Budget Summary" checked={sections.budget} onChange={() => toggle("budget")} />
        </div>
      </section>

      {/* Core Features */}
      <section>
        <GroupLabel label="Core Features" />
        <div className="flex flex-col gap-1">
          <CheckRow label="Origins" checked={sections.origins} onChange={() => toggle("origins")} />
          <CheckRow label="Companion Imports" checked={sections.companions} onChange={() => toggle("companions")} />
          <CheckRow label="Drawbacks" checked={sections.drawbacks} onChange={() => toggle("drawbacks")} />
          <CheckRow label="Scenarios" checked={sections.scenarios} onChange={() => toggle("scenarios")} />
        </div>
      </section>

      {/* Supplements — one toggle per supplement, hidden if none */}
      {availableSupplements.length > 0 && (
        <section>
          <GroupLabel label="Supplements" />
          <div className="flex flex-col gap-1">
            {availableSupplements.map((name) => (
              <CheckRow
                key={name}
                label={name}
                checked={suppEnabled(name)}
                onChange={() => toggleSupplement(name)}
              />
            ))}
          </div>
        </section>
      )}

      {/* Optional Features */}
      <section>
        <GroupLabel label="Optional Features" />
        <div className="flex flex-col gap-1">
          <CheckRow label="Narratives" checked={sections.narrative} onChange={() => toggle("narrative")} />
          <CheckRow label="Alt-forms" checked={sections.altForms} onChange={() => toggle("altForms")} />
          <CheckRow label="Notes" checked={sections.notes} onChange={() => toggle("notes")} />
        </div>
      </section>

      {/* PDF Theme */}
      {format === "pdf" && (
        <>
          <section>
            <GroupLabel label="Color" />
            <select
              value={pdfColorTheme}
              onChange={(e) => onColorThemeChange(e.target.value as PdfColorTheme)}
              className="w-full text-sm rounded border border-edge bg-surface px-1.5 py-0.5"
            >
              {PDF_COLOR_THEMES.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </section>
          <section>
            <GroupLabel label="Font" />
            <select
              value={pdfFont}
              onChange={(e) => onFontChange(e.target.value as PdfFont)}
              className="w-full text-sm rounded border border-edge bg-surface px-1.5 py-0.5"
            >
              {PDF_FONTS.map(({ value, label }) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </section>
        </>
      )}
    </div>
  );
}
