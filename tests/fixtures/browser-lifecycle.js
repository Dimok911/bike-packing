import { readFileSync } from "node:fs";
import { freemem, totalmem } from "node:os";

// Sample outside the page: a crashed renderer cannot answer page.evaluate.
// OS free memory alone does not reveal a Linux cgroup limit or OOM event.
export function trackBrowserLifecycle(page) {
  const read = path => { try { return readFileSync(path, "utf8").trim(); } catch { return null; } };
  const sample = event => ({ event, at: new Date().toISOString(), browserConnected: page.context().browser()?.isConnected(),
    pageClosed: page.isClosed(), freeMemory: freemem(), totalMemory: totalmem(),
    ...(process.platform === "linux" ? { cgroupPath: read("/proc/self/cgroup"), rootCgroupMemory: Object.fromEntries(
      ["current", "max", "peak", "events"].map(name => [name, read("/sys/fs/cgroup/memory." + name)])) } : {}) });
  const events = [sample("test-start")];
  page.on("crash", () => events.push(sample("page-crash")));
  page.on("close", () => events.push(sample("page-close")));
  return events;
}
