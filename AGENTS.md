# Ciao Digital Signage Agent Development Guide

## Scope

This repository supports AI-assisted development for a semi-agnostic player with 100% web and HTML5 compatibility on modern Chrome.

Primary goals:

- Fast onboarding of external web apps through a lightweight SDK model.
- Safe hosting inside player runtime without leaking tenant secrets.
- Optional internal adapters for high-risk business integrations.

## Governance References

Before proposing or implementing changes, align with these project policies:

- Versioning and release channels: `docs/governance/VERSIONING.md`
- Public milestones: `docs/governance/MILESTONES.md`
- Changelog process: `CHANGELOG.md`
- Contribution and PR workflow: `CONTRIBUTING.md`
- Community and moderation guidelines: `docs/governance/COMMUNITY.md`
- License policy (non-commercial model): `docs/governance/LICENSE-POLICY.md`

When opening or triaging work items, prefer GitHub Issues with clear labels and milestone assignment.

## Platform Constraints

- Runtime target: Chrome modern web platform.
- Content host model: iframe sandbox by default.
- No native plugin requirement in P0/P1.
- Chrome extension integration is allowed only for specific hardware that is not supported by standard web APIs.

## Decision Framework For New Integrations

1. Low-risk, read-only data app:

- Build as external web app.
- Integrate via asset.webapp.
- Use SDK handshake and host events.

1. Business-critical or sensitive integration:

- Build internal adapter UI inside Ciao domain.
- Keep third-party credentials server-side.
- Expose only tokenized or proxied APIs to player app.

1. Unclear risk:

- Start external in sandbox behind feature flag.
- Promote to internal adapter only if governance or SLA requires it.

## Mandatory Security Rules

- Never ship third-party API keys in frontend code.
- Use server-side proxy or token exchange endpoints.
- Use allowlist domains per tenant or org.
- Enforce iframe sandbox profiles.
- Emit app health and lifecycle logs.
- Provide kill switch per app assignment.

## AI-Assisted Delivery Workflow

Use this sequence for each new app connector:

1. Define use case contract:

- Inputs
- Outputs
- Failure modes
- Interaction mode (passive or interactive)

1. Create app integration card in planning docs:

- App id
- Owner
- Tenant constraints
- Security profile

1. Generate starter implementation:

- App shell UI
- SDK bridge usage
- Host lifecycle handling

1. Add server-side integration:

- Proxy endpoint or token exchange endpoint
- Validation and rate limiting

1. Add player runtime mapping:

- asset.webapp node support
- watchdog config and fallback behavior

1. Add CMS assignment flow:

- Playlist item or fixed asset assignment
- Scope assignment to screen, group, or org

1. Add tests:

- API tests for integration endpoint
- E2E smoke for player rendering and interaction
- Runtime recovery tests

## Issue And Milestone Flow

- Use GitHub Issue templates for bug reports and feature requests.
- Link each issue to one milestone (`M0`, `M1`, `M2`, `M3` or later).
- Keep one owner per issue and one clear acceptance criteria list.
- For release-bound work, track status in `docs/governance/MILESTONES.md` and `CHANGELOG.md`.

## Definition Of Done For Connector Apps

- App runs in player and loads within timeout budget.
- No secret appears in browser network payload from frontend source.
- Health and error telemetry emitted.
- Kill switch disables app assignment in runtime.
- E2E smoke passes on Chrome project.

## Pilot Selected

Current recommended pilot:

- Google Calendar Connector with custom UI.
- Start with read-only timeline view from a public calendar path or server-proxied API.
- Add authenticated API key mode only through backend proxy.
