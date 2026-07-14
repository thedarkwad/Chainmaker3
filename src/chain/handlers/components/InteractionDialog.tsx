import { useEffect, useState } from "react";
import {
  AnnotationInteraction,
  JumpDocBuildData,
  useViewerActionStore,
} from "../../state/ViewerActionStore";
import { ChainMutators } from "../types";
import { stripTemplating } from "@/jumpdoc/data/JumpDoc";
import { InteractionPreviewCard } from "../../components/InteractionPreviewCard";

export function InteractionDialog({
  interactions,
  build,
  mutators,
  onClose,
}: {
  interactions: AnnotationInteraction<object>[];
  build: JumpDocBuildData;
  mutators: ChainMutators;
  onClose: () => void;
}) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [interactionState, setInteractionState] = useState<object>(
    () => interactions[0]?.initialize(build) ?? {},
  );

  useEffect(() => {
    setInteractionState(interactions[activeIndex]?.initialize(build) ?? {});
  }, [activeIndex]);

  const enqueueInteractions = useViewerActionStore(s => s.enqueueInteractions);

  let interaction = interactions[activeIndex];
  let errorMessage = interaction.error(build);
  let actions = (
    typeof interaction.actions == "function"
      ? interaction.actions(build)
      : interaction.actions
  )
    .filter(a => a.condition(build))
    .map(a => ({
      label:
        typeof a.name == "function" ? a.name(build, interactionState) : a.name,
      variant: a.variant ?? "confirm",
      blocker:
        typeof a.blocker == "function"
          ? a.blocker(build, interactionState)
          : a.blocker,
      onConfirm: () =>
        a
          .execute(build, mutators, interactionState)
          .forEach(followup =>
            "interaction" in followup
              ? enqueueInteractions(followup.interaction, followup.character)
              : enqueueInteractions([followup]),
          ),
    }));

  return (
    <div className="bg-surface rounded-xl border border-edge shadow-xl text-left w-max max-w-[90vw] md:max-w-[70vw] lg:max-w-[60vw] justify-items-center overflow-visible">
      {interactions.length > 1 && (
        <>
          <p className="px-4 pt-3 pb-2 text-sm font-semibold text-ink border-b border-edge">
            Multiple options — choose one:
          </p>
          <div className="flex flex-row flex-wrap justify-center gap-1 mx-2 mt-2 max-w-100">
            {interactions.map(({ name, initialize }, i) => (
              <button
                key={i}
                onClick={() => {
                  if (i != activeIndex) {
                    setActiveIndex(i);
                    setInteractionState(
                      interactions[activeIndex].initialize(build),
                    );
                  }
                }}
                className={`text-xs px-2 py-0.5 rounded-full border ${i == activeIndex ? "bg-accent2-tint text-accent2 border-accent2-ring" : "text-muted border-transparent hover:text-ink hover:border-edge hover:bg-tint"}`}
              >
                {stripTemplating(
                  typeof name == "function"
                    ? name(build, initialize(build))
                    : name,
                )}
              </button>
            ))}
          </div>
        </>
      )}
      <div className="flex flex-col max-w-120 w-full">
        <InteractionPreviewCard
          typeName={interaction.typeName}
          description={
            typeof interaction.description == "function"
              ? interaction.description(build, interactionState)
              : interaction.description
          }
          name={
            typeof interaction.name == "function"
              ? interaction.name(build, interactionState)
              : interaction.name
          }
          costStr={
            typeof interaction.costStr == "function"
              ? interaction.costStr(build, interactionState)
              : interaction.costStr
          }
          info={
            typeof interaction.info == "function"
              ? interaction.info(build, interactionState)
              : interaction.info
          }
          warning={
            typeof interaction.warning == "function"
              ? interaction.warning(build, interactionState)
              : interaction.warning
          }
          actions={actions}
          onClose={onClose}
          errorMessage={errorMessage}
        >
          <interaction.preview
            buildData={build}
            setState={partial => {
              setInteractionState(s => ({ ...s, ...partial }));
            }}
            state={interactionState}
          />
        </InteractionPreviewCard>
      </div>
    </div>
  );
}
