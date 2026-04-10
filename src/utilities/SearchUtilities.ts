/** Which field a token applies to. "any" means all searchable fields. */
export type SearchField = "name" | "description" | "tag" | "any";

export type SearchToken = {
  field: SearchField;
  /** Lowercased search term. */
  term: string;
  /** True when the term was wrapped in quotes — exact (whole-string) match for tags. */
  exact: boolean;
};

/**
 * Parses a query string into search tokens.
 *
 * Syntax:
 *   - `word`               — substring match on name, description, or any tag
 *   - `"exact phrase"`     — same, but the token text must match as a whole substring
 *   - `name:word`          — substring match on name only
 *   - `description:word`   — substring match on description only
 *   - `tag:word`           — case-insensitive substring match on tags
 *   - `tag:"exact"`        — case-insensitive exact-equality match on tags
 *
 * Multiple tokens are ANDed together.
 */
export function parseSearchQuery(query: string): SearchToken[] {
  const tokens: SearchToken[] = [];
  const str = query.trim();
  let i = 0;

  while (i < str.length) {
    // Skip whitespace
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;

    // Optional field prefix: name: / description: / tag:
    const fieldMatch = str.slice(i).match(/^(name|description|tag):/i);
    let field: SearchField = "any";
    if (fieldMatch) {
      field = fieldMatch[1].toLowerCase() as SearchField;
      i += fieldMatch[0].length;
    }

    if (i >= str.length) break;

    // Quoted string
    if (str[i] === '"') {
      i++; // skip opening quote
      const start = i;
      while (i < str.length && str[i] !== '"') i++;
      const term = str.slice(start, i).toLowerCase();
      if (i < str.length) i++; // skip closing quote
      if (term) tokens.push({ field, term, exact: true });
    } else {
      // Bare word (ends at next whitespace)
      const start = i;
      while (i < str.length && !/\s/.test(str[i])) i++;
      const term = str.slice(start, i).toLowerCase();
      if (term) tokens.push({ field, term, exact: false });
    }
  }

  return tokens;
}

export type PerkSearchItem = {
  name: string;
  description: string;
  tags: string[];
  subpurchaseNames: string[];
  subpurchaseDescriptions: string[];
};

function fieldContains(haystack: string, token: SearchToken): boolean {
  return haystack.toLowerCase().includes(token.term);
}

function tokenMatchesItem(item: PerkSearchItem, token: SearchToken): boolean {
  const { field } = token;

  if (field === "name" || field === "any") {
    if (fieldContains(item.name, token)) return true;
    for (const n of item.subpurchaseNames) {
      if (fieldContains(n, token)) return true;
    }
  }

  if (field === "description" || field === "any") {
    if (fieldContains(item.description, token)) return true;
    for (const d of item.subpurchaseDescriptions) {
      if (fieldContains(d, token)) return true;
    }
  }

  if (field === "tag" || field === "any") {
    for (const tag of item.tags) {
      const t = tag.toLowerCase();
      const matches = token.exact ? t === token.term : t.includes(token.term);
      if (matches) return true;
    }
  }

  return false;
}

/** Returns true if the item satisfies every token (AND logic). */
export function matchesPerkItem(item: PerkSearchItem, tokens: SearchToken[]): boolean {
  return tokens.every((token) => tokenMatchesItem(item, token));
}

// ─────────────────────────────────────────────────────────────────────────────
// JumpDoc search
// ─────────────────────────────────────────────────────────────────────────────

export type JumpDocSearchField =
  | "name"
  | "author"
  | "franchise"
  | "genre"
  | "medium"
  | "element"
  | "any";

export type JumpDocSearchToken = {
  field: JumpDocSearchField;
  /** Lowercased search term. */
  term: string;
  /** True when the term was wrapped in quotes. Exact equality for array fields. */
  exact: boolean;
};

/**
 * Parses a jump-doc query string into tokens.
 *
 * Syntax:
 *   - `word`               — substring match on name or franchise
 *   - `"phrase"`           — same with quoted phrase
 *   - `name:word`          — name only
 *   - `franchise:word`     — franchise array substring match
 *   - `genre:word`         — genre array substring match
 *   - `genre:"Exact"`      — genre array exact match (case-insensitive)
 *   - `medium:word`        — medium array substring match
 *   - `element:word`       — supernaturalElements array substring match
 *
 * Multiple tokens are ANDed.
 */
export function parseJumpDocQuery(query: string): JumpDocSearchToken[] {
  const tokens: JumpDocSearchToken[] = [];
  const str = query.trim();
  let i = 0;

  while (i < str.length) {
    while (i < str.length && /\s/.test(str[i])) i++;
    if (i >= str.length) break;

    const fieldMatch = str.slice(i).match(/^(name|author|franchise|genre|medium|element):/i);
    let field: JumpDocSearchField = "any";
    if (fieldMatch) {
      field = fieldMatch[1].toLowerCase() as JumpDocSearchField;
      i += fieldMatch[0].length;
    }

    if (i >= str.length) break;

    if (str[i] === '"') {
      i++;
      const start = i;
      while (i < str.length && str[i] !== '"') i++;
      const term = str.slice(start, i).toLowerCase();
      if (i < str.length) i++;
      if (term) tokens.push({ field, term, exact: true });
    } else {
      const start = i;
      while (i < str.length && !/\s/.test(str[i])) i++;
      const term = str.slice(start, i).toLowerCase();
      if (term) tokens.push({ field, term, exact: false });
    }
  }

  return tokens;
}

export type JumpDocSearchItem = {
  name: string;
  franchise: string[];
  genre: string[];
  medium: string[];
  supernaturalElements: string[];
};

function matchesJumpDocToken(item: JumpDocSearchItem, token: JumpDocSearchToken): boolean {
  const { field, term, exact } = token;

  function hit(str: string): boolean {
    return exact ? str.toLowerCase() === term : str.toLowerCase().includes(term);
  }
  function hitArr(arr: string[]): boolean {
    return arr.some(hit);
  }

  if (field === "any") return hit(item.name) || hitArr(item.franchise);
  if (field === "name") return hit(item.name);
  if (field === "franchise") return hitArr(item.franchise);
  if (field === "genre") return hitArr(item.genre);
  if (field === "medium") return hitArr(item.medium);
  return hitArr(item.supernaturalElements); // element
}

/**
 * Returns true if the item satisfies the query.
 *
 * Bare-word tokens (field "any") are ORed — the item only needs to match one.
 * Field-specific tokens (genre:, medium:, etc.) are ANDed — all must match.
 */
export function matchesJumpDoc(item: JumpDocSearchItem, tokens: JumpDocSearchToken[]): boolean {
  const anyTokens = tokens.filter((t) => t.field === "any");
  const specificTokens = tokens.filter((t) => t.field !== "any");

  if (!specificTokens.every((t) => matchesJumpDocToken(item, t))) return false;
  if (anyTokens.length > 0 && !anyTokens.some((t) => matchesJumpDocToken(item, t))) return false;
  return true;
}

// ─────────────────────────────────────────────────────────────────────────────

/**
 * Returns true if the tag string itself directly matches at least one token
 * that applies to the tag field (field === "tag" or field === "any").
 *
 * Used to sort tag groups: direct-match tags appear before tags that only
 * appear in results because their purchases matched via name/description.
 */
export function tagDirectlyMatches(tag: string, tokens: SearchToken[]): boolean {
  if (tokens.length === 0) return false;
  const t = tag.toLowerCase();
  return tokens.some((token) => {
    if (token.field !== "tag" && token.field !== "any") return false;
    return token.exact ? t === token.term : t.includes(token.term);
  });
}
