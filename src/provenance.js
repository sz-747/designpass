import { unitHash } from "./design-memory.js";

/**
 * How much of a DESIGN.md is still someone else's.
 *
 * A unit is `borrowed` when its content hash matches a unit of the seed source (the
 * provenance record written by `designpass seed`, or any file passed with `--against`)
 * and `own` otherwise. `dropped` counts source units no longer present. Hashes are
 * backpass's normalised unit hashes, so a cosmetic edit elsewhere in the file does not
 * turn a borrowed line into an "own" one, but any real change to the line does.
 */
export function provenanceReport({ units, sourceHashes }) {
  const source = new Set(sourceHashes);
  const rows = units.map((u) => ({
    id: u.id,
    section: topSection(u),
    hash: u.hash ?? unitHash(u.text),
    tokens: u.tokens ?? 0,
  }));
  const present = new Set(rows.map((r) => r.hash));
  const borrowed = rows.filter((r) => source.has(r.hash));
  const own = rows.filter((r) => !source.has(r.hash));
  const dropped = [...source].filter((h) => !present.has(h)).length;

  const sections = new Map();
  for (const row of rows) {
    if (!sections.has(row.section)) sections.set(row.section, { section: row.section, borrowed: 0, own: 0 });
    sections.get(row.section)[source.has(row.hash) ? "borrowed" : "own"] += 1;
  }
  const tokensOf = (list) => list.reduce((n, r) => n + r.tokens, 0);
  return {
    total: rows.length,
    borrowed: borrowed.length,
    own: own.length,
    dropped,
    borrowedTokens: tokensOf(borrowed),
    ownTokens: tokensOf(own),
    ownShare: rows.length ? own.length / rows.length : 0,
    sections: [...sections.values()],
  };
}

function topSection(unit) {
  const section = unit.section || "";
  if (section.startsWith("front matter")) return section.split(" > ").slice(0, 2).join(" > ");
  return section.split(" > ")[0] || "(top)";
}

export function renderProvenance(report, { label = "seed source" } = {}) {
  const pct = (n) => `${Math.round(n * 100)}%`;
  const lines = [];
  lines.push(
    `provenance · ${report.total} unit(s): ${report.own} own (${pct(report.ownShare)}), ${report.borrowed} still from the ${label}` +
      (report.dropped ? `, ${report.dropped} source unit(s) dropped` : ""),
  );
  lines.push(`  tokens: ${report.ownTokens} own · ${report.borrowedTokens} borrowed`);
  for (const s of report.sections) {
    lines.push(`  ${s.section.padEnd(34)} own ${String(s.own).padStart(3)} · borrowed ${String(s.borrowed).padStart(3)}`);
  }
  return lines.join("\n");
}
