import { readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = fileURLToPath(new URL("../", import.meta.url));

function discoverTests(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return discoverTests(path);
    return entry.isFile()
      && /\.test\.[cm]?js$/.test(entry.name)
      && !/\.rules\.test\.[cm]?js$/.test(entry.name)
      ? [path] : [];
  });
}

const tests = discoverTests(join(root, "tests")).sort();
if (!tests.length) throw new Error("No unit test files found in tests/.");

const result = spawnSync(process.execPath, ["--test", ...process.argv.slice(2), ...tests], {
  cwd: root,
  stdio: "inherit",
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
