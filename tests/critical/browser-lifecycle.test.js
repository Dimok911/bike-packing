import { test } from "node:test";
import assert from "node:assert/strict";
import { readLinuxCgroupMemory } from "../fixtures/browser-lifecycle.js";

test("browser diagnostics read the actual service and its ancestors even when root memory metrics are absent", () => {
  const files = new Map([
    ["/proc/self/cgroup", "0::/system.slice/hosted-compute-agent.service"],
    ["/sys/fs/cgroup/system.slice/hosted-compute-agent.service/memory.max", "2147483648"],
    ["/sys/fs/cgroup/system.slice/hosted-compute-agent.service/memory.events", "oom 1\noom_kill 1"],
    ["/sys/fs/cgroup/system.slice/memory.max", "4294967296"]
  ]);
  const value = readLinuxCgroupMemory(path => files.get(path) ?? null);
  assert.deepEqual(value.memory.map(row => row.path), ["/sys/fs/cgroup/system.slice/hosted-compute-agent.service", "/sys/fs/cgroup/system.slice", "/sys/fs/cgroup"]);
  assert.equal(value.memory[0].max, "2147483648"); assert.equal(value.memory[0].events, "oom 1\noom_kill 1");
  assert.equal(value.memory[1].max, "4294967296"); assert.equal(value.memory[2].max, null);
});

test("unavailable, root, v1 and malformed cgroups keep missing metrics explicit and reads inside the mount", () => {
  for (const source of [null, "0::/", "5:memory:/service", "0::relative", "0::/../outside", "0::/bad\0name"]) {
    const readPaths = [];
    const value = readLinuxCgroupMemory(path => { readPaths.push(path); return path === "/proc/self/cgroup" ? source : null; });
    assert.equal(value.memory.length, 1); assert.equal(value.memory[0].path, "/sys/fs/cgroup");
    assert.deepEqual(Object.values(value.memory[0]).slice(1), [null, null, null, null]);
    assert.ok(readPaths.every(path => path === "/proc/self/cgroup" || path.startsWith("/sys/fs/cgroup/memory.")));
  }
});
