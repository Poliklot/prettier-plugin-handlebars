# Core extraction plan

The shared template-formatting core now lives in the external package [`template-format-core`](https://github.com/Poliklot/template-format-core). This repository keeps Handlebars-specific dialect rules and consumes the shared core as a dependency.

## Current status

Completed:

1. **Internal core boundary**
   - Source range helpers, input normalization, HTML-ish tag metadata, whitespace helpers, expression tokenization, and dialect contracts were first isolated inside this repository.

2. **Internal dialect boundary**
   - Handlebars token scanning and token classification moved into `src/dialects/handlebars/*`.
   - The parser calls dialect rules for delimiter-aware scanning, raw-block handling, block expressions, block prefixes, and recovery decisions.
   - The printer calls dialect rules for tag delimiters, block prefixes, else tags, close tags, partial prefixes, decorator prefixes, and comment markers.

3. **External core package**
   - The neutral core modules moved to `template-format-core`.
   - This plugin imports shared helpers from `template-format-core` instead of local `src/core/*` files.

## Next work

1. **Stabilize Handlebars on the external core**
   - Keep `.hbs` / `.handlebars` behavior unchanged.
   - Keep semantic render, corpus, and fuzz checks green.

2. **Build `prettier-plugin-mustache`**
   - Use `template-format-core`.
   - Add Mustache-specific dialect rules separately from Handlebars rules.
   - Support `.mustache` without mixing Mustache semantics into this Handlebars plugin.

## Core vs dialect boundary

Core owns infrastructure:

- source ranges and input normalization;
- HTML-ish tag metadata;
- whitespace and indentation helpers;
- template expression tokenization primitives;
- template dialect contracts.

Dialect packages own semantics:

- Handlebars block forms, decorators, block partials, and `else if`;
- Mustache sections, inverted sections, delimiter changes, parents, and blocks;
- dialect-specific whitespace and recovery decisions.
