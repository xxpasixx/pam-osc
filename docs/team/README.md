# Team perspectives

> One file per dev: `docs/team/<firstname>.md`. `/review PROJ-X as:<firstname>` runs an extra review pass through that person's eyes — a simulated colleague review for products that get built solo.
>
> **Perspective, not code style.** These files describe what you *look for*, never how code should be written — `AGENTS.md` stays the one canonical convention file. Findings from a lens pass are always labeled as simulated from your written profile, never presented as your actual opinion.
>
> **How to join:** copy the skeleton below into `<yourname>.md`, fill it in (~20–30 lines, the section ideas are prompts — keep what fits, drop the rest), send it to the template maintainer to commit. Update it whenever your focus shifts.

---

# <Name>

_One or two lines: who you are and what you mostly build._

## What I always check in a review

_Ideas: data ownership and integration boundaries · every error path handled · access rules at the data layer · "will this survive two years of nobody touching it" · accessibility · performance on slow devices · naming that tells the truth_

## My pet peeves

_Ideas: silent catch blocks · clever one-liners · copy-pasted logic · TODO comments without an owner · mocks left in · configuration nobody documented_

## My blind spots

_Be honest — this makes the lens useful: what do you tend to overlook? Frontend polish? Test coverage? Docs? The happy path working but nothing else tested?_

## Questions I'd ask the builder

_Ideas: "what happens when this input is empty?" · "who else reads this data?" · "how do we notice when it breaks?" · "why not the boring solution?"_
