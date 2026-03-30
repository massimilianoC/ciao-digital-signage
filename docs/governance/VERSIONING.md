# Versioning Strategy

This project uses a practical hybrid model:

- SemVer 2.0.0 for compatibility and tooling
- Pre-release channels for incremental delivery (`alpha`, `beta`, `rc`)
- Optional date suffix on Git tags for release traceability

## 1. Canonical Version Format

Canonical project version (in package.json):

- `MAJOR.MINOR.PATCH`
- Pre-release: `MAJOR.MINOR.PATCH-alpha.N`, `-beta.N`, `-rc.N`

Examples:

- `0.1.0-alpha.1`
- `0.1.0-alpha.2`
- `0.1.0-beta.1`
- `0.1.0-rc.1`
- `0.1.0`

## 2. Date-Aware Release Tag (Optional)

For release visibility, use a Git tag with build metadata date:

- `v<version>+YY.MM`

Examples:

- `v0.1.0-alpha.1+26.03`
- `v0.1.0-rc.1+26.04`
- `v0.1.0+26.05`

Notes:

- Build metadata (`+26.03`) does not affect SemVer precedence.
- Keep `package.json` version canonical without date suffix.

## 3. Human-Friendly Alias Mapping

If you want a short notation like `0.1a-26-03`, map it as:

- `0.1a-26-03` -> `0.1.0-alpha.1+26.03`
- `0.1b-26-04` -> `0.1.0-beta.1+26.04`
- `0.1rc1-26-04` -> `0.1.0-rc.1+26.04`

Use this only in communication notes or release titles, not as canonical package version.

## 4. Channel Rules

- `alpha`: fast iteration, unstable APIs allowed
- `beta`: feature-complete for milestone, bugfix-focused
- `rc`: release candidate, only critical fixes
- `stable`: production release

## 5. Milestone Coupling

Suggested lifecycle:

1. Milestone kickoff -> `alpha`
2. Milestone feature freeze -> `beta`
3. Milestone stabilization -> `rc`
4. Milestone close -> stable

## 6. Release Checklist

1. Update [CHANGELOG.md](CHANGELOG.md)
2. Confirm roadmap/milestone status
3. Run quality checks
4. Bump version
5. Create Git tag
6. Publish release notes

## 7. Standard Commands

Version bump helpers (from package scripts):

- `npm run release:alpha`
- `npm run release:beta`
- `npm run release:rc`
- `npm run release:stable`

Tag helper preview:

- `npm run release:tag:preview`

Create date-aware tag manually:

- `git tag v0.1.0-alpha.1+26.03`
- `git push origin v0.1.0-alpha.1+26.03`
