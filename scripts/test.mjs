import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";

// Expand filenames in Node so this also works in Windows Command Prompt.
const files = readdirSync("tests")
  .filter((name) => name.endsWith(".test.mjs"))
  .sort()
  .map((name) => `tests/${name}`);
const result = spawnSync(process.execPath, ["--test", ...files], { stdio: "inherit" });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
