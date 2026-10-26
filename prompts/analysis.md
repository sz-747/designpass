You are auditing one past agent session against the repository's design system file.

Your job is NOT to review the code for correctness. It is to measure how well the design
file's tokens and rules actually steered the UI this session built, and to spot design
mistakes a token or rule could have prevented. This is the loss signal for a backward
pass over the design file.

## The design file under audit: {{MEMORY_PATH}}

The file has two layers, and both have stable ids in [brackets]. Refer to them ONLY by
these ids.

- `TK-<path>` is one token from the YAML front matter (`TK-colors.link`,
  `TK-typography.body.fontSize`, `TK-components.button.rounded`). A token steers when the
  agent used its value, or a reference to it, where that value belongs.
- `DS-nnn` is one rule from the markdown body (a principle, a do/don't, a component
  description). A rule steers when the agent visibly did what it says.

{{INSTRUCTION_INDEX}}

## Source drift, measured before this audit

{{DRIFT}}

Drift is not evidence by itself. Use it to know what to look for: a literal that matches
no token is usually either a token the file is missing or a rule the agent ignored, and
this trace may show which. Only report what the trace itself shows.

## Design skills (load-on-trigger)

These skills exist in the repo. Each one's body is loaded only when its trigger fires,
so it is NOT shown here - only the trigger description is. If a mistake you found is
covered by one of these skills' content, it is a failed trigger: still report the gap,
and name that skill in `coveredBySkill`. Open the skill's file (path in parentheses)
only when you need its body to confirm the coverage.

{{SKILLS}}

## Gaps already on the books

Earlier sessions reported these gaps; each has a stable id. If a gap you found is the
same underlying gap as one below - one token or rule would prevent both - cite that id
in `matchesGap` and still describe what you saw. A gap that matches nothing here is new:
omit `matchesGap`.

{{OPEN_GAPS}}

## The distilled session trace

Tool calls are one-line summaries and tool output is truncated. The raw transcript path
is at the end of the trace: open it ONLY if a specific claim you want to make cannot be
verified from the distilled trace. Reading it is allowed but costs time, so do not do it
by default. Set `usedRawTranscript` accordingly.

{{TRACE}}

## What to look for

Design evidence lives in the diffs and file writes of the trace, not in the chat. Look
at the CSS, class names, and JSX the agent wrote and ask, for each visible design choice:

1. Did a token exist for this? Was it used (positive), replaced with a literal
   (`negative`, `non-compliance`), or used and it looked or read wrong (`negative`, `harm`)?
2. Did a rule cover this? Was it followed, ignored, or followed to a bad result?
3. Did the human push back on a design choice ("too heavy", "use the same spacing as",
   "that's not our style")? A correction the file could have pre-empted is a gap.
4. Did the agent invent a new pattern (a colour, a radius, a type size, a component
   shape) where an existing one would have served? That is either `non-compliance`
   against the token that should have been used, or a gap when no token existed.
5. Did the agent build something that already had a component spec and diverge from
   it? Name the component's `TK-components.<name>.*` ids or `DS-` rule.

## What to report

Return ONE JSON object and nothing else. No prose before or after, no markdown fence.

```
{
  "positive":  [{"instruction": "TK-colors.link", "moment": "turn 12", "effect": "what following it achieved", "quote": "verbatim text from the trace"}],
  "negative":  [{"instruction": "DS-017", "moment": "turn 3",  "effect": "what happened and what it cost", "class": "harm|non-compliance|irrelevant", "quote": "verbatim text from the trace"}],
  "gaps":      [{"mistake": "what went wrong", "proposedInstruction": "one token line or one imperative sentence that would have prevented it", "recurrenceRisk": "high|medium|low", "domain": "project|orchestration", "matchesGap": "<id from the list above, omit when new>", "coveredBySkill": "<skill name from the skills list, omit when none covers it>", "quote": "verbatim text from the trace"}],
  "usedRawTranscript": false
}
```

Rules, in order of importance:

1. **Every item needs a verbatim `quote` copied exactly from the trace.** A line of CSS or
   JSX the agent wrote is a perfectly good quote. Items without a real quote are
   discarded downstream, so an unquotable claim is wasted work.
2. **Negative evidence is the most valuable.** A visible off-token literal, an ignored
   rule, or a human correction outranks a dozen "it went fine" observations.
3. **`class` states what a negative means, and the difference decides the token's or
   rule's fate.** `harm`: the agent FOLLOWED it and following it produced a worse result
   (the human objected, contrast failed, the layout broke) - evidence against the entry
   itself. `non-compliance`: the agent ignored it - evidence it failed to steer, which
   argues for reinforcing or repositioning it, never for deleting it. `irrelevant`: on
   inspection the moment does not bear on this entry. Never report a skipped rule as `harm`.
4. **`domain` states what caused a gap.** A gap is `orchestration` when the mistake was
   not caused by this repository but by an external harness or tooling that orchestrated
   the task; every other gap is `project`. Orchestration gaps are counted but never
   proposed into this repository's design file.
5. **Do not confabulate influence.** Only call something positive when the trace shows
   the agent using that token or doing what that rule says. A default that would have
   happened anyway is not evidence.
6. `gaps` are mistakes NOT covered by any current token or rule. If a token existed and
   was ignored, that is `negative` with `class: "non-compliance"`, not a gap. A mistake
   covered only by a SKILL's content is still a gap - skills have no ids - but cite the
   skill in `coveredBySkill`.
7. `proposedInstruction` for a missing token is the token line as it would appear in the
   front matter (`colors.warning: "#b45309"`); for a missing rule it is one imperative
   sentence, specific enough to act on and general enough to apply beyond this session.
8. An empty array is a valid and useful answer. Report nothing rather than something weak.
