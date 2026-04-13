import { GID, Id, Lookup, Registry } from "./types";
import { Character } from "./Character";
import { Purchase, PurchaseGroup, PurchaseType } from "./Purchase";
import { Jump } from "./Jump";
import { AltForm } from "./AltForm";
import { ChainSupplement } from "./ChainSupplement";

export interface BankSettings {
    enabled: boolean;
    maxDeposit: number;
    depositRatio: number;
    interestRate: number;
}

export type Chain = {
    purchases: Registry<GID.Purchase, Purchase>;
    characters: Registry<GID.Character, Character>;
    jumps: Registry<GID.Jump, Jump>;
    altforms: Registry<GID.AltForm, AltForm>;

    chainDrawbackList: Id<GID.Purchase>[];

    purchaseGroups: Lookup<GID.Character, Registry<GID.PurchaseGroup, PurchaseGroup>>;
    supplements: Registry<GID.Supplement, ChainSupplement>;

    notesList: number[];
    notes: Record<number, { title: string, body: string, id: number }>;

    purchaseCategories: Record<PurchaseType.Perk | PurchaseType.Item, Registry<GID.PurchaseCategory, string>>;

    jumpList: Id<GID.Jump>[];
    characterList: Id<GID.Character>[];

    name: string;
    versionNumber: string;

    chainSettings: {
        defaultCP: number,
        chainDrawbacksForCompanions: boolean;
        chainDrawbacksSupplements: boolean;
        narratives: "enabled" | "disabled" | "restricted";
        altForms: boolean;
        startWithJumpZero: boolean;

        //todo cleanup
        //todo negative cost discounts
        //todo bank budget sync
        //todo retain template id with paste
        //todo: previous purchases duration in supplements
        // "Used-in" taking a long time to load in images. shouldn't be fetching separetly
        //image chest folder
        //todo: origin prereqs, multiple alt-cost prereq AND vs OR
        allowItemGroups: boolean;
        allowPerkGroups: boolean;

        ignoreDrawbackLimit: boolean;
        /** Whether drawbacks with duration > 1 (or indefinite) taken in one jump
         *  are visible as retained drawbacks to sibling jumps in the same
         *  supplement block. */
        supplementBlockDrawbackSharing: boolean;
    };

    bankSettings: BankSettings;

    budgetFlag: number;
}
