# @poliklot/prettier-plugin-handlebars

[![npm version](https://img.shields.io/npm/v/@poliklot/prettier-plugin-handlebars.svg)](https://www.npmjs.com/package/@poliklot/prettier-plugin-handlebars)

Prettier plugin for classic Handlebars templates with mixed HTML markup.

It is built for `.hbs` / `.handlebars` codebases that use classic Handlebars patterns such as:

- HTML + Handlebars in the same tree
- partials and long partial params
- block partials and inline partial definitions
- block helpers inside attributes
- multiline `class=""` values with helpers
- whitespace control markers
- raw Handlebars blocks
- raw `script` / `style` sections
- whitespace-sensitive `pre` / `textarea` content
- malformed or half-written templates that should be preserved safely

## Install

```bash
npm install --save-dev prettier @poliklot/prettier-plugin-handlebars
```

## Quick Start

Minimal config:

```js
/** @type {import("prettier").Config} */
module.exports = {
  plugins: ["@poliklot/prettier-plugin-handlebars"],
};
```

Once the plugin is loaded, Prettier can infer `.hbs` and `.handlebars` files by extension.

## Configuration Patterns

### 1. Minimal plugin setup

Use this when your editor already resolves the plugin correctly.

```js
/** @type {import("prettier").Config} */
module.exports = {
  plugins: ["@poliklot/prettier-plugin-handlebars"],
};
```

### 2. Explicit Handlebars override

Use this when you want stable format-on-save behavior in editors, or when your project mixes multiple template types.

```js
/** @type {import("prettier").Config} */
module.exports = {
  plugins: ["@poliklot/prettier-plugin-handlebars"],
  overrides: [
    {
      files: ["*.hbs", "*.handlebars"],
      options: {
        parser: "handlebars",
      },
    },
  ],
};
```

### 3. Explicit Handlebars override with project style

Normal Prettier options still work and often matter a lot for `.hbs`.

```js
/** @type {import("prettier").Config} */
module.exports = {
  plugins: ["@poliklot/prettier-plugin-handlebars"],
  overrides: [
    {
      files: ["*.hbs", "*.handlebars"],
      options: {
        parser: "handlebars",
        printWidth: 120,
        useTabs: true,
        tabWidth: 4,
        singleQuote: true,
        htmlWhitespaceSensitivity: "ignore",
      },
    },
  ],
};
```

### 4. Local plugin path during dogfooding

Useful when you are testing the plugin from a neighboring repository before publishing a new npm version.

```js
/** @type {import("prettier").Config} */
module.exports = {
  plugins: ["../prettier-plugin-handlebars/dist/plugin.js"],
  overrides: [
    {
      files: ["*.hbs", "*.handlebars"],
      options: {
        parser: "handlebars",
      },
    },
  ],
};
```

### 5. JSON config

```json
{
  "plugins": ["@poliklot/prettier-plugin-handlebars"],
  "overrides": [
    {
      "files": ["*.hbs", "*.handlebars"],
      "options": {
        "parser": "handlebars",
        "printWidth": 120,
        "useTabs": true,
        "tabWidth": 4
      }
    }
  ]
}
```

## CLI

Published package:

```bash
npx prettier --write "src/**/*.{hbs,handlebars}" --plugin @poliklot/prettier-plugin-handlebars
```

Local plugin build:

```bash
npx prettier --write "src/**/*.{hbs,handlebars}" --plugin ../prettier-plugin-handlebars/dist/plugin.js
```

## API

```js
const prettier = require("prettier");
const plugin = require("@poliklot/prettier-plugin-handlebars");

async function run(source) {
  return prettier.format(source, {
    filepath: "template.hbs",
    parser: "handlebars",
    plugins: [plugin],
  });
}
```

## Plugin Options

### `dataAttributeOrder`

Custom ordering override for `data-*` attributes.

```json
{
  "plugins": ["@poliklot/prettier-plugin-handlebars"],
  "dataAttributeOrder": ["data-testid", "data-state", "data-track"]
}
```

### `maxEmptyLines`

Maximum number of consecutive blank lines preserved between nodes.

```json
{
  "plugins": ["@poliklot/prettier-plugin-handlebars"],
  "maxEmptyLines": 1
}
```

## What The Plugin Handles Today

- HTML elements, void elements, comments, and custom elements
- `{{mustache}}`, `{{{triple-stash}}}`, block helpers, `{{else}}`, partials
- whitespace control markers such as `{{~ value ~}}` and `{{~/if~}}`
- raw blocks such as `{{{{raw}}}}...{{{{/raw}}}}`
- block partials such as `{{#> layout}}...{{/layout}}`
- inline partial definitions such as `{{#*inline "name"}}...{{/inline}}`
- Handlebars inside attribute values
- Handlebars blocks that emit attributes
- multiline class formatting with conditional modifiers
- `prettier-ignore`, `prettier-ignore-start`, `prettier-ignore-end`
- raw `script` / `style` text preservation
- literal `pre` / `textarea` text preservation
- unmatched / incomplete structures preserved as raw nodes instead of crashing
- recovery for some broken formatter output, such as split dynamic attribute names

## Current Limits

This is still a `0.x` formatter.

The highest-priority unsupported or not-yet-finished areas include:

- richer formatting for `{{else if ...}}` chains
- decorators outside inline partial definitions
- embedded JavaScript / CSS formatting inside `script` / `style` tags; these sections are preserved safely today
- more dialect-specific syntax outside classic Handlebars, especially Glimmer / Ember-only constructs

## Development

```bash
npm install
npm run build
npm test
```

Useful scripts:

- `npm run build` - compile the plugin into `dist/`
- `npm test` - run the full automated suite
- `npm run check` - build + test
- `npm run corpus:check -- <path> [more-paths...]` - run an idempotence / crash-safety sweep over real template corpora
- `npm run pack:check` - inspect npm package contents with `npm pack --dry-run`

## VS Code Companion

If you work with Handlebars in VS Code, try [HBS Master](https://marketplace.visualstudio.com/items?itemName=poliklot.hbs-master) as a companion extension. It pairs well with this formatter and makes day-to-day `.hbs` editing more comfortable.

## Notes

- This README is intentionally self-contained so it works well on npm too.
- If your editor does not format `.hbs` on save, the safest setup is an explicit `overrides` rule with `parser: "handlebars"`.
