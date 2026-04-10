import { Trash2 } from "lucide-react";

import { PersonalityComponent } from "@/chain/data/Character";
import type { Character } from "@/chain/data/Character";
import { useDraft } from "@/chain/state/useDraft";
import { EditableSection } from "@/ui/EditableSection";
import { FieldLabel, ViewText, EditTextarea } from "@/chain/components/AltFormEditor";
import { convertWhitespace } from "@/utilities/miscUtilities";

// ─────────────────────────────────────────────────────────────────────────────

export type CharModify = (name: string, updater: (c: Character) => void) => void;

// ─────────────────────────────────────────────────────────────────────────────
// Personality metadata
// ─────────────────────────────────────────────────────────────────────────────

const ALL_PERSONALITY_COMPONENTS: PersonalityComponent[] = [
  PersonalityComponent.Personality,
  PersonalityComponent.Motivation,
  PersonalityComponent.Likes,
  PersonalityComponent.Dislikes,
  PersonalityComponent.Quirks,
  PersonalityComponent.Ideology,
  PersonalityComponent.Fears,
  PersonalityComponent.Aspirations,
  PersonalityComponent.Struggles,
];

const PERSONALITY_PLACEHOLDERS: Record<PersonalityComponent, (name: string) => string> = {
  [PersonalityComponent.Personality]: (name) =>
    `What is a broad summary of what ${name} is like? What kind of person are they?`,
  [PersonalityComponent.Motivation]: (name) =>
    `Why does ${name} jump? What purpose do they find for the many abilities they shall accumulate?`,
  [PersonalityComponent.Likes]: (name) => `What is at least one thing that ${name} enjoys?`,
  [PersonalityComponent.Dislikes]: (name) =>
    `What is at least one thing that ${name} finds unpleasant?`,
  [PersonalityComponent.Quirks]: (name) =>
    `What is at least one thing that makes ${name} weird or unique?`,
  [PersonalityComponent.Ideology]: (name) =>
    `What beliefs guide ${name}'s judgements and decisions?`,
  [PersonalityComponent.Fears]: (name) => `What is ${name} afraid of?`,
  [PersonalityComponent.Aspirations]: (name) => `What does ${name} personally desire and hope for?`,
  [PersonalityComponent.Struggles]: (name) =>
    `What personally challenges ${name}? What demons do they wrestle with?`,
};

// ─────────────────────────────────────────────────────────────────────────────
// Original Background card
// ─────────────────────────────────────────────────────────────────────────────

type BackgroundDraft = {
  name: string;
  gender: string;
  originalAge: number;
  backgroundSummary: string;
  backgroundDescription: string;
};

