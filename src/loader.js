import { patchSource } from "./patches.js";

/**
 * Module hooks that turn backpass into designpass without forking it.
 *
 * Registered by `bin/designpass.js` before anything else is imported. Two mechanisms:
 *
 *   overrides   a few backpass modules resolve to a designpass module instead. Each
 *               override re-exports the original (reached through the
 *               `?designpass-original` suffix, which resolves to the untouched upstream
 *               file as a separate module instance) and replaces only what differs.
 *   patches     two upstream files are text-patched at load time - constants only
 *               (state-dir name, config file name, default memory file, budget). Every
 *               patch asserts its anchor occurs exactly once, so a backpass upgrade that
 *               moves an anchor fails at startup instead of silently running with
 *               AGENTS.md defaults.
 *
 * Everything else in backpass loads untouched.
 */

export const ORIGINAL_SUFFIX = "?designpass-original";

export const OVERRIDES = {
  "memory.js": "./overrides/memory.js",
  "prompts.js": "./overrides/prompts.js",
  "bootstrap.js": "./overrides/bootstrap.js",
  "proposal.js": "./overrides/proposal.js",
  "apply/writer.js": "./overrides/writer.js",
};

const BACKPASS_SRC = /\/backpass\/src\/([^?#]+)(\?[^#]*)?$/;

export function backpassSourceFile(url) {
  const match = String(url).match(BACKPASS_SRC);
  return match ? { file: match[1], query: match[2] || "" } : null;
}

export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith(ORIGINAL_SUFFIX)) {
    const bare = specifier.slice(0, -ORIGINAL_SUFFIX.length);
    const resolved = await nextResolve(bare, context);
    return { ...resolved, url: `${resolved.url}${ORIGINAL_SUFFIX}`, shortCircuit: true };
  }
  const resolved = await nextResolve(specifier, context);
  const hit = backpassSourceFile(resolved.url);
  if (hit && !hit.query && OVERRIDES[hit.file]) {
    return { ...resolved, url: new URL(OVERRIDES[hit.file], import.meta.url).href, shortCircuit: true };
  }
  return resolved;
}

export async function load(url, context, nextLoad) {
  const hit = backpassSourceFile(url);
  const loaded = await nextLoad(url, context);
  if (!hit || loaded.source == null) return loaded;
  const patched = patchSource(hit.file, sourceText(loaded.source));
  return patched === null ? loaded : { ...loaded, source: patched, shortCircuit: true };
}

function sourceText(source) {
  if (typeof source === "string") return source;
  return Buffer.from(source).toString("utf8");
}
