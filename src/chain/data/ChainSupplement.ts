import { JumpSource } from "./Jump";
import { GID, Id, Registry } from "./types";

export const enum CompanionAccess {
    Unavailable,
    Available,
    Communal,
    Imports
}

export const enum SupplementType {
    Item,
    Perk,
    Dual
};

export type ChainSupplement = {
    id: Id<GID.Supplement>;

    name: string;

    singleJump: boolean,
    initialJump: number,

    investmentRatio: number;
    maxInvestment: number;
    initialStipend: number;
    perJumpStipend: number;

    companionAccess: CompanionAccess;
    currency: string;

    source: JumpSource;

    purchaseCategories: Registry<GID.PurchaseCategory, string>;
    type: SupplementType;
    enableScenarios: boolean;
}