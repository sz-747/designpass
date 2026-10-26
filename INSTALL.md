# Agent installation and setup guide

This guide is for a coding agent installing Designpass for a user. Run installation commands in the tool checkout and project commands in the user's UI repository. Installing the tool and running its offline checks do not require model calls.

## Prerequisites

- Git and Node.js 22.5 or newer. Node.js 24 is recommended.
- A Git repository containing the UI project to inspect.
- For model analysis and proposals: [acpx](https://github.com/openclaw/acpx) on PATH and an authenticated coding agent. These calls use the agent's account and may consume quota or incur provider charges. Run them only within the user's authorized scope.

## Install from GitHub

Choose a tool directory outside the UI project. Reuse an existing Designpass checkout if the user already has one.

```sh
git clone https://github.com/sz-747/designpass.git
cd designpass
npm ci
npm link
designpass --version
```

`npm link` makes the `designpass` command available globally. If a global link is unsuitable, run `node /path/to/designpass/bin/designpass.js` instead, from the UI project's working directory. Replace the path with the actual checkout location.

For model stages, install acpx if it is missing:

```sh
npm install -g acpx
```

Use the coding agent's normal login process. Keep credentials in its authentication store. Designpass does not require a separate API key of its own.

## Configure the UI project

Run Designpass inside the Git repository whose UI the user wants to improve. Project configuration lives in `.designpassrc.json`. Personal configuration lives in `~/.config/designpass/config.json`, or beneath `XDG_CONFIG_HOME` when set.

Example project configuration using Codex for both model passes:

```json
{
  "memoryFiles": ["DESIGN.md"],
  "budgetTokens": 8000,
  "analysis": { "agent": "codex" },
  "synthesis": { "agent": "codex" },
  "drift": { "excludeDirs": ["test", "fixtures"] }
}
```

You can set `model` and `effort` within either role. Use model identifiers supported by the authenticated agent. Without a pinned agent, each pass tries its configured candidate list.

Keep private host settings in personal configuration. Add `.designpass/` to the UI project's ignore rules: it contains generated evidence and proposals, which can include private session content and machine paths.

Make sure the coding agent reads `DESIGN.md` during UI work. Reference it in the project's agent instructions or include it in task context. Creating the file alone does not make every harness load it.

## Prepare the design file

Keep an existing `DESIGN.md` if the project has one. Otherwise, choose one of these commands from the UI project:

```sh
# Start from an empty skeleton.
designpass seed

# Or copy an existing design file and record its starting content.
designpass seed --from path/to/design.md
```

`seed` refuses to overwrite an existing file without `--force`. Preserve the user's current design file unless they authorize replacement.

Use nested token maps followed by Markdown rules:

```yaml
---
colors:
  paper: "#ffffff"
  ink: "#111111"
typography:
  body:
    fontFamily: "Inter, sans-serif"
    fontSize: 16px
rounded:
  card: 8px
spacing:
  gutter: 1rem
components:
  button:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.paper}"
---

# Design system

## Principles

- Use one body size for running text.
```

The parser supports the nested maps used by Stitch-style files. It is not a complete YAML implementation. Details needed only for a specific component or page can live in `design-<thing>` skills under `.agents/skills`. Their description lines count toward the token budget.

## Run the workflow

Start with the offline source scan:

```sh
designpass drift
designpass provenance
```

When model analysis is authorized:

```sh
# Discover sessions, analyze them, and generate a proposal.
designpass

# Review proposed edits and write the ones the user accepts.
designpass apply
```

Analysis writes reports and proposals. `apply` changes the design file and skills after review. The drift command reports source values without rewriting the UI.

| Command | Purpose |
| --- | --- |
| `designpass scan` | Discover sessions associated with the repository. |
| `designpass analyze` | Analyze selected sessions and cache their evidence. |
| `designpass propose` | Generate a proposal from available evidence. |
| `designpass apply --dry-run` | Preview changes without writing them. |
| `designpass status` | Inspect the current run state. |
| `designpass provenance` | Compare the current file with its recorded seed. |
| `designpass drift --json` | Print the source scan as JSON. |

Use `--since 7d` to narrow discovery, `--strict` to exclude uncertain repository associations, and `--force` to refresh cached analysis.

For a personal design file shared across projects:

```sh
designpass seed --scope user
designpass --scope user
designpass apply --scope user
```

User scope targets `~/.agents/DESIGN.md`. Source drift is measured only in project scope because user scope has no single repository to scan.

## Privacy and interpretation

Discovery and drift measurement run locally. Model stages send distilled session content and design context through the configured agent. Obvious secrets are redacted during distillation, but review which sessions and files are made available to that agent.

Source drift is evidence to investigate. It does not establish whether the code or the design file should change. Proposed additions, rewrites, and removals must meet session evidence thresholds and fit an edit cap and token budget. The default budget is 8,000 estimated tokens.

The design checks reject missing front-matter fences, removed front matter, and newly broken token references. For component text and background colors that resolve to hex values, they reject newly introduced contrast below 3:1 and advise on ratios below 4.5:1. They do not establish full accessibility compliance. The accepted subset is checked again before writing.

## Limits and troubleshooting

- The source scanner reads text without rendering pages. It can miss generated styles and report literals from comments or examples.
- `rem` assumes 16px. Values in `em`, `%`, `vw`, and expressions such as `calc()` are not compared.
- Scanning stops at 2,000 eligible files and skips files larger than 512 KiB. Dependencies and build output are excluded.
- Source drift is not in the analysis cache key. After significant source changes, use `--force` to analyze sessions with the new scan.
- Provenance measures changes from the seed. A changed unit is not proof that a session justified it.
- Sessions launched from a parent directory may not associate with a child repository. Start UI sessions inside the project checkout.
- Runtime integration uses module hooks and exact anchors against a pinned dependency. If an anchor fails, check the installed dependency version. Do not bypass the failure.
- Live model analysis and proposal generation remain unverified end to end in this release.

## Verify the installation

From the Designpass checkout:

```sh
npm test
node bin/designpass.js --version
```

The offline suite covers token parsing, line numbers, source drift, contrast and references, provenance, and runtime integration. It needs no account or model calls. Report installation and offline checks separately from any live model run.
