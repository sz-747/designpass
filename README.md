# Designpass

Designpass helps you improve the design instructions you give coding agents.

You keep your colors, fonts, spacing, and design rules in a file called `DESIGN.md`. After agents build UI, Designpass reads their session records and checks the code for differences from that file. It suggests small changes to the instructions, and you choose which ones to keep.

## What you use it for

Use Designpass when agents keep making the same design mistakes and you want future sessions to benefit from what you have already learned.

- **Reduce repeated corrections.** If you keep asking agents to use the same spacing or button style, check whether the design instructions need to be clearer.
- **Keep UI work consistent.** Find colors, text sizes, and other style values in the code that do not match the values in your design file.
- **Improve a starting design file.** Begin with an empty file or a borrowed template, then review changes supported by your own sessions.

For example, your design file says body text should be `16px`, but agents repeatedly write `15px`. Designpass shows where that happens and looks for session evidence that explains it. You can then review a proposal to clarify the rule or change the value. The mismatch alone does not tell it which choice is right.

Designpass updates the instructions used for future UI work. Its source scan reports differences for you to inspect; it does not restyle your application.

## Install

Requires Node.js 22.5 or newer and Git. Node.js 24 is recommended.

```sh
git clone https://github.com/sz-747/designpass.git
cd designpass
npm ci
npm link
designpass --version
```

