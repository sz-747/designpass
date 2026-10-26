import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

import { lengthToPx, normalizeColor, renderDriftForPrompt, scanSourceDrift } from "../src/drift.js";

const DESIGN = `---
colors:
  paper: "#fcfcfa"
  ink: "#000000"
  link: "#0b5fad"
typography:
  body:
    fontFamily: "Noto Serif SC", Georgia, serif
    fontSize: 17px
  meta:
    fontFamily: "Noto Sans SC", sans-serif
    fontSize: 12px
spacing:
  gutter: 1rem
rounded:
  none: 0px
---
# x
`;

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "designpass-drift-"));
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.mkdirSync(path.join(root, "node_modules", "junk"), { recursive: true });
  fs.writeFileSync(
    path.join(root, "src", "app.css"),
    `:root { --ink: #000; --link: #0B5FAD; --font-serif: "Noto Serif SC", serif; }
.body { font-size: 17px; color: var(--ink); padding: 1rem; }
.rogue { font-size: 15px; color: #ff0000; border-radius: 4px; font-family: Inter, sans-serif; }
`,
  );
  fs.writeFileSync(path.join(root, "src", "Card.tsx"), `export const c = <div className="text-[13px] p-[1rem]" />;\n`);
  fs.writeFileSync(path.join(root, "node_modules", "junk", "x.css"), `.z { color: #123456; }\n`);
  fs.writeFileSync(path.join(root, "DESIGN.md"), DESIGN);
  return root;
}

test("normalisation expands short hex and converts rem", () => {
  assert.equal(normalizeColor("#000"), "#000000");
  assert.equal(normalizeColor("#0B5FAD"), "#0b5fad");
  assert.equal(normalizeColor("rgb(255, 0, 0)"), "#ff0000");
  assert.equal(lengthToPx("1rem"), 16);
  assert.equal(lengthToPx("0.5em"), null);
});

test("scanSourceDrift separates on-token from off-token values and skips node_modules", () => {
  const root = fixture();
  const report = scanSourceDrift({ root, designText: DESIGN });
  assert.equal(report.filesScanned, 2);

  const knownColors = report.colors.known.map((k) => k.value);
  assert.ok(knownColors.includes("#000000"));
  assert.ok(knownColors.includes("#0b5fad"));
  const unknownColors = report.colors.unknown.map((k) => k.value);
  assert.ok(unknownColors.includes("#ff0000"));
  assert.ok(!unknownColors.includes("#123456"), "node_modules is skipped");
  assert.deepEqual(report.colors.unused.map((u) => u.token), ["colors.paper"]);

  const unknownSizes = report.typography.unknown.map((k) => k.value);
  assert.ok(unknownSizes.includes(15));
  assert.ok(unknownSizes.includes(13), "tailwind arbitrary text size is seen");
  assert.ok(report.typography.known.some((k) => k.value === 17));
  assert.deepEqual(report.typography.unused, ["meta"]);

  assert.ok(report.spacing.known.some((k) => k.value === 16 && k.uses === 2));
  assert.ok(report.rounded.unknown.some((k) => k.value === 4));
  assert.ok(report.fonts.unknown.some((k) => k.value === "Inter"));
  assert.ok(report.fonts.known.some((k) => k.value === "Noto Serif SC"));

  const rogue = report.colors.unknown.find((k) => k.value === "#ff0000");
  assert.match(rogue.locations[0], /^src\/app\.css:3$/);

  const text = renderDriftForPrompt(report);
  assert.match(text, /colours: 3 token\(s\)/);
  assert.match(text, /#ff0000/);
  fs.rmSync(root, { recursive: true, force: true });
});
