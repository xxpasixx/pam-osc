# Feature Specifications

One folder per feature: `PROJ-X-feature-name/` (kebab-case). In `INDEX.md` the "Spec" column points to the folder.

## The files in a feature folder

Each file has one owner-skill, so nothing drifts:

- **`spec.md`** — the CONTRACT (WHAT). Always exists. Owner: `/spec` (also created inline by `/build` for small things). Lite by default: Why, 3–7 acceptance criteria with AC-IDs, Out of Scope. Full (user stories, edge cases, decision log) for risk work. Read-only during `/build`. Updates are **deltas** — append/edit, never rewrite, never renumber IDs.
- **`design.md`** — the technical design (HOW). Exists **when it helps**: integrations, shared data model, moving parts — and always for risk work. Owner: `/design`. Holds the decisions with alternatives and trade-offs, and optionally a Build Plan for parallel work.
- **`review.md`** — the verdict. Owner: `/review`. Pass/fail per AC-ID, code-review findings, security results, bugs with severity, ship yes/no.

## AC-IDs are the traceability backbone

Every acceptance criterion gets a stable ID (`AC-1`, `AC-2`, …), every edge case too (`EC-1`, …). `review.md` verifies per AC-ID — that's the chain: **AC → Test**. Written as Given/When/Then in the project's spec language (see `AGENTS.md` → Spec Language):

```markdown
- [ ] **AC-1** — Given [a starting state], when [the user acts], then [the observable result]
```

Unresolved ambiguity is marked inline as `[NEEDS CLARIFICATION: …]` — never silently guessed.

## Status

Tracked in `INDEX.md`: **Roadmap → Spec'd → Building → In Review → Approved → Live** — plus two terminal states: **Cancelled** (stopped before Live, row stays with a reason) and **Retired** (was Live, taken down — date and data fate noted). The one hard gate: features touching money, credentials/auth, or personal data need full spec + design + review before Live.

## Git is the source of truth for implementation details

Implementation details live in commits (`git log --grep="PROJ-1"`). No changelog files.
