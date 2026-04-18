import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { createId, type GID, type Id, type LID } from "@/chain/data/types";
import { DEFAULT_CURRENCY_ID, type Currency, type Origin, type OriginCategory } from "@/chain/data/Jump";
import type { SimpleValue } from "@/chain/data/Purchase";
import {
  useJumpSettings,
  useJumpNotes,
  useJumpOriginCategories,
  useJumpOrigins,
  useJumpAltForms,
  useCurrencies,
} from "@/chain/state/hooks";
import { EditableSection } from "@/ui/EditableSection";
import { useDraft } from "@/chain/state/useDraft";
import { DraggableList } from "@/chain/components/DraggableList";
import { SelectField } from "@/ui/SelectField";
import { AltFormEditor, ViewText, EditTextarea } from "@/chain/components/AltFormEditor";
import { NarrativeCard } from "@/chain/components/NarrativeCard";
import { convertWhitespace } from "@/utilities/miscUtilities";

export const Route = createFileRoute("/chain/$chainId/char/$charId/jump/$jumpId/")({
  validateSearch: (search: Record<string, unknown>) => ({
    origin: typeof search.origin === "string" ? search.origin : undefined,
  }),
  component: OverviewTab,
});

// ─────────────────────────────────────────────────────────────────────────────
// Notes card
// ─────────────────────────────────────────────────────────────────────────────

