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
// The whitespace before the inch mark is inside the optional group, so a
// trailing space is only consumed when a mark actually follows it — otherwise
//  2'9 4  would match "2'9 " and leave "334".
const RX_FT_IN = new RegExp(
  `(-?${QTY})\\s*${QUOTE_FT}\\s*(?:(${QTY})(?:\\s*${QUOTE_IN})?)?`,
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
    // Space before a mark is noise ("2 '" is "2'"). Space *after* one is not:
    // eating it turned  24" 3  into  243  instead of an error.
    .replace(/\s+(['"])/g, "$1");
}

// Architectural shorthand drops the feet mark as readily as the inch mark, so
// two unmarked quantities separated by nothing but whitespace read as feet
// then inches:  295 6  /  295 6 1/4  /  295 6.25  are all 295'-6"ish.
//
// The shape that must NOT be caught is the mixed number: "1 1/2" has always
// meant an inch and a half, so a lone fraction still binds to the number on
// its left. The cost is that "295 1/4" stays 295.25" — write 295' 1/4" for
// two hundred ninety-five feet and a quarter inch.
const RX_IMPLY_FT = new RegExp(
  "(^|[-+*/(\\s])" + // feet can only open an operand, never continue one
    "(\\d+(?:\\.\\d+)?)\\s+" + // feet: a plain whole or decimal number
    "(?!\\d+\\/\\d+)" + // a lone fraction belongs to the number behind it
    `(${QTY})` + // inches: whatever is left, "6 1/4" included
    `(?!\\s*${QUOTE_FT})`, // ...unless it is marked as feet itself
  "g"
);

// Write the implied feet mark in, so the rest of the pipeline only ever sees
// notation it already understands.
export function implyFeet(s) {
  return s.replace(RX_IMPLY_FT, (m, lead, ft, inch) => `${lead}${ft}' ${inch}`);
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
  return implyFeet(normalize(s))
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

/* ---------- display formatting for the expression itself ---------- */

// Display-only tokenizer. The only genuinely ambiguous character is "/" —
// it is both the division sign and the fraction bar — so we can't decide
// spacing character by character. Instead we match whole measurement tokens
// first (the same shapes the parser recognises); any "/" left over after
// that is division and gets spaced, while a "/" swallowed inside a token
// stays tight. 3/4" keeps its bar, 24" / 2 gets air.
//
// Sticky flag: we walk the string left to right and the alternatives are
// tried in the same priority order the parser uses.
const RX_TOKEN = new RegExp(
  [
    `(${QTY})\\s*${QUOTE_FT}\\s*(?:(${QTY})(?:\\s*${QUOTE_IN})?)?`, // 2'  /  2'6"
    `(${QTY})\\s*${QUOTE_IN}`, // 3 1/2"
    QTY, // bare number or fraction
    "[-+*/()]",
    "\\s+", // separator between tokens — dropped, we re-space from scratch
    "\\S", // anything else: pass through so bad input still renders
  ].join("|"),
  "gy"
);

// Collapse the whitespace inside a quantity: "9   1/2" → "9 1/2".
const tidyQty = (q) => q.trim().replace(/\s+/g, " ");

// Re-render an expression with spaces around the arithmetic operators while
// leaving measurements — and the fraction bars inside them — intact.
// Value-preserving: the result parses back to the same number.
export function prettyExpr(s) {
  const src = implyFeet(normalize(s)).trim();

  // Pass one: tokenise. We can't render as we go any more — whether a bare
  // number is a length depends on the token that comes after it.
  const toks = [];
  let expectOperand = true; // exactly where a "-" is a sign, not a subtraction
  RX_TOKEN.lastIndex = 0;
  let m;
  while ((m = RX_TOKEN.exec(src))) {
    const [tok, ft, ftIn, inch] = m;
    if (/^\s+$/.test(tok)) continue; // separator: we re-space from scratch
    if (ft !== undefined) {
      const t = `${tidyQty(ft)}'` + (ftIn !== undefined ? ` ${tidyQty(ftIn)}"` : "");
      toks.push({ kind: "meas", text: t });
      expectOperand = false;
    } else if (inch !== undefined) {
      toks.push({ kind: "meas", text: `${tidyQty(inch)}"` });
      expectOperand = false;
    } else if (tok === "(") {
      toks.push({ kind: "open", text: "(" });
      expectOperand = true;
    } else if (tok === ")") {
      toks.push({ kind: "close", text: ")" });
      expectOperand = false;
    } else if (tok === "-" && expectOperand) {
      toks.push({ kind: "sign", text: "-" });
      expectOperand = true;
    } else if (/^[-+*/]$/.test(tok)) {
      toks.push({ kind: "op", text: tok });
      expectOperand = true;
    } else {
      toks.push({ kind: "qty", text: tidyQty(tok) });
      expectOperand = false;
    }
  }

  // Pass two: give the bare numbers their inch mark. The parser reads them as
  // inches already — "295' 6 - 20" is 20 inches short — so the display should
  // say so. The exception is a number next to * or /: there it scales a
  // measurement rather than being one, and  2' * 3"  would be nonsense.
  const scales = (t) => t && t.kind === "op" && (t.text === "*" || t.text === "/");
  toks.forEach((tok, i) => {
    if (tok.kind !== "qty") return;
    let before = i - 1;
    if (toks[before] && toks[before].kind === "sign") before--;
    if (scales(toks[before]) || scales(toks[i + 1])) return;
    tok.text += '"';
  });

  // Pass three: re-space. Everything butts up against an opening paren or a
  // unary sign; a closing paren butts up against whatever precedes it.
  let out = "";
  let tight = true;
  for (const tok of toks) {
    out += (tight || tok.kind === "close" ? "" : " ") + tok.text;
    tight = tok.kind === "open" || tok.kind === "sign";
  }
  return out;
}

export function evaluate(expr) {
  if (/[^0-9+\-*/().\s]/.test(expr)) {
    throw new SyntaxError("Invalid input");
  }
  // Two numbers with nothing but space between them are a measurement that
  // never came together — "5 6 7", "24\" 3". Function() would only report
  // "Unexpected number", so say what actually went wrong.
  if (/\d\s+[\d.]/.test(expr)) {
    throw new SyntaxError("Missing an operator between two numbers");
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
    fFt: `${sign}${mixed(ft, DEN)}' ${mixed(inch, DEN)}"`,
    dFt: `${sign}${trimZeros(abs / 12)}'`,
    fIn: `${sign}${mixed(abs, DEN)}"`,
    dIn: `${sign}${trimZeros(abs)}"`,
    raw: tot,
  };
}
