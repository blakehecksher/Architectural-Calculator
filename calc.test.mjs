// Test suite for the Feet & Inches parser/formatter.
// Run with:  node calc.test.mjs
import { parseInput, formatOutputs, prettyExpr } from "./calc.js";

let pass = 0;
const failures = [];

const approx = (a, b) => Math.abs(a - b) < 1e-9;

// parseInput(input) should equal `inches`
function eq(input, inches) {
  try {
    const got = parseInput(input);
    if (approx(got, inches)) pass++;
    else failures.push(`parse ${JSON.stringify(input)} → ${got}  (expected ${inches})`);
  } catch (e) {
    failures.push(`parse ${JSON.stringify(input)} threw "${e.message}"  (expected ${inches})`);
  }
}

// parseInput(input) should throw
function bad(input) {
  try {
    const got = parseInput(input);
    failures.push(`parse ${JSON.stringify(input)} → ${got}  (expected a thrown error)`);
  } catch {
    pass++;
  }
}

// prettyExpr(input) should render as `exp` — and, since it is a display-only
// rewrite, must still parse to the same number as the original.
function pretty(input, exp) {
  const got = prettyExpr(input);
  if (got === exp) pass++;
  else failures.push(`pretty ${JSON.stringify(input)} → ${JSON.stringify(got)}  (expected ${JSON.stringify(exp)})`);
  try {
    if (approx(parseInput(input), parseInput(got))) pass++;
    else failures.push(`pretty ${JSON.stringify(input)} changed the value: ${parseInput(input)} → ${parseInput(got)}`);
  } catch (e) {
    failures.push(`pretty ${JSON.stringify(input)} → ${JSON.stringify(got)} no longer parses: "${e.message}"`);
  }
}

// formatOutputs(inches, den) fields should match
function fmt(inches, den, exp) {
  const out = formatOutputs(inches, den);
  for (const k of Object.keys(exp)) {
    if (out[k] === exp[k]) pass++;
    else failures.push(`format(${inches},1/${den}).${k} → ${JSON.stringify(out[k])}  (expected ${JSON.stringify(exp[k])})`);
  }
}

/* ------------------------------------------------------------------ */
/* Basic units                                                         */
eq('1"', 1);
eq('12"', 12);
eq('0"', 0);
eq("1'", 12);
eq("2'", 24);
eq("10'", 120);

/* Feet + inches, mark present */
eq("1'6\"", 18);
eq("2'9\"", 33);
eq("5'3\"", 63);
eq("5' 3\"", 63);
eq("10'0\"", 120);
eq("12'11\"", 155);
eq("5'6 1/2\"", 66.5);

/* Feet + inches, NO inch mark — the reported bug (2'9 must be 33, not 249) */
eq("2'9", 33);
eq("1'6", 18);
eq("5'3", 63);
eq("12'11", 155);
eq("0'5", 5);
eq("2' 9", 33);
eq("20'9", 249); // genuinely twenty feet nine inches

/* Feet + inches with NO marks at all — 295 6 is 295'-6" */
eq("295 6", 3546);
eq("295 6.25", 3546.25);
eq("295 6 1/4", 3546.25);
eq('295 6"', 3546);
eq('295 6 1/4"', 3546.25);
eq("0 6", 6);
eq("6 0", 72);
eq("1.5 6", 24);
eq("-295 6", -3546); // the sign negates the whole measurement
eq("100,000 6", 1200006);
eq("295 6 - 20", 3526);
eq("2 + 3 4", 42);
eq("295 6 + 2 3", 3573);

/* ...but a lone fraction still binds LEFT as a mixed number, so these are
   inches, not feet. Write 295' 1/4" if you mean feet. */
eq("295 1/4", 295.25);
eq("295 1/4 + 2", 297.25);
eq('5 1/2"', 5.5);
eq("2' 6 1/4", 30.25);

