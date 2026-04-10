import { Check, Images, Pencil, Trash2, X } from "lucide-react";
import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import type { AltForm } from "@/chain/data/AltForm";
import {
  convertLength,
  convertWeight,
  displayLength,
  displayWeight,
  LengthUnit,
  WeightUnit,
} from "@/chain/data/AltForm";
import { type GID, type Id } from "@/chain/data/types";
import { useAltForm } from "@/chain/state/hooks";
import { useTheme } from "@/providers/ThemeProvider";
import { useDraft } from "@/chain/state/useDraft";
import { EditableSection } from "@/ui/EditableSection";
import { AutoResizeTextarea } from "@/ui/AutoResizeTextarea";
import { SelectField } from "@/ui/SelectField";
import { convertWhitespace } from "@/utilities/miscUtilities";
import { ImageGallery } from "@/app/components/ImageGallery";
import type { ImageSummary } from "@/api/images";
import { useImageUrl, useImageUrlCache } from "@/chain/state/ImageUrlCache";
import { useCurrentUser } from "@/app/state/auth";

const isElectron = import.meta.env.VITE_PLATFORM === "electron";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers (also re-exported for sibling cards)
// ─────────────────────────────────────────────────────────────────────────────

export function FieldLabel({ children }: { children: React.ReactNode }) {
  return <p className="text-xs font-semibold text-muted mb-0.5">{children}</p>;
}

export function ViewText({ text, placeholder }: { text: string; placeholder?: string }) {
  if (!text.trim()) {
    return <p className="text-xs text-ghost italic">{placeholder ?? "—"}</p>;
  }
  return <div className="text-sm text-ink flex flex-col gap-2">{convertWhitespace(text)}</div>;
}

