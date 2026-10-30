import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { runAgent } from "../agent.ts";
import { RunLog } from "../log.ts";
import { scenarios } from "../scenarios.ts";
import { setup } from "../setup.ts";

const stamp = new Date().toISOString().slice(0, 10);
const rev = (() => { try { return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return "uncommitted"; } })();
const only = process.argv[2];
const file = `evidence/fixture-${stamp}.jsonl`;
writeFileSync(file, JSON.stringify({ type: "session", ts: new Date().toISOString(), code_rev: rev, dataset: "suppliers-v1", node: process.version, mode: "fixture" }) + "\n");

console.log(`agent-toolkit fixture demo  (no API calls, scripted model)  rev=${rev}  dataset=suppliers-v1\n`);
const summary: string[] = [];
for (const s of scenarios.filter((x) => !only || x.name === only)) {
  const { registry, svc } = await setup({ faults: s.faults, timeoutMs: s.timeoutMs });
  const log = new RunLog(file, true);
  console.log(`> ${s.name}: "${s.question}"`);
  const r = await runAgent(s.question, { model: s.model(), registry, log, maxSteps: s.maxSteps });
  if (r.answer) console.log(`  answer [${r.answer.status}]: ${r.answer.answer}\n`);
  else console.log("");
  summary.push(`${s.name.padEnd(28)} ${r.status.padEnd(20)} steps=${r.steps} tool_calls=${r.toolCalls} errors=${r.toolErrors} run=${r.runId}`);
  await svc.close();
}
console.log(summary.join("\n"));
console.log(`\nlog: ${file}  (code rev ${rev})`);
