# ICF Company Context

> **How to use this file:** stable facts about ICF Zürich's IT live here, committed into every project that starts from this template. Volatile detail (project lists, licenses, people, ops) lives in Notion behind the links at the bottom — follow a link when you need current state, don't copy it in here. Keep this file under ~150 lines.

## Who we are

ICF Zürich is a church. The IT ministry builds and runs the digital services, products, and infrastructure that support the staff and the church — and aims to be a pioneer in shaping church digitally. Most software serves one of three audiences: staff, volunteers, or the wider church community.

## The 3-layer IT model

Every system, product, and project is assigned to one layer:

| Layer | Name                    | Examples                                                                                                         |
| ----- | ----------------------- | ---------------------------------------------------------------------------------------------------------------- |
| **1** | Platform & Foundation   | Identity/auth (Keycloak), devices, office & hall infrastructure, Google Workspace, collaboration tools           |
| **2** | Church Business Systems | Salesforce (hub), PCO (Sunday operations), finance (Abacus, FinDock/give.icf.ch, Spendenformular), kids check-in |
| **3** | Digital Products        | Website & Hub, Huulo (Event + Church), Prayer App, event websites, small tools                                   |

Work is organized in tracks `1.01`–`3.10` (Identity & Access … Digital Products) — see the Projects database in Notion.

## Architecture principles (from "Landscape Rome")

1. **Federated data sovereignty.** Every system is owner of and responsible for its own data. There is **no single "source of truth" system** — only systems with goals, and data that serves those goals.
2. **Owner vs consumer.** When two systems seem to know the same thing, one is the owner and the other consumes via sync — never two parallel truths.
3. **Current owners:** Salesforce → people, households, groups, donations, journey progress. PCO → service schedules, volunteer/worship planning. Huulo → events & offer discovery. Hub → content shared between ICF locations. Prayer App → prayer content.
4. **No unnecessary sync.** Syncs are built only where another system has a goal that needs the data — sync is an ingredient, not a default.
5. **Typed integration roles.** Every system relationship has exactly one explicit role: data source, consumer, or manipulator.
6. **Hard rule: Salesforce never writes into PCO.**

## Engineering defaults (custom products)

- **Stack:** Next.js + TypeScript is the default for web products; hosted on **DigitalOcean App Platform**, secrets in DO environment variables, never client-side.
- **Repos:** GitLab (`gitlab.com/icf-zh`) is the primary home for product code; GitHub (`201people`) hosts shared templates.
- **Forms:** Fillout (business-editable), writing into Salesforce staging objects — forms never read data.
- **Integration motto:** _if we code, we code; if we want flows, business users click them together_ (Make is the clicks lane — don't build a hybrid).
- **Guarded-zone rule:** code that holds a credential, computes a price, or defines a contract is **guarded** — slow, reviewed, tested. Code that only renders read-only data is **free** — may be AI-generated and churn without ceremony. Enforce the split by repo structure, not discipline.
- **Salesforce work** follows its own process (request → requirements → kickoff → build & ~2-week testing → go-live), documented on Salesforce Home in Notion. This template does not govern declarative Salesforce work — only the code repos that integrate with it.
- **Spec language:** team documentation is mixed German/English; each project records its choice in `AGENTS.md → Spec Language` at `/init`.

## The documentation ladder (minimum docs per repo)

Documentation scales with the repo — but a minimum **always** exists. Risk overrides size: anything touching **money, credentials, or personal data** moves up at least one tier regardless of how small it is.

| Tier                   | Trigger                                                               | Required documentation                                                                                                                                                      |
| ---------------------- | --------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **0 — always**         | Every repo, even a one-script tool                                    | A README answering: **why does this repo exist, what problem does it solve, why did we build it ourselves, and is it live (since when)?** Use `docs/readme-template.md`.    |
| **1 — spec**           | More than one script, or any real behavior others rely on             | Tier 0 + a `spec.md`: what it must do, in acceptance-criteria form (can be short). In template-based repos, `/spec` or `/build` produces this (lite spec → build → review). |
| **2 — architecture**   | Integrations, a data model, or moving parts (queues, webhooks, syncs) | Tier 1 + a design/architecture doc (`design.md`): systems touched, who owns what data, guarded zones, key decisions with reasons.                                           |
| **3 — full framework** | Big repo, multiple people working on it                               | Tier 2 + this spec-driven workflow (features/, AC→Test) and a written development strategy / AI-framework choice — in the repo, or a link to its Notion page.               |

A repo may reference its architecture on Notion instead of in-repo (like the Booking Katalog does), but the README must carry the link — nothing should require tribal knowledge to locate.

The ladder is the minimum for **any** repo, template or not. Once the spec-driven template is installed, its lite-spec floor applies on top (and satisfies Tier 1); maintenance churn that changes no observable behavior stays spec-free via `/maintenance`.

## Notion links (volatile detail lives there)

- [IT Home](https://app.notion.com/p/1353d2f4a7a48080ad82ca65a880590f) — entry point for everything IT
- [Landscape Rome](https://app.notion.com/p/2b73d2f4a7a480988411ef4fd8efb6f4) — the architecture landscape project
- [Architektur-Vision](https://app.notion.com/p/33c3d2f4a7a481639b26d717e630a9cc) — data-sovereignty principles (canonical)
- [Systems](https://app.notion.com/p/3593d2f4a7a4812cbe3ddc03120370e5) — system map by layer, with per-system pages
- [Projects database](https://app.notion.com/p/1353d2f4a7a481239f7afbfd291d0b3f) — all IT projects, status, priorities
- [Products and Services database](https://app.notion.com/p/1353d2f4a7a480f7b155c5f635112216) — every product/service incl. self-built (Eigenprodukte)
- [Salesforce Home](https://app.notion.com/p/2e64d121867b4ee5899c1df1cb1a9dc7) — Salesforce process, documentation, licenses
