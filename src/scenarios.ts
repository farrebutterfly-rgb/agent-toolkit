import { call, ScriptedModel, toolResults } from "./model/scripted.ts";
import type { Faults } from "./server/recordService.ts";
import type { Message } from "./model/types.ts";

/**
 * Fixture scenarios. The scripted model decides from the real tool results in the transcript,
 * so the final answers below are computed from data the tools returned, not hard-coded.
 */
export interface Scenario {
  name: string;
  question: string;
  model: () => ScriptedModel;
  faults?: Faults;
  timeoutMs?: number;
  maxSteps?: number;
}

type Detail = { id: string; certifications: string[]; lead_time_days: number; contact_email: string; name: string };
const parsed = (t: Message[]) => toolResults(t).filter((r) => !r.isError).map((r) => JSON.parse(r.content));
const lastSearch = (t: Message[]) => parsed(t).filter((r) => "results" in r).at(-1) as { results: { id: string }[] } | undefined;
const details = (t: Message[]) => parsed(t).filter((r) => "lead_time_days" in r) as Detail[];

const pickIso9001Fastest = (t: Message[]) => {
  const ok = details(t).filter((d) => d.certifications.includes("ISO 9001")).sort((a, b) => a.lead_time_days - b.lead_time_days);
  const best = ok[0];
  if (!best) return call("final_answer", { status: "insufficient_evidence", answer: "No fetched supplier in Göteborg is ISO 9001 certified.", supplier_ids: [], evidence_ids: [] });
  return call("final_answer", {
    status: "answered",
    answer: `${best.name} (${best.id}) has the shortest lead time among ISO 9001 suppliers in Göteborg: ${best.lead_time_days} days. Contact: ${best.contact_email}.`,
    supplier_ids: [best.id],
    evidence_ids: ok.map((d) => d.id),
  });
};

const Q_MAIN = "Which ISO 9001 certified supplier in Göteborg has the shortest lead time, and how do I contact it?";

export const scenarios: Scenario[] = [
  {
    name: "happy-path",
    question: Q_MAIN,
    model: () =>
      new ScriptedModel(
        [
          () => ({ calls: [call("search_suppliers", { city: "Göteborg" })] }),
          (t) => ({ calls: (lastSearch(t)?.results ?? []).map((r) => call("get_supplier", { id: r.id })) }),
          (t) => ({ calls: [pickIso9001Fastest(t)] }),
        ],
        "happy-path",
      ),
  },
  {
    name: "bad-calls-then-recover",
    question: Q_MAIN,
    model: () =>
      new ScriptedModel(
        [
          // Unknown tool, a missing required filter, and a malformed id in one turn.
          () => ({ calls: [call("lookup_supplier", { city: "Göteborg" }), call("search_suppliers", { limit: 5 }), call("get_supplier", { id: "3" })] }),
          () => ({ calls: [call("search_suppliers", { city: "Göteborg" })] }),
          (t) => ({ calls: (lastSearch(t)?.results ?? []).map((r) => call("get_supplier", { id: r.id })) }),
          (t) => ({ calls: [pickIso9001Fastest(t)] }),
        ],
        "bad-calls-then-recover",
      ),
  },
  {
    name: "upstream-timeout",
    question: "What is the lead time for SUP-003?",
    faults: { slowIds: { "SUP-003": 3000 } },
    timeoutMs: 300,
    model: () =>
      new ScriptedModel(
        [
          () => ({ calls: [call("get_supplier", { id: "SUP-003" })] }),
          () => ({ calls: [call("get_supplier", { id: "SUP-003" })] }), // one retry, the error was retryable
          () => ({ calls: [call("final_answer", { status: "insufficient_evidence", answer: "The record service did not answer for SUP-003 within the timeout, twice. Lead time is unknown.", supplier_ids: ["SUP-003"], evidence_ids: [] })] }),
        ],
        "upstream-timeout",
      ),
  },
  {
    name: "no-evidence",
    question: "Which supplier in Kiruna can deliver castings?",
    model: () =>
      new ScriptedModel(
        [
          () => ({ calls: [call("search_suppliers", { city: "Kiruna" })] }),
          () => ({ calls: [call("final_answer", { status: "insufficient_evidence", answer: "The catalogue has no supplier in Kiruna, so I cannot name one.", supplier_ids: [], evidence_ids: [] })] }),
        ],
        "no-evidence",
      ),
  },
  {
    name: "ungrounded-final-rejected",
    question: "What is the lead time for Mölndal Precision AB?",
    model: () =>
      new ScriptedModel(
        [
          () => ({ calls: [call("search_suppliers", { query: "Mölndal" })] }),
          // Claims evidence it never fetched: the agent must refuse this answer.
          () => ({ calls: [call("final_answer", { status: "answered", answer: "About 6 days.", supplier_ids: ["SUP-009"], evidence_ids: ["SUP-009"] })] }),
          () => ({ calls: [call("get_supplier", { id: "SUP-009" })] }),
          (t) => {
            const d = details(t).find((x) => x.id === "SUP-009")!;
            return { calls: [call("final_answer", { status: "answered", answer: `${d.name} quotes ${d.lead_time_days} days lead time.`, supplier_ids: [d.id], evidence_ids: [d.id] })] };
          },
        ],
        "ungrounded-final-rejected",
      ),
  },
  {
    name: "runaway-loop",
    question: Q_MAIN,
    maxSteps: 5,
    // Repeats the same search forever. The step limit must stop it.
    model: () => new ScriptedModel([() => ({ calls: [call("search_suppliers", { city: "Göteborg" })] })], "runaway-loop", true),
  },
];
