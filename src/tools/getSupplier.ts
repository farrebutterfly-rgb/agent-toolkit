import { z } from "zod";
import { ToolFailure } from "../errors.ts";
import { defineTool } from "./types.ts";

export const SupplierDetail = z.object({
  id: z.string(),
  name: z.string(),
  city: z.string(),
  category: z.string(),
  certifications: z.array(z.string()),
  lead_time_days: z.number().int().nonnegative(),
  contact_email: z.string(),
  updated: z.string(),
});

/** Factory so tests and the demo can point the tool at whichever port the record service got. */
export function makeGetSupplier(baseUrl: string) {
  return defineTool({
    name: "get_supplier",
    description:
      "Fetch one supplier record from the record service over HTTP: certifications, lead_time_days, contact_email.",
    input: z.object({ id: z.string().regex(/^SUP-\d{3}$/, "id looks like SUP-001") }).strict(),
    output: SupplierDetail,
    async run({ id }, { signal }) {
      let res: Response;
      try {
        res = await fetch(`${baseUrl}/suppliers/${encodeURIComponent(id)}`, { signal });
      } catch (e) {
        if (signal.aborted) throw e; // the registry turns this into TIMEOUT
        throw new ToolFailure({ code: "UPSTREAM_ERROR", tool: "get_supplier", message: `network error: ${(e as Error).message}`, retryable: true });
      }
      if (res.status === 404) {
        throw new ToolFailure({ code: "NOT_FOUND", tool: "get_supplier", message: `no supplier with id ${id}`, retryable: false });
      }
      if (!res.ok) {
        throw new ToolFailure({ code: "UPSTREAM_ERROR", tool: "get_supplier", message: `record service answered HTTP ${res.status}`, retryable: res.status >= 500 });
      }
      return (await res.json()) as unknown as z.infer<typeof SupplierDetail>;
    },
  });
}
