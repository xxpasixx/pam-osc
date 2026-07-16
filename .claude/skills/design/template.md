# PROJ-X — Design

**Date:** YYYY-MM-DD

> The technical design (HOW). Two readers: the PM (approves) and `/build` (implements against it). No code — but implementation-grade precise: every field with type and constraints, ownership/access stated, states explicit. Owner: `/design`. The contract (WHAT) lives in `spec.md`.

## Component Structure

Visual tree of the parts needed (skip for features without an interface):

```
Main Page
+-- Input Area (add item)
+-- Board
|   +-- "To Do" Column
|   |   +-- Task Cards (draggable)
|   +-- "Done" Column
|       +-- Task Cards (draggable)
+-- Empty State Message
```

## Data Model

Plain language, no code — every field with type and constraints, who owns each record:

```
Each task has:
- Unique ID
- Title (text, max 200 characters, required)
- Status (one of: To Do, Done)
- Created timestamp
- Belongs to: one user (the creator)

Access: users can only see and change their own tasks.
Stored in: locally on the device (no server needed)
```

## Behaviors & Access

_Backend features only — delete for frontend-only features._ The operations and their access rules; this is the contract `/build` builds the API against:

```
Operations:
- Create a task — any logged-in user; Title required, max 200 chars
- List tasks — returns only the current user's tasks
- Update a task's status — only the task's owner
- Delete a task — only the task's owner

Rejected when: not logged in, or acting on someone else's task.
```

## Tech Decisions

WHY each tool/approach, in plain language a PM can follow:

- _Example:_ Data stays on the device because there are no user accounts and nothing needs to sync.

## Dependencies

- `package-name` — what it does and why we need it

## Build Plan (optional)

_Only when the build is big enough for parallel work or multiple sessions — otherwise delete this section and `/build` plans inline._ Levels run sequentially; `[P]` tasks within a level touch **disjoint files** and may run in parallel:

```
Level 1 — Data:      T1      users table + access rules            · files: path/a  · → AC-1, AC-3
Level 2 — Logic:     T2 [P]  login endpoint                        · files: path/b  · → AC-1
                     T3 [P]  logout endpoint                       · files: path/c  · → AC-4
Level 3 — Interface: T4      login form incl. error/loading states · files: path/d  · → AC-2, EC-1
```

## Technical Decisions

| Decision | Rationale | Alternative considered | Trade-off | Date |
| --- | --- | --- | --- | --- |
| Client-side storage over a hosted database | No user accounts needed; data is device-local | Hosted database | No cross-device sync; data lost if storage is cleared | YYYY-MM-DD |

## Open Questions

- [ ] Open technical question that still needs an answer
