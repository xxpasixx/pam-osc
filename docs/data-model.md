# Data Model

> The app-wide map of **what data this product stores and how it connects** — the shared blueprint every feature's tables or objects conform to.
>
> - Created by `/init` (the first holistic pass: entities + relationships).
> - Refined by `/design` as each feature is designed.
> - **Altitude:** entities, relationships, and ownership live here (product-level, anyone can read them). Column types, indexes, and exact foreign keys are decided per feature in that feature's `design.md` — not here.

## Entities

_Each entity is a kind of thing the app stores (a real-world noun). List the ones you know so far with a one-line purpose and who owns or can see it. No column types — just the thing and what it's for._

| Entity | What it represents | Owned by / who can see it |
|--------|--------------------|---------------------------|
| _profiles_ | _A user's account profile_ | _the user themselves_ |
| _..._ | _..._ | _..._ |

## Relationships

_How the entities connect, in plain language. This is where coherence comes from — get the connections right once, up front._

- _A profile has many ..._
- _Each ... belongs to exactly one ..._
- _A ... can have many ..._

## Diagram (optional)

_A simple text sketch of the model, filled in as it firms up._

```
profiles
  └─ owns many ...
        └─ has many ...
```

---

_This is a living document. When `/design` designs a feature that introduces or changes an entity, it updates this map first, so later features build against an accurate picture. Run `/init` to create the first version from your feature map._
