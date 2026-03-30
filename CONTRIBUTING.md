# Contributing to Ciao Digital Signage

Thanks for your interest in contributing.

## Development Setup

1. Install Node.js 20+.
2. Install dependencies: `npm ci`
3. Start local development: `npm run dev`
4. Run checks before opening a PR:

   - `npm run typecheck`
   - `npm run lint`
   - `npm run test`

## Pull Request Guidelines

1. Keep PRs focused and small when possible.
2. Include a short problem statement and solution summary.
3. Add or update tests for behavior changes.
4. Update docs for user-facing or API changes.

## Issues And Milestones

1. Use GitHub Issue templates (`bug` or `feature request`).
2. Assign one milestone to each issue when the work is release-related.
3. Add labels to classify scope and urgency.
4. Keep acceptance criteria explicit before implementation starts.

Recommended labels:

- `type:bug`
- `type:feature`
- `type:docs`
- `priority:high`
- `priority:medium`
- `priority:low`
- `status:blocked`
- `status:ready`

## Commit Guidance

Use clear, imperative commit messages. Example:

- "Add public roadmap document"
- "Rename product metadata to Ciao Digital Signage"

## Release Flow

1. Follow [VERSIONING.md](docs/governance/VERSIONING.md).
2. Update [CHANGELOG.md](CHANGELOG.md) for each release.
3. Keep milestone status aligned in [MILESTONES.md](docs/governance/MILESTONES.md).
4. For tagged releases, prefer date-aware tags like `v0.1.0-alpha.1+26.03`.

## Security and Secrets

1. Never commit real credentials or private keys.
2. Use `.env.local` for local secrets.
3. Use placeholders in examples.

## License Expectations

This repository is source-available under PolyForm Noncommercial 1.0.0.
Commercial use requires a separate commercial agreement.

Read:

- [LICENSE](LICENSE)
- [LICENSE-POLICY.md](docs/governance/LICENSE-POLICY.md)

## AI-Assisted Contributions

AI-generated code is welcome if reviewed by a human maintainer.
Contributors remain responsible for correctness, licensing, and security.
