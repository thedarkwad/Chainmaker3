import { createServerFn } from "@tanstack/react-start";
import { connectToDatabase, Models } from "@/server/db";
import { parseSearchQuery } from "@/utilities/SearchUtilities";
import { escapeRegex } from "@/api/_helpers";

export type PurchaseSearchResult = {
  _id: string;
  docId: string;
  templateId: number;
  name: string;
  description: string;
  choiceContext?: string;
  purchaseType: "perk" | "item";
  cost: { kind: "cp"; amount: number } | { kind: "custom" };
  isScenarioReward: boolean;
  docName: string;
};

export type PurchaseSearchParams = {
  search: string;
  page: number;
  pageSize: number;
  minCost?: number;
  maxCost?: number;
  purchaseType?: "perk" | "item";
};

export type PurchaseSearchPage = {
  results: PurchaseSearchResult[];
  total: number;
};

function buildPurchaseFilter(
  search: string,
  minCost: number | undefined,
  maxCost: number | undefined,
  purchaseType: "perk" | "item" | undefined,
): object {
  const andClauses: object[] = [{ published: true }];

  if (search.trim()) {
    const tokens = parseSearchQuery(search);
    const anyTokens = tokens.filter((t) => t.field === "any");
    const specificTokens = tokens.filter((t) => t.field !== "any");

    // Bare words: any one must match name, description, or choiceContext
    if (anyTokens.length > 0) {
      const orClauses = anyTokens.flatMap((t) => {
        const re = new RegExp(escapeRegex(t.term), "i");
        return [{ name: re }, { description: re }, { choiceContext: re }];
      });
      andClauses.push({ $or: orClauses });
    }

    // Field-specific tokens: each must match
    for (const t of specificTokens) {
      const re = t.exact
        ? new RegExp(`^${escapeRegex(t.term)}$`, "i")
        : new RegExp(escapeRegex(t.term), "i");
      if (t.field === "name") andClauses.push({ name: re });
      else if (t.field === "description") andClauses.push({ description: re });
    }
  }

  if (purchaseType) andClauses.push({ purchaseType });

  // Cost range: applies to "cp" purchases only. "custom" always passes through.
  if (minCost !== undefined || maxCost !== undefined) {
    const amountFilter: Record<string, number> = {};
    if (minCost !== undefined) amountFilter.$gte = minCost;
    if (maxCost !== undefined) amountFilter.$lte = maxCost;
    andClauses.push({
      $or: [{ "cost.kind": "custom" }, { "cost.kind": "cp", "cost.amount": amountFilter }],
    });
  }

  return andClauses.length === 1 ? andClauses[0] : { $and: andClauses };
}

export const searchPurchases = createServerFn({ method: "POST" })
  .inputValidator((data: PurchaseSearchParams) => data)
  .handler(async ({ data }): Promise<PurchaseSearchPage> => {
    await connectToDatabase();

    const filter = buildPurchaseFilter(data.search, data.minCost, data.maxCost, data.purchaseType);
    const skip = (data.page - 1) * data.pageSize;

    const [rawResults, total] = await Promise.all([
      Models.Purchase.find(filter, {
        docId: 1,
        templateId: 1,
        name: 1,
        description: 1,
        choiceContext: 1,
        purchaseType: 1,
        cost: 1,
        isScenarioReward: 1,
        docName: 1,
      })
        .sort({ name: 1, docName: 1 })
        .skip(skip)
        .limit(data.pageSize)
        .lean(),
      Models.Purchase.countDocuments(filter),
    ]);

    return {
      total,
      results: rawResults.map((r) => ({
        _id: String(r._id),
        docId: r.docId as string,
        templateId: r.templateId as number,
        name: r.name as string,
        description: r.description as string,
        choiceContext: r.choiceContext as string | undefined,
        purchaseType: r.purchaseType as "perk" | "item",
        cost: r.cost as { kind: "cp"; amount: number } | { kind: "custom" },
        isScenarioReward: r.isScenarioReward as boolean,
        docName: r.docName as string,
      })),
    };
  });
