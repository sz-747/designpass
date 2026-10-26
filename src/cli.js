import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";

import { loadConfig, STATE_DIRNAME, userStateDir } from "backpass/src/config.js";
import { UserError, color, fail, info, json, out } from "backpass/src/logger.js";
import { parseMemoryUnits } from "backpass/src/memory.js";
import { resolveRepo } from "backpass/src/repo.js";

import { configure, currentDrift } from "./context.js";
import { provenanceReport, renderProvenance } from "./provenance.js";
import { renderDriftReport } from "./drift.js";
import { seedDesignFile } from "./seed.js";

const PKG = JSON.parse(
  fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "package.json"), "utf8"),
);
export const VERSION = PKG.version;

const HELP = `designpass v${VERSION} - a backward pass over DESIGN.md (built on backpass)

Finds the agent sessions that built UI in this repo, measures how well DESIGN.md's tokens
and rules steered them, scans the source for values that drift from the token table, and
proposes evidence-backed edits - under a token budget, gated by you. Never writes without
\`apply\`.

DESIGNPASS COMMANDS
  seed [--from <file>] [--scope user] [--force]
             create DESIGN.md (or ~/.agents/DESIGN.md) from an empty skeleton or a
             borrowed file, and record its provenance
  provenance [--against <file>] [--scope user] [--json]
             how much of the design file is still the seed's text vs earned since
  drift [--json]
             the deterministic source-drift scan on its own (no model calls)

BACKPASS COMMANDS (run, scan, analyze, propose, apply, status, init) and every flag are
inherited unchanged; \`designpass --scope user\` trains ~/.agents/DESIGN.md across projects.
State lives in .designpass/ (project) or ~/.config/designpass/user/ (user scope); the
project config file is .designpassrc.json, the user config ~/.config/designpass/config.json.
`;

function scopeOf(argv) {
  const eq = argv.find((a) => a.startsWith("--scope="));
  if (eq) return eq.slice("--scope=".length);
  const i = argv.indexOf("--scope");
  return i >= 0 ? argv[i + 1] : "project";
}

function expandHome(p) {
  if (p === "~") return os.homedir();
  if (p.startsWith("~/")) return path.join(os.homedir(), p.slice(2));
  return p;
}

/** Where the design file and the provenance record live for a scope. */
function resolveSurface(scope) {
  if (scope === "user") {
    const config = loadConfig(null, {}, { kind: "user" });
    const entry = config.memoryFiles[0];
    const expanded = expandHome(entry);
    const target = path.isAbsolute(expanded) ? expanded : path.join(os.homedir(), expanded);
    return { scope, root: os.homedir(), target, relative: entry, stateDir: userStateDir(), name: "user" };
  }
  const repo = resolveRepo(process.cwd());
  const config = loadConfig(repo.root, {});
  const entry = config.memoryFiles[0];
  return {
    scope,
    root: repo.root,
    target: path.join(repo.root, entry),
    relative: entry,
    stateDir: path.join(repo.root, STATE_DIRNAME),
    name: repo.name,
  };
}

function parse(argv, options) {
  return parseArgs({ args: argv, options, allowPositionals: true, strict: true });
}

async function cmdSeed(argv) {
  const { values } = parse(argv, {
    scope: { type: "string" },
    from: { type: "string" },
    force: { type: "boolean" },
  });
  const surface = resolveSurface(values.scope === "user" ? "user" : "project");
  const result = seedDesignFile({
    target: surface.target,
    recordPath: path.join(surface.stateDir, "provenance.json"),
    from: values.from ? path.resolve(values.from) : null,
    name: surface.name,
    force: Boolean(values.force),
    parseUnits: parseMemoryUnits,
  });
  info(`${color.green("·")} wrote ${result.target} (${result.units} unit(s), ${result.bytes} bytes${result.borrowed ? `, borrowed from ${values.from}` : ", empty skeleton"})`);
  info(`${color.green("·")} provenance recorded in ${result.recordPath}`);
  out("");
  out(
    surface.scope === "user"
      ? "Next: `designpass --scope user` runs a backward pass over it from your sessions across projects."
      : "Next: `designpass` runs a backward pass over it from this repo's sessions; `designpass drift` scans the source now.",
  );
  return 0;
}