function NotesCard({ jumpId, charId }: { jumpId: Id<GID.Jump>; charId: Id<GID.Character> }) {
  const { notes, setNotes } = useJumpNotes(jumpId, charId);
  const draft = useDraft<{ text: string }>({ text: "" });

  const isEmpty = !notes.trim();

  return (
    <EditableSection
      separated
      title="Notes"
      isEmpty={isEmpty}
      viewContent={<ViewText text={notes} placeholder="No notes." />}
      editContent={
        <EditTextarea
          value={draft.state.text}
          onChange={(v) =>
            draft.sync((d) => {
              d.text = v;
            })
          }
          placeholder="Write notes here…"
        />
      }
      onEnterEdit={() => draft.restart({ text: notes })}
      onSave={() => {
        draft.close();
        setNotes(draft.state.text.trimEnd());
      }}
      onCancel={() => draft.cancel()}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Origins card — one origin entry per category
// ─────────────────────────────────────────────────────────────────────────────

type OriginDraft = {
  catId: Id<LID.OriginCategory>;
  category: OriginCategory;
  entries: Origin[];
};

function OriginEntryRow({
  entry,
  catName,
  hasCurrencies,
  currencyList,
  canRemove,
  singleLine,
  onAmountBlur,
  onCurrencyChange,
  onSummaryChange,
  onDescriptionChange,
  onRemove,
}: {
  entry: Origin;
  catName: string;
  hasCurrencies: boolean;
  currencyList: [string, Currency][];
  canRemove: boolean;
  singleLine: boolean;
  onAmountBlur: (v: number) => void;
  onCurrencyChange: (id: Id<LID.Currency>) => void;
  onSummaryChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onRemove: () => void;
}) {
  const [amtStr, setAmtStr] = useState(String(entry.value.amount));
  useEffect(() => setAmtStr(String(entry.value.amount)), [entry.value.amount]);

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-1.5">
        <span className="text-sm font-medium text-muted shrink-0">{catName}:</span>
        <div className="flex-1 min-w-0">
          <EditTextarea
            value={entry.summary}
            onChange={onSummaryChange}
            placeholder="Summary…"
            singleLine
          />
        </div>
        {hasCurrencies && (
          <>
            <input
              type="number"
              step={50}
              value={amtStr}
              onChange={(e) => {
                const str = e.target.value;
                setAmtStr(str);
                if (str !== "" && str !== "-" && !str.endsWith(".") && !isNaN(+str)) {
                  onAmountBlur(+str);
                }
              }}
              onBlur={(e) => {
                const v = +e.target.value || 0;
                setAmtStr(String(v));
                onAmountBlur(v);
              }}
              className="w-16 text-sm text-ink bg-transparent border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring shrink-0"
            />
            {currencyList.length === 1 ? (
              <span className="text-xs text-muted shrink-0">{currencyList[0]![1].abbrev}</span>
            ) : (
              <SelectField
                value={entry.value.currency as number}
                onChange={(e) => onCurrencyChange(createId<LID.Currency>(+e.target.value))}
              >
                {currencyList.map(([cid, cur]) => (
                  <option key={cid} value={cid}>
                    {cur.abbrev}
                  </option>
                ))}
              </SelectField>
            )}
          </>
        )}
        {canRemove && (
          <button
            type="button"
            title="Remove entry"
            onClick={onRemove}
            className="p-0.5 rounded text-ghost hover:text-red-500 transition-colors shrink-0"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
      {!singleLine && (
        <EditTextarea
          value={entry.description ?? ""}
          onChange={onDescriptionChange}
          placeholder="Description…"
        />
      )}
    </div>
  );
}

function OriginsCard({ jumpId, charId, forceOpenNonce }: { jumpId: Id<GID.Jump>; charId: Id<GID.Character>; forceOpenNonce?: number }) {
  const originCategories = useJumpOriginCategories(jumpId);
  const { origins, setOrigins } = useJumpOrigins(jumpId, charId);
  const currencies = useCurrencies(jumpId);
  const drafts = useDraft<OriginDraft[]>([]);

  if (!originCategories || Object.keys(originCategories.O).length === 0) return null;

  const catEntries = Object.entries(originCategories.O);
  const currencyList = Object.entries(currencies?.O ?? {});

  const isEmpty = catEntries.every(([catIdStr, cat]) => {
    const catId = +catIdStr as Id<LID.OriginCategory>;
    const entries = origins?.[catId] ?? [];
    if (cat.default) return false;
    return (
      entries.length === 0 || entries.every((e) => !e.summary.trim() && !e.description?.trim())
    );
  });

  const makeBlankOrigin = (): Origin => ({
    value: { amount: 0, currency: DEFAULT_CURRENCY_ID } as SimpleValue,
    summary: "",
    description: "",
  });

  const formatValue = (v: SimpleValue) => {
    const cur = currencies?.O[v.currency] as Currency | undefined;
    if (!cur || currencyList.length === 0) return null;
    return `Cost: ${v.amount} ${cur.abbrev}`;
  };

  const syncEntry = (di: number, ei: number, patch: Partial<Origin> | ((e: Origin) => Origin)) =>
    drafts.sync((d) => {
      const item = d[di];
      if (!item) return;
      const old = item.entries[ei];
      if (!old) return;
      item.entries[ei] = typeof patch === "function" ? patch(old) : { ...old, ...patch };
    });

  const setEntry = (di: number, ei: number, patch: Partial<Origin> | ((e: Origin) => Origin)) =>
    drafts.set("Update entry", (d) => {
      const item = d[di];
      if (!item) return;
      const old = item.entries[ei];
      if (!old) return;
      item.entries[ei] = typeof patch === "function" ? patch(old) : { ...old, ...patch };
    });

  const viewContent = (
    <div className="flex flex-col gap-0.5">
      {catEntries.map(([catIdStr, cat]) => {
        const catId = +catIdStr as Id<LID.OriginCategory>;
        const entries = (origins?.[catId] ?? []).filter(
          (e) => e.summary.trim() || e.description?.trim(),
        );
        if (entries.length === 0) {
          if (!cat.default) return null;
          return (
            <div key={catIdStr}>
              <p className="text-sm text-ink">
                <span className="font-medium text-muted/80">{cat.name}: </span>
                {cat.default}
              </p>
            </div>
          );
        }
        return entries.map((entry, i) => {
          const val = formatValue(entry.value);
          return (
            <div key={`${catIdStr}-${i}`}>
              <div className="flex items-baseline gap-1.5">
                <p className="flex-1 min-w-0 text-sm text-ink">
                  <span className="font-medium text-muted/80">{cat.name}: </span>
                  {entry.summary || <span className="text-ghost italic">—</span>}
                </p>
                {val !== null && <span className="text-xs text-muted shrink-0">[{val}]</span>}
              </div>
              {!cat.singleLine && entry.description?.trim() && (
                <div className="text-xs text-muted flex flex-col gap-1.5 pl-2 mx-2 mt-0.5 border-l border-accent2/50">
                  {convertWhitespace(entry.description)}
                </div>
              )}
            </div>
          );
        });
      })}
      {isEmpty && <p className="text-xs text-ghost italic">No origins set.</p>}
    </div>
  );

  const editContent = (
    <div className="flex flex-col gap-3">
      {drafts.state.map((draft, di) => (
        <div key={draft.catId as number} className="flex flex-col gap-1">
          {draft.entries.map((entry, ei) => (
            <OriginEntryRow
              key={ei}
              entry={entry}
              catName={draft.category.name}
              hasCurrencies={currencyList.length > 0}
              currencyList={currencyList}
              canRemove={draft.category.multiple}
              singleLine={draft.category.singleLine}
              onAmountBlur={(v) =>
                syncEntry(di, ei, (en) => ({ ...en, value: { ...en.value, amount: v } }))
              }
              onCurrencyChange={(id) =>
                setEntry(di, ei, (en) => ({ ...en, value: { ...en.value, currency: id } }))
              }
              onSummaryChange={(v) => syncEntry(di, ei, { summary: v })}
              onDescriptionChange={(v) => syncEntry(di, ei, { description: v })}
              onRemove={() =>
                drafts.set("Remove entry", (d) => {
                  d[di]?.entries.splice(ei, 1);
                })
              }
            />
          ))}
          {draft.category.multiple && (
            <button
              type="button"
              onClick={() =>
                drafts.set("Add entry", (d) => {
                  d[di]?.entries.push(makeBlankOrigin());
                })
              }
              className="self-start text-xs text-accent hover:underline flex items-center gap-0.5 mt-0.5"
            >
              <Plus size={11} /> Add entry
            </button>
          )}
        </div>
      ))}
    </div>
  );

  return (
    <EditableSection
      separated
      title="Insertion"
      isEmpty={false}
      forceOpenNonce={forceOpenNonce}
      viewContent={viewContent}
      editContent={editContent}
      onEnterEdit={() => {
        drafts.restart(
          catEntries.map(([catIdStr, cat]) => {
            const catId = +catIdStr as Id<LID.OriginCategory>;
            const existing = origins?.[catId] ?? [];
            const entries =
              existing.length > 0
                ? existing.map((e) => ({ ...e }))
                : [{ ...makeBlankOrigin(), summary: cat.default ?? "" }];
            return { catId, category: cat, entries };
          }),
        );
      }}
      onSave={() => {
        setOrigins((d) => {
          for (const draft of drafts.state) {
            const filtered = draft.entries.filter((e) => e.summary.trim() || e.description?.trim());
            if (filtered.length === 0) {
              delete (d as Record<number, Origin[]>)[draft.catId as number];
            } else {
              (d as Record<number, Origin[]>)[draft.catId as number] = filtered.map((e) => ({
                ...e,
                summary: e.summary.trimEnd(),
                description: e.description?.trimEnd(),
              }));
            }
          }
        });
        drafts.close();
      }}
      onCancel={() => drafts.cancel()}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Alt-forms section
// ─────────────────────────────────────────────────────────────────────────────

function AltFormsSection({ jumpId, charId }: { jumpId: Id<GID.Jump>; charId: Id<GID.Character> }) {
  const { altFormIds, actions } = useJumpAltForms(jumpId, charId);
  const [newAltFormIds, setNewAltFormIds] = useState<Set<Id<GID.AltForm>>>(() => new Set());

  return (
    <div className="flex flex-col gap-1 mt-2">
      <div className="flex items-center justify-between px-1">
        <p className="text-xs font-semibold text-muted uppercase tracking-wide">Alt-Forms</p>
        <button
          type="button"
          onClick={() => {
            const id = actions.addAltForm();
            setNewAltFormIds((prev) => new Set(prev).add(id));
          }}
          className="flex items-center gap-1 text-xs text-accent hover:underline"
        >
          <Plus size={12} /> Add
        </button>
      </div>
      {altFormIds.length === 0 ? (
        <p className="text-xs text-ghost italic text-center py-2">No alt-forms yet.</p>
      ) : (
        <DraggableList
          ids={altFormIds}
          onReorder={actions.reorderAltForms}
          renderItem={(id) => (
            <AltFormEditor
              id={id}
              deletable
              onRemove={() => actions.removeAltForm(id)}
              isNew={newAltFormIds.has(id)}
            />
          )}
          renderOverlay={() => (
            <div className="rounded-lg border border-trim bg-surface shadow-xl ring-2 ring-accent opacity-95 cursor-grabbing px-2.5 py-1.5 text-sm font-semibold text-ink">
              Alt-Form
            </div>
          )}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Root route component
// ─────────────────────────────────────────────────────────────────────────────

function OverviewTab() {
  const { charId, jumpId } = Route.useParams();
  const { origin } = Route.useSearch();
  const navigate = useNavigate();
  const jumpGid = createId<GID.Jump>(+jumpId);
  const charGid = createId<GID.Character>(+charId);
  const [insertionNonce, setInsertionNonce] = useState(0);

  useEffect(() => {
    if (origin !== undefined) {
      setInsertionNonce((n) => n + 1);
      navigate({ to: ".", search: (s) => ({ ...s, origin: undefined }), replace: true });
    }
  }, [origin]);

  const { useNarrative, useAltForms } = useJumpSettings(jumpGid, charGid);

  return (
    <div key={jumpId} className="flex-1 overflow-auto py-1">
      <div className="max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-2 gap-2 items-start">
        {/* Left column */}
        <div className="flex flex-col gap-2">
          <OriginsCard jumpId={jumpGid} charId={charGid} forceOpenNonce={insertionNonce} />
          {useNarrative && <NarrativeCard jumpId={jumpGid} charId={charGid} />}
        </div>

        {/* Right column */}
        <div className="flex flex-col gap-2">
          <NotesCard jumpId={jumpGid} charId={charGid} />
          {useAltForms && <AltFormsSection jumpId={jumpGid} charId={charGid} />}
        </div>
      </div>
    </div>
  );
}
