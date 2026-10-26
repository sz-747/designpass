import fs from "node:fs";
import path from "node:path";

import { resolveReference, tokenTable } from "./design-memory.js";

/**
 * Source drift: the deterministic loss signal a transcript cannot give.
 *
 * Scans the repository's UI source for literal design values - colours, font sizes,
 * spacing, radii, font families - and compares them with the DESIGN.md token table.
 * Every literal that matches no token is drift; every token no source uses is dead
 * weight. The report goes into the analysis and synthesis prompts as `{{DRIFT}}`, is
 * written to the state dir as `drift.json`, and is printed by `designpass drift`.
 *
 * No model is involved, no file outside the repo is read, and nothing is written to the
 * repo. Values are matched exactly after normalisation (hex lower-cased and expanded,
 * rem converted to px at 16px, `{a.b}` references resolved); fuzzy matching would hide
 * the very drift this measures. Fluid values (clamp, calc, em, %, vw) are not compared.
 */

export const SOURCE_EXTENSIONS = new Set([
  ".css",
  ".scss",
  ".less",
  ".pcss",
  ".tsx",
  ".jsx",
  ".ts",
  ".js",
  ".mjs",
  ".html",
  ".vue",
  ".svelte",
  ".astro",
  ".mdx",
]);

export const SKIP_DIRS = new Set([
  "node_modules",
  "dist",
  "build",
  "out",
  ".next",
  ".git",
  ".designpass",
  ".backpass",
  "coverage",
  ".turbo",
  ".cache",
  "vendor",
]);

const MAX_FILE_BYTES = 512 * 1024;
const MAX_FILES = 2000;
const MAX_LOCATIONS = 3;
const REM_PX = 16;

export function listSourceFiles(root, { excludeDirs = [] } = {}) {
  const skip = new Set([...SKIP_DIRS, ...excludeDirs]);
  const files = [];
  const walk = (dir) => {
    if (files.length >= MAX_FILES) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      if (files.length >= MAX_FILES) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!skip.has(entry.name)) walk(full);
        continue;
      }
      if (!entry.isFile()) continue;
      const ext = path.extname(entry.name).toLowerCase();
      if (!SOURCE_EXTENSIONS.has(ext)) continue;
      if (/\.min\.|\.d\.ts$/.test(entry.name)) continue;
      try {
        if (fs.statSync(full).size > MAX_FILE_BYTES) continue;
      } catch {
        continue;
      }
      files.push(full);
    }
  };
  walk(root);
  return files;
}