/* Mixed-number feet come along for free: the implied mark lands after the
   whole mixed number, so "5 1/2 6" is 5 1/2 feet plus 6 inches. */
eq("5 1/2 6", 72);
eq("2 1/4 6", 33);
eq("1/2 6", 12);
// ...without disturbing division
eq("6 / 2 + 1", 4);
eq("24 / 2", 12);

/* Two numbers that never joined into one measurement are an error — they
   used to silently concatenate ("2'9 4" printed 334). */
bad("5 6 7");
bad("2 3 4");
bad('24" 3');
bad("2'9 4");
bad("2' 9 4");
bad('5\'6" 4');
bad("295 6'");

/* Fractions */
eq('1/2"', 0.5);
eq('3/4"', 0.75);
eq('1 1/2"', 1.5);
eq('3 1/4"', 3.25);
eq("5' 1/2\"", 60.5); // feet + bare fraction inches (was broken)
eq("5'1/2", 60.5);
eq("2'9 1/2\"", 33.5);
eq("2'9 1/2", 33.5);
eq("2'6 3/4\"", 30.75);
eq("2'9 3/4", 33.75);
eq("5 1/2'", 66);
eq("1/2'", 6);
eq("2 1/4'", 27);
eq("2'0 1/16\"", 24.0625);

/* Decimals */
eq("1.5'", 18);
eq("2.25'", 27);
eq('0.5"', 0.5);
eq("1.5'6\"", 24);
eq("2'9.5", 33.5);

/* Arithmetic */
eq("5' + 3\"", 63);
eq("5' - 3\"", 57);
eq("2' * 3", 72);
eq("6' / 2", 36);
eq("(1.5' * 2)", 36);
eq("(2'6\") * 2", 60);
eq("2'9 + 1'3", 48);
eq("10' - 2'6\"", 90);
eq('3" + 3"', 6);
eq("1' + 1' + 1'", 36);
eq("5'3\" - 5'3\"", 0);
eq("2 + 3 * 4", 14);
eq("(2 + 3) * 4", 20);
eq("2' + 3' * 2", 96);

/* Negatives */
eq("-1'", -12);
eq("-2'6\"", -30);
eq('3" - 5\'', -57);
eq('-1/2"', -0.5);

/* Whitespace */
eq("  2'9  ", 33);
eq("   10'   ", 120);

/* Unicode marks / operators */
eq("2′ 9″", 33); // prime + double prime
eq("2’", 24); // curly apostrophe
eq("3″", 3); // double prime
eq("2' × 3", 72); // ×
eq("6' ÷ 2", 36); // ÷
eq("2' x 3", 72); // x as multiply

/* Commas as thousands separators */
eq('1,000"', 1000);
eq('1,234.5"', 1234.5);

/* Bare numbers / fractions (interpreted as inches) */
eq("6", 6);
eq("3/4", 0.75);
eq("1 1/2", 1.5);
eq("10 1/2", 10.5);

/* Errors */
bad("");
bad("abc");
bad("2 +");
bad('1/0"');
bad("(");
bad("*/");
bad("2''");
bad("5 + )");

/* Results too big to be represented exactly are refused rather than shown
   as float noise or scientific notation */
