import assert from "node:assert/strict";
import { test } from "node:test";

import { contrastRatio, designGates, parseHex } from "../src/gates.js";

const BASE = `---
colors:
  paper: "#fcfcfa"
  ink: "#000000"
  ink-3: "#626262"
components:
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
---

# Body
`;

test("contrast maths matches the WCAG reference pair", () => {
  assert.equal(Math.round(contrastRatio(parseHex("#000000"), parseHex("#ffffff"))), 21);
  assert.deepEqual(parseHex("#fff"), [255, 255, 255]);
});

test("a clean edit produces no violations", () => {
  const after = BASE.replace('ink-3: "#626262"', 'ink-3: "#5a5a5a"');
  assert.deepEqual(designGates({ before: BASE, after }).violations, []);
});

test("removing a referenced token is a violation", () => {
  const after = BASE.replace('  ink: "#000000"\n', "");
  const { violations } = designGates({ before: BASE, after });
  assert.equal(violations.length, 1);
  assert.match(violations[0], /\{colors\.ink\}/);
});

test("an unterminated front matter is a violation", () => {
  const after = BASE.replace("\n---\n\n# Body", "\n\n# Body");
  const { violations } = designGates({ before: BASE, after });
  assert.match(violations[0], /never closes/);
});

test("dropping contrast below the floor is a violation, staying below it is a note", () => {
  const low = BASE.replace('textColor: "{colors.ink}"', 'textColor: "#d0d0d0"');
  const first = designGates({ before: BASE, after: low });
  assert.equal(first.violations.length, 1);
  assert.match(first.violations[0], /below the 3:1 floor/);

  const stillLow = low.replace('"#d0d0d0"', '"#d4d4d4"');
  const second = designGates({ before: low, after: stillLow });
  assert.deepEqual(second.violations, []);
  assert.ok(second.notes.some((n) => /contrast/.test(n)));
});
