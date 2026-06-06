import { readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { spawnSync } from "node:child_process";

const root = process.cwd();
const files = ["app.js", "sw.js", ...listJsFiles("src")];

for (const file of files) {
  const result = spawnSync(process.execPath, ["--check", file], {
    cwd: root,
    encoding: "utf8",
    stdio: "pipe"
  });
  if (result.status === 0) continue;
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  process.exit(result.status || 1);
}

function listJsFiles(dir) {
  const result = [];
  for (const entry of readdirSync(join(root, dir))) {
    const fullPath = join(root, dir, entry);
    const relativePath = relative(root, fullPath).replace(/\\/g, "/");
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      result.push(...listJsFiles(relativePath));
      continue;
    }
    if (stats.isFile() && entry.endsWith(".js")) result.push(relativePath);
  }
  return result.sort();
}
