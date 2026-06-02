# Core extraction plan

This repository remains the source of truth for the first extraction phase. The goal is to make the shared formatting pieces real inside the Handlebars plugin before moving them into a separate package.

## Order of work

1. **Internal core boundary**
   - Keep the published Handlebars plugin API unchanged.
   - Move dialect-neutral helpers into `src/core/*`.
   - Keep Handlebars-specific parsing and printing behavior in the current plugin.
   - Require the existing Handlebars tests, semantic render checks, and fuzz checks to stay green.

2. **Internal dialect boundary**
   - Define dialect contracts in `src/core/template/*`.
   - Move Handlebars token scanning and token classification into `src/dialects/handlebars/*`.
   - Make the parser call the dialect for delimiter-aware scanning, raw-block handling, block expressions, and block prefixes.
   - Make the printer call the dialect for tag delimiters, block prefixes, else tags, close tags, partial prefixes, decorator prefixes, and comment markers.
   - Keep the AST and formatter output unchanged while making room for a Mustache dialect.

3. **External core package**
   - Move stable `src/core/*` modules into a separate repository/package.
   - Keep the package name dialect-neutral.
   - Do not publish a Mustache plugin until the Handlebars plugin can consume the extracted core.

4. **Rebuild Handlebars on the extracted core**
   - Replace local core imports with the external core package.
   - Preserve the current `.hbs` / `.handlebars` behavior.
   - Add compatibility tests to prove the package boundary did not change formatting.

5. **Build `prettier-plugin-mustache`**
   - Use the extracted core.
   - Add Mustache-specific dialect rules separately from Handlebars rules.
   - Start with `.mustache` support only after the core package is proven by Handlebars.

## Core vs dialect boundary

Core should own infrastructure:

- source ranges and input normalization;
- HTML-ish tag metadata;
- whitespace and indentation helpers;
- template expression tokenization primitives;
- shared parser/printer utilities once they are stable enough.

Dialect packages should own semantics:

- Handlebars block forms, decorators, block partials, and `else if`;
- Mustache sections, inverted sections, delimiter changes, parents, and blocks;
- dialect-specific whitespace and recovery decisions.
