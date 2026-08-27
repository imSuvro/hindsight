# Working notes — decisions and dead ends

Kept during the overhaul. The reasoning that did not survive into `DESIGN.md`
or `REPORT.md`, and the things that were tried and abandoned.

---

## The brief's central assumption was wrong, and that had to be surfaced

The brief reads as though pointed at a default-looking app: "revise anything
that reads as generic AI default", "no Inter-everywhere", "no default
blue/gray". None of that applied. `globals.css` already carried a two-accent
system where the accents meant things, contrast ratios documented per surface,
dark mode stepped independently, and zero hardcoded hex.

The brief's own rule — _existing partial design system: propose migration,
don't silently replace_ — bound harder than the P2 instruction to invent new
directions. It was surfaced rather than resolved unilaterally. **The answer
came back: develop fresh directions anyway.** So that is what happened, with
one constraint held: the _semantics_ of the two accents are product logic, not
styling, and could not change. Only the hues did.

## Dead end: maximising accent separation

The first palette search sorted candidates by colour-blind separation and
returned pure gold against pure blue — `#aa8c00` / `#005adc`, 37 ΔE. It clears
every bar comfortably and looks like a default chart library. Rejected: the
brief bans default blue, and separation is a floor to clear, not a quantity to
maximise. The search was re-run constrained to the Meridian families and the
best qualifying pair taken instead — 25.0 ΔE, which clears the bar with almost
nothing to spare and keeps the concept intact.

## Dead end: Assay

A metallurgy direction — testing a claim's purity by fire — got as far as a
palette before it was cut. Crucible charcoal, ember orange, cooled steel on
warm stone. Two problems, either fatal: the palette is cream-and-terracotta,
which the brief names as a banned cliché, and the register is adversarial —
trial by fire — where the product's emotional target is calm.

## Dead end: Signal

Near-monochrome, one electric accent. Genuinely the most distinctive of the
three and the strongest "serious instrument" read. Cut on a structural
argument rather than taste: one accent cannot express belief versus reality,
and that distinction is the single thing the colour system exists to carry.
A second accent would have made it Meridian with worse contrast.

## The validator was built before it was needed, and immediately earned it

`scripts/palette-check.mjs` was written because the old tokens' comments cited
a validator that was never committed — claims like "separate by ΔE 18 under
protanopia" with nothing checking them. Building it first meant the first
Meridian palette was caught at 19.9 ΔE against its own 25 ΔE bar before a
single component was touched.

It then caught something better. After the palette swap, the accessibility
suite failed on `/demo` — `DecisionList` set text in `--belief`, which is tuned
to the 3:1 graphics bar rather than the 4.5:1 text bar. The old mark colour
happened to clear both, so the component had been written against a
coincidence. **The rule already existed in `DESIGN.md` and was still broken in
seven files**, which is the argument for enforcement over documentation. The
validator now scans stylesheets, and the check was verified by reintroducing
the exact regression and watching it fail.

## `hidden` was not hiding

Found while reviewing the confirmation-step capture: the entire editable form
sat above "This is what gets sealed". `hidden`'s UA rule is `display: none` at
the lowest possible specificity, so the module's `display: flex` on `.field`
beat it silently.

Checked the before-capture before claiming it: identical. Pre-existing, not a
regression introduced here. Fixed globally rather than per-component, because
the next component to set `display` would reintroduce it.

## The amendment rule fought the repo and lost

`DESIGN.md` originally specified that amendments land as commits prefixed
`design-amendment:`. Commitlint rejected it — the repo's `type-enum` predates
this document. Rather than widening the repo's config to accommodate a document
written after it, the rule moved the marker into the commit body. A convention
invented during this work should not get to overrule one the project already
enforces.

## Rejected: making the dashboard show a curve early

Considered plotting the handful of resolved decisions faintly, or drawing a
provisional curve with a caveat. Rejected outright — `docs/calibration.md`
makes refusing to draw from thin data a stated product value, and the README
argues a curve from four decisions is "not a weak signal, it is an invented
one".

The empty frame threads that: the _instrument_ is visible, no data is on it.
Signed off before implementing, since it touches a documented principle.

## Rejected: building the toast primitive

`DESIGN.md` specifies one. Nothing in the product raises a transient message —
it is server-rendered throughout, with full page transitions. Building an
unused component to satisfy a checklist is worse than leaving the standard
written down for whoever needs it first. Listed as PENDING rather than
silently skipped.

## Skeleton is built and unused, deliberately

Same reasoning as the toast, resolved the other way — it is small, it is
referenced by the empty-state and card standards, and it costs nothing to have
ready. But it renders nowhere today, which is stated in the report rather than
implied by its existence.

## The dark-mode pass, done

`AUDIT_SCHEME=dark` renders the whole capture under `prefers-color-scheme:
dark`. The palette held: the night ground carries brass and cyan cleanly, the
reliability diagram separates its two series against the dark surface, and the
inverted primary reads as primary rather than as a hole in the page. No fixes
were needed, which is the useful thing to be able to say rather than assume.

## The seed that proved the verifier is stronger than documented

Testing the second half of the loop needed a decision whose review date had
passed, and review dates are forward-only in the form — correctly, since
scheduling a review for last Tuesday is meaningless. So `makeDue` shifts
`reviewAt` in the materialised view.

The first version of that helper carried a comment claiming the specs would
assert `/api/ledger/verify` still passed afterwards, "which proves the seam was
not corrupted". **That was wrong, and the test failing is what surfaced it.**
`auditRecord` rebuilds the decisions from the chain and diffs them against
what is stored, so a view edited behind the ledger's back is precisely what it
exists to catch. The claim in the comment was the opposite of the truth.

Two outcomes. The helper's documentation now says what it actually does, and
the specs using it assert that no problem is of kind `chain` — isolating the
claim under test from the fixture's known side effect. And the accident became
a test worth having: editing stored state without a matching ledger entry is
now asserted to be detected, with a 409 and a `projection` problem, which is
the operator-tampering scenario ADR-0002 describes.

## The disabled button that explained nothing

`Review before locking` is disabled until both required fields have content —
correct, and it correctly treats whitespace as empty. But it said nothing about
why, and a screen reader announces only "dimmed". Two of the first edge-case
probes were written expecting an error message and failed against a disabled
control; the app was right and the tests were wrong, but the silence was still
a small dead end. It now names the field that is missing, wired through
`aria-describedby`.

## A race I wrote, twice

The resolve tests asserted the submit button's absence to know the write had
landed. The button relabels to "Recording…" the instant it is pressed, so that
assertion passes mid-flight and the next navigation raced the server action.
The radios survive until the form is replaced, so they are the honest signal.
Worth recording because the failure looked exactly like a product bug — the
dashboard showing an unanswered decision — and was not.