export function BackgroundCard({
  char,
  modify,
  initiallyEditing,
}: {
  char: Character;
  modify: CharModify;
  initiallyEditing?: boolean;
}) {
  const draft = useDraft<BackgroundDraft>({
    name: "",
    gender: "",
    originalAge: 0,
    backgroundSummary: "",
    backgroundDescription: "",
  });

  const isEmpty =
    !char.name.trim() &&
    !char.gender.trim() &&
    !char.background.summary.trim() &&
    !char.background.description.trim();

  const viewContent = (
    <div className="flex flex-col gap-2">
      <div className="grid grid-cols-[1fr_1fr_auto] gap-x-4 gap-y-1">
        <div>
          <FieldLabel>Name</FieldLabel>
          <ViewText text={char.name} placeholder="Unknown" />
        </div>
        <div>
          <FieldLabel>Gender</FieldLabel>
          <ViewText text={char.gender} placeholder="Unknown" />
        </div>
        <div>
          <FieldLabel>Original Age</FieldLabel>
          {char.originalAge ? (
            <p className="text-sm text-ink">{char.originalAge}</p>
          ) : (
            <p className="text-xs text-ghost italic">Unknown</p>
          )}
        </div>
      </div>

      {char.background.summary.trim() || char.background.description.trim() ? (
        <div className="flex flex-col gap-1 mt-1">
          <FieldLabel>Background</FieldLabel>
          {char.background.summary.trim() && <ViewText text={char.background.summary} />}
          {char.background.description.trim() && (
            <div className="text-xs text-muted flex flex-col gap-1.5 pl-2 mx-2 mt-0.5 border-l border-accent2/50">
              {convertWhitespace(char.background.description)}
            </div>
          )}
        </div>
      ) : isEmpty ? (
        <p className="text-xs text-ghost italic">No background set.</p>
      ) : null}
    </div>
  );

  const editContent = (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-2">
        <div>
          <FieldLabel>Name</FieldLabel>
          <EditTextarea
            value={draft.state.name}
            onChange={(v) =>
              draft.sync((d) => {
                d.name = v;
              })
            }
            placeholder="Character name"
            singleLine
          />
        </div>
        <div>
          <FieldLabel>Gender</FieldLabel>
          <EditTextarea
            value={draft.state.gender}
            onChange={(v) =>
              draft.sync((d) => {
                d.gender = v;
              })
            }
            placeholder="Gender"
            singleLine
          />
        </div>
        <div>
          <FieldLabel>Original Age</FieldLabel>
          <input
            type="number"
            min={0}
            value={draft.state.originalAge || ""}
            onChange={(e) =>
              draft.sync((d) => {
                d.originalAge = +e.target.value;
              })
            }
            placeholder="0"
            className="w-full text-sm text-ink bg-transparent border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring"
          />
        </div>
      </div>

      <div>
        <FieldLabel>Background</FieldLabel>
        <input
          type="text"
          value={draft.state.backgroundSummary}
          onChange={(e) =>
            draft.sync((d) => {
              d.backgroundSummary = e.target.value;
            })
          }
          placeholder="Brief background summary…"
          className="w-full text-sm text-ink bg-transparent border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring"
        />
      </div>

      <div>
        <EditTextarea
          value={draft.state.backgroundDescription}
          onChange={(v) =>
            draft.sync((d) => {
              d.backgroundDescription = v;
            })
          }
          placeholder="Detailed background…"
        />
      </div>
    </div>
  );

  return (
    <EditableSection
      separated
      title="Original Background"
      initiallyEditing={initiallyEditing}
      isEmpty={isEmpty}
      viewContent={viewContent}
      editContent={editContent}
      onEnterEdit={() =>
        draft.restart({
          name: char.name,
          gender: char.gender,
          originalAge: char.originalAge,
          backgroundSummary: char.background.summary,
          backgroundDescription: char.background.description,
        })
      }
      onSave={() => {
        draft.close();
        modify("Edit background", (c) => {
          c.name = draft.state.name.trimEnd();
          c.gender = draft.state.gender.trimEnd();
          c.originalAge = draft.state.originalAge;
          c.background.summary = draft.state.backgroundSummary.trimEnd();
          c.background.description = draft.state.backgroundDescription.trimEnd();
        });
      }}
      onCancel={() => draft.cancel()}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Biography / Notes card
// ─────────────────────────────────────────────────────────────────────────────

export function BiographyCard({ char, modify }: { char: Character; modify: CharModify }) {
  const draft = useDraft<{ text: string }>({ text: "" });

  const isEmpty = !char.notes.trim();

  return (
    <EditableSection
      separated
      title="Biography / Notes"
      isEmpty={isEmpty}
      viewContent={<ViewText text={char.notes} placeholder="No biography or notes yet." />}
      editContent={
        <EditTextarea
          value={draft.state.text}
          onChange={(v) =>
            draft.sync((d) => {
              d.text = v;
            })
          }
          placeholder="Write biography or notes here…"
        />
      }
      onEnterEdit={() => draft.restart({ text: char.notes })}
      onSave={() => {
        draft.close();
        modify("Edit biography", (c) => {
          c.notes = draft.state.text.trimEnd();
        });
      }}
      onCancel={() => draft.cancel()}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Personal Identity card
// ─────────────────────────────────────────────────────────────────────────────

type PersonalityDraft = Partial<Record<PersonalityComponent, string>>;

export function PersonalIdentityCard({ char, modify }: { char: Character; modify: CharModify }) {
  const draft = useDraft<PersonalityDraft>({});

  const charName = char.name.trim() || "they";

  const pd = draft.state as Record<string, string | undefined>;

  const presentComponents = ALL_PERSONALITY_COMPONENTS.filter((c) => pd[c] !== undefined);
  const unusedComponents = ALL_PERSONALITY_COMPONENTS.filter((c) => pd[c] === undefined);

  const personality = char.personality as Record<string, string | undefined>;
  const isEmpty = !Object.values(char.personality).some((v) => v?.trim());

  const viewContent = (
    <div className="flex flex-col gap-3">
      {ALL_PERSONALITY_COMPONENTS.map((component) => {
        const text = personality[component] ?? "";
        if (component !== PersonalityComponent.Personality && !text.trim()) return null;
        return (
          <div key={component}>
            <FieldLabel>{component}</FieldLabel>
            <ViewText text={text} placeholder={PERSONALITY_PLACEHOLDERS[component](charName)} />
          </div>
        );
      })}
    </div>
  );

  const editContent = (
    <div className="flex flex-col gap-3">
      {presentComponents.map((component) => (
        <div key={component}>
          <div className="flex items-baseline justify-between mb-0.5">
            <FieldLabel>{component}</FieldLabel>
            {component !== PersonalityComponent.Personality && (
              <button
                type="button"
                title={`Remove ${component}`}
                onClick={() =>
                  draft.set("Remove personality component", (d) => {
                    delete (d as Record<string, unknown>)[component];
                  })
                }
                className="p-0.5 rounded text-ghost hover:text-red-500 transition-colors"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
          <EditTextarea
            value={pd[component] ?? ""}
            onChange={(v) =>
              draft.sync((d) => {
                (d as Record<string, string>)[component] = v;
              })
            }
            placeholder={PERSONALITY_PLACEHOLDERS[component](charName)}
          />
        </div>
      ))}

      {unusedComponents.length > 0 && (
        <select
          key={presentComponents.join(",")}
          defaultValue=""
          onChange={(e) => {
            const comp = e.target.value as PersonalityComponent;
            if (!comp) return;
            draft.set("Add personality component", (d) => {
              (d as Record<string, string>)[comp] = "";
            });
          }}
          className="self-start text-xs text-muted bg-transparent border border-edge rounded px-2 py-1 focus:outline-none focus:border-accent-ring"
        >
          <option value="">Add aspect…</option>
          {unusedComponents.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      )}
    </div>
  );

  return (
    <EditableSection
      separated
      title="Personal Identity"
      isEmpty={isEmpty}
      viewContent={viewContent}
      editContent={editContent}
      onEnterEdit={() => {
        const initial: PersonalityDraft = { ...char.personality };
        if (!(PersonalityComponent.Personality in initial)) {
          (initial as Record<string, string>)[PersonalityComponent.Personality] = "";
        }
        draft.restart(initial);
      }}
      onSave={() => {
        draft.close();
        modify("Edit personal identity", (c) => {
          const result: Partial<Record<PersonalityComponent, string>> = {};
          for (const [key, value] of Object.entries(draft.state)) {
            if (value !== undefined) {
              result[key as PersonalityComponent] = (value as string).trimEnd();
            }
          }
          c.personality = result;
        });
      }}
      onCancel={() => draft.cancel()}
    />
  );
}
