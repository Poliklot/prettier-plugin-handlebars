# Changelog

All notable changes to `@poliklot/prettier-plugin-handlebars` are documented here.

This project follows the spirit of [Keep a Changelog](https://keepachangelog.com/), while staying in the `0.x` range until formatter behavior is hardened across more real-world Handlebars and Mustache-compatible templates.

## Unreleased

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

