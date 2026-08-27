/**
 * Palette validator.
 *
 * The design tokens carry claims — "4.6:1 on the surface", "separable under
 * protanopia" — and a claim in a comment that nothing checks is just a hope.
 * This script recomputes every one of them from the hex values themselves.
 *
 *   node scripts/palette-check.mjs            # check, exit non-zero on failure
 *   node scripts/palette-check.mjs --verbose  # print every measurement
 *
 * Three things are checked:
 *
 *  1. WCAG 2.1 contrast. Body text 4.5:1, large text and non-text graphics 3:1.
 *  2. Dichromat separation. The two data colours must stay distinguishable to
 *     the ~4% of people who cannot separate red from green, so they are
 *     projected through protanopia and deuteranopia simulations and their
 *     OKLab distance measured. Position and label do the real work on the
 *     diagram; this stops colour from actively lying.
 *  3. Chroma floor. A data colour that desaturates to near-grey stops reading
 *     as a series at all, so each carries a minimum OKLCH chroma.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const VERBOSE = process.argv.includes("--verbose");

/* ---------- colour space plumbing ---------- */

function hexToRgb(hex) {
  const clean = hex.replace("#", "");
  const full =
    clean.length === 3
      ? clean
          .split("")
          .map((c) => c + c)
          .join("")
      : clean;
  return [
    Number.parseInt(full.slice(0, 2), 16) / 255,
    Number.parseInt(full.slice(2, 4), 16) / 255,
    Number.parseInt(full.slice(4, 6), 16) / 255,
  ];
}

/** sRGB companding, per IEC 61966-2-1. */
const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);

