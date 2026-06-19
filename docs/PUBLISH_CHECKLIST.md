# Publish Checklist

## Already Prepared

- public npm package name is chosen: `@poliklot/prettier-plugin-handlebars`
- open-source license is chosen: `MIT`
- package exports and CommonJS entry are defined in `package.json`
- build and test scripts are green
- public OSS corpus sweep is available through `npm run corpus:oss`
- deterministic malformed-template fuzzing is available through `npm run fuzz:parser`
- `prepublishOnly` runs the safety checks before publish
- `npm pack --dry-run` is available through `npm run pack:check`
- CI runs build, tests, and package inspection
- npm publishing is automated through GitHub Actions Trusted Publishing
- README now documents install and usage
- parser / printer / corpus scripts stay in one repository

## Release Flow

Before a regular release:

1. run `npm run check`
2. run `npm run pack:check`
3. run `npm run fuzz:parser` when changing parser / recovery behavior
4. run `npm run corpus:oss`
5. format temp copies of representative real projects with `npm run format:hbs-tree -- <copy>` and run their own build / test commands
6. merge the Release Please PR for the next `0.x`
7. let the GitHub Actions Trusted Publishing workflow publish the release tag

Manual fallback:

If a GitHub release already exists but npm was not published, re-run the `Publish npm` workflow in GitHub Actions with the release tag. Do not run `npm publish` locally.

## Nice-To-Haves After First Publish

- issue templates for formatting regressions
- scheduled public corpus smoke checks
