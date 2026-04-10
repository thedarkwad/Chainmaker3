/**
 * RareFieldsGroup — groups rarely-used fields so their dormant "add" buttons
 * share a single line. When a field becomes active, its full UI splits off
 * below the dormant row.
 */

import { Fragment } from "react";
import type { ReactNode } from "react";

export type RareFieldDef = {
  key: string;
  isActive: boolean;
  /** Rendered inline in the shared dormant button row. */
  dormant: () => ReactNode;
  /** Rendered below the dormant row when the field is active. */
  active: () => ReactNode;
};

export function RareFieldsGroup({ fields }: { fields: RareFieldDef[] }) {
  const dormantFields = fields.filter((f) => !f.isActive);
  const activeFields = fields.filter((f) => f.isActive);

  if (fields.length === 0) return null;

  return (
    <>
      {dormantFields.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 pt-1.5 border-t border-line">
          {dormantFields.map((f) => (
            <Fragment key={f.key}>{f.dormant()}</Fragment>
          ))}
        </div>
      )}
      {activeFields.map((f) => (
        <Fragment key={f.key}>{f.active()}</Fragment>
      ))}
    </>
  );
}
