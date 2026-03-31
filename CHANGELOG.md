# Changelog

All notable changes to this project will be documented in this file.

This format is based on Keep a Changelog.

## [Unreleased]

### Added

- Structured public documentation baseline (README, CONTRIBUTING, SECURITY, CODE_OF_CONDUCT, ROADMAP)
- Versioning protocol documentation and release scripts
- Exclusive player monitor session lock (`token + HttpOnly cookie`) with server-side ownership enforcement for `/player` socket and public player APIs

## [0.2.1-alpha.1] - 2026-03

### Changed

- Registration onboarding now auto-creates one organization for the new user
- New signup flow assigns creator role (`owner`) and activates the organization in session
- Organization naming at signup uses user name plus a random 4-digit suffix

### Security

- Self-service organization creation enabled for alpha with one-organization-per-user limit

## [0.1.0-alpha.1] - 2026-03

### Bootstrap

- Initial public-ready baseline for Ciao Digital Signage repository
- First pre-release channel setup (`alpha`)
