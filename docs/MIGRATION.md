# Migration Notes

## From ignored `.hbs` files

If your project currently has `.hbs` or `.handlebars` in `.prettierignore`, remove those patterns gradually:

1. Copy the project or branch first.
2. Add the plugin and explicit override.
3. Run `npx prettier --check "**/*.{hbs,handlebars}"`.
4. Format a small directory first.
5. Run the project build or template snapshot tests.

For split layout partials, verify both halves together. The plugin preserves standalone root closing tag indentation in files such as `layout-end.hbs`.

## From plain HTML formatting

If `.hbs` files were previously formatted as HTML, add the explicit parser override:

```json
{
  "plugins": ["@poliklot/prettier-plugin-handlebars"],
  "overrides": [
    {
      "files": ["*.hbs", "*.handlebars"],
      "options": {
        "parser": "handlebars"
      }
    }
  ]
}
```

This avoids HTML parser failures on Handlebars-only constructs such as partials, block helpers, attribute helpers, and raw blocks.

## From another Handlebars formatter

Run the formatter on a temporary copy first:

```bash
cp -R ./project ./project-format-check
cd ./project-format-check
npx prettier --write "**/*.{hbs,handlebars}"
```

Then run the project's own build, render tests, or snapshot tests. A formatter idempotence check is not enough for template engines because layout directives and helper semantics can be project-specific.

## From older `@poliklot/prettier-plugin-handlebars` versions

Upgrade the package, then run the normal check command:

```bash
npm install --save-dev @poliklot/prettier-plugin-handlebars@latest
npx prettier --check "**/*.{hbs,handlebars}"
```

Notable behavior hardening in recent versions:

- multiline Handlebars comments inside opening tags stay stable;
- split layout fragments keep useful child indentation;
- root closing tags in layout end partials keep their standalone indentation;
- malformed or incomplete structures are preserved as raw nodes instead of crashing.
