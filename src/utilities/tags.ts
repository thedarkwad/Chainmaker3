import { createId, Registry, TID } from "../chain/data/types";
import type { Value } from "../chain/data/Purchase";
import { Currency } from "../chain/data/Jump";
import { objMap } from "@/utilities/miscUtilities";

/**
 * applyTags — template string evaluation with expression support.
 *
 * Template-level interpolations:
 *   $${VarName}   — short-circuit: simple tag lookup (multiline textarea UI hint).
 *                   No expression parsing. VarName is used as-is (trimmed).
 *   ${expression} — full expression evaluated (see grammar below).
 *
 * Expression grammar (operator precedence, low → high):
 *   ternary  = or ('?' ternary ':' ternary)?
 *   or       = and ('||' and)*
 *   and      = cmp ('&&' cmp)*
 *   cmp      = add (('==' | '>=' | '<=' | '>' | '<') add)?
 *   add      = mul (('+' | '-') mul)*
 *   mul      = pow (('*' | '//' | '/' | '%') pow)*
 *   pow      = unary ('^' pow)?           right-associative exponentiation
 *   unary    = '!' unary | '-' unary | '?' unary | primary
 *   primary  = NUMBER | STRING | var | '(' expr ')'
 *   var      = ('@' | '#')? ('[' name_with_spaces ']' | IDENT)
 *
 * Variable/tag name rules:
 *   - Names without spaces: bare identifier    ${Name}
 *   - Names with spaces: bracket syntax        ${[My Tag Name]}
 *   - If the entire ${…} content (trimmed) contains no operator characters,
 *     the whole content is treated as the tag name (spaces allowed without brackets).
 *     e.g. ${ First Name } is equivalent to ${[First Name]}.
 *   - @ prefix: multiline textarea UI hint — stripped, does not affect evaluation.
 *   - # prefix: casts the variable's string value to a number for arithmetic.
 *     The # is NOT part of the tag name stored in `vars`.
 *   - ? prefix (unary): casts the variable/expression to boolean ("true"/"false").
 *
 * String literals (', ", `) support backslash escapes (\n \t \r \\ \' \" \`)
 * and ${...} interpolation using the same syntax and full expression support as top-level.
 *
 * Arithmetic: + on two numbers adds; + involving any string concatenates.
 * Comparison: numeric if either operand is a number or #-cast; string otherwise.
 * Boolean: only meaningful as a ternary condition.
 *          Truthy = non-zero number, or non-empty string that is not "false".
 *
 * Error handling:
 *   - Undefined variable → "" (empty string)
 *   - Any parse/evaluation error → "[Error]"
 */

// ─── Types ────────────────────────────────────────────────────────────────────

type Val = string | number;

type Token =
  | { k: "num"; v: number }
  | { k: "str"; v: string }
  | { k: "var"; name: string; cast: "num" | false }
  | { k: "op"; v: string }
  | { k: "eof" };

export type UserInputTags = Record<
  string,
  "numeric" | "paragraph" | "phrase" | "boolean"
>;

// ─── Lexer ────────────────────────────────────────────────────────────────────

const TWO_CHAR_OPS = new Set(["==", "&&", "||", ">=", "<=", "//"]);
const ONE_CHAR_OPS = new Set([
  ">",
  "<",
  "+",
  "-",
  "*",
  "/",
  "%",
  "!",
  "?",
  ":",
  "(",
  ")",
  "^",
]);
const ESC_MAP: Record<string, string> = {
  n: "\n",
  t: "\t",
  r: "\r",
  "\\": "\\",
  "'": "'",
  '"': '"',
  "`": "`",
};

class Lexer {
  private i = 0;
  private _peek: Token | null = null;

  constructor(
    private src: string,
    private vars: Record<string, string>,
  ) {}

  peek(): Token {
    if (this._peek === null) this._peek = this._read();
    return this._peek;
  }

  next(): Token {
    const t = this._peek ?? this._read();
    this._peek = null;
    return t;
  }

  private _ws(): void {
    while (this.i < this.src.length && this.src[this.i]! <= " ") this.i++;
  }

  private _isDigit(ch: string | undefined): boolean {
    return ch !== undefined && ch >= "0" && ch <= "9";
  }

