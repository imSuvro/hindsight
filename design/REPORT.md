# Hindsight — premium UI/UX overhaul

Branch `feat/premium-ui-overhaul`, cut from `develop` at `87f74b4`.
Evidence: `design/audit/before/` and `design/audit/after/`, 39 full-page
screenshots each — every route at 360, 768 and 1440, captured by the same
harness (`tests/e2e/audit-capture.spec.ts`) so the pairs are directly
comparable.

---

## What this turned out to be

The brief assumed a default-looking app. It was not one. `src/app/globals.css`
already held a principled token system — meaning-bearing accents, contrast
ratios documented per surface, dark mode stepped rather than flipped, and zero
hardcoded hex values anywhere in the CSS modules.

That system was fully expressed on `/` and `/demo`, and barely expressed on
`/dashboard`, `/review` and `/settings` — the screens a paying user lives in.
**The work was not inventing a look. It was applying one evenly, and building
the structure that had been missing.**

This was surfaced before P2 rather than assumed. Given the choice between
extending the existing system and developing fresh directions, the call was to
develop fresh ones — so three were built against the product's subject and the
strongest was locked as **Meridian**.

---

## Before → after, screen by screen

| Screen               | Before                                   | After                                   |
| -------------------- | ---------------------------------------- | --------------------------------------- |
| Dashboard, populated | `before/11-dashboard-populated-1440.png` | `after/11-dashboard-populated-1440.png` |
| Dashboard, empty     | `before/05-dashboard-empty-1440.png`     | `after/05-dashboard-empty-1440.png`     |
| Review, empty        | `before/07-review-empty-1440.png`        | `after/07-review-empty-1440.png`        |
| Lock confirmation    | `before/10-decision-confirm-1440.png`    | `after/10-decision-confirm-1440.png`    |
| Journal, populated   | `before/12-decisions-populated-1440.png` | `after/12-decisions-populated-1440.png` |
| Landing              | `before/01-landing-1440.png`             | `after/01-landing-1440.png`             |
| Sign-in              | `before/02-sign-in-1440.png`             | `after/02-sign-in-1440.png`             |
| Sample journal       | `before/03-demo-1440.png`                | `after/03-demo-1440.png`                |
| How scoring works    | `before/04-how-scoring-works-1440.png`   | `after/04-how-scoring-works-1440.png`   |
| Journal, empty       | `before/06-decisions-empty-1440.png`     | `after/06-decisions-empty-1440.png`     |
| Settings             | `before/08-settings-1440.png`            | `after/08-settings-1440.png`            |
| Record a decision    | `before/09-decision-new-1440.png`        | `after/09-decision-new-1440.png`        |
| Decision detail      | `before/13-decision-detail-1440.png`     | `after/13-decision-detail-1440.png`     |

Each also exists at `-360` and `-768`.

### The four that matter most

**Dashboard, populated.** Was: an onboarding card reading _"START HERE"_ and
_"Write my first decision"_ directly beneath a heading reading _"3 decisions
recorded"_; a calibration card at half the width of the list below it; a table
of five zero rows; roughly a third of a 1440 viewport carrying nothing. Now:
the card knows decisions exist and says so, an instrument rail carries the
running count and the next review date, the calibration block spans its
container, and the reliability diagram's empty frame stands where the paragraph
was.

**Review, empty.** Was: all content in the top-left quadrant, two-thirds of the
viewport blank, a bare button under a dashed box. Now: the rail holds the queue
counts and the next return, and one composed empty state names what will live
there and offers the action that puts it there.

**Lock confirmation.** Was: the entire editable form still on screen above
_"This is what gets sealed"_ — the one irreversible moment in the product,
competing with the form it was meant to replace. Now: the summary alone, and
the seal itself is the product's one orchestrated moment.

**The empty diagram frame.** The signature change. A journal below the display
threshold now shows the instrument with nothing on it — axes, grid, the
perfect-calibration diagonal — rather than a paragraph explaining its absence.

---

## Changes by phase

### P0 · Recon — `ae13337`

Capture harness built first so before and after would be comparable. All routes
walked at three widths. Console clean before any change. `design/AUDIT.md`
records journeys, screen inventory, eight ranked frictions and where the
three-second test failed.

### P1 · Product

Target user, core problem, emotional target and one primary action per screen,
added to `AUDIT.md`. Eight UX fixes listed, two marked **PENDING** and
surfaced rather than implemented on assumption.

### P2 · Design lock — `1b15834`

Three directions developed against the product's subject: **Meridian**
(celestial navigation — you take a sighting, the true position arrives later),
**Assay** (metallurgy, cut for landing on the cream-and-terracotta cliché the
brief bans and for an adversarial register), **Signal** (monochrome brutalist,
cut because one accent cannot carry the belief-versus-reality distinction).

`DESIGN.md` committed **before any implementation**. It also shipped
`scripts/palette-check.mjs` — the validator the old tokens referenced but never
shipped — which recomputes every contrast, dichromat-separation and chroma
claim from the hex values. It caught the first Meridian palette at 19.9 ΔE
against a 25 ΔE bar, so the accents were re-derived by search rather than by
eye.

### P3 · Foundations — `68ce338`

