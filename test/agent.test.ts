import { test } from "node:test";
import assert from "node:assert/strict";
import { runAgent } from "../src/agent.ts";
import { RunLog } from "../src/log.ts";
import { scenarios } from "../src/scenarios.ts";
import { setup } from "../src/setup.ts";
import { ScriptedModel, call } from "../src/model/scripted.ts";

async function run(name: string) {
  const s = scenarios.find((x) => x.name === name)!;
  const { registry, svc } = await setup({ faults: s.faults, timeoutMs: s.timeoutMs });
  const log = new RunLog();
  try {
    const r = await runAgent(s.question, { model: s.model(), registry, log, maxSteps: s.maxSteps });
    return { r, log };
  } finally {
    await svc.close();
  }
}

const toolEvents = (log: RunLog) => log.events.filter((e) => e.type === "tool_call");

test("happy path uses both tools and cites only fetched records", async () => {
  const { r, log } = await run("happy-path");
  assert.equal(r.status, "completed");
  assert.equal(r.answer?.status, "answered");
  assert.deepEqual(r.answer?.supplier_ids, ["SUP-003"]);
  assert.match(r.answer!.answer, /rfq@lindholmen-fras\.example/);
  const used = new Set(toolEvents(log).map((e) => e.tool));
  assert.deepEqual([...used].sort(), ["get_supplier", "search_suppliers"]);
});

test("bad calls are returned to the model as errors and the run recovers", async () => {
  const { r, log } = await run("bad-calls-then-recover");
  assert.equal(r.status, "completed");
  assert.equal(r.toolErrors, 3);
  const codes = toolEvents(log).filter((e) => !e.ok).map((e) => (e.error as { code: string }).code);
  assert.deepEqual(codes, ["UNKNOWN_TOOL", "INVALID_ARGUMENTS", "INVALID_ARGUMENTS"]);
});

test("timeouts produce an honest insufficient_evidence answer", async () => {
  const { r } = await run("upstream-timeout");
  assert.equal(r.answer?.status, "insufficient_evidence");
  assert.equal(r.toolErrors, 2);
});

test("missing data gives insufficient_evidence, not a guess", async () => {
  const { r } = await run("no-evidence");
  assert.equal(r.answer?.status, "insufficient_evidence");
  assert.deepEqual(r.answer?.supplier_ids, []);
});

test("a final answer citing unfetched records is rejected", async () => {
  const { r, log } = await run("ungrounded-final-rejected");
  assert.equal(log.events.filter((e) => e.type === "final_rejected").length, 1);
  assert.equal(r.status, "completed");
  assert.deepEqual(r.answer?.evidence_ids, ["SUP-009"]);
});

test("step limit stops a runaway loop", async () => {
  const { r } = await run("runaway-loop");
  assert.equal(r.status, "step_limit_exceeded");
  assert.equal(r.steps, 5);
  assert.equal(r.answer, undefined);
});

test("a model API failure ends the run with model_error", async () => {
  const { registry, svc } = await setup();
  const broken = new ScriptedModel([() => { throw new Error("529 overloaded"); }], "broken");
  const r = await runAgent("anything", { model: broken, registry, log: new RunLog() });
  await svc.close();
  assert.equal(r.status, "model_error");
});

test("answered without evidence is refused by the schema", async () => {
  const { registry, svc } = await setup();
  const model = new ScriptedModel(
    [() => ({ calls: [call("final_answer", { status: "answered", answer: "SUP-001", supplier_ids: ["SUP-001"], evidence_ids: [] })] })],
    "no-evidence-answer",
    true,
  );
  const log = new RunLog();
  const r = await runAgent("q", { model, registry, log, maxSteps: 2 });
  await svc.close();
  assert.equal(r.status, "step_limit_exceeded");
  assert.match(String(log.events.find((e) => e.type === "final_rejected")?.reason), /at least one fetched record/);
});
