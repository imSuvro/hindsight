# Hindsight — design system

**Status: locked.** Every value below is law. Amendments land as
`refactor(ui):` commits whose body opens with `design-amendment:` and states
the reason — the repository's commitlint owns the subject line, so the marker
lives in the body where it does not fight it.

Validated by `node scripts/palette-check.mjs`, which recomputes every contrast,
colour-blindness and chroma claim in this document from the hex values
themselves. It exits non-zero on any failure and runs in CI.

---

## Directions considered

Three were developed. All three take the product's actual subject — judging
under uncertainty, then finding out — rather than decorating a dashboard.

### A · Meridian — chosen

Celestial navigation. You take a sighting with an instrument, commit it to the
log, and the true position arrives later. The gap between the two is the whole
craft. That is Hindsight's loop exactly, and it gives the reliability diagram's
perfect-calibration diagonal a real-world name: **the horizon**.

- **Palette** Chart-paper blue-grey by day, night-watch navy after dark.
  Sighting-brass for what you believed, sea-cyan for what happened.
- **Type** Fraunces (display) / IBM Plex Sans (interface) / IBM Plex Mono
  (numbers).
- **Layout** A reading column with a persistent **instrument rail**.
- **Signature** The horizon line.
- **Motion** Instruments settle. Nothing bounces.

### B · Assay — rejected

Metallurgy: testing a claim's purity by fire. Crucible charcoal, ember, cooled
steel. Rejected because the ember-on-warm-stone palette lands squarely on the
cream-and-terracotta cliché this document bans, and the register — trial by
fire — is adversarial where the product needs to feel calm.

### C · Signal — rejected

Near-monochrome brutalist instrument, one electric accent, everything else
graphite. Genuinely distinctive and the strongest "serious tool" read of the
three. Rejected because a single accent cannot carry the belief-versus-reality
distinction, which is the one thing the colour system must do.

---

## The rule that survives from the previous system

**Two accents, and they mean things.** `--belief` is what you said would
happen. `--reality` is what actually happened. They are never used
decoratively, never swapped for emphasis, and never joined by a third data
colour. On the reliability diagram they converge on the horizon when you are
well calibrated, and the distance between them is the finding.

The hues changed. The semantics did not, and must not.

---

## Colour

Light is primary — this is a reading product. Dark is stepped independently
against the night ground, never flipped.

### Light

| Token             | Value     | Role                                              |
| ----------------- | --------- | ------------------------------------------------- |
| `--ground`        | `#eef1f5` | Page. Cool chart paper, never white, never cream. |
| `--surface`       | `#f8fafc` | Cards, raised things.                             |
| `--surface-sunk`  | `#e3e8ef` | Wells, insets, table stripes.                     |
| `--surface-hover` | `#f1f4f8` | Row and card hover.                               |
| `--ink`           | `#10151f` | Body and headings. 17.5:1 on surface.             |
| `--ink-soft`      | `#4a5566` | Secondary prose. 7.2:1.                           |
| `--ink-faint`     | `#5b6675` | Labels, captions. 5.6:1.                          |
| `--rule`          | `#d7dde6` | Hairlines.                                        |
| `--rule-strong`   | `#bcc5d1` | Structural boundaries.                            |
| `--belief`        | `#b06412` | Data mark. 4.3:1 — graphics bar.                  |
| `--belief-ink`    | `#9d570f` | Belief as **text**. 5.3:1.                        |
| `--belief-wash`   | `#f7ecdf` | Belief fill.                                      |
| `--reality`       | `#005f7d` | Data mark. 6.8:1.                                 |
| `--reality-ink`   | `#005f7d` | Reality as text. 6.8:1.                           |
| `--reality-wash`  | `#ddeef4` | Reality fill.                                     |
| `--horizon`       | `#6b7684` | The perfect-calibration diagonal. 4.4:1.          |
| `--danger`        | `#8f3226` | Destructive only. 7.6:1.                          |
| `--danger-wash`   | `#f7e4e0` |                                                   |

### Dark

| Token             | Value     | Role               |
| ----------------- | --------- | ------------------ |
| `--ground`        | `#0b1020` | Night.             |
| `--surface`       | `#141b2e` |                    |
| `--surface-sunk`  | `#070b16` |                    |
| `--surface-hover` | `#1b2338` |                    |
| `--ink`           | `#e8ecf5` | 14.5:1 on surface. |
| `--ink-soft`      | `#a3aec2` | 7.7:1.             |
| `--ink-faint`     | `#8e99ad` | 6.0:1.             |
| `--rule`          | `#232c42` |                    |
| `--rule-strong`   | `#35405c` |                    |
| `--belief`        | `#eaa53a` | 8.1:1.             |
| `--belief-ink`    | `#eaa53a` | 8.1:1.             |
| `--belief-wash`   | `#2a2113` |                    |
| `--reality`       | `#38c4e2` | 8.3:1.             |
| `--reality-ink`   | `#38c4e2` | 8.3:1.             |
| `--reality-wash`  | `#0c2630` |                    |
| `--horizon`       | `#6d7a90` | 4.0:1.             |
| `--danger`        | `#e08272` | 6.2:1.             |
| `--danger-wash`   | `#2e1a16` |                    |

