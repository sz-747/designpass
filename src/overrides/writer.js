import fs from "node:fs";
import path from "node:path";

import * as original from "backpass/src/apply/writer.js?designpass-original";
import { UserError } from "backpass/src/logger.js";
import { projectWithDecisions } from "backpass/src/proposal.js";

import { designGates } from "../gates.js";

/**
 * backpass's writer with one preflight in front of it: the accepted subset of edits,
 * projected onto the DESIGN.md as it is on disk, must clear the design gates. The
 * proposal cleared them as a whole; a human accepting a token removal while rejecting
 * the component rewrite that dropped the last reference to it would not, so the check
 * runs again on exactly what is about to be written.
 */
export * from "backpass/src/apply/writer.js?designpass-original";

export function applyDecisions(args) {
  const { proposal, decisions, repo } = args;
  const memoryPath = proposal?.memoryFile?.path;
  const absolute = memoryPath && repo?.root ? path.resolve(repo.root, memoryPath) : null;
  if (absolute && fs.existsSync(absolute) && Array.isArray(proposal.edits)) {
    const before = fs.readFileSync(absolute, "utf8");
    const acceptedIds = Object.entries(decisions || {})
      .filter(([, verdict]) => verdict === "accepted")
      .map(([id]) => id);
    const cap = proposal.config?.budgetTokens ?? 0;
    const { text: after } = projectWithDecisions(before, proposal.edits, acceptedIds, cap);
    const gates = designGates({ before, after });
    if (gates.violations.length) {
      throw new UserError(
        `the accepted edits would leave ${memoryPath} inconsistent:\n  - ${gates.violations.join("\n  - ")}`,
        "accept the edit that keeps the reference or contrast intact alongside this one, or reject both",
      );
    }
  }
  return original.applyDecisions(args);
}
