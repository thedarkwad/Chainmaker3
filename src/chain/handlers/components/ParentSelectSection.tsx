import { GID, Id } from "@/chain/data/types";
import { SegmentedControl } from "@/ui/SegmentedControl";

export function ParentSelectSection({
  parents,
  selectedParent,
  onChangeParent,
}: {
  parents: {name: string, id: Id<GID.Purchase>}[];
  selectedParent?: Id<GID.Purchase>;
  onChangeParent: (parent: Id<GID.Purchase>) => void;
}) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs text-muted font-semibold shrink-0">Parent Purchase:</span>
      <SegmentedControl
        value={selectedParent !== undefined ? String(selectedParent) : ""}
        onChange={(v) => onChangeParent(Number(v) as Id<GID.Purchase>)}
        options={parents.map(({id, name}) => ({
          value: String(id),
          label: name,
        }))}
      />
    </div>
  );
}
