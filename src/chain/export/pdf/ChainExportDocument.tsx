import { Document, Image, Link, Page, Text, View } from "@react-pdf/renderer";
import type {
  ExportIR,
  ExportOptions,
  IRAltForm,
  IRCompanionImport,
  IRDrawback,
  IRJump,
  IRNarrative,
  IROrigin,
  IRPurchase,
  IRPurchaseSection,
  IRScenario,
  IRSupplementSection,
} from "../types";
import { getTheme, type Theme } from "./themes";

// ─────────────────────────────────────────────────────────────────────────────
// Shared primitives
// ─────────────────────────────────────────────────────────────────────────────

function Divider({ t }: { t: Theme }) {
  return <View style={t.divider} />;
}

function Description({ text, t }: { text: string; t: Theme }) {
  const lines = text.split("\n");
  return (
    <View style={{ marginTop: 1, marginLeft: 8 }}>
      {lines.map((line, i) =>
        line.trim() === "" ? (
          <View key={i} style={{ height: 3 }} />
        ) : (
          <Text key={i} style={t.body}>
            {line}
          </Text>
        ),
      )}
    </View>
  );
}

function PurchaseItem({ p, t, depth = 0 }: { p: IRPurchase; t: Theme; depth?: number }) {
  return (
    <View style={{ marginBottom: 3, marginLeft: depth * 12 }}>
      <Text>
        <Text style={t.name}>{p.name}</Text>
        {p.cost ? <Text style={t.cost}> [{p.cost.display}]</Text> : null}
      </Text>
      {p.description ? <Description text={p.description} t={t} /> : null}
      {p.subpurchases.map((sub, i) => (
        <PurchaseItem key={i} p={sub} t={t} depth={depth + 1} />
      ))}
    </View>
  );
}

function SectionHeading({
  title,
  t,
  centered = false,
}: {
  title: string;
  t: Theme;
  centered?: boolean;
  ultracompact?: boolean;
}) {
  return <Text style={centered ? { ...t.h3, textAlign: "center" } : t.h3}>{title}</Text>;
}

function purchaseCostLabel(purchases: IRPurchase[], kind: "cost" | "gain"): string {
  const totals = new Map<string, number>();
  for (const p of purchases) {
    if (!p.cost || p.cost.raw === 0) continue;
    totals.set(p.cost.currencyAbbrev, (totals.get(p.cost.currencyAbbrev) ?? 0) + p.cost.raw);
  }
  if (totals.size === 0) return "";
  const parts = Array.from(totals.entries()).map(([abbrev, total]) => `${total} ${abbrev}`);
  return ` [${kind}: ${parts.join(", ")}]`;
}

function drawbackCostLabel(drawbacks: IRDrawback[]): string {
  const totals = new Map<string, number>();
  for (const d of drawbacks) {
    if (!d.cost || d.cost.raw === 0) continue;
    totals.set(d.cost.currencyAbbrev, (totals.get(d.cost.currencyAbbrev) ?? 0) + d.cost.raw);
  }
  if (totals.size === 0) return "";
  const parts = Array.from(totals.entries()).map(([abbrev, total]) => `${total} ${abbrev}`);
  return ` [gain: ${parts.join(", ")}]`;
}

