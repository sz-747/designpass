import assert from "node:assert/strict";
import { test } from "node:test";

import { parseMemoryUnits as parseBody } from "backpass/src/memory.js";

import { parseDesignUnits, parseFrontMatter, resolveReference, splitFrontMatter, tokenTable } from "../src/design-memory.js";

const SAMPLE = `---
version: alpha
name: sample
colors:
  paper: "#fcfcfa"
  ink: "#000000"
  link: "#0b5fad"
typography:
  body:
    fontFamily: "Noto Serif SC", Georgia, serif
    fontSize: 17px
    lineHeight: 1.7
rounded: {}
spacing:
  gutter: 1rem
components:
  button:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.ink}"
    borderColor: "{colors.ink}"
    rounded: 0
---

# Sample design system

## Principles

- Text is the interface; chrome stays out of the way.
- Every radius is zero.

## Do's and Don'ts

- Do keep one measure (42rem) for running text.
`;

test("splitFrontMatter finds the fence and the body offset", () => {
  const split = splitFrontMatter(SAMPLE);
  assert.equal(split.header.length, 20);
  assert.equal(split.bodyOffset, 22);
  assert.equal(split.lines[split.bodyOffset + 1], "# Sample design system");
});

test("parseFrontMatter yields dotted leaf paths with real line numbers", () => {
  const { header } = splitFrontMatter(SAMPLE);
  const { leaves, maps } = parseFrontMatter(header, 2);
  const byPath = Object.fromEntries(leaves.map((l) => [l.path, l]));
  assert.equal(byPath["colors.link"].value, "#0b5fad");
  assert.equal(byPath["colors.link"].startLine, 7);
  assert.equal(byPath["typography.body.fontSize"].value, "17px");
  assert.equal(byPath["typography.body.fontSize"].section, "front matter > typography > body");
  assert.equal(byPath["components.button.textColor"].value, "{colors.ink}");
  assert.ok(maps.has("rounded"), "an empty map is still a node");
  assert.ok(maps.has("components.button"));
});

test("parseDesignUnits emits TK- units then DS- units, both with correct lines", () => {
  const units = parseDesignUnits(SAMPLE, parseBody);
  const tk = units.filter((u) => u.id.startsWith("TK-"));
  const ds = units.filter((u) => u.id.startsWith("DS-"));
  assert.ok(tk.length >= 12, `expected token units, got ${tk.length}`);
  assert.ok(ds.length >= 3, `expected body units, got ${ds.length}`);
  assert.ok(units.every((u) => typeof u.hash === "string" && u.hash.length === 12));

  const lines = SAMPLE.split("\n");
  for (const unit of units) {
    const slice = lines.slice(unit.startLine - 1, unit.endLine).join("\n");
    const firstLine = unit.text.split("\n")[0].trim();
    assert.ok(slice.includes(firstLine), `${unit.id} points at lines ${unit.startLine}-${unit.endLine}, which do not contain "${firstLine}"`);
  }
  assert.ok(ds.some((u) => u.text.includes("Every radius is zero")));
  assert.equal(ds[0].id, "DS-001");
  assert.ok(units.every((u) => !u.id.startsWith("AG-")), "no AG- ids leak through");
});

test("tokenTable exposes references and resolves them", () => {
  const table = tokenTable(SAMPLE);
  assert.equal(table.hasFrontMatter, true);
  assert.equal(table.colors.get("ink"), "#000000");
  assert.deepEqual(
    table.references.map((r) => r.to),
    ["colors.paper", "colors.ink", "colors.ink"],
  );
  assert.equal(resolveReference(table, "{colors.link}"), "#0b5fad");
  assert.equal(resolveReference(table, "{colors.missing}"), null);
  assert.equal(resolveReference(table, "17px"), "17px");
});

test("a file without front matter parses as body only", () => {
  const units = parseDesignUnits("# Just prose\n\n- One rule.\n", parseBody);
  assert.ok(units.length >= 1);
  assert.ok(units.every((u) => u.id.startsWith("DS-")));
  assert.equal(tokenTable("# Just prose\n").hasFrontMatter, false);
});

test("CRLF and LF files parse into the same units", () => {
  const lf = parseDesignUnits(SAMPLE, parseBody);
  const crlf = parseDesignUnits(SAMPLE.replace(/\n/g, "\r\n"), parseBody);
  assert.equal(crlf.length, lf.length);
  assert.deepEqual(
    crlf.map((u) => [u.id, u.hash, u.startLine]),
    lf.map((u) => [u.id, u.hash, u.startLine]),
  );
});
