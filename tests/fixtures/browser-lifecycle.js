import { readFileSync } from "node:fs";
import { freemem, totalmem } from "node:os";
import { posix } from "node:path";

const readText = path => { try { return readFileSync(path, "utf8").trim(); } catch { return null; } };
// Hosted runners can put the browser in a service cgroup. The root metrics
// alone may be absent or omit the service's own limit and OOM counter.
export function readLinuxCgroupMemory(read = readText) {
  const cgroupPath = read("/proc/self/cgroup"), unified = cgroupPath?.split("\n").find(line => line.startsWith("0::"))?.slice(3);
  const mount = "/sys/fs/cgroup", paths = [];
  if (unified?.startsWith("/") && !unified.includes("\0") && !unified.split("/").includes("..")) {
    let current = posix.resolve(mount, "." + unified);
    while (current.startsWith(mount + "/") && paths.length < 16) { paths.push(current); current = posix.dirname(current); }
  }
  paths.push(mount);
  return { cgroupPath, memory: paths.map(path => ({ path, ...Object.fromEntries(
    ["current", "max", "peak", "events"].map(name => [name, read(path + "/memory." + name)])) })) };
}

// Sample outside the page: a crashed renderer cannot answer page.evaluate.
// OS free memory alone does not reveal a Linux cgroup limit or OOM event.
export function trackBrowserLifecycle(page) {
  const sample = event => ({ event, at: new Date().toISOString(), browserConnected: page.context().browser()?.isConnected(),
    pageClosed: page.isClosed(), freeMemory: freemem(), totalMemory: totalmem(),
    ...(process.platform === "linux" ? { linuxCgroups: readLinuxCgroupMemory() } : {}) });
  const events = [sample("test-start")];
  page.on("crash", () => events.push(sample("page-crash")));
  page.on("close", () => events.push(sample("page-close")));
  return events;
}
