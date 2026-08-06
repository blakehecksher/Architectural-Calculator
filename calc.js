// Pure parsing + formatting logic for the Feet & Inches Calculator.
// Kept free of any DOM references so it can be unit-tested directly
// (see calc.test.mjs) and imported by index.html.

// Quote classes. normalize() converts curly/unicode marks to straight ones
// first, so the parser only ever has to deal with ' and " — but we keep the
// unicode variants in the classes as a belt-and-suspenders measure.
const QUOTE_FT = "['\\u2019\\u2032]"; // apostrophe / prime  → feet
const QUOTE_IN = '["\\u201d\\u2033]'; // quote / double prime → inches

// A measurement "quantity": a mixed number ("9 1/2"), a bare fraction
// ("1/2"), or a plain decimal/whole ("9", "9.5"). Order matters — the mixed
// and fraction forms must be tried before the plain-number form so that the
// numerator isn't swallowed as a standalone number.
const QTY = "(?:\\d+\\s+\\d+\\/\\d+|\\d+\\/\\d+|\\d*\\.?\\d+)";

// Feet, with optional inches. The inch mark is OPTIONAL, so that
// architectural shorthand like  2'9  reads as 2 ft 9 in (not "249"). A number
// directly following a feet mark is always interpreted as inches.
const RX_FT_IN = new RegExp(
  `(-?${QTY})\\s*${QUOTE_FT}\\s*(?:(${QTY})\\s*${QUOTE_IN}?)?`,
  "g"
);
// Standalone inches: 3"  /  3 1/2"  /  1/2"
const RX_IN = new RegExp(`(-?${QTY})\\s*${QUOTE_IN}`, "g");
// Bare fractions with no unit marks (interpreted as inches downstream).
const RX_MIXED_FRAC = /(-?\d+)\s+(\d+\/\d+)/g;
const RX_PURE_FRAC = /-?\d+\/\d+/g;

const gcd = (a, b) => (b ? gcd(b, a % b) : a);
export const roundNearest = (v, d) => Math.round(v * d) / d;

export function normalize(s) {
  return s
    .replace(/[’‘′]/g, "'")
    .replace(/[“”″]/g, '"')
    .replace(/[×x]/gi, "*")
    .replace(/÷/g, "/")
    .replace(/[–—]/g, "-")
    .replace(/,/g, "")
    .replace(/\s*(['"])\s*/g, "$1");
}

export function parseFrac(str) {
  str = str.trim();
  if (/^-?\d+\s+\d+\/\d+$/.test(str)) {
    const neg = str.startsWith("-");
    const [whole, frac] = str.split(/\s+/);
    const [num, den] = frac.split("/");
    if (parseInt(den) === 0) throw new SyntaxError("Invalid fraction");
    // Note: sign is taken from the leading "-", not Math.sign(whole), so
    // that a zero whole part ("0 1/16") keeps its fractional value.
    const mag = Math.abs(parseInt(whole)) + parseInt(num) / parseInt(den);
    return neg ? -mag : mag;
  }
  if (/^-?\d+\/\d+$/.test(str)) {
    const [num, den] = str.split("/");
    if (parseInt(den) === 0) throw new SyntaxError("Invalid fraction");
    return parseInt(num) / parseInt(den);
  }
  return parseFloat(str);
}

// Rewrite architectural notation into a plain arithmetic expression whose
// unit is inches.
export function pre(s) {
  return normalize(s)
    .replace(RX_FT_IN, (m, f, i) => {
      // A leading "-" negates the whole measurement, so -2'6" is -(2ft 6in),
      // i.e. -30", not (-2ft)+(6in) = -18".
      const neg = f.trim().startsWith("-");
      const total = Math.abs(parseFrac(f)) * 12 + (i != null ? parseFrac(i) : 0);
      return neg ? -total : total;
    })
    .replace(RX_IN, (m, i) => parseFrac(i))
    .replace(RX_MIXED_FRAC, (m, w, f) => `(${w}+(${f}))`)
    .replace(RX_PURE_FRAC, (m) => `(${m})`);
}

export function evaluate(expr) {
  if (/[^0-9+\-*/().\s]/.test(expr)) {
    throw new SyntaxError("Invalid input");
  }
  return Function(`"use strict";return (${expr})`)();
}

// Past 2^53 a double can no longer hold an exact integer, so the arithmetic
// has already gone wrong by the time we'd format it — and the number would
// print as scientific notation on top of that. Refuse it instead.
export const MAX_INCHES = Number.MAX_SAFE_INTEGER;

// Parse a full expression and return the total length in inches.
export function parseInput(s) {
  const val = evaluate(pre(s));
  if (typeof val !== "number" || !Number.isFinite(val)) {
    throw new SyntaxError("Invalid result");
  }
  if (Math.abs(val) > MAX_INCHES) {
    throw new RangeError("Result is too large to measure.");
  }
  return val;
}

// Thousands separators, so long runs of digits stay readable. Safe to feed
// straight back into the parser — normalize() strips commas.
const group = (digits) => digits.replace(/\B(?=(\d{3})+(?!\d))/g, ",");

const mixed = (val, d) => {
  const sign = val < 0 ? "-" : "";
  let abs = Math.abs(val);
  abs = roundNearest(abs, d);
  const whole = Math.floor(abs);
  const frac = abs - whole;
  if (frac === 0) return sign + group(String(whole));
  let num = Math.round(frac * d);
  let den = d;
  const g = gcd(num, den);
  num /= g;
  den /= g;
  return sign + (whole ? group(String(whole)) + " " : "") + num + "/" + den;
};

const in2ft = (inches) => ({
  ft: Math.floor(inches / 12),
  in: inches % 12,
});

const trimZeros = (n) => {
  const [whole, frac] = n.toFixed(5).replace(/\.0+$|(?<=\d)0+$/, "").split(".");
  return frac ? `${group(whole)}.${frac}` : group(whole);
};

// Format a total (in inches) into the four presentation strings.
export function formatOutputs(tot, DEN) {
  const sign = tot < 0 ? "-" : "";
  const abs = Math.abs(tot);
  let { ft, in: inch } = in2ft(abs);
  inch = roundNearest(inch, DEN);
  if (inch >= 12) {
    ft++;
    inch -= 12;
  }
  return {
    fFt: `${sign}${mixed(ft, DEN)}'-${mixed(inch, DEN)}"`,
    dFt: `${sign}${trimZeros(abs / 12)}'`,
    fIn: `${sign}${mixed(abs, DEN)}"`,
    dIn: `${sign}${trimZeros(abs)}"`,
    raw: tot,
  };
}
