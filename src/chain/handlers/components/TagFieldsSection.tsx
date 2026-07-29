import { type UserInputTags } from "../../../utilities/tags";
import { convertWhitespace } from "@/utilities/miscUtilities";

export function TagFieldsSection({
  tags,
  tagValues,
  choiceContext,
  onChangeTag,
}: {
  tags: Partial<UserInputTags>;
  tagValues: Record<string, string>;
  choiceContext?: string;
  onChangeTag: (name: string, value: string) => void;
}) {
  const inputClass =
    "h-min bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full";
  return (
    <div className="grid grid-cols-[auto_minmax(0,1fr)] gap-2 p-2 rounded-md border-edge bg-tint border">
      {Object.entries(tags).map(([name, type]) => (
        <label key={name} className="contents">
          <div
            className={`text-xs font-semibold text-muted text-right min-w-min max-w-max w-30 justify-self-end ${type !== "paragraph" ? "self-stretch items-center flex" : ""}`}
          >
            {name
              .split(" ")
              .map(w => w[0]!.toUpperCase() + w.slice(1))
              .join(" ")}
            :
          </div>
          {type === "paragraph" ? (
            <textarea
              className="bg-transparent border border-edge rounded px-2 py-1 text-sm text-ink! focus:outline-none focus:border-accent-ring w-full"
              rows={3}
              value={tagValues[name] ?? ""}
              ref={el => {
                if (el) {
                  el.style.height = "auto";
                  el.style.height = `${el.scrollHeight}px`;
                }
              }}
              onChange={e => {
                const el = e.currentTarget;
                el.style.height = "auto";
                el.style.height = `${el.scrollHeight}px`;
                onChangeTag(name, e.target.value);
              }}
            />
          ) : type === "boolean" ? (
            <input
              type="checkbox"
              className="justify-self-start"
              checked={tagValues[name] === "true"}
              onChange={e =>
                onChangeTag(name, e.target.checked ? "true" : "false")
              }
            />
          ) : type === "numeric" ? (
            <input
              type="number"
              className={inputClass}
              value={tagValues[name] ?? ""}
              onChange={e => onChangeTag(name, e.target.value)}
            />
          ) : (
            <input
              type="text"
              className={inputClass}
              value={tagValues[name] ?? ""}
              onChange={e => onChangeTag(name, e.target.value)}
            />
          )}
        </label>
      ))}
      <div />
      {choiceContext && (
        <div className="text-xs text-muted/90 flex flex-col gap-1.5 max-w-sm max-h-50 overflow-y-auto">
          {convertWhitespace(choiceContext)}
        </div>
      )}
    </div>
  );
}
