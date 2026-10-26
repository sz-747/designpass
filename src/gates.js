import { resolveReference, tokenTable } from "./design-memory.js";

/**
 * Design-specific mechanical gates, evaluated on the projected DESIGN.md text.
 *
 *   front matter   an opening `---` must have its closing fence
 *   references     every `{a.b}` in the front matter resolves to a token path;
 *                  a reference that was already broken before the edit is a note,
 *                  a newly broken one is a violation
 *   contrast       a component whose textColor/backgroundColor both resolve to hex
 *                  colours must not drop below CONTRAST_FLOOR unless it already was;
 *                  anything under CONTRAST_ADVISORY is noted for the human
 *
 * Everything here is measured from text; nothing is taken from the model.
 */

export const CONTRAST_FLOOR = 3.0;
export const CONTRAST_ADVISORY = 4.5;

export function designGates({ before, after }) {
  const violations = [];
  const notes = [];
  const next = tokenTable(after);
  const prev = tokenTable(before);

  if (next.unterminated) {
    violations.push("the front matter opens with `---` but never closes; restore the closing `---` line");
    return { violations, notes };
  }
  if (prev.hasFrontMatter && !next.hasFrontMatter) {
    violations.push("the edit removed the front matter entirely; the token table must stay at the top of the file");
    return { violations, notes };
  }

  const prevBroken = new Set(prev.references.filter((r) => !prev.nodes.has(r.to)).map((r) => `${r.from}->${r.to}`));
  for (const ref of next.references) {
    if (next.nodes.has(ref.to)) continue;
    const key = `${ref.from}->${ref.to}`;
    const message = `{${ref.to}} (referenced from ${ref.from}, line ${ref.line}) does not name any token`;
    if (prevBroken.has(key)) notes.push(`pre-existing broken reference: ${message}`);
    else violations.push(`${message}; add the token, or point the reference at one that exists`);
  }

  const prevRatios = componentContrast(prev);
  for (const [name, ratio] of componentContrast(next)) {
    const was = prevRatios.get(name);
    if (ratio < CONTRAST_FLOOR && (was === undefined || was >= CONTRAST_FLOOR)) {
      violations.push(
        `components.${name} text on its background has contrast ${ratio.toFixed(2)}:1, below the ${CONTRAST_FLOOR}:1 floor` +
          (was === undefined ? "" : ` (was ${was.toFixed(2)}:1)`),
      );
    } else if (ratio < CONTRAST_ADVISORY && (was === undefined || Math.abs(was - ratio) > 0.01)) {
      notes.push(`components.${name} contrast is ${ratio.toFixed(2)}:1, under the ${CONTRAST_ADVISORY}:1 body-text guideline`);
    }
  }
  return { violations, notes };
}

/** Component name -> contrast ratio, for every component whose two colours resolve to hex. */
export function componentContrast(table) {
  const out = new Map();
  for (const [name, spec] of table.components) {
    const fg = parseHex(resolveReference(table, spec.textColor));
    const bg = parseHex(resolveReference(table, spec.backgroundColor));
    if (fg && bg) out.set(name, contrastRatio(fg, bg));
  }
  return out;
}

export function parseHex(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (!m) return null;
  let hex = m[1];
  if (hex.length <= 4) hex = [...hex].map((c) => c + c).join("");
  return [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

function luminance([r, g, b]) {
  const channel = (c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a, b) {
  const la = luminance(a);
  const lb = luminance(b);
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}
