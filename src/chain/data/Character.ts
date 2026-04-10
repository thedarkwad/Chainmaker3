import { GID, Id, TID } from "./types";

export const enum PersonalityComponent {
    Personality = "Personality",
    Motivation = "Motivation",
    Likes = "Likes",
    Dislikes = "Dislikes",
    Quirks = "Quirks",
    Ideology = "Ideology",
    Fears = "Fears",
    Aspirations = "Aspirations",
    Struggles = "Struggles"
}

export type Character = {

    id: Id<GID.Character>;

    name: string;
    gender: string;
    originalAge: number;
    personality: Partial<Record<PersonalityComponent, string>>;
    background: { summary: string, description: string };

    notes: string;

    primary: boolean;

    originalForm: Id<GID.AltForm>;

    /** Set when this character was created by a specific-character companion import. */
    originalImportTID?: { docId: string; templateId: Id<TID.Companion> };

}