  private _read(): Token {
    this._ws();
    if (this.i >= this.src.length) return { k: "eof" };

    const ch = this.src[this.i]!;

    if (ch === '"' || ch === "'" || ch === "`")
      return { k: "str", v: this._readString(ch) };

    if (
      this._isDigit(ch) ||
      (ch === "." && this._isDigit(this.src[this.i + 1]))
    )
      return { k: "num", v: this._readNumber() };

    if (ch === "#" || ch === "@") {
      const cast: "num" | false = ch === "#" ? "num" : false;
      this.i++;
      this._ws();
      return { k: "var", name: this._readVarName(), cast };
    }

    if (
      ch === "[" ||
      (ch >= "a" && ch <= "z") ||
      (ch >= "A" && ch <= "Z") ||
      ch === "_"
    )
      return { k: "var", name: this._readVarName(), cast: false };

    const two = this.src.slice(this.i, this.i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      this.i += 2;
      return { k: "op", v: two };
    }

    if (ONE_CHAR_OPS.has(ch)) {
      this.i++;
      return { k: "op", v: ch };
    }

    throw new Error(`Unexpected character: ${JSON.stringify(ch)}`);
  }

  private _readVarName(): string {
    this._ws();
    if (this.src[this.i] === "[") {
      this.i++;
      const start = this.i;
      while (this.i < this.src.length && this.src[this.i] !== "]") this.i++;
      const name = this.src.slice(start, this.i).trim();
      if (this.src[this.i] === "]") this.i++;
      return name;
    }
    const start = this.i;
    while (this.i < this.src.length && /\w/.test(this.src[this.i]!)) this.i++;
    return this.src.slice(start, this.i);
  }

  private _readNumber(): number {
    const start = this.i;
    while (
      this.i < this.src.length &&
      (this._isDigit(this.src[this.i]) || this.src[this.i] === ".")
    )
      this.i++;
    return Number(this.src.slice(start, this.i));
  }

  private _readString(quote: string): string {
    this.i++; // opening quote
    let out = "";
    while (this.i < this.src.length && this.src[this.i] !== quote) {
      if (this.src[this.i] === "\\") {
        this.i++;
        out += ESC_MAP[this.src[this.i] ?? ""] ?? this.src[this.i] ?? "";
        this.i++;
      } else if (this.src[this.i] === "$" && this.src[this.i + 1] === "{") {
        // ${...} interpolation inside string literal — same syntax as top-level
        this.i += 2; // consume ${
        const end = findCloseBrace(this.src, this.i);
        if (end === -1) {
          out += "${"; // unclosed, treat as literal
        } else {
          out += evalContent(this.src.slice(this.i, end), this.vars);
          this.i = end + 1;
        }
      } else {
        out += this.src[this.i++];
      }
    }
    if (this.src[this.i] === quote) this.i++;
    return out;
  }
}

// ─── Parser / Evaluator ───────────────────────────────────────────────────────

class ExprParser {
  constructor(
    private lex: Lexer,
    private vars: Record<string, string>,
  ) {}

  parse(): Val {
    const val = this._ternary();
    if (this.lex.peek().k !== "eof")
      throw new Error("Unexpected token after expression");
    return val;
  }

  private _peekOp(v: string): boolean {
    const t = this.lex.peek();
    return t.k === "op" && t.v === v;
  }

  private _ternary(): Val {
    const cond = this._or();
    if (!this._peekOp("?")) return cond;
    this.lex.next();
    const then = this._ternary();
    if (!this._peekOp(":")) throw new Error("Expected ':'");
    this.lex.next();
    const els = this._ternary();
    return isTruthy(cond) ? then : els;
  }

  private _or(): Val {
    let left = this._and();
    while (this._peekOp("||")) {
      this.lex.next();
      const right = this._and();
      left = isTruthy(left) || isTruthy(right) ? "true" : "false";
    }
    return left;
  }

  private _and(): Val {
    let left = this._cmp();
    while (this._peekOp("&&")) {
      this.lex.next();
      const right = this._cmp();
      left = isTruthy(left) && isTruthy(right) ? "true" : "false";
    }
    return left;
  }

  private _cmp(): Val {
    const left = this._add();
    const t = this.lex.peek();
    if (t.k !== "op" || !["==", ">", "<", ">=", "<="].includes(t.v))
      return left;
    this.lex.next();
    const right = this._add();
    return cmpVals(left, right, t.v) ? "true" : "false";
  }

