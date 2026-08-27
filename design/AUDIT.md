# Hindsight — UI/UX audit

Captured 2026-08-27 against `feat/premium-ui-overhaul`, branched from `develop`
at `87f74b4`. Evidence in `design/audit/before/` — every route at 360, 768 and
1440, full-page, produced by `tests/e2e/audit-capture.spec.ts` so the after-run
is directly comparable.

**Console: clean.** Zero errors, warnings or page errors across all routes and
widths (`design/audit/before-console.md`). Nothing in this document is a bug
report; it is all fit and finish.

---

## The headline

**This app does not need a redesign. It needs its own design applied evenly.**

The token layer in `src/app/globals.css` is mature and unusually principled: a
two-accent palette where the accents carry meaning (`--belief` warm brass = what
you said, `--reality` cool teal = what happened, converging on the diagonal of
the reliability diagram), contrast ratios documented inline against the surfaces
they sit on, dark mode stepped separately rather than flipped, a three-face type
system with distinct jobs, and `--radius: 3px` with tight shadows because "an
instrument, not an app". There are **zero hardcoded hex values** anywhere in the
CSS modules.

That system is fully expressed on `/` and `/demo`. It is barely expressed on
`/dashboard`, `/review` and `/settings` — the screens a paying user actually
lives in. The gap between the two is the entire problem.

---

## Screen inventory

| #   | Route                | Auth   | State     | Verdict                                  |
| --- | -------------------- | ------ | --------- | ---------------------------------------- |
| 01  | `/`                  | public | —         | **Strong.** Passes the 3s test outright. |
| 02  | `/sign-in`           | public | —         | Clean, spare, appropriate.               |
| 03  | `/demo`              | public | seeded    | **Richest screen in the product.**       |
| 04  | `/how-scoring-works` | public | —         | Solid long-form.                         |
| 05  | `/dashboard`         | authed | empty     | Good onboarding, huge dead space.        |
| 11  | `/dashboard`         | authed | populated | **Weakest screen. Fails the 3s test.**   |
| 06  | `/decisions`         | authed | empty     | Adequate.                                |
| 12  | `/decisions`         | authed | populated | Good list; inconsistent widths.          |
| 09  | `/decisions/new`     | authed | form      | Well-structured, long.                   |
| 10  | `/decisions/new`     | authed | confirm   | Good moment, under-dramatised.           |
| 13  | `/decisions/[id]`    | authed | detail    | Fine.                                    |
| 07  | `/review`            | authed | empty     | **Sparsest screen. Reads unfinished.**   |
| 08  | `/settings`          | authed | —         | Utilitarian.                             |

---

## Core journeys

1. **Convince → sign up.** `/` → `/demo` → `/sign-in`. Works well. The landing
   page's belief-vs-recall card is the best single asset in the product.
2. **First decision.** `/dashboard` (empty) → `/decisions/new` → confirm → lock
   → detail. The confirmation step is the emotional peak of the product and is
   currently styled like a form panel.
3. **Return and resolve.** email/`/review` → resolve → `/dashboard` reads the
   score. Cannot be fully audited without a due decision (dates are
   forward-only in the UI); the empty state is what almost every real user sees
   for their first three months.
4. **Read the record.** `/decisions` → `/decisions/[id]` → verify chain.

---

## Top frictions, ranked

### 1. The onboarding card contradicts the page it sits on — CONFIRMED DEFECT

`src/components/forms/Onboarding.tsx:71` hardcodes **"Write my first
decision"**. Visibility is `!journal.onboarded || decisions.length === 0`
(`src/app/dashboard/page.tsx:33`), so a user who records decisions without ever
clicking "Got it — hide this" sees a header reading _"3 decisions recorded"_
directly above a card reading _"START HERE"_ and _"Write my first decision"_.
Screenshot `11-dashboard-populated-1440.png`. This is the single most
credibility-damaging thing in the product.

### 2. No content grid — card widths are arbitrary

On one 1440 dashboard: the onboarding card runs the full column, the
calibration card runs roughly half, the domain table roughly half, the recent
list full again. `/review` and `/decisions` repeat the pattern — populated
cards full-width, empty-state boxes half-width. Nothing lines up down the right
edge, so the page reads as assembled rather than designed.

### 3. Dead space at desktop widths

`/review` empty puts all its content in the top-left quadrant of a 1440×900
viewport; roughly half the vertical space and half the horizontal space carry
nothing. `/dashboard` empty is nearly as bare. Both read as "unfinished admin
panel", which is precisely the opposite of the premium goal.

### 4. The signature element is absent from the product's main screen

