import { Document, Page, Text, View } from "@react-pdf/renderer";
import type { IRPurchaseListEntry, IRPurchaseListExport, PdfColorTheme, PdfFont, ResolvedColorPalette } from "../types";
import { getTheme } from "./themes";

function PurchaseListItem({
  entry,
  depth = 0,
  t,
}: {
  entry: IRPurchaseListEntry;
  depth?: number;
  t: ReturnType<typeof getTheme>;
}) {
  return (
    <View style={{ marginBottom: 3, marginLeft: depth * 12 }}>
      <Text style={{ ...t.name, ...t.cost }}>{entry.name}</Text>
      {entry.jumpName ? (
        <Text style={{ ...t.muted, fontSize: (t.muted as { fontSize?: number }).fontSize ?? 9 }}>
          {entry.jumpName}
        </Text>
      ) : null}
      {entry.description ? (
        <Text style={{ ...t.body, marginTop: 1 }}>{entry.description}</Text>
      ) : null}
      {entry.subpurchases.map((sub, i) => (
        <PurchaseListItem key={i} entry={sub} depth={depth + 1} t={t} />
      ))}
    </View>
  );
}

export function PurchaseListDocument({
  ir,
  pdfColorTheme,
  pdfFont,
  pdfDark,
  resolvedAppThemePalette,
}: {
  ir: IRPurchaseListExport;
  pdfColorTheme: PdfColorTheme;
  pdfFont: PdfFont;
  pdfDark: boolean;
  resolvedAppThemePalette?: ResolvedColorPalette;
}) {
  const t = getTheme(pdfColorTheme, pdfFont, resolvedAppThemePalette, pdfDark);

  const isGrouped = ir.groups.some((g) => g.heading !== "");

  return (
    <Document title={`${ir.chainName} — ${ir.contentLabel}`} author={ir.characterName}>
      <Page size="A4" style={t.page}>
        <Text style={{ ...t.h1, textAlign: "center" }}>{ir.chainName}</Text>
        <Text style={{ ...t.subtitle, textAlign: "center", marginBottom: 8 }}>
          {ir.characterName} — {ir.contentLabel}
        </Text>

        {ir.groups.map((group, gi) => (
          <View key={gi} style={{ marginBottom: 8 }}>
            {isGrouped && group.heading ? (
              <Text style={{ ...t.h2, textAlign: "center", marginBottom: 4 }}>
                {group.heading}
              </Text>
            ) : null}
            {group.entries.map((entry, ei) => (
              <PurchaseListItem key={ei} entry={entry} t={t} />
            ))}
          </View>
        ))}
      </Page>
    </Document>
  );
}
