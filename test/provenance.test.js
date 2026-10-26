import assert from "node:assert/strict";
import { test } from "node:test";

import { parseMemoryUnits as parseBody } from "backpass/src/memory.js";

import { parseDesignUnits } from "../src/design-memory.js";
import { provenanceReport } from "../src/provenance.js";
import { renderStarterDesign } from "../src/seed.js";

const BORROWED = `---
colors:
  ink: "#000000"
  paper: "#ffffff"
---
# Borrowed

## Principles

- Rule one from someone else.
- Rule two from someone else.
`;

test("a freshly borrowed file is 100% borrowed", () => {
  const units = parseDesignUnits(BORROWED, parseBody);
  const report = provenanceReport({ units, sourceHashes: units.map((u) => u.hash) });
  assert.equal(report.own, 0);
  assert.equal(report.borrowed, units.length);
  assert.equal(report.ownShare, 0);
});

test("edited and added units become own; removed source units are counted as dropped", () => {
  const source = parseDesignUnits(BORROWED, parseBody);
  const evolved = BORROWED.replace("Rule two from someone else.", "Rule two, rewritten from my sessions.").replace(
    '  paper: "#ffffff"\n',
    '  paper: "#fcfcfa"\n  link: "#0b5fad"\n',
  );
  const units = parseDesignUnits(evolved, parseBody);
  const report = provenanceReport({ units, sourceHashes: source.map((u) => u.hash) });
  assert.equal(report.own, 3, "rewritten rule, changed paper, new link");
  assert.equal(report.dropped, 2, "old paper line and old rule two");
  assert.ok(report.sections.some((s) => s.section === "front matter > colors" && s.own === 2));
});

test("the empty skeleton parses into token maps and a principles placeholder", () => {
  const text = renderStarterDesign({ name: "demo" });
  const units = parseDesignUnits(text, parseBody);
  assert.ok(units.some((u) => u.id === "TK-name" && u.tokenValue === "demo"));
  assert.ok(units.some((u) => u.id.startsWith("DS-") && /None recorded yet/.test(u.text)));
});
