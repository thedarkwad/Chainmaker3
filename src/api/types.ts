// Shared types for API responses

export type SaveStatus = "ok" | "conflict" | "unauthorized" | "not_found" | "bad_patches";

export type SaveResult =
  | { status: "ok"; edits: number }
  | { status: Exclude<SaveStatus, "ok"> };
