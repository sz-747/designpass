import { sha256 } from "backpass/src/state.js";
import { estimateTokens } from "backpass/src/tokens.js";

/**
 * DESIGN.md as weights.
 *
 * A Stitch-style DESIGN.md has two layers: YAML front matter holding the tokens
 * (colors, typography, rounded, spacing, components) and a markdown body holding the
 * rules. backpass's own parser handles the body; this module adds the token layer.
 *
 *   TK-<path>   one unit per front-matter leaf (`TK-colors.link`,
 *               `TK-typography.display-hero.fontSize`), text = the line as written,
 *               with its real line number so hunks and removal gates land on it
 *   DS-nnn      body rules, backpass's units re-aliased, line numbers offset past the
 *               front matter; oversized paragraphs keep their DS-nnn.m sentence parts
 *
 * The front-matter parser is indentation-based and line-aware on purpose: a YAML
 * library would lose line numbers, and every token file in the wild is a plain nested
 * map of scalars. Anything it cannot read is left out of the index rather than guessed.
 */

const FRONT_MATTER_FENCE = "---";

/**
 * CRLF files are common on Windows and in git checkouts with autocrlf. A stray CR
 * makes a blank line non-blank, which merges paragraphs into one oversized unit, so
 * every parse sees LF text. Line numbers are unaffected: the count of LF is the same.
 */
export function normalizeNewlines(text) {
  return String(text).replace(/\r\n?/g, "\n");
}

