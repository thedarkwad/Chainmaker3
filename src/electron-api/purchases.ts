// Electron stub for @/api/purchases — the purchases search page is not available
// in the desktop app, but the route file must still compile.

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

export async function searchPurchases(_params: unknown): Promise<PurchaseSearchPage> {
  return { results: [], total: 0 };
}
