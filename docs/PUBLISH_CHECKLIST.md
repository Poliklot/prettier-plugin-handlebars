# Publish Checklist

## Already Prepared

- public npm package name is chosen: `@poliklot/prettier-plugin-handlebars`
- open-source license is chosen: `MIT`
- package exports and CommonJS entry are defined in `package.json`
- build and test scripts are green
- public OSS corpus sweep is available through `npm run corpus:oss`
- `prepublishOnly` runs the safety checks before publish
- `npm pack --dry-run` is available through `npm run pack:check`
- CI runs build, tests, and package inspection
- README now documents install and usage
- parser / printer / corpus scripts stay in one repository

## Publish Command Flow

For a regular publish:

1. run `npm run check`
2. run `npm run pack:check`
3. run `npm run corpus:oss`
4. format temp copies of representative real projects with `npm run format:hbs-tree -- <copy>` and run their own build / test commands
5. publish the next `0.x`

Example:

```bash
npm publish --access public
```

## Nice-To-Haves After First Publish

- automated npm release workflow
- changelog automation
- issue templates for formatting regressions
- scheduled public corpus smoke checks