async function cmdProvenance(argv) {
  const { values } = parse(argv, {
    scope: { type: "string" },
    against: { type: "string" },
    json: { type: "boolean" },
  });
  const surface = resolveSurface(values.scope === "user" ? "user" : "project");
  if (!fs.existsSync(surface.target)) throw new UserError(`${surface.target} does not exist`, "seed it with `designpass seed`");
  const units = parseMemoryUnits(fs.readFileSync(surface.target, "utf8"));
  let sourceHashes;
  let label;
  if (values.against) {
    const file = path.resolve(values.against);
    if (!fs.existsSync(file)) throw new UserError(`--against file not found: ${file}`);
    sourceHashes = parseMemoryUnits(fs.readFileSync(file, "utf8")).map((u) => u.hash);
    label = path.basename(file);
  } else {
    const recordPath = path.join(surface.stateDir, "provenance.json");
    if (!fs.existsSync(recordPath)) {
      throw new UserError(
        `no provenance record at ${recordPath}`,
        "the file was not seeded by designpass; compare against any file with --against <path>",
      );
    }
    const record = JSON.parse(fs.readFileSync(recordPath, "utf8"));
    sourceHashes = (record.units || []).map((u) => u.hash);
    label = record.source ? `seed ${path.basename(record.source)} (${record.seededAt.slice(0, 10)})` : `empty skeleton (${record.seededAt.slice(0, 10)})`;
  }
  const report = provenanceReport({ units, sourceHashes });
  if (values.json) {
    json({ file: surface.target, against: label, ...report });
    return 0;
  }
  out(`${surface.relative} vs ${label}`);
  out(renderProvenance(report, { label }));
  return 0;
}

async function cmdDrift(argv) {
  const { values } = parse(argv, { json: { type: "boolean" }, scope: { type: "string" } });
  if (values.scope === "user") throw new UserError("drift scans one repository; it does not apply to user scope");
  const surface = resolveSurface("project");
  configure({ scope: "project", cwd: process.cwd() });
  const report = currentDrift(surface.relative);
  if (values.json) {
    json(report);
    return 0;
  }
  out(renderDriftReport(report));
  out("");
  out(color.dim(`  full report: ${path.join(surface.stateDir, "drift.json")}`));
  return 0;
}

const LOCAL_COMMANDS = { seed: cmdSeed, provenance: cmdProvenance, drift: cmdDrift };

export async function runCli(argv) {
  const command = argv.find((a) => !a.startsWith("-"));
  if (argv.includes("--version") || argv.includes("-v")) {
    const backpass = JSON.parse(
      fs.readFileSync(new URL("../node_modules/backpass/package.json", import.meta.url), "utf8"),
    );
    console.log(`designpass ${VERSION} (backpass ${backpass.version})`);
    return 0;
  }
  if (!command && (argv.includes("--help") || argv.includes("-h"))) {
    console.log(HELP);
    const { main } = await import("backpass/src/cli.js");
    return main(["--help"]);
  }
  try {
    if (LOCAL_COMMANDS[command]) return await LOCAL_COMMANDS[command](argv.filter((a) => a !== command));
    configure({ scope: scopeOf(argv) === "user" ? "user" : "project", cwd: process.cwd() });
    const { main } = await import("backpass/src/cli.js");
    return await main(argv);
  } catch (err) {
    if (err instanceof UserError || err?.hint) {
      fail(err.message);
      if (err.hint) console.error(`  ${err.hint}`);
      return 1;
    }
    fail(err.stack || err.message);
    return 1;
  }
}
