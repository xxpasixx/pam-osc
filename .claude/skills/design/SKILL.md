---
name: design
description: Write the technical design for a feature (design.md) — decisions in plain language, no code. Optional for simple features; required when the work has integrations, a shared data model, moving parts, or touches money/credentials/personal data.
argument-hint: "PROJ-X"
user-invocable: true
---

# Design

## Goal
Translate a spec into a design a non-technical stakeholder can approve and `/build` can implement without guessing — component structure, data model, access rules, and justified decisions. Plain language, never code.

**Design is optional by design.** Skip it for simple features — `/build` can work straight from the spec. It earns its place when the feature has integrations, a data model others depend on, moving parts (queues, webhooks, syncs), or hits the risk gate (money/credentials/personal data → design is required, not optional).

## CRITICAL Rule
NEVER write code or show implementation details — no code in any language, no queries, no API snippets. WHAT gets built and WHY, not HOW in detail.

## Precision Bar (no code ≠ vague)
`design.md` has two readers: the PM, who must approve it, and `/build`, which implements directly against it. Code-free but **implementation-grade precise**:
- Name every field, its type, and its constraints (e.g. "Title — text, max 200 chars, required").
- State states/enums explicitly (e.g. "Status is one of: To Do, Done").
- Make access and ownership explicit (who can see/do what) — if it's missing, `/build` will invent it.
- Define error and empty behaviors where they affect the design.

"Plain language" does not mean "somewhere", "etc.", or hand-waving. If `/build` needs a detail to implement, write it even if the PM doesn't need it to approve.

## Before Starting
1. Read `features/PROJ-X-*/spec.md` (the ACs the design must cover) and `features/INDEX.md`
2. Read `docs/data-model.md` — this feature's data design fits that map, and you keep the map current
3. Check the existing code surface (`git ls-files` per `AGENTS.md` → Project Structure)

No spec yet → "Run `/spec PROJ-X` first — the design needs ACs to work from." Unresolved `[NEEDS CLARIFICATION]` markers in the spec → stop and list them; a design built on marked ambiguity just moves the guessing to `/build`.

## Use Available Domain Skills
When the feature integrates a service or platform that has a vetted skill installed, load it **here, at design time** — best practices for services are mostly architectural (integration pattern, auth model, webhook/idempotency strategy). Let it shape the *decision*, state the decision in plain language, record it in the Technical Decisions log with the best practice as rationale. A live-docs MCP is a bonus; nothing installed → design from the spec, don't block.

## Align with the App-Wide Data Model
`docs/data-model.md` is the shared map of entities and relationships. Reuse its entities instead of inventing parallel ones; if this feature adds or changes an entity, relationship, or ownership, **update the map** (product altitude — no column types). Detailed schema goes in this feature's `design.md`. If the map turns out wrong in a way that affects other features, flag it — don't silently diverge.

## Produce the design
Write `features/PROJ-X-*/design.md` to the shape in [template.md](template.md) — worked examples per section:
- **A) Component Structure** — visual tree of the parts (skip without an interface)
- **B) Data Model** — every field, type, constraints, ownership, where stored (Precision Bar)
- **C) Behaviors & Access** (backend features) — operations + who-can-do-what; the contract `/build` builds against
- **D) Tech Decisions** — WHY, justified for a PM
- **E) Dependencies** — packages with a one-line purpose
- **F) Build Plan (optional)** — only when the build is big enough for parallel work or multiple sessions: leveled tasks (data → logic → interface, adapted to the project type), each with the files it touches and the AC-IDs it serves. `/build` derives its own plan when this section is absent.

Log every meaningful choice in the **Technical Decisions** table (Decision · Rationale · Alternative considered · Trade-off · Date). Unresolvable questions → Open Questions in `spec.md`. Ideas that don't belong here → `docs/ideas.md`.

## Checklist
- [ ] No unresolved `[NEEDS CLARIFICATION]` markers; every AC covered by the design
- [ ] All sections to the Precision Bar; data design fits `docs/data-model.md` (map updated if entities changed)
- [ ] Technical Decisions logged with alternative + trade-off; domain skills consulted for integrations
- [ ] `design.md` saved; user approved

## Handoff
> "Design approved. Run `/build` to implement PROJ-X."

## Git Commit
```
docs(PROJ-X): design for [feature name]
```
