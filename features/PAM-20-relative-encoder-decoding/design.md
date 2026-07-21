# PAM-20 — Design

## Decision: add a `mode` to the encoder's `encoding`, don't touch the ranges

`controlSchema` (encoder) currently carries
`capabilities.encoding = { increment: {from,to}, decrement: {from,to}, ledRing? , push? }`.
We add an optional `mode: "range" | "signed"` that **defaults to `"range"`**, and
make `increment`/`decrement` optional but **required when `mode === "range"`**
(enforced by a `superRefine`). Additive with a default → every existing device
file (all X-Touch encoders) keeps parsing and behaving exactly as before, so no
`formatVersion` bump (AC-1).

- `range` (default): today's `relativeDetents(value, increment, decrement)`.
- `signed`: new `signedDetents(value)` — the Akai two's-complement scheme.

## `signedDetents` (AC-2)

```
value === 0            → undefined  (no change → engine ignores, like range)
1 <= value <= 63       → value            (+1 … +63)
64 <= value <= 127     → value - 128      (−64 … −1)
```

`0x7F`(127) → −1, `0x40`(64) → −64. Verbatim from the APC40 Mk2 Communications
Protocol v1.2 "Relative Controller" table.

## Routing (AC-3)

`input-router.handleCcEntry` already turns encoder detents into executor/attribute
moves. Only the **decode** call changes: pick `signedDetents` vs `relativeDetents`
by `control.capabilities.encoding.mode`. Everything downstream (accumulator,
`/Page/FaderN`, `/EncoderN` above `MA3_KNOB_THRESHOLD`, `amount` scaling) is
unchanged, so direction + magnitude follow AC-3 for free.

Cue Level → executor **211** (< `MA3_KNOB_THRESHOLD` = 300) → only the fader
accumulator path runs (relative nudge of the executor fader), which is exactly
the intended "cue level knob nudges executor 211" behaviour.

## Device/mapping (AC-4)

`apc-40-mk2.json`: add `cue-level` (CC `0x2F`=47) and `tempo-knob` becomes an
`encoder` (CC `0x0D`=13), both `encoding.mode = "signed"`. (Tempo was a `fader`
placeholder before; it is genuinely a relative encoder.) The mapping binds
`cue-level → executor 211`; `tempo-knob` stays unmapped (no obvious MA target).

## Implementation Notes

- `signedDetents` lives in `v1-compat.ts` beside `relativeDetents` (it is new
  behaviour, not v1 parity, and is labelled as such).
- The `push` capability and `ledRing` stay under `encoding`? No — they are
  siblings of `encoding` on the encoder capability, untouched.
