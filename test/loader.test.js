import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const here = path.dirname(fileURLToPath(import.meta.url));
const bin = path.join(here, "..", "bin", "designpass.js");

/** Run a small script under the loader hooks and return its stdout. */
function underHooks(script) {
  const probe = `
    import { register } from "node:module";
    register(${JSON.stringify(new URL("../src/loader.js", import.meta.url).href)});
    const m = await import(${JSON.stringify(script)});
    await m.default();
  `;
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", probe], {
    cwd: path.join(here, ".."),
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout;
}

test("--version reports both versions", () => {
  const result = spawnSync(process.execPath, [bin, "--version"], { encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^designpass \d+\.\d+\.\d+ \(backpass 0\.1\.22\)/);
});

test("hooks redirect overrides and patch constants", () => {
  const stdout = underHooks(new URL("./fixtures/probe-hooks.mjs", import.meta.url).href);
  const probe = JSON.parse(stdout);
  assert.equal(probe.stateDirname, ".designpass");
  assert.equal(probe.configFilename, ".designpassrc.json");
  assert.deepEqual(probe.defaultMemoryFiles, ["DESIGN.md"]);
  assert.equal(probe.budgetTokens, 8000);
  assert.deepEqual(probe.userMemoryFiles, [".agents/DESIGN.md"]);
  assert.equal(probe.canonical, "DESIGN.md");
  assert.equal(probe.firstUnitId.startsWith("TK-"), true, `first unit is ${probe.firstUnitId}`);
  assert.equal(probe.originalFirstUnitId.startsWith("AG-"), true, "the original parser is still reachable via the query suffix");
  assert.match(probe.analysisPrompt, /design system file/);
  assert.match(probe.analysisPrompt, /<!-- backpass:self-session -->/);
  assert.match(probe.consolidatePrompt, /gap/i);
  assert.equal(probe.userConfigPath.split(path.sep).slice(-2).join("/"), "designpass/config.json");
});
