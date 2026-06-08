# Release Automation

This repository uses GitHub Actions for dependency updates, release PRs, npm publishing, and security scanning.

## Normal release flow

1. Merge normal changes to `master` using Conventional Commit prefixes such as `fix:` and `feat:`.
2. `Release Please` opens or updates a release PR that bumps `package.json`, `CHANGELOG.md`, and `.release-please-manifest.json`.
3. Review and merge the release PR.
4. `Release Please` creates the GitHub release and tag.
5. The npm publish job checks out that tag, verifies `package.json.version` matches it, runs package checks, and publishes to npm.

## npm publishing credentials

The publish workflow is ready for npm Trusted Publishing and also supports a classic npm automation token.

Preferred setup:

- Configure npm Trusted Publishing for this package.
- Use repository `Poliklot/prettier-plugin-handlebars`.
- Use workflow `.github/workflows/publish-npm.yml`.
- Use environment `npm`.

Fallback setup:

- Add a repository secret named `NPM_TOKEN` with an npm automation token.

## Manual publish fallback

If a GitHub release already exists but npm was not published, run the `Publish npm` workflow manually and pass the release tag, for example `v0.2.14`.

The workflow refuses to publish if the tag and `package.json.version` do not match.