bad("99999999999*99999999*1000"); // was printing 9.99e+21"
bad("9999999999*9999999999*99");
eq("100000'*100000*10000", 1200000000000000); // still inside the safe range

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
fmt(33, 16, { fFt: "2' 9\"", dFt: "2.75'", fIn: '33"', dIn: '33"' });
fmt(63, 16, { fFt: "5' 3\"", dFt: "5.25'", fIn: '63"', dIn: '63"' });
fmt(60.5, 16, { fFt: "5' 1/2\"", dFt: "5.04167'", fIn: '60 1/2"', dIn: '60.5"' });
fmt(0, 16, { fFt: "0' 0\"", dFt: "0'", fIn: '0"', dIn: '0"' });
fmt(-30, 16, { fFt: "-2' 6\"", dFt: "-2.5'", fIn: '-30"', dIn: '-30"' });
fmt(33.75, 16, { fFt: "2' 9 3/4\"", fIn: '33 3/4"' });
fmt(1.5, 16, { fFt: "0' 1 1/2\"", dFt: "0.125'", fIn: '1 1/2"', dIn: '1.5"' });
fmt(3.24, 16, { fFt: "0' 3 1/4\"", fIn: '3 1/4"', dIn: '3.24"' }); // rounds to nearest 1/16
fmt(11.97, 16, { fFt: "1' 0\"" }); // inch rounds up to 12 → carries to a foot
fmt(35.99, 16, { fFt: "3' 0\"" });
fmt(3.3, 8, { fFt: "0' 3 1/4\"" }); // 1/8 precision rounds 0.3 → 1/4
fmt(3.3, 2, { fFt: "0' 3 1/2\"" }); // 1/2 precision rounds 0.3 → 1/2

/* Thousands separators on long numbers */
fmt(1200, 16, { fFt: "100' 0\"", dFt: "100'", fIn: '1,200"', dIn: '1,200"' });
fmt(1200000, 16, { fFt: "100,000' 0\"", dFt: "100,000'", fIn: '1,200,000"', dIn: '1,200,000"' });
fmt(1234.5, 16, { fIn: '1,234 1/2"', dIn: '1,234.5"' });
fmt(-1200, 16, { fIn: '-1,200"', dIn: '-1,200"' });
// grouped output must feed straight back into the parser
eq('1,234 1/2"', 1234.5);
eq("100,000'", 1200000);

/* Expression pretty-printing: operators get air, fraction bars don't. */
pretty(`5+3 1/4"`, `5" + 3 1/4"`);
pretty(`3/4"`, `3/4"`);
pretty(`24"/2`, `24" / 2`);
pretty(`24"   /   2`, `24" / 2`);
pretty(`1/2"+1/4"`, `1/2" + 1/4"`);
pretty(`(1.5'*2)`, `(1.5' * 2)`);
pretty(`(3'+4")*2/3`, `(3' + 4") * 2/3`);
pretty(`5'*2-1/16"`, `5' * 2 - 1/16"`);
pretty(`10"x3`, `10" * 3`); // normalize() folds x/× into *
pretty(`1,200"+1`, `1200" + 1"`);
// feet-and-inches stays one token, and gains the inch mark it implied
pretty(`2'6+1/2"`, `2' 6" + 1/2"`);
pretty(`2  '  6 1/2  "`, `2' 6 1/2"`);
// a leading minus is a sign, not a subtraction — it stays glued on
pretty(`-2'6"+3`, `-2' 6" + 3"`);
pretty(`(-3")*2`, `(-3") * 2`);
// a bare number is inches, and says so — unless it scales a measurement
pretty(`295 6 - 20`, `295' 6" - 20"`);
pretty(`295 6 1/4`, `295' 6 1/4"`);
pretty(`295 6.25+1`, `295' 6.25" + 1"`);
pretty(`1 1/2`, `1 1/2"`);
pretty(`2'*3`, `2' * 3`);
pretty(`3*2'`, `3 * 2'`);
pretty(`2+3*4`, `2" + 3 * 4`);
pretty(`(2+3)*4`, `(2" + 3") * 4`);
// "/" inside a token is still read as a fraction bar, not division — 12/2 is
// six inches either way, so the mark is honest
pretty(`12/2`, `12/2"`);
// unicode marks normalize on the way through
pretty(`5’+3 1/4”`, `5' + 3 1/4"`);

/* ------------------------------------------------------------------ */
if (failures.length) {
  console.error(`\n${failures.length} FAILED, ${pass} passed:\n`);
  for (const f of failures) console.error("  ✗ " + f);
  process.exit(1);
} else {
  console.log(`All ${pass} assertions passed.`);
}
