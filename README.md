# Designpass

Designpass improves the design instructions you give coding agents, using evidence from the work they produce.

You keep your colors, fonts, spacing, and design rules in `DESIGN.md`. After agents build UI, Designpass reads their session records and checks the code for differences from that file. It suggests small changes to the instructions, and you choose which ones to keep.

Use it to:

- Reduce repeated corrections when agents keep making the same design mistakes.
- Find colors, text sizes, and spacing that do not match your design file.
- Improve an empty design file or borrowed template using evidence from your own sessions.

For example, your file says body text should be `16px`, but agents repeatedly write `15px`. Designpass shows where that happens and looks for session evidence to support clarifying the rule or changing the value. A mismatch alone does not tell it which choice is right.

It uses a **gradient-style feedback loop**: inspect the results, find evidence for a better direction, and propose a small update. An LLM interprets session evidence, while code measures source drift and checks proposed edits. You review each change before it reaches the design file.

```text
DESIGN.md -> agent builds UI -> sessions + source code
    ^                                  |
    |                                  v
accepted edits <- your review <- proposed improvements
```

The gradient is an analogy: Designpass edits written instructions. It does not calculate mathematical gradients or train model weights. It also does not restyle your application.

The published code passed 22 offline tests and CLI checks for creating a design file, tracking changes from its starting text, and detecting source drift. Live model analysis and proposal generation remain unverified end to end.

[MIT license](LICENSE) · [Third-party notices](THIRD_PARTY_NOTICES.md)

**[AGENTS: READ THIS TO INSTALL AND SET UP DESIGNPASS](INSTALL.md)**
