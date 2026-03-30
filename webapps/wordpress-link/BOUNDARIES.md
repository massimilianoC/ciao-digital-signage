# WordpressLink Boundaries

- No third-party secrets in player payloads.
- Auth credentials are stored server-side in `webapp_secrets_refs`.
- Public player endpoint is token-gated and read-only.
- Remote HTML fields are sanitized before rendering text.
- Per-request timeout and `itemsPerPage` limits protect runtime from oversized responses.