function originCostLabel(origins: IROrigin[]): string {
  const totals = new Map<string, number>();
  for (const o of origins) {
    if (!o.cost || o.cost.raw === 0) continue;
    totals.set(o.cost.currencyAbbrev, (totals.get(o.cost.currencyAbbrev) ?? 0) + o.cost.raw);
  }
  if (totals.size === 0) return "";
  const parts = Array.from(totals.entries()).map(
    ([abbrev, total]) => `${Math.abs(total)} ${abbrev}`,
  );
  const allPositive = Array.from(totals.values()).every((v) => v >= 0);
  const kind = allPositive ? "cost" : "gain";
  return ` [${kind}: ${parts.join(", ")}]`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Jump section
// ─────────────────────────────────────────────────────────────────────────────

function CompanionsSection({
  companions,
  t,
  ultracompact,
}: {
  companions: IRCompanionImport[];
  t: Theme;
  ultracompact?: boolean;
}) {
  if (companions.length === 0) return null;
  const total = companions.reduce((sum, ci) => sum + (ci.cost?.raw ?? 0), 0);
  const abbrev = companions.find((ci) => ci.cost)?.cost?.currencyAbbrev ?? "";
  const label = total > 0 ? ` [cost: ${total} ${abbrev}]` : "";
  return ultracompact ? (
    <Text style={{ ...t.body, marginBottom: 12 }}>
      <Text style={{ ...t.name, color: t.cost.color }}>Companion Imports{label}: </Text>
      {companions.map((ci, i) => (
        <Text key={i}>
          {i > 0 ? ", " : ""}
          {ci.name}
          {ci.cost ? <Text style={t.muted}> [{ci.cost.display}]</Text> : null}
          {ci.characterNames.length > 0 ? (
            <Text style={t.muted}> ({ci.characterNames.join(", ")})</Text>
          ) : null}
        </Text>
      ))}
    </Text>
  ) : (
    <View style={{ marginBottom: 6 }}>
      <SectionHeading title={`Companion Imports${label}`} t={t} centered />
      {companions.map((ci, i) => (
        <View key={i} style={{ marginBottom: 3 }}>
          <Text>
            <Text style={t.name}>{ci.name}</Text>
            {ci.cost ? <Text style={t.cost}> [{ci.cost.display}]</Text> : null}
            {ci.characterNames.length > 0 ? (
              <Text style={t.muted}> ({ci.characterNames.join(", ")})</Text>
            ) : null}
          </Text>
        </View>
      ))}
    </View>
  );
}

function OriginsSection({
  origins,
  t,
  ultracompact,
}: {
  origins: IROrigin[];
  t: Theme;
  ultracompact: boolean;
}) {
  if (origins.length === 0) return null;
  if (ultracompact)
    return (
      <Text style={{ marginBottom: 12, textAlign: "center" }}>
        {origins.map((o, i) => (
          <Text key={i}>
            {i > 0 ? ", " : ""}
            <Text style={t.name}>{o.categoryName}: </Text>
            <Text style={t.body}>{o.summary}</Text>
            {o.cost ? <Text style={t.muted}> [{o.cost.display}]</Text> : null}
          </Text>
        ))}
      </Text>
    );
  return (
    <View style={{ marginBottom: 6 }}>
      <SectionHeading title={`Origins${originCostLabel(origins)}`} t={t} centered />
      {origins.map((o, i) => (
        <View key={i} style={{ marginBottom: 3 }}>
          <Text>
            <Text style={t.name}>{o.categoryName}: </Text>
            <Text style={t.body}>{o.summary}</Text>
            {o.cost ? <Text style={t.cost}> [{o.cost.display}]</Text> : null}
          </Text>
          {o.description ? <Description text={o.description} t={t} /> : null}
        </View>
      ))}
    </View>
  );
}

function InlinePurchaseList({ purchases, t }: { purchases: IRPurchase[]; t: Theme }) {
  return (
    <Text style={t.body}>
      {purchases.map((p, i) => (
        <Text key={i}>
          {i > 0 ? ", " : ""}
          {p.name}
          {p.cost ? <Text style={t.muted}> [{p.cost.display}]</Text> : null}
          {p.subpurchases.length > 0 ? (
            <Text style={t.muted}> ({p.subpurchases.map((s) => s.name).join(", ")})</Text>
          ) : null}
        </Text>
      ))}
    </Text>
  );
}

function InlineDrawbackList({ drawbacks, t }: { drawbacks: IRDrawback[]; t: Theme }) {
  return (
    <Text style={t.body}>
      {drawbacks.map((d, i) => (
        <Text key={i}>
          {i > 0 ? ", " : ""}
          {d.name}
          {d.cost ? <Text style={t.muted}> [{d.cost.display}]</Text> : null}
        </Text>
      ))}
    </Text>
  );
}

function PurchaseGroupSection({
  sections,
  parentTitle,
  t,
  ultracompact = false,
}: {
  sections: IRPurchaseSection[];
  parentTitle: string;
  t: Theme;
  ultracompact?: boolean;
}) {
  if (sections.length === 0) return null;
  const allPurchases = sections.flatMap((s) => s.purchases);
  const label = purchaseCostLabel(allPurchases, "cost");
  return ultracompact ? (
    <View style={{ marginBottom: 12 }}>
      {sections.map((s, i) => {
        if (s.purchases.length === 0) return null;
        return (
          <Text key={i}>
            <Text
              style={{
                ...t.name,
                color: t.cost.color,
              }}
            >
              {s.heading}
              {purchaseCostLabel(s.purchases, "cost")}:{" "}
            </Text>
            <InlinePurchaseList purchases={s.purchases} t={t} />
          </Text>
        );
      })}
    </View>
  ) : (
    <View style={{ marginBottom: 6 }}>
      <SectionHeading title={`${parentTitle}${label}`} t={t} centered />
      {sections.map((s, i) => {
        const showHeading = s.heading && !/^(perk|item)$/i.test(s.heading);
        return (
          <View key={i} style={showHeading ? { marginLeft: 10, marginTop: 3 } : {}}>
            {showHeading ? (
              <Text
                style={{
                  ...t.name,
                  fontSize: (t.h3 as { fontSize?: number }).fontSize ?? 10,
                  marginBottom: 2,
                }}
              >
                {s.heading}
                {purchaseCostLabel(s.purchases, "cost")}
              </Text>
            ) : null}
            {s.purchases.map((p, j) => (
              <PurchaseItem key={j} p={p} t={t} depth={0} />
            ))}
          </View>
        );
      })}
    </View>
  );
}

function DrawbackEntry({ d, t }: { d: IRDrawback; t: Theme }) {
  const retainedTag = d.isRetained ? (
    <Text style={t.tag}> [Retained from previous jump]</Text>
  ) : null;
  return (
    <View style={{ marginBottom: 3 }}>
      <Text>
        <Text style={t.name}>{d.name}</Text>
        {d.cost ? <Text style={t.cost}> [{d.cost.display}]</Text> : null}
        {retainedTag}
      </Text>
      {d.description ? <Description text={d.description} t={t} /> : null}
    </View>
  );
}

function DrawbacksSection({
  drawbacks,
  t,
  ultracompact,
}: {
  drawbacks: IRDrawback[];
  t: Theme;
  ultracompact?: boolean;
}) {
  if (drawbacks.length === 0) return null;
  const chain = drawbacks.filter((d) => d.isChainDrawback);
  const regular = drawbacks.filter((d) => !d.isChainDrawback);
  const regularLabel = drawbackCostLabel(ultracompact ? regular : drawbacks);
  const chainLabel = drawbackCostLabel(chain);
  return ultracompact ? (
    <View style={{ marginBottom: 12 }}>
      {chain.length > 0 && (
        <Text style={t.body}>
          <Text style={{ ...t.name, color: t.cost.color }}>Chain Drawbacks{chainLabel}: </Text>
          <InlineDrawbackList drawbacks={chain} t={t} />
        </Text>
      )}
      {regular.length > 0 && (
        <Text style={t.body}>
          <Text style={{ ...t.name, color: t.cost.color }}>Drawbacks{regularLabel}: </Text>
          <InlineDrawbackList drawbacks={regular} t={t} />
        </Text>
      )}
    </View>
  ) : (
    <View style={{ marginBottom: 6 }}>
      <SectionHeading title={`Drawbacks${regularLabel}`} t={t} centered />
      {chain.length > 0 && (
        <View style={{ marginBottom: 2, marginLeft: 8 }}>
          <Text style={{ ...t.muted, marginBottom: 2 }}>Chain Drawbacks{chainLabel}</Text>
          {chain.map((d, i) => (
            <DrawbackEntry key={i} d={d} t={t} />
          ))}
        </View>
      )}
      {regular.map((d, i) => (
        <DrawbackEntry key={i} d={d} t={t} />
      ))}
    </View>
  );
}

function ScenariosSection({
  scenarios,
  t,
  ultracompact = false,
}: {
  scenarios: IRScenario[];
  t: Theme;
  ultracompact?: boolean;
}) {
  if (scenarios.length === 0) return null;
  if (ultracompact)
    return (
      <Text style={{ marginBottom: 12 }}>
        <Text style={{ ...t.name, color: t.cost.color }}>Scenarios: </Text>
        <Text style={t.body}>{scenarios.map((sc) => sc.name).join(", ")}</Text>
      </Text>
    );
  return (
    <View style={{ marginBottom: 6 }}>
      <SectionHeading title="Scenarios" t={t} centered />
      {scenarios.map((sc, i) => (
        <View key={i} style={{ marginBottom: 3 }}>
          <Text style={t.name}>{sc.name}</Text>
          {sc.description ? <Description text={sc.description} t={t} /> : null}
          {sc.rewards.length > 0 ? (
            <Text style={t.muted}>Rewards: {sc.rewards.join(", ")}</Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function SupplementSection({
  supp,
  t,
  ultracompact = false,
}: {
  supp: IRSupplementSection;
  t: Theme;
  ultracompact?: boolean;
}) {
  return (
    <View style={{ marginBottom: 6 }}>
      <SectionHeading title={supp.name} t={t} centered />
      {supp.prePurchaseBudget !== null ? (
        <Text style={{ ...t.body, textAlign: "center" }}>
          <Text style={t.name}>Budget: </Text>
          {supp.prePurchaseBudget} {supp.currencyName}
        </Text>
      ) : null}
      {supp.investment !== null && supp.investmentCurrencyAbbrev ? (
        <Text style={{ ...t.muted, textAlign: "center", marginBottom: 4 }}>
          Investment: {supp.investment} {supp.investmentCurrencyAbbrev}
        </Text>
      ) : null}
      {ultracompact ? (
        <>
          {supp.perks.length > 0 && <InlinePurchaseList purchases={supp.perks} t={t} />}
          {supp.items.length > 0 && <InlinePurchaseList purchases={supp.items} t={t} />}
        </>
      ) : (
        <>
          {supp.perks.map((p, j) => (
            <PurchaseItem key={`p${j}`} p={p} t={t} />
          ))}
          {supp.items.map((p, j) => (
            <PurchaseItem key={`i${j}`} p={p} t={t} />
          ))}
        </>
      )}
    </View>
  );
}

function AltFormsSection({ altForms, t }: { altForms: IRAltForm[]; t: Theme }) {
  if (altForms.length === 0) return null;
  return (
    <View style={{ marginBottom: 6 }}>
      <SectionHeading title="Alt Forms" t={t} centered />
      {altForms.map((af, i) => (
        <View key={i} style={{ marginBottom: 4 }}>
          <Text>
            <Text style={t.name}>{af.name}</Text>
            <Text style={t.muted}> ({af.species})</Text>
          </Text>
          {af.imageUrl ? (
            <View style={{ alignItems: "center" }}>
              <Image src={af.imageUrl} style={{ width: 180, marginTop: 2, marginBottom: 2 }} />
            </View>
          ) : null}
          {af.physicalDescription ? <Text style={t.body}>{af.physicalDescription}</Text> : null}
          {af.capabilities ? (
            <Text style={t.body}>
              <Text style={t.name}>Capabilities: </Text>
              {af.capabilities}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
}

function NarrativeSection({ narrative, t }: { narrative: IRNarrative; t: Theme }) {
  if (!narrative.goals && !narrative.challenges && !narrative.accomplishments) return null;
  // fontStyle: "italic" is only applied to body text, not the bold label —
  // combining a bold fontFamily (e.g. Helvetica-Bold) with fontStyle: italic
  // requires Helvetica-BoldOblique which @react-pdf/renderer cannot auto-resolve.
  const italicBody = { ...t.body, fontStyle: "italic" as const };
  return (
    <View style={{ marginBottom: 6 }}>
      <SectionHeading title="Narrative" t={t} centered />
      {narrative.goals ? (
        <View style={t.narrative}>
          <Text style={t.name}>Goals</Text>
          <Text style={italicBody}>{narrative.goals}</Text>
        </View>
      ) : null}
      {narrative.challenges ? (
        <View style={t.narrative}>
          <Text style={t.name}>Challenges</Text>
          <Text style={italicBody}>{narrative.challenges}</Text>
        </View>
      ) : null}
      {narrative.accomplishments ? (
        <View style={t.narrative}>
          <Text style={t.name}>Accomplishments</Text>
          <Text style={italicBody}>{narrative.accomplishments}</Text>
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Table of Contents
// ─────────────────────────────────────────────────────────────────────────────

function TableOfContents({ jumps, t }: { jumps: IRJump[]; t: Theme; ultracompact: boolean }) {
  const accentColor = (t.h2 as Record<string, unknown>).color as string;
  return (
    <View style={{ paddingTop: 16 }}>
      <Text style={{ ...t.h2, textAlign: "center", marginTop: 0, marginBottom: 10 }}>
        Table of Contents
      </Text>
      <View style={t.divider} />
      {jumps.map((jump, i) => {
        const isFirstInGroup = i === 0 || jumps[i - 1]!.jumpNumber !== jump.jumpNumber;
        return (
          <Link key={i} src={`#jump-${i}`} style={{ textDecoration: "none" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingVertical: 4 }}>
              <Text
                style={{
                  ...t.body,
                  color: accentColor,
                  width: 56,
                  marginBottom: 0,
                  textAlign: "right",
                  marginRight: 5,
                }}
              >
                {isFirstInGroup ? `Jump ${jump.jumpNumber}:` : ""}
              </Text>
              <Text style={{ ...t.body, color: accentColor, flex: 1, marginBottom: 0 }}>
                {jump.jumpName}{" "}
                <Text style={{ ...t.muted, marginBottom: 0 }}>({jump.duration})</Text>
              </Text>
            </View>
          </Link>
        );
      })}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Jump section
// ─────────────────────────────────────────────────────────────────────────────

function JumpSection({
  jump,
  sections,
  t,
  isFirst = false,
  isSingleJump = false,
  id,
}: {
  jump: IRJump;
  sections: ExportOptions["sections"];
  t: Theme;
  isFirst?: boolean;
  isSingleJump?: boolean;
  id?: string;
}) {
  const ultracompact = !sections.descriptions;
  if (ultracompact) t.h3.color = t.cost.color;
  const title = isSingleJump ? jump.jumpName : `Jump ${jump.jumpNumber} — ${jump.jumpName}`;
  const titleStyle = { ...t.h2, textAlign: "center" as const };
  return (
    <View break={!isSingleJump && !ultracompact} style={{ marginBottom: ultracompact ? 10 : 0 }}>
      {id && <View id={id} style={{ height: 0 }} />}
      {!isFirst && <View style={t.divider} />}
      {jump.sourceUrl ? (
        <Link src={jump.sourceUrl} style={{ textDecoration: "none" }}>
          <Text style={titleStyle}>{title}</Text>
        </Link>
      ) : (
        <Text style={titleStyle}>{title}</Text>
      )}
      {jump.startingPoints && jump.startingPoints.length > 0 ? (
        <Text style={{ ...t.body, marginBottom: 4, textAlign: "center" }}>
          <Text style={t.name}>Starting Points: </Text>
          {jump.startingPoints.map((e) => `${e.amount} ${e.currencyAbbrev}`).join(", ")}
        </Text>
      ) : null}
      {jump.bankDeposit ? (
        <Text style={{ ...t.body, marginBottom: 4, textAlign: "center" }}>
          {jump.bankDeposit.amount > 0
            ? `Bank Deposit: ${jump.bankDeposit.amount} ${jump.bankDeposit.currencyAbbrev}`
            : `Bank Withdrawal: ${Math.abs(jump.bankDeposit.amount)} ${jump.bankDeposit.currencyAbbrev}`}
        </Text>
      ) : null}
      {sections.origins && (
        <OriginsSection origins={jump.origins} t={t} ultracompact={ultracompact} />
      )}
      <PurchaseGroupSection
        sections={jump.perkSections}
        parentTitle="Perks"
        t={t}
        ultracompact={ultracompact}
      />
      <PurchaseGroupSection
        sections={jump.itemSections}
        parentTitle="Items"
        t={t}
        ultracompact={ultracompact}
      />
      {sections.companions && (
        <CompanionsSection companions={jump.companions} t={t} ultracompact={ultracompact} />
      )}
      {sections.drawbacks && (
        <DrawbacksSection drawbacks={jump.drawbacks} t={t} ultracompact={ultracompact} />
      )}
      {sections.scenarios && (
        <ScenariosSection scenarios={jump.scenarios} t={t} ultracompact={ultracompact} />
      )}
      {jump.supplements.map((supp, i) => (
        <SupplementSection key={i} supp={supp} t={t} ultracompact={ultracompact} />
      ))}
      {sections.altForms && <AltFormsSection altForms={jump.altForms} t={t} />}
      {sections.narrative && jump.narrative && (
        <NarrativeSection narrative={jump.narrative} t={t} />
      )}
      {sections.notes && jump.notes ? (
        <View style={{ marginBottom: 6 }}>
          <SectionHeading title="Notes" t={t} centered />
          <Text style={t.body}>{jump.notes}</Text>
        </View>
      ) : null}
      {sections.budget && jump.budget ? (
        <View style={{ marginBottom: 6, alignItems: "center" }}>
          <SectionHeading title="Budget" t={t} centered />
          <View style={{ width: 280, marginTop: 2 }}>
            {jump.budget.sections.map((section, i) => {
              const entriesStr = section.entries
                .map((e) => `${e.amount > 0 ? "+" : ""}${e.amount} ${e.currencyAbbrev}`)
                .join(", ");
              return (
                <View key={i} style={{ flexDirection: "row" }}>
                  <Text style={{ ...t.body, width: 140, textAlign: "right", paddingRight: 8 }}>
                    {section.label}:
                  </Text>
                  <Text style={{ ...t.body, flex: 1 }}>{entriesStr}</Text>
                </View>
              );
            })}
            {jump.budget.totals.length > 0 ? (
              <View style={{ flexDirection: "row", marginTop: 2 }}>
                <Text style={{ ...t.name, width: 140, textAlign: "right", paddingRight: 8 }}>
                  Total:
                </Text>
                <Text style={{ ...t.name, flex: 1 }}>
                  {jump.budget.totals
                    .map((e) => `${e.amount > 0 ? "+" : ""}${e.amount} ${e.currencyAbbrev}`)
                    .join(", ")}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}
    </View>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Document root
// ─────────────────────────────────────────────────────────────────────────────

export function ChainExportDocument({ ir, options }: { ir: ExportIR; options: ExportOptions }) {
  const t = getTheme(
    options.pdfColorTheme,
    options.pdfFont,
    options.resolvedAppThemePalette,
    options.pdfDark,
  );

  const isSingleJump = ir.isSingleJump;
  const ultracompact = !options.sections.descriptions;

  return (
    <Document title={ir.chainName} author={ir.characterName}>
      <Page size="A4" style={t.page}>
        {/* Cover — only shown for multi-jump (chain) exports, occupies full first page */}
        {!isSingleJump && (
          <View style={{ height: 762, justifyContent: "center", alignItems: "center" }}>
            <Text style={t.h1}>{ir.chainName}</Text>
            <Text style={t.subtitle}>{ir.characterName}</Text>
            <Divider t={t} />
          </View>
        )}

        {/* Table of Contents — chain exports only */}
        {!isSingleJump && <TableOfContents jumps={ir.jumps} t={t} ultracompact={ultracompact} />}

        {/* Jumps */}
        {ir.jumps.map((jump, i) => (
          <JumpSection
            key={i}
            jump={jump}
            sections={options.sections}
            t={t}
            isFirst={i === 0 && !isSingleJump}
            isSingleJump={isSingleJump}
            id={isSingleJump ? undefined : `jump-${i}`}
          />
        ))}
      </Page>
    </Document>
  );
}
