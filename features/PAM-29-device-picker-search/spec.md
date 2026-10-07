# PAM-29 — Search in the add-device board picker

> Lite spec, written inline during build (2026-07-27).

## Why

The bundled board list has grown past ten entries (plus user boards); finding the right one by scrolling gets slow. A search box in the "Add device — pick the board" step keeps the flow fast.

## Acceptance Criteria

- **AC-1** The board step of the add-device dialog shows a search input (autofocused) that filters the board list live, case-insensitive, matching name, manufacturer, or board id.
- **AC-2** An empty query shows the full list (unchanged behavior); a query with no matches shows a clear "no board matches" empty state.
- **AC-3** Pressing Enter while exactly one board matches picks that board.
- **AC-4** Invalid catalog files stay listed when the query is empty and are hidden while searching (they have no searchable board data).
- **AC-5** `BoardInfo` carries the device's `manufacturer` so the filter can match it.

## Out of Scope

- Searching mappings (step 2) — mapping lists per board are short.
- Fuzzy matching / ranking — substring match is enough at this scale.
