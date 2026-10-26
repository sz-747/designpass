import assert from "node:assert/strict";
import fs from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { test } from "node:test";

import { PATCHES, PINNED_BACKPASS, patchSource } from "../src/patches.js";

const require = createRequire(import.meta.url);
const backpassRoot = path.dirname(require.resolve("backpass/package.json"));

test("the installed backpass is the pinned version", () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(backpassRoot, "package.json"), "utf8"));
  assert.equal(pkg.version, PINNED_BACKPASS);
});

test("every patch anchor occurs exactly once in the installed source", () => {
  for (const file of Object.keys(PATCHES)) {
    const text = fs.readFileSync(path.join(backpassRoot, "src", file), "utf8");
    const patched = patchSource(file, text);
    assert.ok(patched && patched !== text, `${file} was patched`);
    for (const [, replace] of PATCHES[file]) assert.ok(patched.includes(replace), `${file} contains ${replace}`);
  }
});

test("a moved anchor fails loudly", () => {
  assert.throws(() => patchSource("config.js", "export const STATE_DIRNAME = \".backpass\";"), /expected anchor exactly once/);
});

test("files without patches pass through untouched", () => {
  assert.equal(patchSource("memory.js", "abc"), null);
});
