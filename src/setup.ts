import { ToolRegistry } from "./registry.ts";
import { startRecordService, type Faults } from "./server/recordService.ts";
import { searchSuppliers } from "./tools/searchSuppliers.ts";
import { makeGetSupplier } from "./tools/getSupplier.ts";

export async function setup(opts: { faults?: Faults; timeoutMs?: number } = {}) {
  const svc = await startRecordService(opts.faults);
  const registry = new ToolRegistry([searchSuppliers, makeGetSupplier(svc.url)], opts.timeoutMs ?? 2000);
  return { registry, svc };
}
