import { GID, Id, PartialIndex, Registry, TID } from "../data/types";
import { JumpDocBuildData } from "../state/ViewerActionStore";
import { ModifiedCost, Value, SimpleValue } from "../data/Purchase";
import {
  BasicPurchaseTemplate,
  DrawbackTemplate,
  OriginTemplate,
  CompanionTemplate,
  ScenarioTemplate,
  JumpDoc,
} from "@/jumpdoc/data/JumpDoc";

export type InternalTagsMap = Record<
  string,
  (build: JumpDocBuildData) => string
>;

export type AnnotationInteractionHandlerProps = {
  jumpId: Id<GID.Jump>;
  charId: Id<GID.Character>;
  doc: JumpDoc;
  internalTags: InternalTagsMap;
};

export type PossibleCost = ModifiedCost<TID.Currency> & {
  cost: Value<TID.Currency>;
  floatingDiscountOption?: boolean;
};

export type MutatorNavTarget =
  | { sub: "purchases"; scrollTo?: Id<GID.Purchase> }
  | {
      sub: "drawbacks";
      scrollTo?: Id<GID.Purchase>;
      extraSearch?: Record<string, string>;
    }
  | { sub: "companions"; scrollTo?: Id<GID.Purchase> }
  | { sub: ""; extraSearch?: Record<string, string> };

export type ChainMutators = {
  navigate: (target: MutatorNavTarget) => void;
  addPurchaseFromTemplate: (
    data: {
      template: (BasicPurchaseTemplate | DrawbackTemplate) & {
        cost: Value<TID.Currency>;
      };
      type: "purchase" | "drawback";
      tags: Record<string, string>;
      cost: PossibleCost;

      parent?: Id<GID.Purchase>;

      reward?: Id<TID.Scenario>;
      freebie?: Id<TID.Companion>;
      customDuration?: number;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => Id<GID.Purchase> | undefined;
  addOriginFromTemplate: (
    data: {
      template: OriginTemplate;
      tags: Record<string, string>;
      cost: Value<TID.Currency>;
      freebie?: Id<TID.Companion> | -1;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => Id<TID.Origin>;
  repricePurchase: (
    id: Id<GID.Purchase>,
    cost: PossibleCost,
    doc: JumpDoc,
  ) => void;
  setNameDescription: (
    id: Id<GID.Purchase>,
    name: string,
    description: string,
  ) => void;
  repriceOrigin: (
    templateId: Id<TID.Origin>,
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    build: JumpDocBuildData,
    doc: JumpDoc,
  ) => void;
  removePurchase: (
    id: Id<GID.Purchase>,
    build: JumpDocBuildData,
    parent?: Id<GID.Purchase>,
  ) => void;
  addScenarioFromTemplate: (
    data: {
      template: ScenarioTemplate;
      tags: Record<string, string>;
      rewardGroupIndex: number | undefined;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => Id<GID.Purchase> | undefined;
  addCompanionImport: (
    data: {
      template: CompanionTemplate & {
        cost: Value<TID.Currency>;
      };
      companionIds: Id<GID.Character>[];
      tags: Record<string, string>;
      cost: PossibleCost;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => Id<GID.Purchase> | undefined;
  createCompanion: (data: {
    template: CompanionTemplate;
    name: string;
    gender: string;
    species: string;
  }) => Id<GID.Character>;
  addFollower: (
    data: {
      template: CompanionTemplate & { cost: Value<TID.Currency> };
      cost: PossibleCost;
      tags: Record<string, string>;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => Id<GID.Purchase> | undefined;
  removeCharacters: (ids: Id<GID.Character>[]) => void;
  removeOrigin: (
    templateId: Id<TID.Origin>,
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
  ) => void;
  setFreeFormOrigin: (
    data: {
      categoryId: Id<TID.OriginCategory>;
      value: string;
      cost: SimpleValue<TID.Currency>;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => void;
  addCurrencyExchangeFromDoc: (
    opts: {
      templateIndex: number;
      oCurrency: Id<TID.Currency>;
      tCurrency: Id<TID.Currency>;
      oamount: number;
      tamount: number;
    },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
    doc: JumpDoc,
  ) => void;
  removeCurrencyExchangeFromDoc: (
    opts: { templateIndex: number; oamount: number; tamount: number },
    jumpId: Id<GID.Jump>,
    charId: Id<GID.Character>,
  ) => void;
};
