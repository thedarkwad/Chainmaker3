# The Basics

Wrap a tag name in `${ }` to insert its value into your text. 

For example: `${Perk Name} costs ${Cost} CP.`. If the user fills in `Perk Name` as `Martial Arts`, this becomes: ` Martial Arts costs 100 CP. `


## Variable Types

When you create a tag, the system infers what kind of input to show the user based on how
you use it in your templates. Prefix characters act as hints:

| Prefix | Example           | Variable type | What it shows the user                            |
|--------|-------------------|---------------|---------------------------------------------------|
| *(none)* | `${Name}`       | Phrase        | Single-line text input                            |
| `@`    | `${@Notes}`       | Paragraph     | Large multi-line text box                         |
| `#`    | `${#Amount}`      | Numeric       | Number input                                      |
| `?`    | `${?Active}`      | Boolean       | Checkbox (true / false)                           |

When the same tag appears more than once with different prefixes, the highest-priority
type wins: **Numeric > Paragraph > Phrase > Boolean**.

The `$${ }` (double dollar) notation is still supported for paragraphs, but it only does a simple value lookup - it is not compatible with math, conditions, or any other expression features. Prefer `@` for new templates.

## Tag Names With Spaces

A tag name with spaces works fine in a simple insertion - just write it naturally:

```
You have ${Number of Years} years of experience with ${Skill}.
```

When you need to use a prefix (`#`, `?`, `@`) with a multi-word name, or when the name appears inside a complex expression, wrap it in square brackets:

```
${#[Rank Bonus] * 50}
${?[Has Companion] ? "Yes" : "No"}
${"Perk: " + [Perk Name]}
```



# Reserved Tags

## Value and Cost

Several tags are automatically filled in for you based on the purchase's value and cost.
You do not need to define these - they are always available:

| Tag              | Meaning                                                |
|------------------|--------------------------------------------------------|
| `${Value}`       | The purchase's value in the default currency (CP, etc) |
| `${Cost}`        | The actual cost the character pays                     |
| `${Value_CP}`    | Value in a specific currency (replace `CP` with the currency abbreviation) |
| `${Cost_CP}`     | Cost in a specific currency                            |


## Internal Tags

Internal tags let one purchase's name or description count how many times *other* purchases with a given label have been taken.

To use them, open a purchase in the JumpDoc editor and add one or more **internal tag** names to it (found at the bottom of the card). Any purchase that carries a tag with that name can then be counted by *any other* template, using that tag name in an expression:

The value inserted is the number of purchases with that tag that the character currently holds. It updates automatically whenever purchases are added or removed.

Internal tags are **read-only**: users cannot set them directly. They are always numeric, so use the `#` prefix when doing math or comparisons.


# Math & Logic

Put `#` before a tag name to use it as a number in calculations:

Standard math operators are available:

| Symbol | Meaning              | Example              |
|--------|----------------------|----------------------|
| `+`    | Add                  | `${#A + #B}`         |
| `-`    | Subtract             | `${#A - 50}`         |
| `*`    | Multiply             | `${#A * 3}`          |
| `/`    | Divide               | `${#A / 2}`          |
| `//`   | Divide (no decimal)  | `${#A // 2}`         |
| `%`    | Remainder            | `${#A % 10}`         |
| `^`    | Exponentiation       | `${#A ^ 2}`          |

`//` (double slash) is "integer division" - it divides and throws away any decimal part.
So `7 // 2` gives `3`, not `3.5`.

## Booleans

Put `?` before a name to treat its value as `true` or `false`: `${?Active ? "on" : "off"}`. A `?` hints to the app that the tag should be displayed as a checkbox.

Non-empty text (other than `"false"`) and any non-zero number become `true`;
everything else becomes `false`.


## Conditionals

Use the ternary operator `? :` to show different text depending on a condition:

```
You may pick ${Number of Domains} ${#[Number of Domains] == 1 ? "domain" : "domains"}.
```

Read this as: *"if [Number of Domains] equals 1, show 'domain', otherwise show 'domains'"*.

More examples:

```
${Cost == "0" ? "Free" : Cost + " CP"}
${#Rank >= 3 ? "Master" : #Rank >= 2 ? "Adept" : "Novice"}
```

The following comparison operations are supported:

| Symbol | Meaning                  |
|--------|--------------------------|
| `==`   | Equal to                 |
| `>`    | Greater than             |
| `<`    | Less than                |
| `>=`   | Greater than or equal to |
| `<=`   | Less than or equal to    |


## Logical Operations

Use `&&` (and) and `||` (or) to combine multiple conditions. Use `!` to invert one.

```
${#Tier >= 1 && ?Companion ? "Applies to companion" : "Does not apply"}
${Origin == "Drop-In" || Origin == "Outsider" ? "No background perks" : ""}
${!?Active ? "Inactive" : "Active"}
```

# Text Inside Expressions

You can write fixed text directly inside a `${ }` block by wrapping it in quotes.

Single quotes `'`, double quotes `"`, and backticks `` ` `` all work.

```
${"Rank " + #Rank + ": " + Title}
```

Inside a quoted string, you can interpolate a tag using `${TagName}`:

```
${"This perk is worth ${Value} CP."}
```

To include a literal backslash or quote character inside a string:

| Write   | Means           |
|---------|-----------------|
| `\\`    | A literal `\`   |
| `\"`    | A literal `"`   |


# What Happens When Something Goes Wrong?

- **Tag not filled in** - the tag is replaced with nothing (empty text).
- **Math or syntax error** - the whole `${ }` block is replaced with `[Error]`.


# Quick-Reference

```
${Name}                              Insert tag value (phrase)              
${@Notes}                            Paragraph hint - shows a large text box 
${#Amount}                           Insert tag as a number                  
${?Active}                           Cast tag to true/false                  
${Value}                             Purchase value (default currency)        
${Cost}                              Actual cost paid                         
${Value_CP}                          Value in a named currency                
${Cost_CP}                           Cost in a named currency                
${#Ranks * 50}                       Multiply tag by a number                 
${#A + #B}                           Add two tags                          
${#A ^ 2}                            Square a tag (exponentiation)         
${#A // 3}                           Divide, discard decimal
${#N == 1 ? "one" : "many"}          Conditional text
${#Rank >= 2 ? "Adept" : "Novice"}   Comparison
${!?Active ? "Off" : "On"}           Logical NOT
${#A >= 1 && #B >= 1 ? "both" : ""}  Logical AND
${"Rank " + #Rank + ": " + Title}    Join text and numbers
${#[Rank Bonus] * 50}                Bracketed name with prefix
${?[Has Companion] ? "Yes" : "No"}   Bracketed name, boolean
```
