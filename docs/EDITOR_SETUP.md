# Editor Setup

The plugin works through Prettier. Editors must be configured so Prettier is selected as the formatter for `.hbs` / `.handlebars` files and can resolve the plugin from the project.

## VS Code

Install:

- [Prettier - Code formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode)
- Optional companion extension: [HBS Master](https://marketplace.visualstudio.com/items?itemName=poliklot.hbs-master)

Recommended workspace settings:

```json
{
  "editor.formatOnSave": true,
  "prettier.documentSelectors": ["**/*.hbs", "**/*.handlebars"],
  "[handlebars]": {
    "editor.defaultFormatter": "esbenp.prettier-vscode"
  }
}
```

Recommended Prettier config:

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

If VS Code still does not format files, open the Prettier output panel and check whether it is using the workspace Prettier package.

## WebStorm / PhpStorm / other JetBrains IDEs

1. Install `prettier` and `@poliklot/prettier-plugin-handlebars` in the project.
2. Open **Settings → Languages & Frameworks → JavaScript → Prettier**.
3. Point **Prettier package** to the local `node_modules/prettier` package.
4. Enable **Run on save** for `.hbs` / `.handlebars` if desired.
5. Keep the explicit `overrides` rule in your Prettier config.

If the IDE formats the file as plain HTML, run the CLI command below to verify that project config is correct:

```bash
npx prettier --check "**/*.{hbs,handlebars}"
```

## Neovim / Vim

Use the local project Prettier binary and pass the file path so Prettier can resolve config and parser overrides.

Example command for formatter plugins:

```bash
./node_modules/.bin/prettier --stdin-filepath template.hbs
```

If your formatter does not pass `--stdin-filepath`, use explicit plugin and parser args:

```bash
./node_modules/.bin/prettier \
  --plugin @poliklot/prettier-plugin-handlebars \
  --parser handlebars
```

## CLI sanity check

When an editor behaves differently from the terminal, use this as the source of truth:

```bash
npx prettier --write "**/*.{hbs,handlebars}"
```

If that command works, the plugin is configured correctly and the remaining problem is editor resolution.
