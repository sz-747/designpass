#!/usr/bin/env node
import { register } from "node:module";

// The hooks must be in place before any backpass module is imported, so the CLI is
// loaded dynamically after registration.
register("../src/loader.js", import.meta.url);

const { runCli } = await import("../src/cli.js");
process.exitCode = await runCli(process.argv.slice(2));
