import { createServer, type Server } from "node:http";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";

/**
 * Local HTTP record service. It is a stand-in for a third-party API so tests are reproducible.
 * Fault injection lets tests make one id slow or failing without touching tool code.
 */
export interface Faults {
  slowIds?: Record<string, number>; // id -> delay ms
  failIds?: Record<string, number>; // id -> HTTP status
}

const details = JSON.parse(readFileSync(new URL("../../data/details.json", import.meta.url), "utf8")) as {
  records: Record<string, unknown>;
};

export async function startRecordService(faults: Faults = {}, port = 0): Promise<{ url: string; server: Server; close: () => Promise<void> }> {
  const server = createServer((req, res) => {
    const m = req.url?.match(/^\/suppliers\/([^/?]+)$/);
    if (req.method !== "GET" || !m) {
      res.writeHead(404, { "content-type": "application/json" }).end('{"error":"not found"}');
      return;
    }
    const id = decodeURIComponent(m[1]!);
    const respond = () => {
      if (res.destroyed) return;
      const status = faults.failIds?.[id];
      if (status) return res.writeHead(status, { "content-type": "application/json" }).end(`{"error":"injected ${status}"}`);
      const rec = details.records[id];
      if (!rec) return res.writeHead(404, { "content-type": "application/json" }).end('{"error":"unknown id"}');
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(rec));
    };
    const delay = faults.slowIds?.[id];
    if (delay) setTimeout(respond, delay).unref();
    else respond();
  });
  await new Promise<void>((r) => server.listen(port, "127.0.0.1", r));
  const { port: p } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${p}`,
    server,
    close: () => new Promise((r) => { server.closeAllConnections(); server.close(() => r()); }),
  };
}
