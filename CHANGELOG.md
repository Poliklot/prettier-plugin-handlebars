# Changelog

All notable changes to `@poliklot/prettier-plugin-handlebars` are documented here.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/), while staying in the `0.x` range until formatter behavior is hardened across more real-world Handlebars and Mustache-compatible templates.

## Unreleased

## [0.2.17](https://github.com/Poliklot/prettier-plugin-handlebars/compare/prettier-plugin-handlebars-v0.2.16...prettier-plugin-handlebars-v0.2.17) (2026-06-29)


### deps

* **dev:** update development dependencies ([0147c20](https://github.com/Poliklot/prettier-plugin-handlebars/commit/0147c20f0810a108e8ca14029daa5defc3ceb7c2))

## [0.2.16](https://github.com/Poliklot/prettier-plugin-handlebars/compare/prettier-plugin-handlebars-v0.2.15...prettier-plugin-handlebars-v0.2.16) (2026-06-22)


### Bug Fixes

* make hbs-prettier-init a direct init shortcut ([3e747bf](https://github.com/Poliklot/prettier-plugin-handlebars/commit/3e747bf63081e24fc3491b4b332c77c30977d76d))

## [0.2.15](https://github.com/Poliklot/prettier-plugin-handlebars/compare/prettier-plugin-handlebars-v0.2.14...prettier-plugin-handlebars-v0.2.15) (2026-06-11)


### Bug Fixes

* include node types for TypeScript 6 ([d18e31c](https://github.com/Poliklot/prettier-plugin-handlebars/commit/d18e31c87473ec6c3fb1deccc886774c8d4f0ffe))

## 0.2.14 - 2026-06-03

### Changed

- Switched shared formatter infrastructure to the external `template-format-core` package.
- Bumped the external formatter core dependency to `template-format-core@^0.1.1`.

## 0.2.13 - 2026-06-01

### Added

- Added project setup guidance for editor integrations and common Prettier plugin resolution problems.
- Added migration notes for upgrading from ad-hoc Handlebars formatting, ignored `.hbs` files, or older package versions.
- Added an `init` command that can audit a project, create or update JSON Prettier config, and warn when `.hbs` / `.handlebars` files are ignored.
- Added support for Mustache inheritance parent templates: `{{< layout}}...{{/layout}}`.
- Added support for Mustache block overrides inside parent templates: `{{$title}}...{{/title}}`.
- Added coverage for slash-separated parent names, dynamic parent names, multiline override bodies, incomplete parent recovery, and the Moodle-style drawer template from issue #39.

### Fixed

- Stopped formatting Mustache block override openings such as `{{$title}}` as simple mustache statements like `{{ $title }}`.
- Kept parent templates expanded instead of collapsing multiple override blocks and comments into one unreadable line.