  private _add(): Val {
    let left = this._mul();
    while (true) {
      const t = this.lex.peek();
      if (t.k !== "op" || (t.v !== "+" && t.v !== "-")) break;
      this.lex.next();
      const right = this._mul();
      if (t.v === "+") {
        left =
          typeof left === "number" && typeof right === "number"
            ? left + right
            : String(left) + String(right);
      } else {
        left = toNum(left) - toNum(right);
      }
    }
    return left;
  }

  private _mul(): Val {
    let left = this._pow();
    while (true) {
      const t = this.lex.peek();
      if (t.k !== "op" || !["*", "/", "//", "%"].includes(t.v)) break;
      this.lex.next();
      const right = this._pow();
      const l = toNum(left),
        r = toNum(right);
      left =
        t.v === "*"
          ? l * r
          : t.v === "/"
            ? l / r
            : t.v === "//"
              ? Math.floor(l / r)
              : l % r;
    }
    return left;
  }

  private _pow(): Val {
    const base = this._unary();
    if (!this._peekOp("^")) return base;
    this.lex.next();
    return Math.pow(toNum(base), toNum(this._pow())); // right-associative
  }

  private _unary(): Val {
    const t = this.lex.peek();
    if (t.k === "op" && t.v === "!") {
      this.lex.next();
      return isTruthy(this._unary()) ? "false" : "true";
    }
    if (t.k === "op" && t.v === "-") {
      this.lex.next();
      return -toNum(this._unary());
    }
    if (t.k === "op" && t.v === "?") {
      this.lex.next();
      return isTruthy(this._unary()) ? "true" : "false";
    }
    return this._primary();
  }

