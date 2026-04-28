# Open Source Readiness

This project is still in the "prove it on ugly templates" phase.

Before publishing it as a serious open-source Prettier plugin, we should hold it to a stricter bar than "formats the happy path":

- `npm run build` must stay green.
- `npm test` must stay green in non-watch mode.
- formatting must be idempotent: `format(format(input)) === format(input)`.
- malformed input must not crash the parser or synthesize surprising markup.
- unsupported Handlebars syntax must be an explicit policy decision, not an accidental failure mode.

## Status Legend

- `Covered`: there is explicit automated coverage today.
- `Partial`: some coverage exists, but the behavior is fragile or already known to regress.
- `Missing`: no trustworthy automated coverage yet, or the parser almost certainly does not support the construct.

## Release Blockers

| Priority | Status | Case | Why it matters |
| --- | --- | --- | --- |
| release-blocker | Partial | Mustache spacing inside attributes | Already regresses in current integration tests. |
| release-blocker | Partial | Inline-vs-multiline element decisions | A formatter that flips layout unexpectedly will feel unsafe in large repos. |
| release-blocker | Partial | Block-scoped attributes with conditional branches | Real templates often gate multiple attrs behind `if` / `ifEquals`. |
| release-blocker | Covered | Handlebars whitespace control `~` | Very common in production HBS and whitespace-sensitive templates. |
| release-blocker | Covered | Raw blocks `{{{{raw}}}} ... {{{{/raw}}}}` | Must not be misparsed as regular blocks. |
| release-blocker | Covered | Block partials `{{#> layout}} ... {{/layout}}` | Common in larger Handlebars ecosystems. |
| release-blocker | Covered | Inline partial definitions `{{#*inline "x"}}` | Needed for reusable partial-heavy codebases. |
| release-blocker | Covered | `script` / `style` content containing closing tags in strings | Raw-text parsing skips quoted closing-tag lookalikes. |
| release-blocker | Covered | Text nodes containing `<` that are not HTML tags | Formatter must not reinterpret plain text as markup. |
| release-blocker | Covered | CRLF and BOM handling | Open-source users will hit Windows files immediately. |

## Core Handlebars Syntax

| Priority | Status | Case | Example |
| --- | --- | --- | --- |
| high | Covered | Nested blocks with `else` | `{{#if a}}...{{else}}...{{/if}}` |
| high | Covered | Complex block helpers inside attribute values | `class="base {{#if cond}}mod{{/if}}"` |
| high | Covered | Partials with multiline hash values | `{{> card data=(parseJSON "...") }}` |
| high | Covered | Dynamic partial names | `{{> (lookup . "partialName") }}` |
| high | Covered | Block partials | `{{#> layout}}...{{/layout}}` |
| high | Covered | Inline partial definitions | `{{#*inline "card"}}...{{/inline}}` |
| high | Covered | Raw blocks | `{{{{raw}}}} {{value}} {{{{/raw}}}}` |
| high | Covered | Whitespace control on inline expressions | `{{~ value ~}}` |
| high | Covered | Whitespace control on blocks | `{{~#if cond~}}...{{~/if~}}` |
| high | Covered | Nested subexpressions in params and hash | `{{helper (a (b c=1)) flag=(or x y)}}` |
| high | Covered | Path variants | `../item`, `./name`, `this`, `@index`, `@root.user.name` |
| medium | Covered | Path literals / bracket lookups | `user.[first-name]` |
| medium | Covered | Triple-stash in mixed HTML contexts | `{{{ html }}}` |
| medium | Missing | `else if` style constructs | `{{else if cond}}` |
| medium | Partial | Decorators and decorator blocks | Inline partial definitions are covered; other decorators are preserved conservatively. |

## HTML Interop

| Priority | Status | Case | Example |
| --- | --- | --- | --- |
| high | Covered | Void elements | `<source>`, `<img>`, `<br>` |
| high | Covered | Attribute blocks that emit multiple attrs | `{{#if lazy}}src=... loading="lazy"{{/if}}` |
| high | Covered | Mixed text + mustaches in attributes | `title="Hi {{ name }}!"` |
| high | Covered | Unquoted attrs with Handlebars | `data-id={{id}}` |
| high | Covered | Attributes with nested quotes and helpers | `title='{{t "cta.buy"}}'` |
| high | Covered | Custom elements and web components | `<product-card data-id="{{ id }}"></product-card>` |
| high | Covered | SVG / namespaced tags and attrs | `<svg:use xlink:href="#id" />` |
| high | Covered | `textarea` / `pre` whitespace-sensitive content | `<textarea>  keep me  </textarea>` |
| medium | Covered | Doctype and root-level mixed content | `<!doctype html>` plus comments and blocks |
| medium | Missing | Attribute values containing `>` or `<` in strings | `data-json='{"html":"<b>"}'` |
| medium | Missing | Self-closing custom elements policy | `<x-thing />` |

## Comments, Ignore, and Recovery

| Priority | Status | Case | Example |
| --- | --- | --- | --- |
| high | Covered | Multiline Handlebars comments | `{{!-- ... --}}` |
| high | Covered | `prettier-ignore` directives | `prettier-ignore`, `-start`, `-end` |
| high | Partial | Comments containing embedded mustaches | `{{!-- <span>{{ price }}</span> --}}` |
| high | Covered | Comments with trim markers and weird spacing | `{{~!-- note --~}}` |
| high | Covered | Unmatched tag / block recovery | incomplete block or element |
| high | Covered | Broken interleaving of HTML and Handlebars | opening tag inside unmatched block branch |
| medium | Covered | HTML comments containing `{{` and `}}` | `<!-- {{ not a token }} -->` |
| medium | Missing | Recovery from invalid block-partial syntax | `{{#> layout}}` without close |

## Stability and Open-Source Quality

| Priority | Status | Case | Why it matters |
| --- | --- | --- | --- |
| release-blocker | Partial | Idempotence on heavy fixtures | Formatter must settle after one pass. |
| high | Missing | Round-trip stability on large fixture corpus | Needed before trying real repos. |
| high | Covered | Cross-platform newline normalization | Prevent noisy diffs across OSes. |
| high | Covered | Unicode and non-Latin text fixtures | Open-source usage will include Cyrillic, CJK, emoji, entities. |
| high | Missing | Parser fuzzing / crash-resistance corpus | Safety net for malformed templates. |
| medium | Missing | Fixture corpus from real public templates | Best way to avoid overfitting to handcrafted tests. |

## Next Moves

1. Keep the GitHub-issue-inspired conformance cases green as formatter behavior evolves.
2. Start collecting anonymized real-world `.hbs` fixtures and add them as idempotence tests.
3. Decide the remaining policy for `{{else if ...}}`, non-inline decorators, and embedded JS/CSS formatting.
4. Expand malformed block-partial recovery coverage before calling the parser stable.

The living backlog of concrete edge-case inputs sits in `test/conformance-cases.ts`.
