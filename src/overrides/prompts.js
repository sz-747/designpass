import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import * as original from "backpass/src/prompts.js?designpass-original";

import { promptExtras } from "../context.js";

/**
 * backpass's prompt loader with designpass's prompt directory in front of it: a prompt
 * name that exists under `<designpass>/prompts/` wins, anything else falls through to the
 * upstream file. `renderPrompt` also supplies designpass's extra placeholders (today:
 * `{{DRIFT}}`, the deterministic source-drift report) before the caller's values.
 */
export { SELF_SESSION_SENTINEL } from "backpass/src/prompts.js?designpass-original";

/**
 * backpass renders the annotate preface with `render(loadPrompt(...))` rather than
 * `renderPrompt`, so the extras are supplied here too whenever a template asks for one.
 */
export function render(template, values) {
  const extras = {};
  if (template.includes("{{DRIFT}}")) extras.DRIFT = promptExtras("annotate-preface", values).DRIFT;
  return original.render(template, { ...extras, ...values });
}

export const PROMPT_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "prompts");

const cache = new Map();

export function loadPrompt(name) {
  if (!cache.has(name)) {
    const local = path.join(PROMPT_DIR, `${name}.md`);
    cache.set(name, fs.existsSync(local) ? fs.readFileSync(local, "utf8") : original.loadPrompt(name));
  }
  return cache.get(name);
}

export function renderPrompt(name, values) {
  const merged = { ...promptExtras(name, values), ...values };
  return `${original.SELF_SESSION_SENTINEL}\n${original.render(loadPrompt(name), merged)}`;
}
