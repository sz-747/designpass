import fs from "node:fs";
import path from "node:path";

import { STATE_DIRNAME, CONFIG_FILENAME } from "backpass/src/config.js";
import { resolveRepo } from "backpass/src/repo.js";

import { renderDriftForPrompt, scanSourceDrift } from "./drift.js";

/**
 * Run-scoped context the prompt override reads from: which scope the run is in and the
 * source-drift report for the repository being trained. The CLI sets the scope before
 * delegating to backpass; the drift report is computed once per (repo, memory file)
 * on first use and written to `<state dir>/drift.json` for the human.
 */
const state = {
  scope: "project",
  cwd: process.cwd(),
  cache: new Map(),
};

export function configure(options = {}) {
  Object.assign(state, options);
}

export function promptExtras(name, values = {}) {
  if (!["analysis", "synthesis", "annotate-preface"].includes(name)) return {};
  return { DRIFT: driftForPrompt(values.MEMORY_PATH) };
}

export function driftForPrompt(memoryPath) {
  try {
    return renderDriftForPrompt(currentDrift(memoryPath));
  } catch (err) {
    return `(source drift not measured: ${err.message})`;
  }
}

function driftOptions(root) {
  const file = path.join(root, CONFIG_FILENAME);
  if (!fs.existsSync(file)) return {};
  try {
    const config = JSON.parse(fs.readFileSync(file, "utf8"));
    return config?.drift && typeof config.drift === "object" ? config.drift : {};
  } catch {
    return {};
  }
}

/**
 * The drift report for the current run. User scope has no single repository to scan,
 * so it reports nothing rather than scanning whatever directory the command ran in.
 */
export function currentDrift(memoryPath = "DESIGN.md") {
  if (state.scope === "user") throw new Error("user scope trains a cross-project file; there is no one repository to scan");
  const repo = resolveRepo(state.cwd);
  const relative = path.isAbsolute(memoryPath) ? path.relative(repo.root, memoryPath) : memoryPath;
  const absolute = path.join(repo.root, relative);
  const text = fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : "";
  const key = `${repo.root}|${relative}|${text.length}|${hashOf(text)}`;
  if (state.cache.has(key)) return state.cache.get(key);
  const report = scanSourceDrift({ root: repo.root, memoryPath: relative, designText: text, ...driftOptions(repo.root) });
  state.cache.set(key, report);
  try {
    const dir = path.join(repo.root, STATE_DIRNAME);
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "drift.json"), `${JSON.stringify(report, null, 2)}\n`);
  } catch {
    // The report is advisory; failing to persist it never fails a run.
  }
  return report;
}

function hashOf(text) {
  let h = 0;
  for (let i = 0; i < text.length; i += 1) h = (h * 31 + text.charCodeAt(i)) | 0;
  return h;
}
