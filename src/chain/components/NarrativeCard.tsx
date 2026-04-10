import type { ReactNode } from "react";

import type { NarrativeBlurb } from "@/chain/data/Jump";
import { type GID, type Id } from "@/chain/data/types";
import { useJumpNarrative } from "@/chain/state/hooks";
import { useDraft } from "@/chain/state/useDraft";
import { EditableSection } from "@/ui/EditableSection";
import { FieldLabel, ViewText, EditTextarea } from "@/chain/components/AltFormEditor";

// ─────────────────────────────────────────────────────────────────────────────

type NarrativeDraft = NarrativeBlurb;

/**
 * Editable card showing goals / challenges / accomplishments for a single
 * jump+character pair.
 *
 * Used both on the jump overview (title="Narrative") and on the narrative
 * summary page (title = jump name, action = jump pill link).
 */
export function NarrativeCard({
  jumpId,
  charId,
  title = "Narrative",
  action,
}: {
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  title?: string;
  action?: ReactNode;
}) {
  const { narrative, setNarrative } = useJumpNarrative(jumpId, charId);
  const draft = useDraft<NarrativeDraft>({ goals: "", challenges: "", accomplishments: "" });

  const isEmpty =
    !narrative ||
    (!narrative.goals.trim() && !narrative.challenges.trim() && !narrative.accomplishments.trim());

  const viewContent = (
    <div className="flex flex-col gap-2">
      {(["goals", "challenges", "accomplishments"] as const).map((field) => {
        const text = narrative?.[field] ?? "";
        if (!text.trim()) return null;
        return (
          <div key={field}>
            <FieldLabel>{field.charAt(0).toUpperCase() + field.slice(1)}</FieldLabel>
            <ViewText text={text} />
          </div>
        );
      })}
      {isEmpty && <p className="text-xs text-ghost italic">No narrative yet.</p>}
    </div>
  );

  const editContent = (
    <div className="flex flex-col gap-3">
      {(["goals", "challenges", "accomplishments"] as const).map((field) => (
        <div key={field}>
          <FieldLabel>{field.charAt(0).toUpperCase() + field.slice(1)}</FieldLabel>
          <EditTextarea
            value={draft.state[field]}
            onChange={(v) => draft.sync((d) => { d[field] = v; })}
            placeholder={`Enter ${field}…`}
          />
        </div>
      ))}
    </div>
  );

  return (
    <EditableSection
      separated
      title={title}
      isEmpty={isEmpty}
      action={action}
      viewContent={viewContent}
      editContent={editContent}
      onEnterEdit={() =>
        draft.restart({
          goals: narrative?.goals ?? "",
          challenges: narrative?.challenges ?? "",
          accomplishments: narrative?.accomplishments ?? "",
        })
      }
      onSave={() => {
        draft.close();
        setNarrative((d) => {
          d.goals = draft.state.goals.trimEnd();
          d.challenges = draft.state.challenges.trimEnd();
          d.accomplishments = draft.state.accomplishments.trimEnd();
        });
      }}
      onCancel={() => draft.cancel()}
    />
  );
}
