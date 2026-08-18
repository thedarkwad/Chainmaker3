import { JumpSource } from "./Jump";
import { GID, Id, PartialLookup, Registry } from "./types";

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

    /** Origin tags (e.g. EBM essences). Purchases carrying an ACTIVE tag are
     *  automatically discounted 50% (free when their full price is at or under
     *  originTagFreeThreshold). */
    originTags?: Registry<GID.OriginTag, string>;
    /** Per-character set of origin tags the character currently has. */
    activeOriginTags?: PartialLookup<GID.Character, Id<GID.OriginTag>[]>;
    /** Full price at or below which a tag-discounted purchase becomes free. Default 50. */
    originTagFreeThreshold?: number;
}