import { z } from "zod";

/**
 * The agent ends by calling this pseudo-tool. Its arguments are the structured answer.
 * "insufficient_evidence" is a first-class outcome, not a failure.
 */
export const FinalAnswer = z
  .object({
    status: z.enum(["answered", "insufficient_evidence"]),
    answer: z.string().min(1).max(1000),
    supplier_ids: z.array(z.string()).max(20).describe("Suppliers the answer is about"),
    evidence_ids: z.array(z.string()).max(20).describe("Records actually fetched with get_supplier that support the answer"),
  })
  .strict()
  .refine((a) => a.status !== "answered" || a.evidence_ids.length > 0, {
    message: "An answered result must cite at least one fetched record",
    path: ["evidence_ids"],
  });
export type FinalAnswer = z.infer<typeof FinalAnswer>;

export const FINAL_TOOL_NAME = "final_answer";
export const FINAL_TOOL_DESCRIPTION =
  "Submit the final structured answer and stop. Use status insufficient_evidence when the tools did not return enough data.";