The reliability diagram is the product's whole argument and the most beautiful
thing in the codebase — and on `/dashboard` it is replaced by the text "Not
enough yet to say anything true" until ten decisions resolve. Meanwhile `/demo`
leads with it. A new user's dashboard therefore looks _less_ capable than the
sample they were shown before signing up. **The expectation gap runs the wrong
way.**

### 5. Action names drift across the flow

The same primary action is called **"Start a journal"** (landing), **"Start your
own"** (demo banner), **"Record a decision"** (dashboard header, review empty,
journal header) and **"Write my first decision"** (onboarding card). Four names,
one action.

### 6. The timezone confirmation reads as a warning

Buried inside the onboarding card: _"Your browser says Asia/Calcutta, which is
different from what is saved."_ Stated as a discrepancy to resolve rather than a
setting to confirm. Against the emotional target — calm, capable, quietly
delighted — this is the one moment that manufactures mild tension.

### 7. Zero-state tables presented as data

"Where you are sharper" renders five domain rows of `0 / 0 / — / 5 more to go`.
Formally correct, and a wall of zeroes is a poor first impression where an
invitation belongs. At 360 the five-column table is cramped.

### 8. The confirmation step under-plays the one irreversible moment

"This is what gets sealed" → "Lock it" is the only irreversible action in the
product, and the product's entire claim rests on that irreversibility. It
currently looks like a review panel. This is where the single orchestrated
signature moment belongs.

---

## Where the 3-second test fails

Judged on the entry screenshot alone:

- **`/` — passes.** What it does, who it's for, and the first action are all
  legible immediately.
- **`/demo` — passes.** Obvious what is being demonstrated.
- **`/dashboard` populated — fails.** A first-time visitor sees a greeting, an
  onboarding card telling them to write their first decision, a card saying
  nothing can be said yet, and a table of zeroes. Nothing on the screen shows
  what the product _produces_.
- **`/review` empty — fails.** Reads as an empty admin page.

---

## P1 · Product framing

**Target user.** A reflective professional — the kind of person who already
keeps notes on their own reasoning — who suspects their memory is flattering
them and wants evidence either way. Technical enough to respect a hash chain,
impatient with anything that feels like a productivity toy.

**Core problem.** Hindsight sight-corrects itself. After the fact everyone
remembers having had doubts, so nobody can audit their own judgement from
memory. The product makes the original belief permanent and then scores it.

**Emotional target.** Calm, capable, quietly delighted. Never tense. The product
tells people uncomfortable things about themselves, so the interface must feel
like a well-made instrument handing over a reading — never like a report card,
never like a nag.

**One primary action per screen.**

| Screen                   | Primary action                  |
| ------------------------ | ------------------------------- |
| `/`                      | Start a journal                 |
| `/demo`                  | Start a journal                 |
| `/dashboard` (empty)     | Record a decision               |
| `/dashboard` (populated) | Resolve what's due, else record |
| `/decisions`             | Record a decision               |
| `/decisions/new`         | Review before locking           |
| confirm step             | Lock it                         |
| `/decisions/[id]`        | Resolve (if due) / verify       |
| `/review`                | Say what happened               |
| `/settings`              | — (utility)                     |

### UX fixes

| #   | Fix                                                                                                                           | Scope       |
| --- | ----------------------------------------------------------------------------------------------------------------------------- | ----------- |
| F1  | Onboarding card copy adapts to decision count; card retires itself once a decision exists                                     | UI + copy   |
| F2  | One content grid; every card and empty state on the same rails                                                                | UI          |
| F3  | Dashboard earns its desktop width — no top-left clustering                                                                    | UI          |
| F4  | Give `/dashboard` a real anchor before ten resolutions: show the diagram in an honest "not yet" state rather than a paragraph | UI          |
| F5  | One action name — **"Record a decision"** — everywhere, with "Start a journal" reserved for signed-out CTAs                   | copy        |
| F6  | Timezone reads as confirmation, not discrepancy                                                                               | copy        |
| F7  | Zero-state domain table becomes an invitation                                                                                 | UI + copy   |
| F8  | The lock confirmation becomes the signature moment                                                                            | UI + motion |

### PENDING — surfaced, not implemented

- **F4** changes what the dashboard shows before ten resolved decisions. The
  product deliberately refuses to draw a curve from thin data
  (`docs/calibration.md` display thresholds), and that refusal is a stated
  product value. The proposal is **not** to draw a fake curve, but to render the
  diagram's empty frame — axes, the perfect-calibration diagonal, and a
  plain-language note on what will fill it. **Needs sign-off** because it
  touches a documented product principle.
- **F1** retiring the onboarding card once a decision exists changes
  `showOnboarding` logic, which is behaviour rather than styling. **Needs
  sign-off.**

---

## Out of scope, confirmed untouched

Business logic, scoring, the ledger, auth, APIs, data. Nothing in this audit
requires changing any of them.
