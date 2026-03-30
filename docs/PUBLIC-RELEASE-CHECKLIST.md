# Public Release Checklist

Use this checklist before publishing this repository publicly.

## 1. Secrets and Sensitive Data

- Verify no credentials, API keys, private tokens, or private host details are committed.
- Check example files use placeholders only.
- Rotate any credential that may have appeared in history.

## 2. Internal Material

- Keep internal planning and runbooks out of public commits.
- Exclude private operational docs and machine-specific deployment scripts.
- Ensure `.planning/` and private runbooks are not part of the release branch.

## 3. Public Documentation Baseline

- README is updated and accurate for external contributors.
- LICENSE is present and aligned with intended usage model.
- CONTRIBUTING, SECURITY, CODE_OF_CONDUCT are present.
- ROADMAP is high-level and public-safe.

## 4. Legal and Licensing Review

- Confirm license text with legal advisor if required.
- Ensure trademark and branding usage is defined.
- Confirm third-party dependencies and assets are redistributable.

## 5. Technical Hygiene

- Run `npm run typecheck`
- Run `npm run lint`
- Run `npm run test`
- Validate app startup with `npm run dev`

## 6. Release Branch Preparation

- Create a dedicated `public-release` branch.
- Remove or move internal-only files before merge.
- Review diff manually before pushing.

## 7. Optional Governance Setup

- Add issue templates and PR template in `.github/`.
- Enable branch protection and required checks.
- Define maintainer triage workflow.
