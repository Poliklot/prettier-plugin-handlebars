# Troubleshooting

This guide covers the problems people usually hit when adding `@poliklot/prettier-plugin-handlebars` to an existing project.

## Prettier does not format `.hbs` files

Use an explicit override. It is the most reliable setup across Prettier versions, editors, package managers, and monorepos.

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

Then verify from the command line:

```bash
npx prettier --check "**/*.{hbs,handlebars}"
```

If CLI works but the editor does not, the issue is usually editor configuration, not the plugin itself. See [Editor Setup](./EDITOR_SETUP.md).

## `Cannot find package '@poliklot/prettier-plugin-handlebars'`

Install both Prettier and the plugin in the same project where formatting runs:

```bash
npm install --save-dev prettier @poliklot/prettier-plugin-handlebars
```

For pnpm:

```bash
pnpm add -D prettier @poliklot/prettier-plugin-handlebars
```

For Yarn:

```bash
yarn add -D prettier @poliklot/prettier-plugin-handlebars
```

Avoid relying on a global install. Most editors resolve Prettier and its plugins from the current workspace.

## Prettier uses the wrong parser

Pass the parser explicitly while debugging:

```bash
npx prettier --write "src/**/*.hbs" \
  --plugin @poliklot/prettier-plugin-handlebars \
  --parser handlebars
```

If that works, keep the explicit override in your config.

## `.hbs` files are skipped

Check `.prettierignore` for patterns such as:

```gitignore
*.hbs
**/*.hbs
*.handlebars
src/views/**/*.hbs
```

If those patterns exist, Prettier will skip matching templates even when the plugin is configured correctly.

You can audit the project with:

```bash
npx @poliklot/prettier-plugin-handlebars init
```

The command prints a dry-run report by default and warns about ignored Handlebars files.

## VS Code says there is no formatter for Handlebars

Install the official Prettier extension and add document selectors:

```json
{
  "prettier.documentSelectors": ["**/*.hbs", "**/*.handlebars"],
  "[handlebars]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

Also make sure the project has a local `prettier` and `@poliklot/prettier-plugin-handlebars` in `devDependencies`.

## pnpm or monorepo plugin resolution issues

Put the Prettier config close to the package that owns the `.hbs` files, and install the plugin in that package or in the workspace root used by the editor.

If the editor still cannot resolve the plugin, test the exact workspace from a terminal:

```bash
cd path/to/workspace
npx prettier --check "**/*.{hbs,handlebars}"
```

If the terminal command works, point the editor to the same workspace folder.

## Dynamic template code breaks formatting

The plugin is intentionally conservative around incomplete markup, dynamic attribute names, and Handlebars inside `script` / `style` tags. If a specific block must stay byte-for-byte untouched, use Prettier ignore comments:

```hbs
{{! prettier-ignore }}
<div   class="keep   exactly"></div>
```

Or a range ignore:

```hbs
{{!-- prettier-ignore-start --}}
<script>
  window.data = {{ rawJson }};
</script>
{{!-- prettier-ignore-end --}}
```

## Debug checklist

1. `npm ls prettier @poliklot/prettier-plugin-handlebars`
2. `npx prettier --check "**/*.{hbs,handlebars}" --plugin @poliklot/prettier-plugin-handlebars --parser handlebars`
3. Confirm `.hbs` / `.handlebars` are not ignored in `.prettierignore`.
4. Confirm the editor uses the workspace Prettier installation.
5. Run `npx @poliklot/prettier-plugin-handlebars init` for a setup report.
