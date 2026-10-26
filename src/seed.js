import fs from "node:fs";
import path from "node:path";

import { sha256 } from "backpass/src/state.js";

import { unitHash } from "./design-memory.js";

/**
 * Seeding a DESIGN.md, and remembering where it came from.
 *
 * Two starts are possible: an empty Stitch-shaped skeleton, or a borrowed file (one of
 * the awesome-design-md exports, say) copied verbatim. Either way a provenance record is
 * written next to the run state so `designpass provenance` can later say how much of the
 * file is still the borrowed text and how much has been earned from the owner's own
 * sessions. Files are only ever created here, never overwritten without `--force`.
 */

export const MAINTAINING_DESIGN_SECTION = `## Maintaining this file

Keep this file for what almost every UI-building session needs: the token table, the
principles, and the do/don't list. Component detail that only matters when that component
is built belongs in a skill (\`design-<component>\`), whose one-line description is the
trigger. Prefer rewriting or pruning existing entries over appending new ones. Keep the
front matter and the prose in agreement: a value changes in both places or in neither.
`;

export function renderStarterDesign({ name = "project" } = {}) {
  return `---
version: alpha
name: ${name}
description: Design language for ${name}. Seeded empty by designpass; every token and principle below is earned from real sessions.

colors: {}

typography: {}

rounded: {}

spacing: {}

components: {}
---

# ${name} design system

This file is the always-loaded design memory for agents building UI in ${name}. It is
kept short on purpose: every line here is paid on every session that touches the UI.

## Principles

- None recorded yet. designpass adds evidence-backed principles here from real sessions.

${MAINTAINING_DESIGN_SECTION}`;
}

export function provenanceRecord({ source, sourceText, units, parseUnits }) {
  const unitList = units ?? parseUnits(sourceText);
  return {
    version: 1,
    tool: "designpass",
    seededAt: new Date().toISOString(),
    source: source ? path.resolve(source) : null,
    sourceHash: sourceText != null ? `sha256:${sha256(sourceText).slice(0, 16)}` : null,
    units: unitList.map((u) => ({ id: u.id, hash: u.hash ?? unitHash(u.text), section: u.section || "" })),
  };
}

/**
 * Write the design file at `target` and its provenance record at `recordPath`.
 * Returns what happened; throws when the target exists and `force` is false.
 */
export function seedDesignFile({ target, recordPath, from = null, name, force = false, parseUnits }) {
  if (fs.existsSync(target) && !force) {
    const err = new Error(`${target} already exists`);
    err.hint = "pass --force to overwrite it, or delete it first";
    throw err;
  }
  let text;
  if (from) {
    if (!fs.existsSync(from)) throw new Error(`source file not found: ${from}`);
    text = fs.readFileSync(from, "utf8");
  } else {
    text = renderStarterDesign({ name });
  }
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, text);
  const record = provenanceRecord({ source: from, sourceText: text, parseUnits });
  fs.mkdirSync(path.dirname(recordPath), { recursive: true });
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`);
  return { target, recordPath, borrowed: Boolean(from), units: record.units.length, bytes: Buffer.byteLength(text) };
}
