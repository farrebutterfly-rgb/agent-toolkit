import { runAgent } from "../agent.ts";
import { RunLog } from "../log.ts";
import { AnthropicModel } from "../model/anthropic.ts";
import { setup } from "../setup.ts";

if (!process.env.ANTHROPIC_API_KEY) {
  console.error("ANTHROPIC_API_KEY is not set. Live runs call the real API and cost money; the fixture demo does not.");
  process.exit(2);
}
const question = process.argv.slice(2).join(" ") || "Which ISO 9001 certified supplier in Göteborg has the shortest lead time, and how do I contact it?";
const model = new AnthropicModel();
const { registry, svc } = await setup();
const log = new RunLog(`evidence/live-${new Date().toISOString().replace(/[:.]/g, "-")}.jsonl`, true);
console.log(`live run  model=${model.id}\n> "${question}"`);
const r = await runAgent(question, { model, registry, log });
console.log(r.answer ? `\nanswer [${r.answer.status}]: ${r.answer.answer}` : `\nno answer, status=${r.status}`);
await svc.close();