**Measured separation.** Belief vs reality: 25.0 ΔE light, 25.0 ΔE dark; under
protanopia 19.1 / 20.9; under deuteranopia 25.5 / 24.6. Colour is never the
only channel — every series also carries position, a label, and a line style.

### Two bars, not one

A colour used for a **mark** must clear 3:1 against its surface. The same
colour used for **words** must clear 4.5:1. `--belief` is a mark; `--belief-ink`
is the word. Never set text in `--belief`.

---

## Type

Three faces, three jobs. Loaded via `next/font/google` with `display: "swap"`.

| Token            | Face              | Job                                                                                     |
| ---------------- | ----------------- | --------------------------------------------------------------------------------------- |
| `--font-display` | **Fraunces**      | Headings, and the user's own words. Optical-size and soft axes; a voice, not a UI font. |
| `--font-body`    | **IBM Plex Sans** | Interface. Engineered clarity with real character in the terminals.                     |
| `--font-mono`    | **IBM Plex Mono** | Every number, every hash, every date. Tabular by default.                               |

### Scale

| Token         | Size      |
| ------------- | --------- |
| `--text-2xs`  | 0.6875rem |
| `--text-xs`   | 0.75rem   |
| `--text-sm`   | 0.8125rem |
| `--text-base` | 0.9375rem |
| `--text-md`   | 1.0625rem |
| `--text-lg`   | 1.375rem  |
| `--text-xl`   | 1.875rem  |
| `--text-2xl`  | 2.5rem    |
| `--text-3xl`  | 3.25rem   |
| `--text-4xl`  | 4.25rem   |

Leading: `--leading-tight` 1.12, `--leading-snug` 1.32, `--leading-normal` 1.55,
`--leading-relaxed` 1.7.

**Numbers are the product.** Anything numeric takes `--font-mono` with
`font-variant-numeric: tabular-nums`. A percentage that shifts width as it
animates is a bug.

---

## Space, shape, depth

Spacing is a 4px-rooted scale: `--space-1` 0.25rem through `--space-9` 6rem.
Vertical rhythm between major sections is `--space-7` (3rem) at every width;
irregular section gaps are the single most common cause of "assembled, not
designed".

Radii stay small — this is an instrument. `--radius` 4px, `--radius-lg` 8px,
`--radius-full` 999px (avatars and pills only).

Elevation is restrained: `--shadow-raised` for cards, `--shadow-lifted` for
things that float over content (menus, dialogs, toasts). There is no third
level.

Widths come from a scale, so that columns on different screens line up rather
than each picking their own number:

| Token              | Value | Use                                 |
| ------------------ | ----- | ----------------------------------- |
| `--measure-tight`  | 22rem | Sign-in buttons, narrow cards.      |
| `--measure-narrow` | 26rem | Chart annotations, small panels.    |
| `--measure`        | 34rem | Prose. The default reading measure. |
| `--measure-prose`  | 38rem | Long-form pages, sealed panels.     |
| `--measure-wide`   | 44rem | Forms and settings columns.         |
| `--page-max`       | 72rem | The shell.                          |
| `--rail`           | 19rem | The instrument rail.                |

No component may invent a width outside this scale.

---

## Layout — the chart column

Every authenticated screen uses one skeleton:

```
≥1024px          <1024px
┌──────────┬────┐   ┌──────────┐
│ column   │rail│   │ column   │
│          │    │   ├──────────┤
│          │    │   │ rail     │
└──────────┴────┘   └──────────┘
```

The **column** carries the screen's primary work. The **instrument rail**
carries the current reading — calibration state, what is due, the chain
fingerprint. Below 1024px the rail moves beneath the column in source order.

This exists to fix a measured problem: `/review` and `/dashboard` currently
strand their content in the top-left quadrant of a 1440 viewport. The rail
gives the right-hand space a permanent job.

**Cards do not choose their own width.** A card fills its container. An empty
state fills the same box a populated one would.

---

## The horizon — signature element

The perfect-calibration diagonal, promoted from chart furniture to the
product's recurring mark:

