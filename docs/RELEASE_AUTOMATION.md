# Release Automation

This repository uses GitHub Actions for dependency updates, release PRs, npm Trusted Publishing, and security scanning.

## Normal release flow

1. Merge normal changes to `master` using Conventional Commit prefixes such as `fix:` and `feat:`.
2. `Release Please` opens or updates a release PR that bumps `package.json`, `CHANGELOG.md`, and `.release-please-manifest.json`.
3. Review and merge the release PR.
4. `Release Please` creates the GitHub release and tag.
5. `Release Please` dispatches the standalone `Publish npm` workflow with the new tag and version.
6. Approve the protected `npm` environment deployment when prompted.
7. The publish workflow checks out the tag, verifies `package.json.version` matches it, runs package checks, and publishes to npm through Trusted Publishing provenance.

The publish workflow is dispatched instead of being called as a reusable workflow. npm Trusted Publishing validates the calling workflow filename, so publishing must run directly from `.github/workflows/publish-npm.yml`, which is the workflow registered with npm.

## npm publishing credentials

Publishing is Trusted Publishing-only. Do not publish locally and do not configure an npm automation token fallback.

Required setup:

- Configure npm Trusted Publishing for this package.
- Use repository `Poliklot/prettier-plugin-handlebars`.
- Use workflow `.github/workflows/publish-npm.yml`.
- Use environment `npm`.

## Manual publish fallback

If a GitHub release already exists but npm was not published, run the `Publish npm` workflow manually and pass the release tag, for example `v0.2.14`.

The workflow refuses to publish if the tag and `package.json.version` do not match.

## Dependency release commits

Dependabot npm pull requests use `deps:` for production dependencies and `deps(dev):` for development dependencies. Release Please treats `deps` commits as releasable patch changes, so merging a dependency PR opens or updates the release PR without a manual commit-message override.