The source scan, seed command, provenance report, and offline tests do not need a model. Session analysis and proposal generation require [acpx](https://github.com/openclaw/acpx) on your PATH and an authenticated coding agent:

```sh
npm install -g acpx
```

Model calls use that agent's account and may consume its quota or incur provider charges. Designpass does not require a separate API key of its own.

## Configure

Run Designpass inside the Git repository whose UI you want to improve. Project configuration lives in `.designpassrc.json`. Personal configuration lives in `~/.config/designpass/config.json`, or beneath `XDG_CONFIG_HOME` when set.

For example, to use Codex for both model passes:

```json
{
  "memoryFiles": ["DESIGN.md"],
  "budgetTokens": 8000,
  "analysis": { "agent": "codex" },
  "synthesis": { "agent": "codex" },
  "drift": { "excludeDirs": ["test", "fixtures"] }
}
```

You can set `model` and `effort` within either role. Choose model identifiers supported by your authenticated agent. Without a pinned agent, each pass tries its configured candidate list.

Keep credentials in the agent's authentication store. Keep private host settings in your personal configuration. Generated evidence and proposals stay in `.designpass/`; exclude that directory from version control.

Your coding agent must read `DESIGN.md` during UI work. Reference it in the project's agent instructions or include it in the task context. Creating the file alone does not make every harness load it.

## Run

```sh
cd your-ui-project

# Create a starter file, or keep your existing DESIGN.md.
designpass seed

# Alternatively, start from a design file you already have.
designpass seed --from path/to/design.md

# Compare UI source with the design tokens. No model call.
designpass drift

# Find relevant sessions, analyze them, and generate a proposal.
designpass

# Review proposed edits and write the ones you accept.
designpass apply
```

`seed` creates the design file and records its initial content. It refuses to overwrite an existing file unless you pass `--force`. Analysis writes reports and proposals, while `apply` changes the design file and skills after review. The drift command reports source values; it does not rewrite your UI.

To inspect each stage separately:

| Command | Purpose |
| --- | --- |
| `designpass scan` | Discover sessions associated with the repository. |
| `designpass analyze` | Analyze selected sessions and cache their evidence. |
| `designpass propose` | Generate a proposal from the available evidence. |
| `designpass apply --dry-run` | Preview changes without writing them. |
| `designpass status` | Inspect the current run state. |
| `designpass provenance` | Compare the current design file with its recorded seed. |
| `designpass drift --json` | Print the source scan as JSON. |

Use `--since 7d` to narrow session discovery, `--strict` to exclude uncertain repository associations, and `--force` to refresh cached analysis.

For a personal design file shared across projects:

```sh
designpass seed --scope user
designpass --scope user
designpass apply --scope user
```

User scope targets `~/.agents/DESIGN.md`. It has no single repository to scan, so source drift is measured only in project scope.

## How it is designed

Designpass uses a **gradient-style feedback loop** over a text file:

```text
DESIGN.md -> agent builds UI -> session records + source code
    ^                                      |
    |                                      v
accepted edits <- human review <- evidence-backed proposal
```

The analogy comes from optimization: observe the result of a forward pass, use its errors to choose a direction, and take a small update step. Here, the parameters are design tokens and written rules. An LLM proposes text edits from evidence. Designpass does not compute mathematical derivatives, backpropagate through the model, or train model weights.

| Optimization concept | Designpass equivalent |
| --- | --- |
| Parameters or weights | Token values and prose rules in `DESIGN.md`, plus skill descriptions. |
| Forward pass | An agent uses those instructions while building UI. |
| Loss signal | Session mistakes, human corrections, and measured source drift. These are observations rather than one differentiable loss function. |
| Update direction | Evidence combined across sessions suggests which entries to strengthen, rewrite, add, or remove. |
| Step size and constraints | An edit cap limits each proposal, evidence gates require support, and a token budget bounds the instruction surface. |
| Parameter update | Accepted edits are checked and written after human review. |

### Processing pipeline

1. **Index the design file.** Each value in the YAML front matter becomes a named token unit, such as `TK-colors.link`. Prose rules become `DS-001`, `DS-002`, and so on. Units retain their line numbers so proposals can target specific text.
2. **Find relevant sessions.** Discovery reads local stores for Claude Code, Codex, Pi, OpenCode, Grok, Cursor CLI, and Hermes. It associates sessions using working directories and Git remotes. Missing stores are skipped.
3. **Measure source drift.** A deterministic scan compares literal colors, font sizes, spacing, corner radii, and font families with the token table. It reports values without matching tokens and tokens with no detected source use.
4. **Analyze the evidence.** Each selected transcript is distilled and analyzed by a model. Claims must include quotes found in the trace. The source scan also enters the prompt, grounding the analysis in the current code.
5. **Propose a bounded change.** Evidence is combined across sessions. Proposed additions, rewrites, and removals must meet evidence thresholds and stay within an edit cap and token budget. The default design budget is 8,000 estimated tokens.
6. **Review and apply.** You accept or reject edits. Mechanical checks run on the proposal and again on the accepted subset before writing.

Discovery and drift measurement run locally. Model stages send distilled session content and design context through your configured agent. Obvious secrets are redacted during distillation, but review which sessions and files you make available to that agent.

### Implementation boundaries

- **Parsing and measurement are deterministic.** The parser assigns token and rule IDs with source line numbers. The drift scanner compares normalized literals with the token table without asking a model to judge them.
- **Models interpret evidence and draft changes.** A per-session analysis pass produces structured observations with trace quotes. Synthesis receives the combined evidence and edits a staging copy, from which concrete changes are measured.
- **Validation runs in code.** Evidence requirements, edit limits, token budgets, reference checks, and contrast checks constrain the model's proposal. The writer checks the accepted subset again before applying it.
- **Runtime integration uses module hooks.** Five modules supply design-specific parsing, prompts, bootstrapping, proposal checks, and write checks. Small load-time patches change configuration defaults and platform handling. Unchanged discovery, evidence aggregation, and review behavior comes from a pinned runtime dependency.

Each run produces a proposal for review. Repeating the loop lets later UI sessions use the revised instructions, but every change still needs evidence and acceptance.

### Design file format

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

The parser supports the nested maps used by Stitch-style design files. It is not a complete YAML implementation. Component or page details that are needed only occasionally can live in `design-<thing>` skills under `.agents/skills`. Their description lines count toward the budget; their bodies are loaded when triggered.

### Checks before writing

Design checks reject unterminated or removed front matter and newly broken `{token.references}`. For component text and background colors that resolve to hex values, they reject changes that introduce contrast below 3:1. Ratios below 4.5:1 receive an advisory. These checks do not establish full accessibility compliance.

The accepted subset is checked again because accepting a token removal while rejecting a related reference update could leave the file inconsistent.

## Test and develop

```sh
npm ci
npm test
node bin/designpass.js --version
```

The offline suite covers token parsing, line numbers, source drift, contrast and reference checks, provenance, and runtime integration. It needs no account or model calls.

Runtime integration uses module hooks with a pinned dependency. Patch anchors must match exactly once; a dependency change that moves an anchor stops startup. Dependency upgrades need the integration checks to pass before release.

## Current limits

- Source scanning reads text, without rendering pages or evaluating layouts. It can miss generated styles and report literals from comments or examples.
- Values are compared after normalization. `rem` assumes 16px; values in `em`, `%`, `vw`, and expressions such as `calc()` are not compared.
- Scanning stops at 2,000 eligible files and skips files larger than 512 KiB. Build output and dependencies are excluded.
- Source drift is not part of the analysis cache key. After significant source changes, use `--force` to reanalyze sessions with the new scan.
- Provenance measures text changes from the seed. A changed unit is not proof that a real session justified it.
- Sessions launched from a parent directory may not associate with a child repository. Run UI sessions inside the project checkout.
- Live model analysis and proposal generation have not been verified end to end in this release. The original implementation was developed on Windows 11 with Node.js 24.

## License

[MIT](LICENSE). See [third-party notices](THIRD_PARTY_NOTICES.md) for the runtime dependency's copyright and license.