Tokens implemented as CSS custom properties, extending the existing mechanism
rather than adding a parallel one. Type swapped to Fraunces / IBM Plex Sans /
IBM Plex Mono, all `display: swap`. Added the instrument rail to `PageShell`
and the surface primitives — `Card`, `SectionHead`, `EmptyState`, `RailPanel`,
`RailRow`, `Skeleton`. Buttons gained a danger variant and a loading state that
keeps its label and its width.

### P4 · Overhaul — `9aa1468`, `3d35131`

Dashboard and review rebuilt on the chart column. Onboarding copy made
state-aware. Timezone line reframed from discrepancy to confirmation. Domain
table stops rendering five rows of zeroes. The seal moment added. Width scale
introduced as tokens and ten components migrated off hardcoded measures
(`refactor(ui)` with a `design-amendment:` body, per DESIGN.md's own rule —
itself corrected, because the prefix it originally specified is rejected by the
repository's commitlint).

### P5 · QA — `efe6544`, `abf2fc5`

Per-route smoke spec: every route loads, shows the one thing it exists to show,
and says nothing to the console — at desktop and mobile. Plus a
horizontal-overflow guard and a rail-behaviour spec.

**The accessibility suite caught a real regression**, which is the most useful
thing that happened in this phase. `DecisionList` set its confidence figure in
`--belief`, a colour tuned to the 3:1 bar graphics clear rather than the 4.5:1
bar words clear. The old mark colour happened to clear both, so the component
had been written against a coincidence rather than a rule. Seven files were
doing it. All fixed, and the rule is now **enforced** — `palette-check.mjs`
scans every stylesheet and fails the build, verified by reintroducing the exact
regression and watching it fail.

### P6 · Dark mode and deep QA

**Dark mode.** `AUDIT_SCHEME=dark` re-runs the whole capture under
`prefers-color-scheme: dark`, so both modes now have the same evidence rather
than one having numbers and the other having screenshots. It held with no fixes
needed.

**Edge cases.** Fifteen probes over the inputs and unhappy paths the journey
specs do not reach. Confirmed already-correct: markup stored as text and never
executed, emoji and Bengali round-tripping through the ledger intact,
confidence accepted at exactly 1 and 99, titles capped at 140, whitespace-only
input treated as empty, unknown and malformed decision ids answered with 404
rather than 500, and the CSV export prefixing every cell a spreadsheet would
otherwise execute.

**The second half of the loop had no end-to-end coverage at all.** Review dates
are forward-only in the form, so nothing can become due inside a test run —
reading a due decision and recording what happened was proven only at the
repository layer. `makeDue` shifts a review date in the materialised view so
the real interface can be driven, and four specs now cover it: answering
through the UI, the chain staying intact across an outcome, an answered
decision moving the score, and an unsettled outcome staying out of the score
rather than being quietly counted as a miss.

**Two real fixes came out of it.** The submit button was disabled with no
stated reason, which is a dead end and announces as only "dimmed" to a screen
reader — it now names the missing field through `aria-describedby`. And the
seeding helper's own documentation was wrong in a way the tests caught: see
below.

---

## Test summary

| Gate                           | Result                                                                                                      |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| Playwright, 3 consecutive runs | **122 passed, 0 failed** each time (4 skipped = the capture harness, correctly inert without `AUDIT_PHASE`) |
| Console errors                 | **Zero**, before and after (`design/audit/*-console.md`)                                                    |
| Unit + integration             | **162 passed**, 14 files                                                                                    |
| Typecheck                      | Clean                                                                                                       |
| Lint `--max-warnings=0`        | Clean                                                                                                       |
| Prettier                       | Clean                                                                                                       |
| Palette validator              | **40 checks + stylesheet scan, all pass**                                                                   |
| axe WCAG 2.1 A/AA              | Clean on every audited route, both widths                                                                   |
| Horizontal overflow            | ≤1px on every audited route, 360 and 1440                                                                   |

`palette-check.mjs` now runs in the CI quality job, so `DESIGN.md`'s claim that
it does is true rather than aspirational.

---

## PENDING — surfaced, not implemented

1. **Retiring the onboarding card automatically once a decision exists.**
   `showOnboarding` is `!journal.onboarded || decisions.length === 0`, so the
   panel outlives the first decision until dismissed. The _contradiction_ is
   fixed — the copy is state-aware — but changing the visibility rule is
   behaviour, not styling, and was not in scope without sign-off.

2. **`/review` populated and `/decisions/[id]` due have specs but no
   screenshots.** `makeDue` closed the _testing_ gap — four specs now drive
   those states through the real interface — but the capture harness still does
   not shoot them, so there is no before/after pair. Wiring `makeDue` into the
   capture run would close it.

3. **Toast primitive not built.** `DESIGN.md` specifies one; nothing in the
   product currently raises a transient message, and adding an unused component
   is worse than not having it. The standard is written down for whoever needs
   it first.

---

## Next steps

- Shoot the due states so the screenshot pairs are complete; the specs exist.
- Consider the `showOnboarding` change once someone owns that call.
- `Skeleton` is built and used nowhere. The screens are server-rendered, so
  there is no client loading state to fill; it will earn its place the first
  time something streams.
- `makeDue` writes to the materialised view, which is why specs using it assert
  on `chain` problems rather than an intact record. If a legitimate
  past-dated append is ever needed, doing it through the ledger would remove
  that caveat.
