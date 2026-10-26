{{PREFACE}}designpass measured the changes in the staging copy of {{MEMORY_PATH}}. Every change below
is identified by an id; annotate each one so a human can review it with its evidence.

## Measured changes

{{CHANGES}}

## What to produce

Return ONE JSON object and nothing else. No prose, no markdown fence.

```
{
  "edits": [
    {
      "changes": ["H1"],
      "kind": "add" | "remove" | "rewrite" | "extract" | "move",
      "title": "one line a human can decide on",
      "rationale": "why the evidence supports this",
      "instructions": ["TK-colors.link", "DS-017"],
      "evidence": [{"polarity": "negative", "text": "the verbatim quote", "source": "claude · abc123 · turn 12"}]
    }
  ],
  "verdicts": [
    {"instruction": "DS-042", "verdict": "keep" | "strengthen" | "weaken" | "remove", "positive": 6, "negative": 1, "note": "one line"}
  ],
  "notes": ["anything a human should know that is not an edit"]
}
```

Hard rules - a violation fails the whole proposal:

1. **Every measured change belongs to exactly one edit.** Group the changes that make up
   one decision: a token change and the prose line that states the same value are one
   edit; an extraction is its created or extended `SKILL.md` plus the removal it pays
   for. Do not leave a change out. If a change should not ship, revert it in the file
   first.
2. **At most {{MAX_EDITS}} edits** - the learning rate. Regroup or revert if you are over.
3. **Every edit carries at least one verbatim quote in `evidence`**, with its source.
4. **Every `add`, `rewrite` and `remove` - of {{MEMORY_PATH}} or of a skill file - carries
   quotes from at least {{MIN_GAP_EVIDENCE}} distinct sessions.** designpass counts
   distinct `source` values in your `evidence` only when they match source labels issued
   by this run's fold; do not report a count of your own, it is not read. If you have
   only one session for a change, revert it in the file, or cite a second session's quote
   from the evidence rows you were shown.
5. **Removing a token or rule outright needs harm evidence from at least
   {{MIN_GAP_EVIDENCE}} distinct sessions** (`harm-sessions` in the evidence). Only
   `harm` negatives argue against an entry; `non-compliance` and "unused in the source"
   never justify a deletion on their own. A change that only deletes text and is not part
   of an extract or a move is a removal whatever its `kind` says - if it lacks the
   evidence, revert it in the file first. Text deleted from an existing skill file can
   never carry that evidence, so revert any skill-file deletion.
6. `kind: "extract"` is an edit whose changes are one or more `SKILL.md` files (created,
   or an existing skill file you extended) plus the change(s) to {{MEMORY_PATH}} that pay
   for them. **The skills must carry every line those changes remove**, and an existing
   skill must still contain every line it already had. Several skills belong in ONE
   extract exactly when their removals landed in a **single** measured change. Any other
   kind must not include a created file. An extract may span {{MEMORY_PATH}} and the
   skill file it extends; every other kind changes one file only.
7. `kind: "move"` is an edit whose changes are all on {{MEMORY_PATH}} and whose **removed
   and added lines match one-for-one**. Any unmatched removal needs its own `remove`
   edit, and any unmatched addition needs its normal evidence.
8. **Budget:** {{BUDGET_RULE}}

If you still need to change the files, do that first and then answer; designpass
re-measures after this reply and shows you the new ids if anything moved. Re-measuring
does not use up an annotation attempt.
