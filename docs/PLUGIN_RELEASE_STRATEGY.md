# Plugin Release Strategy

## Short Answer

Do not split this into two separate repositories right now.

The parser, printer, corpus runner, and regression tests are still evolving together. If we split too early, we will create version skew and double the release overhead before the public API is even stable.

## Recommended Path

Keep one repository and publish one npm package first: the Prettier plugin itself.

That means:

- this repository stays the source of truth;
- the published package should be plugin-facing, not parser-facing;
- the parser remains an internal implementation detail for now;
- the printer, parser, and tests continue to version together.

## Why This Is The Best First Release

### 1. The parser is not the product yet

Right now the thing users actually need is:

- install package;
- point Prettier at `.hbs`;
- get stable formatting.

That is a plugin product, not a parser product.

### 2. The parser and printer are tightly coupled

Most recent fixes were not "parser-only" or "printer-only". They were behavior fixes across:

- AST shape;
- multiline expression handling;
- attribute block formatting;
- inline vs multiline layout heuristics;
- corpus-driven safety guarantees.

Splitting repos now would make every release slower and risk mismatched versions.

### 3. One corpus, one CI, one version is much safer

For open source, the important contract is:

- no crashes;
- idempotent formatting;
- predictable output on ugly templates.

That contract is easiest to protect when the whole stack ships together.

## Packaging Recommendation

### Phase 1: Single package, single repo

Use this repository as the plugin repository.

Recommended package direction:

- repo can stay as-is for now;
- npm package should eventually have a plugin-shaped name like `prettier-plugin-hbs` or `prettier-plugin-handlebars`;
- exports should expose the Prettier plugin entry from the package root.

In this phase:

- `src/parser.ts` stays internal;
- `src/printer.ts` stays internal;
- consumers install one package only;
- no separate parser npm package.

### Phase 2: Extract a core package only if there is real demand

If later we actually need standalone parser consumers, then split by package, not by repository.

Do it as a monorepo / workspace inside the same repo:

- `packages/core`
- `packages/prettier-plugin-hbs`

Where:

- `core` exports parser types and parse utilities;
- plugin package depends on `core`;
- fixtures, corpus tools, and integration tests remain in the same repo.

This keeps:

- one issue tracker;
- one test corpus;
- one release workflow;
- no cross-repo coordination tax.

## What I Would Not Do Yet

Do not do this yet:

- separate parser repo;
- separate plugin repo depending on parser repo;
- independent versioning between parser and plugin.

That only makes sense once:

- parser API is intentionally designed;
- external users want parser access without Prettier;
- AST stability becomes a real commitment.

We are not there yet.

## Practical Next Step

The clean next move is:

1. keep this repo as the main repo;
2. tighten package metadata and release flow around the plugin;
3. publish an initial `0.x`;
4. keep parser internals private until usage proves we should extract them.

## Suggested Roadmap

1. Pick the public package name for the plugin.
2. Finalize package exports and README installation instructions.
3. Add CI for `build`, `test`, and corpus smoke checks.
4. Publish `0.x` as experimental but usable.
5. Only after real adoption, decide whether `core` deserves its own package.
