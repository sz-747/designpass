/**
 * Load-time text patches for the two upstream files whose constants designpass changes.
 *
 * Each anchor must occur exactly once in the file it targets. A miss means the pinned
 * backpass version moved, and the run stops with a message naming the anchor rather than
 * proceeding with AGENTS.md defaults.
 */

export const PINNED_BACKPASS = "0.1.22";

export const PATCHES = {
  "config.js": [
    ['export const CONFIG_FILENAME = ".backpassrc.json";', 'export const CONFIG_FILENAME = ".designpassrc.json";'],
    ['export const STATE_DIRNAME = ".backpass";', 'export const STATE_DIRNAME = ".designpass";'],
    ['return path.join(base, "backpass", "config.json");', 'return path.join(base, "designpass", "config.json");'],
    ['  memoryFiles: ["AGENTS.md", "CLAUDE.md"],\n  budgetTokens: 5000,', '  memoryFiles: ["DESIGN.md"],\n  budgetTokens: 8000,'],
    [
      'export const USER_MEMORY_FILES = [".agents/AGENTS.md", ".claude/CLAUDE.md", ".codex/AGENTS.md"];',
      'export const USER_MEMORY_FILES = [".agents/DESIGN.md"];',
    ],
    [
      '    memoryFiles: [".agents/AGENTS.md", path.join(claudeRoot, "CLAUDE.md"), path.join(codexRoot, "AGENTS.md")],',
      '    memoryFiles: [".agents/DESIGN.md"],',
    ],
    ['    memoryFiles: ["AGENTS.md"],\n    budgetTokens: DEFAULT_CONFIG.budgetTokens,', '    memoryFiles: ["DESIGN.md"],\n    budgetTokens: DEFAULT_CONFIG.budgetTokens,'],
  ],
  // Node's chmod on Windows only flips the read-only bit, so a 0700 user-scope state
  // dir can never verify there and upstream refuses to run. The profile directory's
  // ACLs already restrict it to the user; skip the POSIX mode dance on win32 only.
  "state.js": [
    [
      "    if (this.dirMode) {\n      try {\n        fs.chmodSync(this.root, this.dirMode);",
      '    if (this.dirMode && process.platform !== "win32") {\n      try {\n        fs.chmodSync(this.root, this.dirMode);',
    ],
  ],
  "commands/bootstrap.js": [
    ["(`add` under `## Learnings`, replacing the placeholder bullet there; never create a new ", "(`add` under `## Principles`, replacing the placeholder bullet there; never create a new "],
  ],
};

export class PatchError extends Error {}

/** Returns the patched text, or null when the file has no patches. Throws on a missed anchor. */
export function patchSource(file, text) {
  const patches = PATCHES[file];
  if (!patches) return null;
  let out = text;
  for (const [find, replace] of patches) {
    const count = out.split(find).length - 1;
    if (count !== 1) {
      throw new PatchError(
        `designpass: backpass src/${file} does not contain the expected anchor exactly once (found ${count}). ` +
          `designpass is pinned to backpass ${PINNED_BACKPASS}; check the installed version.\n  anchor: ${JSON.stringify(find)}`,
      );
    }
    out = out.replace(find, () => replace);
  }
  return out;
}
