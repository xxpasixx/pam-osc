# Security Rules

## Secrets Management

- NEVER commit secrets, API keys, or credentials to git
- A pre-commit hook (`.githooks/pre-commit`, activated by `/init` via `git config core.hooksPath .githooks`) blocks staged secrets, env files, key material, conflict markers, and blobs >1 MB. It's a safety net, not the gate — never suggest `--no-verify` except for a confirmed false positive
- Real env files (`.env`, `.env.local`, …) hold the user's private keys and are permission-blocked — never read, edit, or create them. If a write is denied, do **not** retry; that's by design.
- The `.example` variant (`.env.example`, `.env.*.example`) is the one kind of env file you may read and write. When a feature needs a new variable, add a **placeholder** line there so it's documented.
- To put a real value into an env file, ask the user in chat — state the exact key and where to get the value. The user pastes it themselves. Never write the real value yourself.

## Input Validation

- Validate ALL user input on the server/backend side — never trust client-side validation alone
- Sanitize data before it reaches storage

## Authentication & Access

- Verify identity before processing requests
- Enforce access rules at the data layer, not only in the UI — the data layer is the second line of defense
- Rate-limit or otherwise protect authentication endpoints against abuse

## Sensitive Data in URLs

- NEVER put credentials, tokens, session IDs, or PII in a URL or query string — they leak into browser history, server logs, and `Referer` headers
- Forms or requests carrying sensitive fields (passwords, tokens) must use a request body (POST), never a query string (GET)

## Code Review Triggers

- Any change to access-control policies requires explicit user approval
- Any change to the authentication flow requires explicit user approval
- Any new environment variable must be documented in the project's `.env.example` variant