1. **On the diagram** — the dashed diagonal, drawn in `--horizon`, labelled.
2. **On an empty dashboard** — the diagram's frame renders with axes and the
   horizon and _no plotted points_, above a line saying what will fill it. The
   instrument is visible before it has a reading. **It never plots invented
   data**; the display thresholds in `docs/calibration.md` are untouched.
3. **At the lock** — a hairline sweeps the width of the confirmation panel as
   the decision seals.

---

## Motion

Instruments settle; they do not bounce.

| Token             | Value                        | Use             |
| ----------------- | ---------------------------- | --------------- |
| `--ease`          | `cubic-bezier(0.2, 0, 0, 1)` | Everything.     |
| `--duration-fast` | 120ms                        | Hover, focus.   |
| `--duration`      | 200ms                        | State changes.  |
| `--duration-slow` | 420ms                        | Entrances.      |
| `--duration-seal` | 900ms                        | The lock, once. |

No spring, no overshoot, no bounce, no parallax, no scroll-jacking. Every
animation is wrapped so `prefers-reduced-motion: reduce` reduces it to an
instant state change — including the seal, which becomes a static "Sealed"
state.

**One orchestrated moment.** Sealing a decision: the panel's live fields settle
to their locked appearance, the horizon hairline sweeps once, and the
fingerprint resolves. It runs once per decision, at the only irreversible
moment in the product. Nowhere else gets choreography.

---

## Components

Every primitive ships all of: rest, hover, `:focus-visible`, active, disabled,
loading. Focus is a 2px `--reality` ring at 2px offset, visible on every
surface in both modes.

- **Button** — `primary` (solid ink), `secondary` (hairline), `quiet` (text),
  `danger`. Loading shows a spinner and keeps its label; the button never
  changes width mid-action.
- **Input / textarea / select** — hairline rest, `--reality` ring on focus,
  `--danger` border plus a message on error. Labels are always visible; no
  placeholder-as-label.
- **Card** — `--surface`, hairline border, `--radius-lg`. Fills its container.
- **Table** — mono numerics, right-aligned; sunk header; hover row. On a narrow
  screen a table **scrolls inside its own container**; the page body never
  scrolls sideways.

  This replaces an earlier rule that said tables stack into rows below 768px.
  Both tables in this product exist to be _compared down a column_ — domains
  against each other, confidence bands against each other — and stacking
  destroys exactly that, which is the reason a table was chosen over a list.
  The numbers table under the reliability diagram has a second reason: it is
  the chart's accessible equivalent, so one row must stay one datapoint.

  A scroll container needs both `overflow-x: auto` **and** `min-width: 0`: grid
  and flex items default to `min-width: auto` and refuse to shrink below their
  content, so the overflow rule alone silently does nothing.

- **Toast** — bottom-right desktop, top on mobile; `--shadow-lifted`; polite
  live region; auto-dismiss ≥5s with a visible dismiss.
- **Skeleton** — the shape of the content it replaces, in `--surface-sunk`,
  with a slow shimmer that respects reduced-motion.
- **Empty state** — icon-free. A sentence naming what will be here, and the
  primary action. Fills its container.

---

## Voice

Plain, precise, unhurried. The product tells people uncomfortable things about
themselves; it must never sound like a report card or a nag.

- **Active voice, plain verbs.** "Record a decision", not "Decision creation".
- **One name per action, everywhere.** The primary action is **"Record a
  decision"**. Signed-out CTAs say **"Start a journal"**. Nothing else.
- **Errors say what happened and what to do.** "That review date is in the
  past. Pick a date from tomorrow onward." Never "Invalid input".
- **Empty states invite.** "Nothing is due today. The next one comes back on
  12 March." Never "No data".
- **Warmth at zero and at success**, never exclamation marks.
- **Numbers are never dressed up.** No "impressive", no "great job". The
  reading is the reading.
- **Second person. No "we".** The journal belongs to the reader.

---

## Anti-patterns

Banned outright:

- Purple or blue gradient heroes. Any gradient used as decoration.
- Inter, or any single-face system. Default system-blue and neutral grey.
- Emoji as iconography.
- Generic three-up feature-card grids with icon, heading, lorem.
- Vague errors: "Something went wrong", "Invalid input", "Error occurred".
- Cream-and-terracotta editorial serif — direction B was cut for this.
- Dead space presented as minimalism. Whitespace must be composed.
- Bouncy or springy motion. Skeleton shimmer that ignores reduced-motion.
- Colour as the only carrier of meaning.
- Text set in `--belief` / `--reality` (use the `-ink` variants).
- A number that changes width as it animates.
- Placeholder text standing in for a label.
