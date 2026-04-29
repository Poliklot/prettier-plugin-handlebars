# Open Source Readiness

This project stays in the "prove it on ugly templates" phase between releases.

For every serious formatter release, we should hold it to a stricter bar than "formats the happy path":

- `npm run build` must stay green.
- `npm test` must stay green in non-watch mode.
- `npm run corpus:oss` should stay green before meaningful formatter releases.
- formatting must be idempotent: `format(format(input)) === format(input)`.
- semantic render checks should compare Handlebars output before and after formatting for whitespace-sensitive cases.
- malformed input must not crash the parser or synthesize surprising markup.
- unsupported Handlebars syntax must be an explicit policy decision, not an accidental failure mode.

## Status Legend

- `Covered`: there is explicit automated coverage today.
- `Partial`: some coverage exists, but the behavior is fragile or already known to regress.
- `Missing`: no trustworthy automated coverage yet, or the parser almost certainly does not support the construct.

## Release Blockers

| Priority | Status | Case | Why it matters |
| --- | --- | --- | --- |
| release-blocker | Covered | Mustache spacing inside attributes | Covered by regression tests and real project sweeps. |
| release-blocker | Partial | Inline-vs-multiline element decisions | A formatter that flips layout unexpectedly will feel unsafe in large repos. |
| release-blocker | Covered | Block-scoped attributes with conditional branches | Real templates often gate multiple attrs behind `if` / `ifEquals`. |
| release-blocker | Covered | Handlebars whitespace control `~` | Very common in production HBS and whitespace-sensitive templates. |
| release-blocker | Covered | Raw blocks `{{{{raw}}}} ... {{{{/raw}}}}` | Must not be misparsed as regular blocks. |
| release-blocker | Covered | Block partials `{{#> layout}} ... {{/layout}}` | Common in larger Handlebars ecosystems. |
| release-blocker | Covered | Inline partial definitions `{{#*inline "x"}}` | Needed for reusable partial-heavy codebases. |
| release-blocker | Covered | Root-level plain-text templates with mustaches | Must not turn `Hello, {{name}}!` into different rendered text. |
| release-blocker | Covered | `script` / `style` content containing closing tags in strings | Raw-text parsing skips quoted closing-tag lookalikes. |
| high | Covered | Embedded JavaScript / CSS formatting for plain `script` / `style` tags | Uses Prettier embed for safe raw-text children and falls back to preservation otherwise. |
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
| medium | Covered | `else if` style constructs | `{{else if cond}}` |
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
| medium | Covered | Attribute values containing `>` or `<` in strings | `data-json='{"html":"<b>"}'` |
| medium | Covered | Self-closing custom elements policy | `<x-thing />` |

## Comments, Ignore, and Recovery

| Priority | Status | Case | Example |
| --- | --- | --- | --- |
| high | Covered | Multiline Handlebars comments | `{{!-- ... --}}` |
| high | Covered | `prettier-ignore` directives | `prettier-ignore`, `-start`, `-end` |
| high | Partial | Comments containing embedded mustaches | `{{!-- <span>{{ price }}</span> --}}` |
| high | Covered | Comments with trim markers and weird spacing | `{{~!-- note --~}}` |
| high | Covered | Unmatched tag / block recovery | incomplete block or element |
| medium | Covered | Invalid closing tags on void elements are preserved safely | `<br></br>` |
| high | Covered | Broken interleaving of HTML and Handlebars | opening tag inside unmatched block branch |
| medium | Covered | HTML comments containing `{{` and `}}` | `<!-- {{ not a token }} -->` |
| medium | Missing | Recovery from invalid block-partial syntax | `{{#> layout}}` without close |

## Stability and Open-Source Quality

| Priority | Status | Case | Why it matters |
| --- | --- | --- | --- |
| release-blocker | Covered | Idempotence on heavy fixtures | Formatter must settle after one pass. |
| high | Covered | Round-trip stability on large fixture corpus | Covered by internal projects and public OSS sweeps. |
| high | Covered | Render-output stability on semantic fixtures | Handlebars runtime tests compare output before and after formatting. |
| high | Covered | Cross-platform newline normalization | Prevent noisy diffs across OSes. |
| high | Covered | Unicode and non-Latin text fixtures | Open-source usage will include Cyrillic, CJK, emoji, entities. |
| high | Missing | Parser fuzzing / crash-resistance corpus | Safety net for malformed templates. |
| medium | Covered | Fixture corpus from real public templates | Best way to avoid overfitting to handcrafted tests. |

## Public OSS Corpus

Run the public corpus sweep before meaningful formatter releases:

```bash
npm run build
npm run corpus:oss
```

By default, the script clones shallow copies into `OSS_CORPUS_ROOT` or
`<system-temp>/hbs-oss-corpus` and checks:

- `handlebars-lang/handlebars.js`
- `TryGhost/Ghost` classic frontend, server, and fixture templates
- `TryGhost/Casper`
- `TryGhost/Source`
- `TryGhost/London`
- `TryGhost/Editorial`
- `TryGhost/Massively`
- `TryGhost/express-hbs`
- `pillarjs/hbs`
- `wet-boew/wet-boew`
- `ActiveCampaign/mailmason`
- `electron/electronjs.org-old`
- `godofredoninja/simply`
- `godofredoninja/Mapache`
- `kathyqian/crisp`

It treats classic Handlebars roots as the blocking release corpus. Ghost admin
templates are run separately as a Glimmer / Ember stress pass, because that
dialect is useful for crash-safety but is not the plugin's compatibility target.

The `pillarjs/hbs` fixture `test/4.x/views/bad_layout.hbs` is intentionally
invalid (`{{title}` / `{{{body`) and is ignored only for the idempotence gate.
The `handlebars-lang/handlebars.js` artifact `spec/artifacts/bom.handlebars`
is an exact raw-source fixture for BOM / no-final-newline behavior. Do not use
that file as a project build-formatting target unless it is intentionally
excluded from formatting.

The corpus sweep is a parser/printer safety gate. For release confidence, also
copy representative projects to a temp directory, run `npm run format:hbs-tree`
against the copy, then run the project's own build or test command. That second
step catches semantic contracts that a pure formatter pass cannot see, such as
engine-specific layout directives or exact rendered-output tests.

## Next Moves

1. Keep the GitHub-issue-inspired conformance cases green as formatter behavior evolves.
2. Keep expanding anonymized real-world `.hbs` fixtures when a project exposes a new edge case.
3. Decide the remaining policy for non-inline decorators and self-closing custom elements.
4. Add fuzzing and more malformed block-partial recovery coverage before calling the parser stable.

The living backlog of concrete edge-case inputs sits in `test/conformance-cases.ts`.
