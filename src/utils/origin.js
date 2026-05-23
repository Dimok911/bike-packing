const LOCAL_DEV_HOSTNAMES = new Set(["localhost", "127.0.0.1", "::1"]);

export function isLocalDevOrigin(hostname = location.hostname) {
  return LOCAL_DEV_HOSTNAMES.has(hostname);
}
