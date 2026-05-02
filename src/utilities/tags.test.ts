import { describe, it, expect } from "vitest";
import { applyTags, extractTags } from "./tags";

// Shorthand: apply with a fixed vars map.
function ap(text: string, vars: Record<string, string> = {}): string {
  return applyTags(text, vars);
}

// ─────────────────────────────────────────────────────────────────────────────
// Passthrough — no interpolation
// ─────────────────────────────────────────────────────────────────────────────

describe("passthrough", () => {
  it("returns plain text unchanged", () => {
    expect(ap("hello world")).toBe("hello world");
  });
  it("returns empty string unchanged", () => {
    expect(ap("")).toBe("");
  });
  it("leaves a lone $ unchanged", () => {
    expect(ap("costs $5")).toBe("costs $5");
  });
  it("leaves an unclosed ${ unchanged", () => {
    expect(ap("hello ${Name")).toBe("hello ${Name");
  });
  it("leaves an unclosed $${ unchanged", () => {
    expect(ap("hello $${Name")).toBe("hello $${Name");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// $${VarName} — short-circuit simple lookup
// ─────────────────────────────────────────────────────────────────────────────

describe("$${} short-circuit", () => {
  it("substitutes a known variable", () => {
    expect(ap("$${Name}", { Name: "Alice" })).toBe("Alice");
  });
  it("returns empty string for unknown variable", () => {
    expect(ap("$${Unknown}")).toBe("");
  });
  it("trims whitespace from the variable name", () => {
    expect(ap("$${ Name }", { Name: "Alice" })).toBe("Alice");
  });
  it("does NOT evaluate expressions — treats content as a literal name", () => {
    expect(ap("$${1 + 2}", { "1 + 2": "surprise" })).toBe("surprise");
    expect(ap("$${1 + 2}")).toBe(""); // no such var → ""
  });
  it("multiple $${} in one string", () => {
    expect(ap("$${A} and $${B}", { A: "foo", B: "bar" })).toBe("foo and bar");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Simple variable lookup  ${Name}
// ─────────────────────────────────────────────────────────────────────────────

describe("simple variable lookup", () => {
  it("substitutes a known variable", () => {
    expect(ap("${Name}", { Name: "Alice" })).toBe("Alice");
  });
  it("returns empty string for an undefined variable", () => {
    expect(ap("${Unknown}")).toBe("");
  });
  it("handles multiple variables in one string", () => {
    expect(ap("${A} + ${B}", { A: "foo", B: "bar" })).toBe("foo + bar");
  });
  it("variable value can itself contain $", () => {
    expect(ap("${A}", { A: "cost is $5" })).toBe("cost is $5");
  });
  it("whitespace around name is trimmed", () => {
    expect(ap("${ Name }", { Name: "Alice" })).toBe("Alice");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tag names with spaces
// ─────────────────────────────────────────────────────────────────────────────

describe("tag names with spaces", () => {
  it("bracket syntax ${[Name With Spaces]}", () => {
    expect(ap("${[First Name]}", { "First Name": "Alice" })).toBe("Alice");
  });
  it("bare spaces in ${ } with no operators treated as tag name", () => {
    expect(ap("${ First Name }", { "First Name": "Alice" })).toBe("Alice");
  });
  it("A B C is treated as tag name 'A B C'", () => {
    expect(ap("${A B C}", { "A B C": "hit" })).toBe("hit");
  });
  it("multiple spaces collapse to one tag name (trimmed)", () => {
    expect(ap("${  Lots   Of   Spaces  }", { "Lots   Of   Spaces": "hit" })).toBe("hit");
  });
  it("bracket name with @ prefix — @ stripped, name preserved", () => {
    expect(ap("${@[Full Name]}", { "Full Name": "Bob" })).toBe("Bob");
  });
  it("bracket name with # prefix — # stripped from name, value cast to number", () => {
    expect(ap("${#[Item Count]}", { "Item Count": "7" })).toBe("7");
    expect(ap("${#[Item Count] * 2}", { "Item Count": "7" })).toBe("14");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// @ prefix (UI hint — multiline textarea)
// ─────────────────────────────────────────────────────────────────────────────

describe("@ prefix", () => {
  it("@Name is equivalent to Name for evaluation", () => {
    expect(ap("${@Name}", { Name: "Alice" })).toBe("Alice");
  });
  it("@Name with undefined var → empty string", () => {
    expect(ap("${@Missing}")).toBe("");
  });
  it("@Name does not appear in the output", () => {
    expect(ap("${@A}", { A: "hello" })).toBe("hello");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// # prefix (cast to number)
// ─────────────────────────────────────────────────────────────────────────────

describe("# prefix", () => {
  it("casts string value to number", () => {
    expect(ap("${#N}", { N: "42" })).toBe("42");
  });
  it("non-numeric string → 0", () => {
    expect(ap("${#N}", { N: "abc" })).toBe("0");
  });
  it("empty / undefined → 0", () => {
    expect(ap("${#N}")).toBe("0");
  });
  it("# does not include # in the tag name", () => {
    // Tag is called "N", not "#N"
    expect(ap("${#N}", { N: "5", "#N": "999" })).toBe("5");
  });
  it("#-cast value participates in numeric arithmetic", () => {
    expect(ap("${#A + #B}", { A: "3", B: "4" })).toBe("7");
  });
  it("#A + literal number", () => {
    expect(ap("${#A + 10}", { A: "5" })).toBe("15");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ? prefix (cast to boolean)
// ─────────────────────────────────────────────────────────────────────────────

describe("? prefix", () => {
  it("non-empty string → 'true'", () => {
    expect(ap("${?A}", { A: "hello" })).toBe("true");
  });
  it("empty string → 'false'", () => {
    expect(ap("${?A}", { A: "" })).toBe("false");
  });
  it("undefined variable → 'false'", () => {
    expect(ap("${?Missing}")).toBe("false");
  });
  it("'false' string → 'false'", () => {
    expect(ap("${?A}", { A: "false" })).toBe("false");
  });
  it("'0' string → 'true' (non-empty, non-'false' string is truthy)", () => {
    expect(ap("${?A}", { A: "0" })).toBe("true");
  });
  it("'1' string → 'true'", () => {
    expect(ap("${?A}", { A: "1" })).toBe("true");
  });
  it("? does not include ? in the tag name", () => {
    expect(ap("${?A}", { A: "yes", "?A": "ignored" })).toBe("true");
  });
  it("?[Bracket Name] works", () => {
    expect(ap("${?[Is Active]}", { "Is Active": "yes" })).toBe("true");
    expect(ap("${?[Is Active]}", { "Is Active": "" })).toBe("false");
  });
  it("? in a ternary condition", () => {
    expect(ap("${?Flag ? 'on' : 'off'}", { Flag: "yes" })).toBe("on");
    expect(ap("${?Flag ? 'on' : 'off'}", { Flag: "" })).toBe("off");
  });
  it("? result used in && with another condition", () => {
    expect(ap("${?A && ?B ? 'both' : 'not'}", { A: "yes", B: "yes" })).toBe("both");
    expect(ap("${?A && ?B ? 'both' : 'not'}", { A: "yes", B: "" })).toBe("not");
  });
  it("?[Bracket Name] works for space-containing names", () => {
    expect(ap("${?[Is Active]}", { "Is Active": "yes" })).toBe("true");
    expect(ap("${?[Is Active]}", { "Is Active": "" })).toBe("false");
  });
  it("? with bare spaces is invalid (ambiguous with ternary)", () => {
    expect(ap("${? Is Active }", { "Is Active": "true" })).toBe("[Error]");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Number literals
// ─────────────────────────────────────────────────────────────────────────────

describe("number literals", () => {
  it("integer literal", () => {
    expect(ap("${42}")).toBe("42");
  });
  it("decimal literal", () => {
    expect(ap("${3.14}")).toBe("3.14");
  });
  it("negative via unary minus", () => {
    expect(ap("${-7}")).toBe("-7");
  });
  it("zero", () => {
    expect(ap("${0}")).toBe("0");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// String literals
// ─────────────────────────────────────────────────────────────────────────────

describe("string literals", () => {
  it("double quotes", () => {
    expect(ap('${"hello"}')).toBe("hello");
  });
  it("single quotes", () => {
    expect(ap("${'hello'}")).toBe("hello");
  });
  it("backtick quotes", () => {
    expect(ap("${`hello`}")).toBe("hello");
  });
  it("empty string literal", () => {
    expect(ap('${""}', {})).toBe("");
  });

  describe("escape sequences", () => {
    it("\\n becomes newline", () => {
      expect(ap('"a${\"\\n\"}b"')).toBe('"a\nb"');
    });
    it("\\t becomes tab", () => {
      expect(ap('${"a\\tb"}')).toBe("a\tb");
    });
    it("\\\\ becomes backslash", () => {
      expect(ap('${"a\\\\b"}')).toBe("a\\b");
    });
    it('\\" inside double-quoted string', () => {
      expect(ap('${"say \\"hi\\""}')).toBe('say "hi"');
    });
  });

  describe("${} interpolation inside string literals", () => {
    it("${Name} inside double-quoted string", () => {
      expect(ap('${"Hello ${Name}!"}', { Name: "Alice" })).toBe("Hello Alice!");
    });
    it("${[Var Name]} inside string", () => {
      expect(ap('${"Hi ${[First Name]}"}', { "First Name": "Bob" })).toBe("Hi Bob");
    });
    it("undefined var inside string literal → empty", () => {
      expect(ap('${"Hello ${Missing}"}')).toBe("Hello ");
    });
    it("bare $ without { is treated as literal $", () => {
      expect(ap('${"cost: $5"}')).toBe("cost: $5");
    });
    it("multiple ${} interpolations in one string literal", () => {
      expect(ap('${"${A} and ${B}"}', { A: "foo", B: "bar" })).toBe("foo and bar");
    });
    it("full expression inside string interpolation", () => {
      expect(ap('${"total: ${#N * 2}"}', { N: "5" })).toBe("total: 10");
    });
    it("ternary inside string interpolation", () => {
      expect(ap('${"${#N == 1 ? \'one\' : \'many\'} items"}', { N: "1" })).toBe("one items");
    });
    it("unclosed ${ inside string treated as literal", () => {
      expect(ap('${"hello ${world"}')).toBe("hello ${world");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Arithmetic
// ─────────────────────────────────────────────────────────────────────────────

describe("arithmetic", () => {
  it("addition of two numbers", () => {
    expect(ap("${1 + 2}")).toBe("3");
  });
  it("subtraction", () => {
    expect(ap("${10 - 3}")).toBe("7");
  });
  it("multiplication", () => {
    expect(ap("${4 * 5}")).toBe("20");
  });
  it("division", () => {
    expect(ap("${10 / 4}")).toBe("2.5");
  });
  it("floor division //", () => {
    expect(ap("${10 // 3}")).toBe("3");
  });
  it("floor division // rounds down (not toward zero) for negatives", () => {
    expect(ap("${-7 // 2}")).toBe("-4");
  });
  it("modulo", () => {
    expect(ap("${10 % 3}")).toBe("1");
  });
  it("operator precedence: * before +", () => {
    expect(ap("${2 + 3 * 4}")).toBe("14");
  });
  it("parentheses override precedence", () => {
    expect(ap("${(2 + 3) * 4}")).toBe("20");
  });
  it("chained operations", () => {
    expect(ap("${1 + 2 + 3 + 4}")).toBe("10");
  });
  it("unary minus on a literal", () => {
    expect(ap("${-5 + 3}")).toBe("-2");
  });
  it("unary minus on a variable", () => {
    expect(ap("${-#N}", { N: "4" })).toBe("-4");
  });
  it("unary minus chained", () => {
    expect(ap("${- -#N}", { N: "4" })).toBe("4");
  });
  it("tag arithmetic: #A * 2", () => {
    expect(ap("${#A * 2}", { A: "6" })).toBe("12");
  });
  it("#A + #B with two tags", () => {
    expect(ap("${#A + #B}", { A: "10", B: "3" })).toBe("13");
  });
  it("#A - #B", () => {
    expect(ap("${#A - #B}", { A: "10", B: "3" })).toBe("7");
  });
  it("complex expression", () => {
    expect(ap("${(#A + #B) * (#C - 1)}", { A: "2", B: "3", C: "4" })).toBe("15");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Exponentiation (^)
// ─────────────────────────────────────────────────────────────────────────────

describe("exponentiation", () => {
  it("basic integer power", () => {
    expect(ap("${2 ^ 3}")).toBe("8");
  });
  it("power of 0 → 1", () => {
    expect(ap("${5 ^ 0}")).toBe("1");
  });
  it("power of 1 → base", () => {
    expect(ap("${7 ^ 1}")).toBe("7");
  });
  it("fractional exponent (square root)", () => {
    expect(ap("${4 ^ 0.5}")).toBe("2");
  });
  it("right-associative: 2^3^2 == 2^9 == 512", () => {
    expect(ap("${2 ^ 3 ^ 2}")).toBe("512");
  });
  it("higher precedence than *: 2 * 3^2 == 18", () => {
    expect(ap("${2 * 3 ^ 2}")).toBe("18");
  });
  it("higher precedence than *: 3^2 * 2 == 18", () => {
    expect(ap("${3 ^ 2 * 2}")).toBe("18");
  });
  it("with # tag", () => {
    expect(ap("${#N ^ 2}", { N: "5" })).toBe("25");
  });
  it("parentheses override right-associativity", () => {
    expect(ap("${(2 ^ 3) ^ 2}")).toBe("64");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// String concatenation with +
// ─────────────────────────────────────────────────────────────────────────────

describe("string concatenation", () => {
  it("two string literals", () => {
    expect(ap('${"foo" + "bar"}')).toBe("foobar");
  });
  it("string + variable", () => {
    expect(ap('${"Hello " + Name}', { Name: "Alice" })).toBe("Hello Alice");
  });
  it("number + string → concatenation", () => {
    expect(ap('${#N + " items"}', { N: "5" })).toBe("5 items");
  });
  it("string + number → concatenation", () => {
    expect(ap('${"count: " + #N}', { N: "5" })).toBe("count: 5");
  });
  it("two plain vars → concatenation", () => {
    // Both are strings; + concatenates
    expect(ap("${A + B}", { A: "hello", B: " world" })).toBe("hello world");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Comparisons
// ─────────────────────────────────────────────────────────────────────────────

describe("comparisons (used in ternary conditions)", () => {
  const vars = { A: "10", B: "3", S: "hello", T: "hello" };

  it("== numeric: equal", () => {
    expect(ap("${#A == 10 ? 'yes' : 'no'}", vars)).toBe("yes");
  });
  it("== numeric: not equal", () => {
    expect(ap("${#A == 5 ? 'yes' : 'no'}", vars)).toBe("no");
  });
  it("== string: equal", () => {
    expect(ap("${S == T ? 'yes' : 'no'}", vars)).toBe("yes");
  });
  it("== string: not equal", () => {
    expect(ap("${S == 'world' ? 'yes' : 'no'}", vars)).toBe("no");
  });
  it("> numeric", () => {
    expect(ap("${#A > #B ? 'yes' : 'no'}", vars)).toBe("yes");
  });
  it("< numeric", () => {
    expect(ap("${#B < #A ? 'yes' : 'no'}", vars)).toBe("yes");
  });
  it(">= equal", () => {
    expect(ap("${#A >= 10 ? 'yes' : 'no'}", vars)).toBe("yes");
  });
  it(">= greater", () => {
    expect(ap("${#A >= 9 ? 'yes' : 'no'}", vars)).toBe("yes");
  });
  it(">= not met", () => {
    expect(ap("${#A >= 11 ? 'yes' : 'no'}", vars)).toBe("no");
  });
  it("<= equal", () => {
    expect(ap("${#A <= 10 ? 'yes' : 'no'}", vars)).toBe("yes");
  });
  it("<= not met", () => {
    expect(ap("${#A <= 9 ? 'yes' : 'no'}", vars)).toBe("no");
  });
  it("comparison involving undefined var (coerced to 0)", () => {
    expect(ap("${#Missing == 0 ? 'yes' : 'no'}")).toBe("yes");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Ternary operator
// ─────────────────────────────────────────────────────────────────────────────

describe("ternary", () => {
  it("basic true branch", () => {
    expect(ap("${1 == 1 ? 'yes' : 'no'}")).toBe("yes");
  });
  it("basic false branch", () => {
    expect(ap("${1 == 2 ? 'yes' : 'no'}")).toBe("no");
  });
  it("condition is a variable (truthy non-empty string)", () => {
    expect(ap("${Name ? 'set' : 'empty'}", { Name: "Alice" })).toBe("set");
  });
  it("condition is a variable (falsy empty string)", () => {
    expect(ap("${Name ? 'set' : 'empty'}", { Name: "" })).toBe("empty");
  });
  it("condition is 'false' string → falsy", () => {
    expect(ap("${Flag ? 'yes' : 'no'}", { Flag: "false" })).toBe("no");
  });
  it("condition is '0' number → falsy", () => {
    expect(ap("${#N ? 'yes' : 'no'}", { N: "0" })).toBe("no");
  });
  it("condition is non-zero number → truthy", () => {
    expect(ap("${#N ? 'yes' : 'no'}", { N: "5" })).toBe("yes");
  });
  it("nested ternary (right-associative)", () => {
    expect(ap("${#N > 0 ? 'pos' : #N < 0 ? 'neg' : 'zero'}", { N: "0" })).toBe("zero");
    expect(ap("${#N > 0 ? 'pos' : #N < 0 ? 'neg' : 'zero'}", { N: "5" })).toBe("pos");
    expect(ap("${#N > 0 ? 'pos' : #N < 0 ? 'neg' : 'zero'}", { N: "-3" })).toBe("neg");
  });
  it("branches can be expressions", () => {
    expect(ap("${#N > 0 ? #N * 2 : 0}", { N: "5" })).toBe("10");
    expect(ap("${#N > 0 ? #N * 2 : 0}", { N: "-1" })).toBe("0");
  });
  it("singular vs plural", () => {
    expect(ap("${#N} ${#N == 1 ? 'item' : 'items'}", { N: "1" })).toBe("1 item");
    expect(ap("${#N} ${#N == 1 ? 'item' : 'items'}", { N: "3" })).toBe("3 items");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Logical operators
// ─────────────────────────────────────────────────────────────────────────────

describe("logical operators", () => {
  it("&& both truthy", () => {
    expect(ap("${A && B ? 'yes' : 'no'}", { A: "x", B: "y" })).toBe("yes");
  });
  it("&& one falsy", () => {
    expect(ap("${A && B ? 'yes' : 'no'}", { A: "x", B: "" })).toBe("no");
  });
  it("&& both falsy", () => {
    expect(ap("${A && B ? 'yes' : 'no'}", { A: "", B: "" })).toBe("no");
  });
  it("|| both truthy", () => {
    expect(ap("${A || B ? 'yes' : 'no'}", { A: "x", B: "y" })).toBe("yes");
  });
  it("|| one truthy", () => {
    expect(ap("${A || B ? 'yes' : 'no'}", { A: "", B: "y" })).toBe("yes");
  });
  it("|| both falsy", () => {
    expect(ap("${A || B ? 'yes' : 'no'}", { A: "", B: "" })).toBe("no");
  });
  it("! on empty string → truthy (inverted)", () => {
    expect(ap("${!A ? 'empty' : 'set'}", { A: "" })).toBe("empty");
  });
  it("! on non-empty string → falsy (inverted)", () => {
    expect(ap("${!A ? 'empty' : 'set'}", { A: "hello" })).toBe("set");
  });
  it("! on 'false' string → truthy (inverted)", () => {
    expect(ap("${!Flag ? 'yes' : 'no'}", { Flag: "false" })).toBe("yes");
  });
  it("combined && and ||", () => {
    // (true && false) || true → true
    expect(ap("${(A && B) || C ? 'yes' : 'no'}", { A: "x", B: "", C: "z" })).toBe("yes");
  });
  it("! and &&", () => {
    expect(ap("${!A && B ? 'yes' : 'no'}", { A: "", B: "x" })).toBe("yes");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Operator precedence (cross-level)
// ─────────────────────────────────────────────────────────────────────────────

describe("operator precedence", () => {
  it("* before + (left side)", () => {
    expect(ap("${2 * 3 + 4}")).toBe("10");
  });
  it("* before + (right side)", () => {
    expect(ap("${4 + 2 * 3}")).toBe("10");
  });
  it("unary minus before *", () => {
    expect(ap("${-2 * 3}")).toBe("-6");
  });
  it("! before &&", () => {
    // !false && true  →  true && true → true
    expect(ap("${!A && B ? 'y' : 'n'}", { A: "false", B: "x" })).toBe("y");
  });
  it("comparison before &&", () => {
    expect(ap("${#A > 0 && #B > 0 ? 'y' : 'n'}", { A: "1", B: "2" })).toBe("y");
    expect(ap("${#A > 0 && #B > 0 ? 'y' : 'n'}", { A: "1", B: "-1" })).toBe("n");
  });
  it("&& before ||", () => {
    // false && true || true → (false && true) || true → true
    expect(ap("${A && B || C ? 'y' : 'n'}", { A: "", B: "x", C: "z" })).toBe("y");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Braces inside string literals (brace-scanner correctness)
// ─────────────────────────────────────────────────────────────────────────────

describe("closing brace inside a string literal", () => {
  it("} inside double-quoted string does not end the expression", () => {
    expect(ap('${"hello}world"}')).toBe("hello}world");
  });
  it("} inside single-quoted string", () => {
    expect(ap("${'a}b'}")).toBe("a}b");
  });
  it("} inside backtick string", () => {
    expect(ap("${`a}b`}")).toBe("a}b");
  });
  it("expression continues after string with }", () => {
    expect(ap('${"x}" + Name}', { Name: "!" })).toBe("x}!");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Mixed template (multiple blocks in one string)
// ─────────────────────────────────────────────────────────────────────────────

describe("multiple interpolations in one template", () => {
  it("two simple lookups", () => {
    expect(ap("${A} and ${B}", { A: "foo", B: "bar" })).toBe("foo and bar");
  });
  it("expression mixed with simple lookup", () => {
    expect(ap("${#N * 2} out of ${Max}", { N: "3", Max: "10" })).toBe("6 out of 10");
  });
  it("$${} and ${} in the same string", () => {
    expect(ap("$${A} = ${#B + 1}", { A: "result", B: "4" })).toBe("result = 5");
  });
  it("surrounding literal text preserved", () => {
    expect(ap("prefix ${Name} suffix", { Name: "X" })).toBe("prefix X suffix");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Real-world template examples
// ─────────────────────────────────────────────────────────────────────────────

describe("real-world templates", () => {
  it("singular/plural item count", () => {
    const t = "You receive ${#Count} ${#Count == 1 ? 'item' : 'items'}.";
    expect(ap(t, { Count: "1" })).toBe("You receive 1 item.");
    expect(ap(t, { Count: "5" })).toBe("You receive 5 items.");
  });

  it("price with currency string", () => {
    expect(ap('${#Cost + " CP"}', { Cost: "300" })).toBe("300 CP");
  });

  it("greeting with name fallback", () => {
    const t = "${Name ? 'Hello, ' + Name + '!' : 'Hello, stranger!'}";
    expect(ap(t, { Name: "Alice" })).toBe("Hello, Alice!");
    expect(ap(t, { Name: "" })).toBe("Hello, stranger!");
  });

  it("double the cost if premium", () => {
    const t = "${Premium == 'yes' ? #Cost * 2 : #Cost} CP";
    expect(ap(t, { Premium: "yes", Cost: "100" })).toBe("200 CP");
    expect(ap(t, { Premium: "no", Cost: "100" })).toBe("100 CP");
  });

  it("floor division for even split", () => {
    expect(ap("Each person gets ${#Total // #People} points.", { Total: "100", People: "3" }))
      .toBe("Each person gets 33 points.");
  });

  it("remainder to show leftovers", () => {
    expect(ap("${#Total % #People} left over.", { Total: "100", People: "3" }))
      .toBe("1 left over.");
  });

  it("tag names with spaces in a sentence", () => {
    expect(
      ap("${[Character Name]} arrives at ${[Location Name]}.", {
        "Character Name": "Alice",
        "Location Name": "the tavern",
      }),
    ).toBe("Alice arrives at the tavern.");
  });

  it("string interpolation inside literal for a formatted message", () => {
    expect(
      ap('${"Greetings, ${Name}. You have ${[Item Count]} items."}', {
        Name: "Bob",
        "Item Count": "7",
      }),
    ).toBe("Greetings, Bob. You have 7 items.");
  });

  it("nested ternary for letter grade", () => {
    const t = "${#S >= 90 ? 'A' : #S >= 80 ? 'B' : #S >= 70 ? 'C' : 'F'}";
    expect(ap(t, { S: "95" })).toBe("A");
    expect(ap(t, { S: "83" })).toBe("B");
    expect(ap(t, { S: "72" })).toBe("C");
    expect(ap(t, { S: "55" })).toBe("F");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Error handling
// ─────────────────────────────────────────────────────────────────────────────

describe("error handling", () => {
  it("undefined variable → empty string", () => {
    expect(ap("${Missing}")).toBe("");
  });
  it("undefined variable in arithmetic defaults to 0 when #-cast", () => {
    expect(ap("${#Missing + 5}")).toBe("5");
  });
  it("syntax error → [Error]", () => {
    expect(ap("${1 +}")).toBe("[Error]");
  });
  it("unmatched paren → [Error]", () => {
    expect(ap("${(1 + 2}")).toBe("[Error]");
  });
  it("missing ternary colon → [Error]", () => {
    expect(ap("${1 ? 'a'}")).toBe("[Error]");
  });
  it("unclosed ${ — left as literal text", () => {
    expect(ap("hello ${world")).toBe("hello ${world");
  });
  it("extra tokens after expression → [Error]", () => {
    expect(ap("${1 2}")).toBe("[Error]");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// extractTags
// ─────────────────────────────────────────────────────────────────────────────

describe("extractTags", () => {
  it("empty string → empty object", () => {
    expect(extractTags("")).toEqual({});
  });
  it("plain text → empty object", () => {
    expect(extractTags("no tags here")).toEqual({});
  });

  // Variable kinds
  it("bare var → phrase", () => {
    expect(extractTags("${Name}")).toEqual({ Name: "phrase" });
  });
  it("# var → numeric", () => {
    expect(extractTags("${#Count}")).toEqual({ Count: "numeric" });
  });
  it("? var → boolean", () => {
    expect(extractTags("${?Active}")).toEqual({ Active: "boolean" });
  });
  it("@ var → paragraph", () => {
    expect(extractTags("${@Notes}")).toEqual({ Notes: "paragraph" });
  });
  it("$${} short-circuit → paragraph", () => {
    expect(extractTags("$${Description}")).toEqual({ Description: "paragraph" });
  });
  it("bracket name → phrase", () => {
    expect(extractTags("${[First Name]}")).toEqual({ "First Name": "phrase" });
  });
  it("#-bracket name → numeric", () => {
    expect(extractTags("${#[Item Count]}")).toEqual({ "Item Count": "numeric" });
  });

  // Priority: numeric > paragraph > phrase > boolean
  it("numeric wins over phrase", () => {
    expect(extractTags("${Name} and ${#Name}")).toEqual({ Name: "numeric" });
  });
  it("numeric wins over paragraph", () => {
    expect(extractTags("$${Name} and ${#Name}")).toEqual({ Name: "numeric" });
  });
  it("paragraph wins over phrase", () => {
    expect(extractTags("${Name} and ${@Name}")).toEqual({ Name: "paragraph" });
  });
  it("paragraph wins over boolean", () => {
    expect(extractTags("${?Flag} and ${@Flag}")).toEqual({ Flag: "paragraph" });
  });
  it("numeric wins over boolean", () => {
    expect(extractTags("${?Flag} ${#Flag}")).toEqual({ Flag: "numeric" });
  });
  it("phrase wins over boolean", () => {
    expect(extractTags("${?Flag} ${Flag}")).toEqual({ Flag: "phrase" });
  });

  // Multiple distinct vars
  it("multiple different vars", () => {
    expect(extractTags("${#Points} ${Name} ${?Active}")).toEqual({
      Points: "numeric",
      Name: "phrase",
      Active: "boolean",
    });
  });
  it("reserved tags (Value, Cost, Value_X, Cost_X) are excluded", () => {
    expect(extractTags("${#Value} ${#Cost} ${#Value_CP} ${#Cost_CP} ${Name}")).toEqual({
      Name: "phrase",
    });
  });

  // Expression context
  it("var in arithmetic expression → phrase (operands only)", () => {
    expect(extractTags("${#A + #B}")).toEqual({ A: "numeric", B: "numeric" });
  });
  it("var in ternary branches", () => {
    expect(extractTags("${#N == 1 ? Label : Other}")).toEqual({
      N: "numeric",
      Label: "phrase",
      Other: "phrase",
    });
  });

  // Vars inside string literals (nested ${})
  it("var inside string literal interpolation → extracted", () => {
    expect(extractTags('${"Hello ${Name}"}')).toEqual({ Name: "phrase" });
  });
  it("#var inside string literal interpolation → numeric", () => {
    expect(extractTags('${"total: ${#Count}"}')).toEqual({ Count: "numeric" });
  });

  // Bare $Name inside a string literal is NOT interpolated → not extracted
  it("bare $Name inside string literal → not extracted", () => {
    expect(extractTags('${"Hello $Name"}')).toEqual({});
  });
  it("bare $[Name] inside string literal → not extracted", () => {
    expect(extractTags('${"Hello $[Name]"}')).toEqual({});
  });

  // Variables outside ${} blocks are not extracted
  it("text outside ${ } is ignored", () => {
    expect(extractTags("just Name here")).toEqual({});
  });
  it("$Name outside braces → not extracted", () => {
    expect(extractTags("$Name")).toEqual({});
  });

  // Operator tokens / numbers are not treated as var names
  it("number literal not treated as var", () => {
    expect(extractTags("${42}")).toEqual({});
  });
  it("operators not treated as vars", () => {
    expect(extractTags("${#A + 1}")).toEqual({ A: "numeric" });
  });

  // Spaced tag names without brackets (no operators/logic)
  it("space-separated name without brackets → single phrase tag", () => {
    expect(extractTags("${Tags with whitespace and no operations or logic}")).toEqual({
      "Tags with whitespace and no operations or logic": "phrase",
    });
  });
  it("@ prefix with spaced name → paragraph", () => {
    expect(extractTags("${@Long Note}")).toEqual({ "Long Note": "paragraph" });
  });
  it("# prefix with spaced name is invalid (ambiguous) → no tag", () => {
    expect(extractTags("${#Item Count}")).toEqual({});
  });
  it("? prefix with spaced name is invalid → no tag", () => {
    expect(extractTags("${? Is Active}")).toEqual({});
  });
});