  private _primary(): Val {
    const t = this.lex.next();
    if (t.k === "num") return t.v;
    if (t.k === "str") return t.v;
    if (t.k === "var") {
      const raw = this.vars[t.name] ?? "";
      if (t.cast === "num") return toNum(raw);
      return raw;
    }
    if (t.k === "op" && t.v === "(") {
      const val = this._ternary();
      const close = this.lex.next();
      if (close.k !== "op" || close.v !== ")") throw new Error("Expected ')'");
      return val;
    }
    throw new Error(`Unexpected token: ${JSON.stringify(t)}`);
  }
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function isTruthy(v: Val): boolean {
  if (typeof v === "number") return v !== 0;
  return v !== "" && v !== "false";
}

function toNum(v: Val): number {
  if (typeof v === "number") return v;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function cmpVals(left: Val, right: Val, op: string): boolean {
  if (typeof left === "number" || typeof right === "number") {
    const l = toNum(left),
      r = toNum(right);
    return op === "=="
      ? l === r
      : op === ">"
        ? l > r
        : op === "<"
          ? l < r
          : op === ">="
            ? l >= r
            : l <= r;
  }
  const l = String(left),
    r = String(right);
  return op === "=="
    ? l === r
    : op === ">"
      ? l > r
      : op === "<"
        ? l < r
        : op === ">="
          ? l >= r
          : l <= r;
}

// ─── Expression content evaluator ────────────────────────────────────────────

// Characters that signal a real expression needing full parsing.
const EXPR_CHARS = /[+\-*/%><=!&|?:()"'`^]/;

function evalContent(inner: string, vars: Record<string, string>): string {
  const trimmed = inner.trim();

  // Strip optional @ (UI hint only), # (cast to number), or ? (cast to boolean).
  let cast: "num" | "bool" | false = false;
  let body = trimmed;
  if (body.startsWith("@")) body = body.slice(1).trimStart();
  else if (body.startsWith("#")) {
    cast = "num";
    body = body.slice(1).trimStart();
  } else if (body.startsWith("?")) {
    cast = "bool";
    body = body.slice(1).trimStart();
  }

  const applyCast = (raw: string): string =>
    cast === "num"
      ? String(toNum(raw))
      : cast === "bool"
        ? isTruthy(raw)
          ? "true"
          : "false"
        : raw;

  // Entire body is a bracket-name with nothing else: [Name With Spaces]
  if (body.startsWith("[")) {
    const close = body.indexOf("]");
    if (close !== -1 && body.slice(close + 1).trim() === "") {
      return applyCast(vars[body.slice(1, close).trim()] ?? "");
    }
  }

  // No operator characters and no brackets, and not a number literal → whole body is
  // the tag name. Spaces are allowed without brackets only when there is no cast prefix
  // (# or ?), since `${? Is Active }` would be ambiguous with ternary syntax.
  if (!EXPR_CHARS.test(body) && !body.includes("[") && !/^\d/.test(body)) {
    if (cast === false || !body.includes(" ")) {
      return applyCast(vars[body.trim()] ?? "");
    }
  }

  // Full expression parse.
  const lex = new Lexer(trimmed, vars);
  return String(new ExprParser(lex, vars).parse());
}

// ─── Template scanner ─────────────────────────────────────────────────────────

// Returns the index of the closing } for a ${…} block, skipping over string
// literals so a } inside a string doesn't terminate the expression early.
function findCloseBrace(text: string, from: number): number {
  let i = from;
  while (i < text.length) {
    const ch = text[i]!;
    if (ch === "}") return i;
    if (ch === '"' || ch === "'" || ch === "`") {
      i++;
      while (i < text.length && text[i] !== ch) {
        if (text[i] === "\\") i++;
        i++;
      }
      i++;
    } else {
      i++;
    }
  }
  return -1;
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function applyTags(
  text: string,
  vars: Record<string, string>,
): string {
  let out = "";
  let i = 0;

  while (i < text.length) {
    if (text[i] === "$" && text[i + 1] === "$" && text[i + 2] === "{") {
      // $${VarName} — short-circuit, no expression parsing
      const end = text.indexOf("}", i + 3);
      if (end === -1) {
        out += text.slice(i);
        break;
      }
      out += vars[text.slice(i + 3, end).trim()] ?? "";
      i = end + 1;
    } else if (text[i] === "$" && text[i + 1] === "{") {
      // ${expression}
      const contentStart = i + 2;
      const end = findCloseBrace(text, contentStart);
      if (end === -1) {
        out += text.slice(i);
        break;
      }
      try {
        out += evalContent(text.slice(contentStart, end), vars);
      } catch {
        out += "[Error]";
      }
      i = end + 1;
    } else {
      out += text[i++];
    }
  }

  return out;
}

// ─── Tag extraction ───────────────────────────────────────────────────────────

const TAG_PRIORITY: Record<string, number> = {
  numeric: 0,
  paragraph: 1,
  phrase: 2,
  boolean: 3,
};
const TAG_BY_PRIORITY = ["numeric", "paragraph", "phrase", "boolean"] as const;

function scanExprVars(
  src: string,
  record: (name: string, type: UserInputTags[string]) => void,
): void {
  // Fast path: mirrors evalContent's simple-name detection.
  const trimmed = src.trim();
  let fastType: UserInputTags[string] = "phrase";
  let fastBody = trimmed;
  if (fastBody.startsWith("@")) { fastType = "paragraph"; fastBody = fastBody.slice(1).trimStart(); }
  else if (fastBody.startsWith("#")) { fastType = "numeric"; fastBody = fastBody.slice(1).trimStart(); }
  else if (fastBody.startsWith("?")) { fastType = "boolean"; fastBody = fastBody.slice(1).trimStart(); }

  if (fastBody.startsWith("[")) {
    const close = fastBody.indexOf("]");
    if (close !== -1 && fastBody.slice(close + 1).trim() === "") {
      const name = fastBody.slice(1, close).trim();
      if (name) record(name, fastType);
      return;
    }
  }

  if (!EXPR_CHARS.test(fastBody) && !fastBody.includes("[") && !/^\d/.test(fastBody)) {
    // # and ? prefixes disallow spaces in the name (ambiguous with operators).
    // @ and no-prefix allow spaces.
    if (fastType !== "numeric" && fastType !== "boolean" || !fastBody.includes(" ")) {
      if (fastBody) record(fastBody, fastType);
    }
    return; // either recorded above, or invalid (prefix + spaces) → nothing
  }

  let i = 0;
  const ws = () => {
    while (i < src.length && src[i]! <= " ") i++;
  };
  const readName = (): string | null => {
    ws();
    if (src[i] === "[") {
      i++;
      const start = i;
      while (i < src.length && src[i] !== "]") i++;
      const name = src.slice(start, i).trim();
      if (src[i] === "]") i++;
      return name || null;
    }
    if (i < src.length && /[a-zA-Z_]/.test(src[i]!)) {
      const start = i;
      while (i < src.length && /\w/.test(src[i]!)) i++;
      return src.slice(start, i) || null;
    }
    return null;
  };
  while (i < src.length) {
    ws();
    if (i >= src.length) break;
    const ch = src[i]!;
    if (ch === '"' || ch === "'" || ch === "`") {
      i++;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === "\\") {
          i += 2;
          continue;
        }
        if (src[i] === "$" && src[i + 1] === "{") {
          i += 2;
          const end = findCloseBrace(src, i);
          if (end === -1) break;
          scanExprVars(src.slice(i, end), record);
          i = end + 1;
        } else {
          i++;
        }
      }
      if (i < src.length) i++;
      continue;
    }
    if (ch === "#" || ch === "@") {
      const type = ch === "#" ? "numeric" : "paragraph";
      i++;
      const name = readName();
      if (name) record(name, type);
      continue;
    }
    if (ch === "?") {
      // Bool-cast prefix only when immediately adjacent (no space) to [name] or identifier.
      // A space after ? means it's a ternary operator — skip it.
      const next = src[i + 1];
      if (next === "[" || (next !== undefined && /[a-zA-Z_]/.test(next))) {
        i++;
        const name = readName();
        if (name) record(name, "boolean");
      } else {
        i++;
      }
      continue;
    }
    if (ch === "[" || /[a-zA-Z_]/.test(ch)) {
      const name = readName();
      if (name) record(name, "phrase");
      continue;
    }
    i++;
  }
}

export function extractTags(text: string): UserInputTags {
  const best = new Map<string, number>();
  const record = (name: string, type: UserInputTags[string]): void => {
    const p = TAG_PRIORITY[type]!;
    const current = best.get(name) ?? Infinity;
    if (p < current) best.set(name, p);
  };
  let i = 0;
  while (i < text.length) {
    if (text[i] === "$" && text[i + 1] === "$" && text[i + 2] === "{") {
      const end = text.indexOf("}", i + 3);
      if (end === -1) break;
      record(text.slice(i + 3, end).trim(), "paragraph");
      i = end + 1;
    } else if (text[i] === "$" && text[i + 1] === "{") {
      const contentStart = i + 2;
      const end = findCloseBrace(text, contentStart);
      if (end === -1) break;
      scanExprVars(text.slice(contentStart, end), record);
      i = end + 1;
    } else {
      i++;
    }
  }
  const result: UserInputTags = {};
  for (const [name, p] of best) {
    if (!isReservedTag(name)) result[name] = TAG_BY_PRIORITY[p]!;
  }
  return result;
}

// ─── Reserved tags ────────────────────────────────────────────────────────────

// Value  — numeric purchase value BEFORE discounts/alt-costs, in default currency
// Cost   — numeric purchase cost AFTER discounts/alt-costs, in default currency
// Value_ABBREV / Cost_ABBREV — same, in the currency with that TID abbreviation

function isReservedTag(name: string): boolean {
  return (
    name === "Value" ||
    name === "Cost" ||
    name.startsWith("Value_") ||
    name.startsWith("Cost_")
  );
}

const DEFAULT_CURRENCY_TID = createId<TID.Currency>(0);

export function applyTagsWithCost(
  text: string,
  vars: Record<string, string>,
  value: Value<TID.Currency>,
  cost: Value<TID.Currency>,
  currencies: Registry<TID.Currency, Currency>,
): string {
  const reserved: Record<string, number> = {};
  for (const st of value) {
    if (st.currency == DEFAULT_CURRENCY_TID)
      reserved["Value"] = (reserved["Value"] ?? 0) + st.amount;
    const vKey = "Value_" + currencies.O[st.currency]?.abbrev;
    if (vKey !== "Value_undefined") reserved[vKey] = (reserved[vKey] ?? 0) + st.amount;
  }
  for (const st of cost) {
    if (st.currency == DEFAULT_CURRENCY_TID)
      reserved["Cost"] = (reserved["Cost"] ?? 0) + st.amount;
    const cKey = "Cost_" + currencies.O[st.currency]?.abbrev;
    if (cKey !== "Cost_undefined") reserved[cKey] = (reserved[cKey] ?? 0) + st.amount;
  }
  // Reserved tags take precedence over user-defined vars of the same name.
  return applyTags(text, { ...vars, ...objMap(reserved, n => `${n}`) });
}
