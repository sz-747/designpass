import fs from "node:fs";
import path from "node:path";

import * as original from "backpass/src/memory.js?designpass-original";
import { estimateTokens } from "backpass/src/tokens.js";

import { parseDesignUnits } from "../design-memory.js";

/**
 * backpass's `memory.js` with the DESIGN.md unit parser in place of the markdown-only
 * one. Everything the original exports is re-exported; the four functions below are the
 * ones that call the parser through a module-local binding and therefore have to be
 * re-declared here so they see the design parser.
 */
export * from "backpass/src/memory.js?designpass-original";

export function parseMemoryUnits(text) {
  return parseDesignUnits(text, original.parseMemoryUnits);
}

export function readMemoryFile(repoRoot, relativePath, options = {}) {
  const absolute = original.resolveMemoryPath(repoRoot, relativePath, options);
  if (!fs.existsSync(absolute)) return null;
  const text = fs.readFileSync(absolute, "utf8");
  return {
    path: relativePath,
    absolute,
    text,
    hash: original.memoryTextHash(text),
    tokens: estimateTokens(text),
    units: parseMemoryUnits(text),
  };
}

export function loadMemoryFiles(repoRoot, memoryFiles, options = {}) {
  return memoryFiles.map((f) => readMemoryFile(repoRoot, f, options)).filter(Boolean);
}

export function resolveMemoryFiles(repoRoot, memoryFiles, options = {}) {
  const files = loadMemoryFiles(repoRoot, memoryFiles, options);
  if (!files.length) return { primary: null, all: files, pointers: [], separate: [], hash: null };
  const [primary, ...others] = files;
  const pointers = others.filter(
    (f) =>
      path.basename(f.absolute).toLowerCase() === "claude.md" &&
      original.isPointerTo(f.text, primary.absolute, { fromDir: path.dirname(f.absolute) }),
  );
  const separate = others.filter((f) => !pointers.includes(f));
  return { primary, all: files, pointers, separate, hash: original.memorySetHash(files) };
}
