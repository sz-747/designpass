import path from "node:path";

import { parseMemoryUnits } from "backpass/src/memory.js";
import { sha256 } from "backpass/src/state.js";
import { estimateTokens } from "backpass/src/tokens.js";

import { renderStarterDesign } from "../seed.js";

/**
 * The starter file designpass seeds when a repo has no DESIGN.md: a Stitch-shaped
 * skeleton with empty token maps and an empty `## Principles` section. There is no
 * pointer file - DESIGN.md is read by every agent directly.
 */
export * from "backpass/src/bootstrap.js?designpass-original";

export const CANONICAL_MEMORY_FILE = "DESIGN.md";
export const POINTER_MEMORY_FILE = null;

export function renderPointer() {
  return "";
}

export function bootstrapTargets(memoryFiles) {
  return { canonical: memoryFiles[0] || CANONICAL_MEMORY_FILE, pointer: null };
}

export function renderStarterMemory({ repo }) {
  return renderStarterDesign({ name: repo.name });
}

export function starterMemoryFile(repo, relativePath = CANONICAL_MEMORY_FILE) {
  const text = renderStarterMemory({ repo });
  return {
    path: relativePath,
    absolute: path.join(repo.root, relativePath),
    text,
    hash: `sha256:${sha256(text).slice(0, 16)}`,
    tokens: estimateTokens(text),
    units: parseMemoryUnits(text),
  };
}
