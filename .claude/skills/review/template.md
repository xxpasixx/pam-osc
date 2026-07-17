# Review Report Template

Content of the standalone file `features/PROJ-X-*/review.md`:

```markdown
# Review — PROJ-X

**Reviewed:** YYYY-MM-DD
**Where tested:** [test environment]
**Reviewer:** Review (AI)

### Acceptance Criteria

- [x] AC-1: [criterion] — pass
- [ ] AC-2: [criterion] — BUG-1

### Edge Cases

- [x] EC-1: handled correctly

### Code Review

- [notable findings: correctness, design-match, validation, simplicity — or "clean"]

### Security (red team)

- [x] Auth: no bypass found; [x] Authorization: cross-user access denied
- [x] Injection attempts blocked; [x] No secrets in client artifacts
- [x] No credentials/PII in URLs; [x] Auth endpoints rate-limited
- [ ] BUG: [security finding]

### E2E (critical journeys, optional)

- Status: **not run** — or one line per journey: journey (AC-IDs) — test file — pass/fail

### Bugs

**BUG-1: [title]**

- **Severity:** Critical | High | Medium | Low
- **Steps to reproduce:** 1. … 2. …
- **Expected / Actual:** …

### Verdict

- **ACs:** X/Y passed · **Bugs:** N (C/H/M/L) · **Security:** pass / findings
- **Ship:** YES / NO — [one line why]
```
