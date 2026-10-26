// Runs under the designpass loader hooks (see test/loader.test.js) and prints what the
// patched and overridden backpass modules report.
export default async function probe() {
  const config = await import("backpass/src/config.js");
  const memory = await import("backpass/src/memory.js");
  const original = await import("backpass/src/memory.js?designpass-original");
  const bootstrap = await import("backpass/src/bootstrap.js");
  const prompts = await import("backpass/src/prompts.js");

  const sample = "---\ncolors:\n  ink: \"#000\"\n---\n# T\n\n- A rule.\n";
  const values = {
    MEMORY_PATH: "DESIGN.md",
    INSTRUCTION_INDEX: "",
    SKILLS: "",
    OPEN_GAPS: "",
    TRACE: "",
  };
  const out = {
    stateDirname: config.STATE_DIRNAME,
    configFilename: config.CONFIG_FILENAME,
    defaultMemoryFiles: config.DEFAULT_CONFIG.memoryFiles,
    budgetTokens: config.DEFAULT_CONFIG.budgetTokens,
    userMemoryFiles: config.USER_MEMORY_FILES,
    userConfigPath: config.userConfigPath(),
    canonical: bootstrap.CANONICAL_MEMORY_FILE,
    firstUnitId: memory.parseMemoryUnits(sample)[0].id,
    originalFirstUnitId: original.parseMemoryUnits("# T\n\n- A rule.\n")[0].id,
    analysisPrompt: prompts.renderPrompt("analysis", values),
    consolidatePrompt: prompts.loadPrompt("consolidate"),
  };
  process.stdout.write(JSON.stringify(out));
}