function normalizeForHash(text) {
  return text
    .toLowerCase()
    .replace(/[`*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Identical to backpass's unit hash so provenance and re-anchoring agree across tools. */
export function unitHash(text) {
  return sha256(normalizeForHash(text)).slice(0, 12);
}

/**
 * Split text into front matter lines and body. `bodyOffset` is the number of leading
 * lines (opening fence, header, closing fence) the body's line numbers must skip.
 */
export function splitFrontMatter(text) {
  const lines = text.split("\n");
  if ((lines[0] || "").trim() !== FRONT_MATTER_FENCE) {
    return { header: null, headerStart: 0, bodyOffset: 0, unterminated: false, lines };
  }
  for (let i = 1; i < lines.length; i += 1) {
    if (lines[i].trim() === FRONT_MATTER_FENCE) {
      return { header: lines.slice(1, i), headerStart: 1, bodyOffset: i + 1, unterminated: false, lines };
    }
  }
  return { header: null, headerStart: 0, bodyOffset: 0, unterminated: true, lines };
}

const KEY_LINE = /^(\s*)(?:(-)\s+)?([^\s#:-][^:]*?)\s*:(?:\s+(.*?)\s*|\s*)$/;
const LIST_LINE = /^(\s*)-\s+(.*?)\s*$/;

function stripQuotes(value) {
  const v = String(value ?? "").trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) return v.slice(1, -1);
  return v;
}

/**
 * Parse front-matter lines into token nodes with line numbers.
 *
 * Returns `{ leaves, maps }`: leaves are `{ path, key, value, raw, startLine, endLine, section }`
 * (1-based line numbers in the whole file); `maps` is the set of every non-leaf path.
 */
export function parseFrontMatter(headerLines, firstLineNumber = 2) {
  const leaves = [];
  const maps = new Set();
  const stack = []; // { indent, key }
  const listCounters = new Map();

  const pathOf = (key) => [...stack.map((s) => s.key), key].join(".");
  const sectionOf = () => ["front matter", ...stack.map((s) => s.key)].join(" > ");

  for (let i = 0; i < headerLines.length; i += 1) {
    const line = headerLines[i];
    const lineNumber = firstLineNumber + i;
    if (!line.trim() || /^\s*#/.test(line)) continue;

    const indent = line.match(/^\s*/)[0].length;
    while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();

    const keyed = line.match(KEY_LINE);
    if (keyed) {
      const [, , dash, rawKey, rawValue] = keyed;
      let key = rawKey.trim();
      if (dash) {
        const parent = stack.map((s) => s.key).join(".");
        const n = (listCounters.get(parent) || 0) + 1;
        listCounters.set(parent, n);
        key = `[${n}].${key}`;
      }
      const value = rawValue === undefined ? "" : rawValue;
      if (value === "" || value === "{}" || value === "[]") {
        maps.add(pathOf(key));
        if (value === "") stack.push({ indent, key });
        continue;
      }
      let endLine = lineNumber;
      if (value === "|" || value === ">" || value === "|-" || value === ">-") {
        // Block scalar: the indented lines that follow belong to this leaf.
        let j = i + 1;
        while (j < headerLines.length) {
          const next = headerLines[j];
          const nextIndent = next.match(/^\s*/)[0].length;
          if (next.trim() && nextIndent <= indent) break;
          j += 1;
        }
        endLine = firstLineNumber + j - 1;
        const block = headerLines.slice(i + 1, j).map((l) => l.trim()).join(" ");
        leaves.push({
          path: pathOf(key),
          key,
          value: block,
          raw: line.trim(),
          text: [line.trim(), ...headerLines.slice(i + 1, j).map((l) => l.trim())].join("\n").replace(/\s+$/, ""),
          startLine: lineNumber,
          endLine,
          section: sectionOf(),
        });
        i = j - 1;
        continue;
      }
      leaves.push({
        path: pathOf(key),
        key,
        value: stripQuotes(value),
        raw: line.trim(),
        text: line.trim(),
        startLine: lineNumber,
        endLine,
        section: sectionOf(),
      });
      continue;
    }

    const item = line.match(LIST_LINE);
    if (item) {
      const parent = stack.map((s) => s.key).join(".");
      const n = (listCounters.get(parent) || 0) + 1;
      listCounters.set(parent, n);
      const key = `[${n}]`;
      leaves.push({
        path: pathOf(key),
        key,
        value: stripQuotes(item[2]),
        raw: line.trim(),
        text: line.trim(),
        startLine: lineNumber,
        endLine: lineNumber,
        section: sectionOf(),
      });
    }
    // Anything else (a bare continuation line) is not indexed.
  }
  return { leaves, maps };
}

function tokenUnit(leaf, seen) {
  let id = `TK-${leaf.path}`;
  if (seen.has(id)) {
    let n = 2;
    while (seen.has(`${id}#${n}`)) n += 1;
    id = `${id}#${n}`;
  }
  seen.add(id);
  return {
    id,
    hash: unitHash(leaf.text),
    tokens: estimateTokens(leaf.text),
    text: leaf.text,
    section: leaf.section,
    startLine: leaf.startLine,
    endLine: leaf.endLine,
    tokenPath: leaf.path,
    tokenValue: leaf.value,
  };
}

function realias(unit, index, offset) {
  const id = `DS-${String(index + 1).padStart(3, "0")}`;
  const parts = unit.parts?.map((part, p) => ({
    ...part,
    id: `${id}.${p + 1}`,
    parentId: id,
    startLine: part.startLine + offset,
    endLine: part.endLine + offset,
  }));
  return { ...unit, id, startLine: unit.startLine + offset, endLine: unit.endLine + offset, ...(parts ? { parts } : {}) };
}

/**
 * The full unit list for a DESIGN.md: token leaves first (in file order), then body
 * rules. `parseBody` is backpass's `parseMemoryUnits`, injected so this module has no
 * dependency on the module it replaces.
 */
export function parseDesignUnits(rawText, parseBody) {
  const text = normalizeNewlines(rawText);
  const split = splitFrontMatter(text);
  const seen = new Set();
  const units = [];
  if (split.header) {
    const { leaves } = parseFrontMatter(split.header, split.headerStart + 1);
    for (const leaf of leaves) units.push(tokenUnit(leaf, seen));
  }
  const bodyText = split.lines.slice(split.bodyOffset).join("\n");
  const body = parseBody(bodyText);
  for (let i = 0; i < body.length; i += 1) units.push(realias(body[i], i, split.bodyOffset));
  return units;
}

const REFERENCE = /\{([A-Za-z0-9_.\-[\]]+)\}/g;

/**
 * The token table behind a DESIGN.md: values by path, every node path that a
 * `{a.b}` reference may point to, and the references each leaf makes.
 */
export function tokenTable(rawText) {
  const split = splitFrontMatter(normalizeNewlines(rawText));
  const table = {
    unterminated: split.unterminated,
    hasFrontMatter: Boolean(split.header),
    leaves: new Map(),
    nodes: new Set(),
    references: [],
    colors: new Map(),
    spacing: new Map(),
    rounded: new Map(),
    typography: new Map(),
    components: new Map(),
  };
  if (!split.header) return table;
  const { leaves, maps } = parseFrontMatter(split.header, split.headerStart + 1);
  for (const map of maps) table.nodes.add(map);
  for (const leaf of leaves) {
    table.leaves.set(leaf.path, leaf);
    table.nodes.add(leaf.path);
    const parts = leaf.path.split(".");
    for (let i = 1; i < parts.length; i += 1) table.nodes.add(parts.slice(0, i).join("."));
    for (const match of String(leaf.value).matchAll(REFERENCE)) {
      table.references.push({ from: leaf.path, to: match[1], line: leaf.startLine });
    }
    const [group, ...rest] = parts;
    if (group === "colors" && rest.length === 1) table.colors.set(rest[0], leaf.value);
    if (group === "spacing" && rest.length === 1) table.spacing.set(rest[0], leaf.value);
    if (group === "rounded" && rest.length === 1) table.rounded.set(rest[0], leaf.value);
    if (group === "typography" && rest.length === 2) {
      if (!table.typography.has(rest[0])) table.typography.set(rest[0], {});
      table.typography.get(rest[0])[rest[1]] = leaf.value;
    }
    if (group === "components" && rest.length === 2) {
      if (!table.components.has(rest[0])) table.components.set(rest[0], {});
      table.components.get(rest[0])[rest[1]] = leaf.value;
    }
  }
  return table;
}

/** Resolve a `{a.b.c}` reference chain to a scalar value, or null when it does not resolve. */
export function resolveReference(table, value, depth = 0) {
  if (typeof value !== "string" || depth > 8) return value ?? null;
  const match = value.trim().match(/^\{([A-Za-z0-9_.\-[\]]+)\}$/);
  if (!match) return value;
  const leaf = table.leaves.get(match[1]);
  if (!leaf) return null;
  return resolveReference(table, leaf.value, depth + 1);
}