function relativeLuminance(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrast(a, b) {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Linear sRGB -> OKLab (Björn Ottosson). */
function toOklab(hex) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

function chroma(hex) {
  const [, a, b] = toOklab(hex);
  return Math.hypot(a, b);
}

/**
 * Dichromat simulation, Viénot–Brettel–Mollon (1999): convert to LMS, collapse
 * the missing cone onto the plane spanned by the remaining two, convert back.
 */
function simulate(hex, kind) {
  const [r, g, b] = hexToRgb(hex).map(toLinear);

  // Hunt–Pointer–Estévez, normalised to D65.
  const L = 0.31399022 * r + 0.63951294 * g + 0.04649755 * b;
  const M = 0.15537241 * r + 0.75789446 * g + 0.08670142 * b;
  const S = 0.01775239 * r + 0.10944209 * g + 0.87256922 * b;

  let L2 = L;
  let M2 = M;
  const S2 = S;
  if (kind === "protanopia") {
    L2 = 1.05118294 * M + -0.05116099 * S;
  } else {
    M2 = 0.9513092 * L + 0.04866992 * S;
  }

  let rr = 5.47221206 * L2 + -4.6419601 * M2 + 0.16963708 * S2;
  let gg = -1.1252419 * L2 + 2.29317094 * M2 + -0.1678952 * S2;
  let bb = 0.02980165 * L2 + -0.19318073 * M2 + 1.16364789 * S2;

  const clamp = (c) => Math.min(1, Math.max(0, c));
  const toGamma = (c) =>
    c <= 0.0031308 ? 12.92 * c : 1.055 * clamp(c) ** (1 / 2.4) - 0.055;

  [rr, gg, bb] = [rr, gg, bb].map((c) => clamp(toGamma(clamp(c))));
  const hex2 = (c) =>
    Math.round(c * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${hex2(rr)}${hex2(gg)}${hex2(bb)}`;
}

/** Euclidean distance in OKLab, scaled to roughly CIE ΔE units. */
function distance(a, b) {
  const [l1, a1, b1] = toOklab(a);
  const [l2, a2, b2] = toOklab(b);
  return Math.hypot(l1 - l2, a1 - a2, b1 - b2) * 100;
}

/* ---------- the palette under test ---------- */

const light = {
  ground: "#eef1f5",
  surface: "#f8fafc",
  surfaceSunk: "#e3e8ef",
  ink: "#10151f",
  inkSoft: "#4a5566",
  inkFaint: "#5b6675",
  belief: "#b06412",
  beliefInk: "#9d570f",
  reality: "#005f7d",
  realityInk: "#005f7d",
  reference: "#6b7684",
  danger: "#8f3226",
};

const dark = {
  ground: "#0b1020",
  surface: "#141b2e",
  surfaceSunk: "#070b16",
  ink: "#e8ecf5",
  inkSoft: "#a3aec2",
  inkFaint: "#8e99ad",
  belief: "#eaa53a",
  beliefInk: "#eaa53a",
  reality: "#38c4e2",
  realityInk: "#38c4e2",
  reference: "#6d7a90",
  danger: "#e08272",
};

const failures = [];
const notes = [];

function check(label, actual, min, unit = ":1") {
  const ok = actual >= min;
  const line = `${ok ? "pass" : "FAIL"}  ${label}: ${actual.toFixed(2)}${unit} (min ${min}${unit})`;
  if (!ok) failures.push(line);
  if (VERBOSE || !ok) notes.push(line);
}

for (const [mode, p] of [
  ["light", light],
  ["dark", dark],
]) {
  notes.push(`\n— ${mode} —`);

  // Body text has to clear 4.5:1 on every surface it can land on.
  for (const surface of ["ground", "surface", "surfaceSunk"]) {
    check(`${mode} ink on ${surface}`, contrast(p.ink, p[surface]), 4.5);
    check(`${mode} inkSoft on ${surface}`, contrast(p.inkSoft, p[surface]), 4.5);
    check(`${mode} inkFaint on ${surface}`, contrast(p.inkFaint, p[surface]), 4.5);
  }

  // Words in an accent colour are still words.
  check(`${mode} beliefInk on surface`, contrast(p.beliefInk, p.surface), 4.5);
  check(`${mode} realityInk on surface`, contrast(p.realityInk, p.surface), 4.5);
  check(`${mode} danger on surface`, contrast(p.danger, p.surface), 4.5);

  // Data marks and chart furniture are non-text graphics: 3:1.
  check(`${mode} belief mark on surface`, contrast(p.belief, p.surface), 3);
  check(`${mode} reality mark on surface`, contrast(p.reality, p.surface), 3);
  check(`${mode} reference on surface`, contrast(p.reference, p.surface), 3);

  // The two series must not collapse into each other.
  check(`${mode} belief vs reality separation`, distance(p.belief, p.reality), 25, " ΔE");
  for (const kind of ["protanopia", "deuteranopia"]) {
    check(
      `${mode} belief vs reality under ${kind}`,
      distance(simulate(p.belief, kind), simulate(p.reality, kind)),
      15,
      " ΔE",
    );
  }

  // A data colour that greys out stops reading as a series.
  check(`${mode} belief chroma`, chroma(p.belief), 0.05, "");
  check(`${mode} reality chroma`, chroma(p.reality), 0.05, "");
}

/* ---------- the two-bars rule, enforced against the stylesheets ---------- */

/*
 * `--belief` and `--reality` are tuned to the 3:1 bar that graphics have to
 * clear. Setting *text* in them lands under the 4.5:1 bar that words have to
 * clear, which is the whole reason the `-ink` variants exist.
 *
 * This is not hypothetical. The accessibility suite caught `.confidence` in
 * DecisionList doing exactly this right after the palette changed: the old
 * mark colour happened to clear the text bar, the new one does not, and the
 * component had been written against the coincidence rather than the rule. A
 * rule that lives only in a document gets broken by the next component.
 */
function cssFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...cssFiles(full));
    else if (entry.endsWith(".css")) out.push(full);
  }
  return out;
}

const NON_TEXT = /(accent|border|decoration|outline|background|fill|stroke)-color/;
const TEXT_IN_MARK = /(^|[^-\w])color:\s*var\(--(belief|reality)\)\s*;/;

notes.push("\n— stylesheets —");
let offenders = 0;
for (const file of cssFiles("src")) {
  readFileSync(file, "utf8")
    .split(/\r?\n/)
    .forEach((line, index) => {
      if (NON_TEXT.test(line) || !TEXT_IN_MARK.test(line)) return;
      offenders += 1;
      const message = `FAIL  ${file}:${index + 1} sets text in a mark colour — use the -ink variant`;
      failures.push(message);
      notes.push(message);
    });
}
if (offenders === 0) {
  notes.push("pass  no text is set in a mark colour");
}

console.log(notes.join("\n"));

if (failures.length > 0) {
  console.error(`\n${failures.length} palette check(s) failed:\n`);
  for (const f of failures) console.error(`  ${f}`);
  process.exit(1);
}
console.log(`\nAll palette checks passed.`);
