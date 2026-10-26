import * as original from "backpass/src/proposal.js?designpass-original";

import { designGates } from "../gates.js";

/**
 * backpass's proposal gates plus the design-specific ones (`src/gates.js`): the
 * projected DESIGN.md must keep a well-formed front matter, every `{a.b}` reference
 * must still resolve, and no edit may push a component's text/background contrast
 * below the floor. Violations are appended to backpass's own list, so the synthesis
 * agent is re-prompted with them exactly like any other breach.
 */
export * from "backpass/src/proposal.js?designpass-original";

export function buildProposal(rawResult, context) {
  const result = original.buildProposal(rawResult, context);
  const { memoryFile } = context;
  const { proposal } = result;
  if (!memoryFile?.text || !Array.isArray(proposal?.edits)) return result;
  try {
    const slices = proposal.edits
      .filter((edit) => edit.targetsMemoryFile && edit.applicable !== false)
      .map((edit) => original.sliceEditForFile(edit, memoryFile.path) ?? edit);
    const after = original.applyEdits(memoryFile.text, slices);
    const gates = designGates({ before: memoryFile.text, after });
    result.violations.push(...gates.violations);
    proposal.notes.push(...gates.notes);
  } catch (err) {
    proposal.notes.push(`design gates were not evaluated: ${err.message}`);
  }
  return result;
}
