import { readFileSync } from "node:fs";
import { z } from "zod";
import { defineTool } from "./types.ts";

const Summary = z.object({ id: z.string(), name: z.string(), city: z.string(), category: z.string() });
type Summary = z.infer<typeof Summary>;

const index = JSON.parse(readFileSync(new URL("../../data/index.json", import.meta.url), "utf8")) as {
  version: string;
  records: Summary[];
};

const norm = (s: string) => s.toLocaleLowerCase("sv-SE").normalize("NFC").trim();

export const searchSuppliers = defineTool({
  name: "search_suppliers",
  description:
    "Search the local supplier catalogue. Returns id, name, city and category only. " +
    "Certifications, lead times and contacts are NOT included; use get_supplier for those.",
  input: z
    .object({
      query: z.string().max(100).optional().describe("Free text matched against name and category"),
      city: z.string().max(60).optional().describe("Exact city name, e.g. Göteborg"),
      category: z.string().max(60).optional(),
      limit: z.number().int().min(1).max(20).default(10),
    })
    .strict()
    .refine((a) => a.query || a.city || a.category, { message: "Give at least one of query, city or category" }),
  output: z.object({ dataset: z.string(), total: z.number().int(), results: z.array(Summary) }),
  async run(args) {
    const hits = index.records.filter(
      (r) =>
        (!args.city || norm(r.city) === norm(args.city)) &&
        (!args.category || norm(r.category) === norm(args.category)) &&
        (!args.query || norm(`${r.name} ${r.category}`).includes(norm(args.query))),
    );
    return { dataset: index.version, total: hits.length, results: hits.slice(0, args.limit) };
  },
});