export function normalizeHex(value) {
  const m = String(value).trim().match(/^#([0-9a-f]{3,8})$/i);
  if (!m) return null;
  let hex = m[1].toLowerCase();
  if (hex.length === 3 || hex.length === 4) hex = [...hex].map((c) => c + c).join("");
  if (hex.length === 8 && hex.endsWith("ff")) hex = hex.slice(0, 6);
  if (hex.length !== 6 && hex.length !== 8) return null;
  return `#${hex}`;
}

export function normalizeColor(value) {
  const v = String(value).trim();
  const hex = normalizeHex(v);
  if (hex) return hex;
  const rgb = v.match(/^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/i);
  if (rgb) {
    const [r, g, b] = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Number(n)));
    const alpha = rgb[4];
    const hex6 = `#${[r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
    if (!alpha || alpha === "1" || alpha === "100%") return hex6;
    return `${hex6}@${alpha}`;
  }
  return v.toLowerCase().replace(/\s+/g, "");
}

/** A CSS length to px, or null when it is relative to something we cannot know (em, %, vw). */
export function lengthToPx(value) {
  const v = String(value).trim();
  if (v === "0") return 0;
  const m = v.match(/^(-?\d*\.?\d+)(px|rem)$/i);
  if (!m) return null;
  const n = Number(m[1]);
  return m[2].toLowerCase() === "rem" ? round(n * REM_PX) : round(n);
}

/**
 * Every fixed length in a CSS value list (`0.35rem 2rem` -> [5.6, 32]). Parts inside a
 * function call (clamp, calc, var) are not fixed lengths and are skipped, which the
 * whitespace split does naturally: `clamp(1rem,` is not a length.
 */
export function lengthsIn(value) {
  return String(value)
    .trim()
    .split(/\s+/)
    .map(lengthToPx)
    .filter((px) => px !== null);
}

function round(n) {
  return Math.round(n * 100) / 100;
}

const COLOR_LITERAL = /#(?:[0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{3,4})\b|rgba?\([^)]*\)|hsla?\([^)]*\)/gi;
const CUSTOM_PROPERTY = /(--[A-Za-z0-9_-]+)\s*:\s*([^;{}]+)/g;
const VAR_USE = /var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g;
const DECLARATION =
  /\b(font-size|padding(?:-(?:top|right|bottom|left|inline|block))?|margin(?:-(?:top|right|bottom|left|inline|block))?|gap|row-gap|column-gap|border-radius|font-family)\s*:\s*([^;{}]+)/g;
const TAILWIND_ARBITRARY = /\b(text|p[xytrbl]?|m[xytrbl]?|gap(?:-[xy])?|space-[xy]|rounded(?:-[a-z]{1,2})?)-\[(-?\d*\.?\d+(?:px|rem))\]/g;

const GROUP_OF_PROPERTY = (prop) => {
  if (prop === "font-size") return "typography";
  if (prop === "border-radius") return "rounded";
  if (prop === "font-family") return "font";
  if (/^(padding|margin|gap|row-gap|column-gap)/.test(prop)) return "spacing";
  return null;
};

const GROUP_OF_TAILWIND = (prefix) => {
  if (prefix === "text") return "typography";
  if (prefix.startsWith("rounded")) return "rounded";
  if (/^(p|m)[xytrbl]?$|^gap|^space-/.test(prefix)) return "spacing";
  return null;
};

/** Radii may be zero (a square corner is a design choice); spacing and sizes must be positive. */
const ACCEPTS = {
  typography: (px) => px > 0,
  spacing: (px) => px > 0,
  rounded: (px) => px >= 0,
};

function lineOf(text, index) {
  let line = 1;
  for (let i = 0; i < index && i < text.length; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function firstFamily(value) {
  const first = String(value).split(",")[0].trim().replace(/^["']|["']$/g, "");
  return first.startsWith("var(") || first.startsWith("{") ? "" : first;
}

class Tally {
  constructor() {
    this.map = new Map();
  }
  add(value, location) {
    if (!this.map.has(value)) this.map.set(value, { value, uses: 0, locations: [] });
    const entry = this.map.get(value);
    entry.uses += 1;
    if (entry.locations.length < MAX_LOCATIONS && !entry.locations.includes(location)) entry.locations.push(location);
  }
  entries() {
    return [...this.map.values()].sort((a, b) => b.uses - a.uses || String(a.value).localeCompare(String(b.value)));
  }
}

/**
 * Compare a tally of source values with `[tokenName, value]` pairs. A token may carry
 * several values (a two-value spacing shorthand) and several tokens may share one value
 * (every serif style referencing the body family).
 */
function classify(tally, pairs) {
  const known = [];
  const unknown = [];
  const names = new Set();
  const valueToTokens = new Map();
  for (const [name, value] of pairs) {
    names.add(name);
    if (!valueToTokens.has(value)) valueToTokens.set(value, []);
    if (!valueToTokens.get(value).includes(name)) valueToTokens.get(value).push(name);
  }
  for (const entry of tally.entries()) {
    const tokens = valueToTokens.get(entry.value);
    if (tokens) known.push({ ...entry, tokens });
    else unknown.push(entry);
  }
  const usedNames = new Set(known.flatMap((k) => k.tokens));
  const usedValues = new Set(known.map((k) => k.value));
  return {
    tokenCount: names.size,
    known,
    unknown,
    unused: [...names].filter((name) => !usedNames.has(name)),
    unusedValues: [...valueToTokens].filter(([value]) => !usedValues.has(value)).map(([value, tokens]) => ({ value, tokens })),
  };
}

/**
 * Scan one repository. `designText` is the DESIGN.md content; `memoryPath` only labels
 * the report. Returns a JSON-serialisable report.
 */
export function scanSourceDrift({ root, memoryPath = "DESIGN.md", designText = "", excludeDirs = [] }) {
  const table = tokenTable(designText);
  const files = listSourceFiles(root, { excludeDirs });

  const colors = new Tally();
  const sizes = { typography: new Tally(), spacing: new Tally(), rounded: new Tally() };
  const fonts = new Tally();
  const customProps = new Map(); // --name -> normalised colour, when the value is exactly one colour

  const texts = new Map();
  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    texts.set(file, text);
    for (const m of text.matchAll(CUSTOM_PROPERTY)) {
      const literals = [...m[2].matchAll(COLOR_LITERAL)].map((c) => normalizeColor(c[0]));
      if (literals.length === 1 && !m[2].includes("var(")) customProps.set(m[1], literals[0]);
    }
  }

  for (const [file, text] of texts) {
    const rel = path.relative(root, file).split(path.sep).join("/");
    const at = (index) => `${rel}:${lineOf(text, index)}`;

    for (const m of text.matchAll(COLOR_LITERAL)) colors.add(normalizeColor(m[0]), at(m.index));
    for (const m of text.matchAll(VAR_USE)) {
      const resolved = customProps.get(m[1]);
      if (resolved) colors.add(resolved, at(m.index));
    }
    for (const m of text.matchAll(DECLARATION)) {
      const group = GROUP_OF_PROPERTY(m[1]);
      if (!group) continue;
      if (group === "font") {
        const family = firstFamily(m[2]);
        if (family) fonts.add(family, at(m.index));
        continue;
      }
      for (const px of lengthsIn(m[2])) if (ACCEPTS[group](px)) sizes[group].add(px, at(m.index));
    }
    for (const m of text.matchAll(CUSTOM_PROPERTY)) {
      if (!/^--font/.test(m[1])) continue;
      const family = firstFamily(m[2]);
      if (family) fonts.add(family, at(m.index));
    }
    for (const m of text.matchAll(TAILWIND_ARBITRARY)) {
      const group = GROUP_OF_TAILWIND(m[1]);
      const px = lengthToPx(m[2]);
      if (group && px !== null && ACCEPTS[group](px)) sizes[group].add(px, at(m.index));
    }
  }

  const resolved = (value) => resolveReference(table, value) ?? value;
  const lengthPairs = (map) => {
    const pairs = [];
    for (const [name, value] of map) for (const px of lengthsIn(resolved(value))) pairs.push([name, px]);
    return pairs;
  };
  const colorPairs = [...table.colors].map(([name, value]) => [name, normalizeColor(resolved(value))]);
  const typePairs = [];
  const fontPairs = [];
  for (const [style, spec] of table.typography) {
    for (const px of lengthsIn(resolved(spec.fontSize || ""))) typePairs.push([style, px]);
    const family = firstFamily(resolved(spec.fontFamily || ""));
    if (family) fontPairs.push([style, family]);
  }
  const referenced = new Set(table.references.map((r) => r.to));

  const colorReport = classify(colors, colorPairs);
  const typographyReport = classify(sizes.typography, typePairs);
  const spacingReport = classify(sizes.spacing, lengthPairs(table.spacing));
  const roundedReport = classify(sizes.rounded, lengthPairs(table.rounded));
  const fontReport = classify(fonts, fontPairs);

  const group = (report, { unused }) => ({
    tokens: report.tokenCount,
    known: report.known,
    unknown: report.unknown,
    unused,
  });

  return {
    tool: "designpass",
    measuredAt: new Date().toISOString(),
    root,
    memoryPath,
    hasFrontMatter: table.hasFrontMatter,
    filesScanned: texts.size,
    colors: group(colorReport, {
      unused: colorReport.unused.map((name) => ({
        token: `colors.${name}`,
        referencedByTokens: referenced.has(`colors.${name}`),
      })),
    }),
    typography: group(typographyReport, { unused: typographyReport.unused }),
    spacing: group(spacingReport, { unused: spacingReport.unused }),
    rounded: group(roundedReport, { unused: roundedReport.unused }),
    // Families are shared by many styles, so an unused family is reported once with the
    // styles that carry it, not once per style.
    fonts: group(fontReport, {
      unused: fontReport.unusedValues.map(({ value, tokens }) => `${value} (${tokens.join(", ")})`),
    }),
  };
}

const MAX_LISTED = 12;

function unusedLabel(u) {
  return typeof u === "string" ? u : u.token;
}

function listValues(entries, format = (v) => v) {
  return entries
    .slice(0, MAX_LISTED)
    .map((e) => `${format(e.value)} (${e.uses} use${e.uses === 1 ? "" : "s"}; ${e.locations.join(", ")})`)
    .join("; ");
}

function px(v) {
  return `${v}px`;
}

/** The compact text the prompts see. Deterministic for a given report. */
export function renderDriftForPrompt(report) {
  if (!report) return "(no drift report)";
  if (!report.hasFrontMatter) {
    return (
      `Source drift was scanned across ${report.filesScanned} file(s), but ${report.memoryPath} has no YAML front ` +
      `matter, so there is no token table to compare against. Literal colours seen: ` +
      `${listValues(report.colors.unknown) || "none"}.`
    );
  }
  const lines = [];
  lines.push(
    `Deterministic scan of ${report.filesScanned} UI source file(s) against the token table (no model involved; ` +
      `exact matches after normalisation, rem at 16px; fluid values such as clamp() are not compared). ` +
      `Each item names where the value appears so a claim can be grounded.`,
  );
  const section = (label, group, format) => {
    const unknown = group.unknown.length
      ? `${group.unknown.length} literal(s) match no token: ${listValues(group.unknown, format)}`
      : "no off-token literals";
    const unused = group.unused.length ? `unused tokens: ${group.unused.map(unusedLabel).join(", ")}` : "every token is used";
    lines.push(
      `- ${label}: ${group.tokens} token(s); ${group.known.length} distinct source value(s) on-token; ${unknown}; ${unused}.`,
    );
  };
  section("colours", report.colors, (v) => v);
  section("font sizes", report.typography, px);
  section("spacing", report.spacing, px);
  section("radii", report.rounded, px);
  section("font families", report.fonts, (v) => v);
  return lines.join("\n");
}

/** Terminal rendering for `designpass drift`. */
export function renderDriftReport(report) {
  const out = [];
  out.push(`drift · ${report.memoryPath} · ${report.filesScanned} source file(s) scanned`);
  if (!report.hasFrontMatter) {
    out.push("  no YAML front matter in the design file, so there is no token table to compare against");
  }
  const group = (label, g, format = (v) => v) => {
    out.push("");
    out.push(
      `  ${label}: ${g.tokens} token(s), ${g.known.length} on-token value(s), ${g.unknown.length} off-token value(s), ${g.unused.length} unused token(s)`,
    );
    for (const e of g.unknown.slice(0, MAX_LISTED)) out.push(`    off-token  ${format(e.value)}  x${e.uses}  ${e.locations.join(", ")}`);
    if (g.unknown.length > MAX_LISTED) out.push(`    ... ${g.unknown.length - MAX_LISTED} more`);
    for (const u of g.unused.slice(0, MAX_LISTED)) out.push(`    unused     ${unusedLabel(u)}`);
    if (g.unused.length > MAX_LISTED) out.push(`    ... ${g.unused.length - MAX_LISTED} more`);
  };
  group("colours", report.colors);
  group("font sizes", report.typography, px);
  group("spacing", report.spacing, px);
  group("radii", report.rounded, px);
  group("font families", report.fonts);
  return out.join("\n");
}