export function EditTextarea({
  value,
  onChange,
  placeholder,
  singleLine,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  singleLine?: boolean;
}) {
  if (singleLine) {
    return (
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full text-sm text-ink bg-transparent border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring"
      />
    );
  }
  return (
    <AutoResizeTextarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full text-sm text-ink bg-transparent border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring min-h-12"
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const LENGTH_UNITS: { value: LengthUnit; label: string }[] = [
  { value: LengthUnit.Centimeters, label: "cm" },
  { value: LengthUnit.Meters, label: "m" },
  { value: LengthUnit.Feet, label: "ft" },
  { value: LengthUnit.Inches, label: "in" },
  { value: LengthUnit.Kilometers, label: "km" },
  { value: LengthUnit.Miles, label: "mi" },
];

export const WEIGHT_UNITS: { value: WeightUnit; label: string }[] = [
  { value: WeightUnit.Kilograms, label: "kg" },
  { value: WeightUnit.Pounds, label: "lbs" },
  { value: WeightUnit.Tonnes, label: "t" },
  { value: WeightUnit.Tons, label: "tons" },
];

const IMPERIAL_LENGTH_UNITS = LENGTH_UNITS.filter((u) =>
  [LengthUnit.Feet, LengthUnit.Inches, LengthUnit.Miles].includes(u.value),
);
const METRIC_LENGTH_UNITS = LENGTH_UNITS.filter((u) =>
  [LengthUnit.Centimeters, LengthUnit.Meters, LengthUnit.Kilometers].includes(u.value),
);
const IMPERIAL_WEIGHT_UNITS = WEIGHT_UNITS.filter((u) =>
  [WeightUnit.Pounds, WeightUnit.Tons].includes(u.value),
);
const METRIC_WEIGHT_UNITS = WEIGHT_UNITS.filter((u) =>
  [WeightUnit.Kilograms, WeightUnit.Tonnes].includes(u.value),
);

// ─────────────────────────────────────────────────────────────────────────────
// AltFormEditor
// ─────────────────────────────────────────────────────────────────────────────

type AltFormDraft = Omit<AltForm, "id">;

export function AltFormEditor({
  id,
  deletable = false,
  onRemove,
  isNew = false,
  jumpPill,
  headless = false,
  onClose,
}: {
  id: Id<GID.AltForm>;
  /** Show the delete button in the header. */
  deletable?: boolean;
  onRemove?: () => void;
  /** When true, the editor opens in edit mode immediately (used for newly created alt-forms). */
  isNew?: boolean;
  /** Optional pill element rendered in the card header (e.g. a link to the source jump). */
  jumpPill?: ReactNode;
  /**
   * When true, renders without the EditableSection card wrapper (no border, no collapsible
   * heading). Used when embedding inside a side panel that provides its own container.
   */
  headless?: boolean;
  /** Called when the user clicks the close button (headless mode only). */
  onClose?: () => void;
}) {
  const { altForm, modify } = useAltForm(id);
  const { firebaseUser } = useCurrentUser();
  const {
    settings: { units },
  } = useTheme();
  const imperial = units === "imperial";
  const lengthUnits = imperial ? IMPERIAL_LENGTH_UNITS : METRIC_LENGTH_UNITS;
  const weightUnits = imperial ? IMPERIAL_WEIGHT_UNITS : METRIC_WEIGHT_UNITS;

  const draft = useDraft<AltFormDraft>({
    name: "",
    species: "",
    sex: "",
    physicalDescription: "",
    capabilities: "",
    height: { value: 0, unit: LengthUnit.Centimeters },
    weight: { value: 0, unit: WeightUnit.Kilograms },
    image: undefined,
  });

  // Resolved URL for view mode: cache lookup for internal, direct for external.
  const internalImgId = altForm?.image?.type === "internal" ? altForm.image.imgId : undefined;
  const cachedUrl = useImageUrl(internalImgId);
  const viewResolvedUrl = altForm?.image?.type === "external" ? altForm.image.URL : cachedUrl;

  // Resolved URL for edit preview (updated immediately when the user picks/removes).
  const [editPreviewUrl, setEditPreviewUrl] = useState<string>("");

  // Which image source mode the user has selected this editing session.
  const [imageMode, setImageMode] = useState<"none" | "external" | "internal">("none");

  const [headlessEditing, setHeadlessEditing] = useState(false);

  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerTriggerRef = useRef<HTMLButtonElement>(null);
  const [pickerStyle, setPickerStyle] = useState<React.CSSProperties>({});

  function calcPickerStyle(): React.CSSProperties | null {
    if (!pickerTriggerRef.current) return null;
    const rect = pickerTriggerRef.current.getBoundingClientRect();
    const width = Math.max(rect.width, 300);
    const maxHeight = 400;

    const style: React.CSSProperties = { position: "fixed", width, maxHeight, zIndex: 200 };

    // Horizontal: anchor to whichever side has more room
    if (window.innerWidth - rect.left >= rect.right) {
      style.left = rect.left;
    } else {
      style.right = window.innerWidth - rect.right;
    }

    // Vertical: open downward if enough room, otherwise open upward
    if (window.innerHeight - rect.bottom >= maxHeight || window.innerHeight - rect.bottom >= rect.top) {
      style.top = rect.bottom + 6;
    } else {
      style.bottom = window.innerHeight - rect.top + 6;
    }

    return style;
  }

  function openPicker() {
    const style = calcPickerStyle();
    if (style) setPickerStyle(style);
    setPickerOpen(true);
  }

  useEffect(() => {
    if (!pickerOpen) return;
    function handleResize() {
      const style = calcPickerStyle();
      if (style) setPickerStyle(style);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, [pickerOpen]);

  function handlePickImage(image: ImageSummary) {
    draft.sync((d) => { d.image = { type: "internal", imgId: image._id }; });
    useImageUrlCache.getState().setUrl(image._id, image.path);
    setEditPreviewUrl(image.path);
    setPickerOpen(false);
  }

  async function handleElectronUpload() {
    const api = window.electronAPI;
    if (!api) return;
    const result = await api.images.uploadImage();
    if (!result) return;
    draft.sync((d) => { d.image = { type: "internal", imgId: result.id }; });
    useImageUrlCache.getState().setUrl(result.id, result.url);
    setEditPreviewUrl(result.url);
    setImageMode("internal");
  }

  if (!altForm) return null;

  function handleEnterEdit() {
    const height = convertLength(altForm!.height, imperial);
    const weight = convertWeight(altForm!.weight, imperial);
    draft.restart({
      name: altForm!.name,
      species: altForm!.species,
      sex: altForm!.sex,
      physicalDescription: altForm!.physicalDescription,
      capabilities: altForm!.capabilities,
      height: { ...height, value: +(+height.value).toFixed(1) },
      weight: { ...weight, value: +(+weight.value).toFixed(1) },
      image: altForm!.image,
    });
    setImageMode(
      altForm!.image?.type === "external" ? "external"
      : altForm!.image?.type === "internal" ? "internal"
      : "none",
    );
    setEditPreviewUrl(
      altForm!.image?.type === "external" ? altForm!.image.URL : viewResolvedUrl ?? "",
    );
  }

  function handleSave() {
    modify("Edit alt-form", (a) => {
      a.name = draft.state.name.trimEnd();
      a.species = draft.state.species.trimEnd();
      a.sex = draft.state.sex.trimEnd();
      a.physicalDescription = draft.state.physicalDescription.trimEnd();
      a.capabilities = draft.state.capabilities.trimEnd();
      a.height = draft.state.height;
      a.weight = draft.state.weight;
      if (draft.state.image) {
        a.image = draft.state.image;
      } else {
        delete a.image;
      }
    });
    draft.close();
  }

  function handleCancel() {
    setPickerOpen(false);
    setEditPreviewUrl("");
    setImageMode("none");
    draft.cancel();
  }

  const autoOpen = isNew;

  const viewContent = (
    <div className="flex flex-col gap-2">
      {viewResolvedUrl && (
        <a target="_blank" href={viewResolvedUrl}>
          <img
            src={viewResolvedUrl}
            alt={altForm.name || "Alt-form image"}
            className="w-full max-h-70 object-contain rounded"
          />
        </a>
      )}
      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
        {altForm.species.trim() && (
          <div>
            <FieldLabel>Species</FieldLabel>
            <p className="text-ink">{altForm.species}</p>
          </div>
        )}
        {altForm.sex.trim() && (
          <div>
            <FieldLabel>Sex</FieldLabel>
            <p className="text-ink">{altForm.sex}</p>
          </div>
        )}
        <div>
          <FieldLabel>Height</FieldLabel>
          <p className="text-ink">{displayLength(altForm.height, imperial)}</p>
        </div>
        <div>
          <FieldLabel>Weight</FieldLabel>
          <p className="text-ink">{displayWeight(altForm.weight, imperial)}</p>
        </div>
      </div>
      {altForm.physicalDescription.trim() && (
        <div>
          <FieldLabel>Physical Description</FieldLabel>
          <ViewText text={altForm.physicalDescription} />
        </div>
      )}
      {altForm.capabilities.trim() && (
        <div>
          <FieldLabel>Capabilities & Limitations</FieldLabel>
          <ViewText text={altForm.capabilities} />
        </div>
      )}
    </div>
  );

  const editContent = (
    <div className="flex flex-col gap-3">
      {/* Image */}
      <div>
        <FieldLabel>Image</FieldLabel>
        {editPreviewUrl && (
          <img
            src={editPreviewUrl}
            alt="Preview"
            className="mb-1.5 w-full max-h-40 object-contain rounded border border-edge"
          />
        )}
        {imageMode === "none" ? (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => setImageMode("external")}
              className="px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-ink hover:border-trim transition-colors"
            >
              Link Externally
            </button>
            {isElectron ? (
              <button
                type="button"
                onClick={handleElectronUpload}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-ink hover:border-trim transition-colors"
              >
                <Images size={12} />
                Upload
              </button>
            ) : (
              <button
                ref={pickerTriggerRef}
                type="button"
                onClick={() => { setImageMode("internal"); openPicker(); }}
                disabled={!firebaseUser}
                title={!firebaseUser ? "Sign in to upload images" : undefined}
                className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-ink hover:border-trim transition-colors disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:text-muted disabled:hover:border-edge"
              >
                <Images size={12} />
                Upload
              </button>
            )}
          </div>
        ) : imageMode === "external" ? (
          <div className="flex gap-1.5">
            <input
              type="url"
              value={draft.state.image?.type === "external" ? draft.state.image.URL : ""}
              onChange={(e) => {
                const url = e.target.value;
                draft.sync((d) => {
                  d.image = url.trim() ? { type: "external", URL: url } : undefined;
                });
                setEditPreviewUrl(url);
              }}
              placeholder="https://…"
              autoFocus
              className="flex-1 min-w-0 text-sm text-ink bg-transparent border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring"
            />
            <button
              type="button"
              onClick={() => {
                setImageMode("none");
                draft.sync((d) => { d.image = undefined; });
                setEditPreviewUrl("");
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-red-500 hover:border-red-400 transition-colors"
            >
              <Trash2 size={12} />
              Remove
            </button>
          </div>
        ) : (
          <div className="flex gap-1.5">
            <button
              ref={isElectron ? undefined : pickerTriggerRef}
              type="button"
              onClick={isElectron ? handleElectronUpload : openPicker}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-ink hover:border-trim transition-colors"
            >
              <Images size={12} />
              {draft.state.image?.type === "internal" ? "Change image" : "Choose image"}
            </button>
            <button
              type="button"
              onClick={() => {
                setImageMode("none");
                draft.sync((d) => { d.image = undefined; });
                setEditPreviewUrl("");
              }}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium rounded border border-edge text-muted hover:text-red-500 hover:border-red-400 transition-colors"
            >
              <Trash2 size={12} />
              Remove
            </button>
          </div>
        )}
      </div>

      {/* Name / Species / Sex */}
      <div className="grid grid-cols-[1fr_1fr] gap-2">
        <div className="col-span-2">
          <FieldLabel>Name</FieldLabel>
          <EditTextarea
            value={draft.state.name}
            onChange={(v) =>
              draft.sync((d) => {
                d.name = v;
              })
            }
            placeholder="Form name"
            singleLine
          />
        </div>
        <div>
          <FieldLabel>Species</FieldLabel>
          <EditTextarea
            value={draft.state.species}
            onChange={(v) =>
              draft.sync((d) => {
                d.species = v;
              })
            }
            placeholder="Species"
            singleLine
          />
        </div>
        <div>
          <FieldLabel>Sex</FieldLabel>
          <EditTextarea
            value={draft.state.sex}
            onChange={(v) =>
              draft.sync((d) => {
                d.sex = v;
              })
            }
            placeholder="Sex"
            singleLine
          />
        </div>
      </div>

      {/* Height */}
      <div>
        <FieldLabel>Height</FieldLabel>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={draft.state.height.value}
            onChange={(e) =>
              draft.sync((d) => {
                d.height.value = +e.target.value;
              })
            }
            className="w-24 text-sm text-ink bg-transparent border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring"
          />
          <SelectField
            value={draft.state.height.unit}
            onChange={(e) =>
              draft.set("Set height unit", (d) => {
                d.height.unit = +e.target.value as LengthUnit;
              })
            }
          >
            {lengthUnits.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {/* Weight */}
      <div>
        <FieldLabel>Weight</FieldLabel>
        <div className="flex items-center gap-2">
          <input
            type="number"
            min={0}
            value={draft.state.weight.value}
            onChange={(e) =>
              draft.sync((d) => {
                d.weight.value = +e.target.value;
              })
            }
            className="w-24 text-sm text-ink bg-transparent border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring"
          />
          <SelectField
            value={draft.state.weight.unit}
            onChange={(e) =>
              draft.set("Set weight unit", (d) => {
                d.weight.unit = +e.target.value as WeightUnit;
              })
            }
          >
            {weightUnits.map((u) => (
              <option key={u.value} value={u.value}>
                {u.label}
              </option>
            ))}
          </SelectField>
        </div>
      </div>

      {/* Physical Description */}
      <div>
        <FieldLabel>Physical Description</FieldLabel>
        <EditTextarea
          value={draft.state.physicalDescription}
          onChange={(v) =>
            draft.sync((d) => {
              d.physicalDescription = v;
            })
          }
          placeholder="Describe physical appearance…"
        />
      </div>

      {/* Capabilities */}
      <div>
        <FieldLabel>Capabilities & Limitations</FieldLabel>
        <EditTextarea
          value={draft.state.capabilities}
          onChange={(v) =>
            draft.sync((d) => {
              d.capabilities = v;
            })
          }
          placeholder="Describe capabilities…"
        />
      </div>
    </div>
  );

  const pickerPortal = pickerOpen
    ? createPortal(
        <>
          <div
            className="fixed inset-0"
            style={{ zIndex: 199 }}
            onClick={() => setPickerOpen(false)}
          />
          <div
            className="bg-canvas border border-edge rounded-lg shadow-xl overflow-y-auto p-3"
            style={pickerStyle}
          >
            <ImageGallery pageSize={9} onSelect={handlePickImage} minCardWidth={80} />
          </div>
        </>,
        document.body,
      )
    : null;

  // ── Headless mode (no card border / collapsible heading) ──────────────────
  if (headless) {
    function doSave() { handleSave(); setHeadlessEditing(false); }
    function doCancel() { handleCancel(); setHeadlessEditing(false); }

    return (
      <>
        <div
          className="flex flex-col"
          onKeyDown={(e) => {
            if (!headlessEditing) return;
            if (e.key === "Escape") { e.preventDefault(); doCancel(); }
            else if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); doSave(); }
          }}
        >
          {/* Header bar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-edge bg-accent2-tint shrink-0">
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-hidden">
              <span className="text-sm font-semibold text-accent2 truncate">
                {altForm.name.trim() || "Unnamed Form"}
              </span>
              {!headlessEditing && jumpPill}
            </div>
            <div className="flex items-center gap-1 shrink-0">
              {deletable && onRemove && (
                <button
                  type="button"
                  title="Delete alt-form"
                  onClick={onRemove}
                  className="p-1 rounded text-ghost hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
              {headlessEditing ? (
                <>
                  <button
                    type="button"
                    onClick={doSave}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-accent2 hover:bg-accent2/80 text-surface transition-colors"
                  >
                    <Check size={11} />
                    Save
                  </button>
                  <button
                    type="button"
                    onClick={doCancel}
                    className="flex items-center gap-1 px-2 py-0.5 rounded text-xs font-semibold bg-surface text-muted border border-edge hover:bg-accent2-tint transition-colors"
                  >
                    <X size={11} />
                    Cancel
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  title="Edit"
                  onClick={() => { handleEnterEdit(); setHeadlessEditing(true); }}
                  className="p-1 rounded text-accent2 hover:bg-accent2/20 transition-colors"
                >
                  <Pencil size={12} />
                </button>
              )}
              {onClose && (
                <button
                  type="button"
                  title="Close"
                  onClick={onClose}
                  className="p-1 rounded text-ghost hover:text-ink transition-colors ml-1"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
          {/* Content */}
          <div className="p-3 overflow-y-auto">
            {headlessEditing ? editContent : viewContent}
          </div>
        </div>
        {pickerPortal}
      </>
    );
  }

  // ── Normal card mode ───────────────────────────────────────────────────────
  return (
    <>
      <EditableSection
        title={altForm.name.trim() || "Unnamed Form"}
        initiallyEditing={autoOpen}
        viewContent={viewContent}
        altColor
        editContent={editContent}
        action={
          jumpPill || (deletable && onRemove) ? (
            <>
              {jumpPill}
              {deletable && onRemove && (
                <button
                  type="button"
                  title="Delete alt-form"
                  onClick={onRemove}
                  className="p-1 rounded text-ghost hover:text-red-500 transition-colors"
                >
                  <Trash2 size={12} />
                </button>
              )}
            </>
          ) : undefined
        }
        onEnterEdit={handleEnterEdit}
        onSave={handleSave}
        onCancel={handleCancel}
      />
      {pickerPortal}
    </>
  );
}
