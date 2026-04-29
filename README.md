# @poliklot/prettier-plugin-handlebars

[![npm version](https://img.shields.io/npm/v/@poliklot/prettier-plugin-handlebars.svg)](https://www.npmjs.com/package/@poliklot/prettier-plugin-handlebars)

Prettier plugin for classic Handlebars templates with mixed HTML markup.

It is built for `.hbs` / `.handlebars` codebases that use classic Handlebars patterns such as:

- HTML + Handlebars in the same tree
- partials and long partial params
- helpers with positional params, hash params, and nested subexpressions
- block partials and inline partial definitions
- `{{else if ...}}` branch chains
- block helpers inside attributes
- Handlebars inside quoted and unquoted attribute values
- multiline `class=""` values with helpers
- whitespace control markers
- raw Handlebars blocks
- raw `script` / `style` sections
- whitespace-sensitive `pre` / `textarea` content
- malformed or half-written templates that should be preserved safely
- root-level plain-text templates such as `Hello, {{name}}!`

## Install

```bash
npm install --save-dev prettier @poliklot/prettier-plugin-handlebars
```

## Quick Start

Recommended config:

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

The explicit override keeps `.hbs` files on this plugin even in Prettier versions that also know about other Handlebars-like parsers.

## Configuration Patterns

### 1. Minimal plugin setup

Use this only when you have verified that your Prettier version and editor resolve `.hbs` files to this plugin. The explicit override below is safer for shared projects.

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
npx prettier --write "src/**/*.{hbs,handlebars}" --plugin @poliklot/prettier-plugin-handlebars --parser handlebars
```

Local plugin build:

```bash
npx prettier --write "src/**/*.{hbs,handlebars}" --plugin ../prettier-plugin-handlebars/dist/plugin.js --parser handlebars
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
- `{{mustache}}`, `{{{triple-stash}}}`, block helpers, `{{else}}`, `{{else if ...}}`, partials
- whitespace control markers such as `{{~ value ~}}` and `{{~/if~}}`
- raw blocks such as `{{{{raw}}}}...{{{{/raw}}}}`
- block partials such as `{{#> layout}}...{{/layout}}`
- inline partial definitions such as `{{#*inline "name"}}...{{/inline}}`
- Handlebars inside attribute values
- unquoted mustache attribute values such as `src={{ imgSrc }}`
- Handlebars blocks that emit attributes
- multiline class formatting with conditional modifiers
- comparison helper operators such as `{{#ifCompare a '===' b}}`
- hash params written as `key=value`, `key= value`, or `key = value`
- long helper and partial calls with nested subexpressions
- `prettier-ignore`, `prettier-ignore-start`, `prettier-ignore-end`
- root-level plain-text templates with inline mustaches
- raw `script` / `style` text preservation
- literal `pre` / `textarea` text preservation
- unmatched / incomplete structures preserved as raw nodes instead of crashing
- recovery for some broken formatter output, such as split dynamic attribute names

## Real-World Examples

### `else if` chains

```hbs
{{#if primary}}
  Primary
{{else if secondary}}
  Secondary
{{else}}
  Fallback
{{/if}}
```

### Conditional class values

```hbs
<div
  class="
    card
    {{#if isPrimary}}
      card--primary
    {{else if isSecondary}}
      card--secondary
    {{/if}}
  "
></div>
```

### Partial params with relaxed spacing

```hbs
{{> 'ui/input-primary/input-primary'
  id='compare-family-name'
  type='text'
  placeholder='Family name'
}}
```

The parser accepts common source styles such as `id= 'value'` and `type = 'text'`, then prints them consistently as hash params.

### Classic comparison helpers

```hbs
{{#ifCompare ../activeIndex '===' @index}}
  active
{{/ifCompare}}
```

Operators like `'==='`, `'!=='`, `'>'`, and `'<'` are kept as positional params instead of being mistaken for hash pairs.

## Current Limits

This is still a `0.x` formatter.

The highest-priority unsupported or not-yet-finished areas include:

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
- `npm run corpus:oss` - clone and check a public OSS corpus from Ghost themes, Ghost classic templates, WET, `express-hbs`, `pillarjs/hbs`, and other real `.hbs` projects
- `npm run format:hbs-tree -- <path>` - format every `.hbs` / `.handlebars` file under a temp project copy before running that project's own build
- `PRETTIER_VERSION=3.2 npm run smoke:install` - pack the plugin, install it into a clean temp project, format a sample, and verify that `handlebars` is not installed
- `npm run pack:check` - inspect npm package contents with `npm pack --dry-run`

## VS Code Companion

If you work with Handlebars in VS Code, try [HBS Master](https://marketplace.visualstudio.com/items?itemName=poliklot.hbs-master) as a companion extension. It pairs well with this formatter and makes day-to-day `.hbs` editing more comfortable.

## Notes

- This README is intentionally self-contained so it works well on npm too.
- If your editor does not format `.hbs` on save, the safest setup is an explicit `overrides` rule with `parser: "handlebars"`.
