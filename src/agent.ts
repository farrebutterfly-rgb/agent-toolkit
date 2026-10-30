import { z } from "zod";
import { FINAL_TOOL_DESCRIPTION, FINAL_TOOL_NAME, FinalAnswer } from "./tools/finalAnswer.ts";
import type { ToolRegistry } from "./registry.ts";
import type { Message, ModelClient } from "./model/types.ts";
import type { RunLog } from "./log.ts";

export const SYSTEM_PROMPT = `You answer questions about a small supplier catalogue using tools.
Rules:
- search_suppliers only returns id, name, city and category. Anything about certifications, lead times or contacts must come from get_supplier.
- Never state a fact you did not get from a tool result in this conversation.
- If the tools do not return enough data, call final_answer with status "insufficient_evidence" and say what is missing.
- Finish by calling final_answer exactly once. evidence_ids must list the get_supplier records that support the answer.`;

export type RunStatus = "completed" | "step_limit_exceeded" | "model_error";

export interface RunResult {
  runId: string;
  status: RunStatus;
  steps: number;
  answer?: FinalAnswer;
  toolCalls: number;
  toolErrors: number;
}

export interface AgentOptions {
  model: ModelClient;
  registry: ToolRegistry;
  log: RunLog;
  maxSteps?: number;
}

export async function runAgent(question: string, opts: AgentOptions): Promise<RunResult> {
  const { model, registry, log } = opts;
  const maxSteps = opts.maxSteps ?? 8;
  const specs = [
    ...registry.specs(),
    { name: FINAL_TOOL_NAME, description: FINAL_TOOL_DESCRIPTION, input_schema: z.toJSONSchema(FinalAnswer, { io: "input" }) as Record<string, unknown> },
  ];
  const transcript: Message[] = [{ role: "user", text: question }];
  const fetched = new Set<string>(); // ids returned by successful get_supplier calls in THIS run
  let toolCalls = 0;
  let toolErrors = 0;

  log.write({ type: "run_start", model: model.id, question, max_steps: maxSteps, tools: specs.map((s) => s.name) });

  const end = (status: RunStatus, steps: number, answer?: FinalAnswer): RunResult => {
    log.write({ type: "run_end", status, steps, tool_calls: toolCalls, tool_errors: toolErrors, answer });
    return { runId: log.runId, status, steps, answer, toolCalls, toolErrors };
  };

  for (let step = 1; step <= maxSteps; step++) {
    let turn;
    try {
      turn = await model.next(SYSTEM_PROMPT, transcript, specs);
    } catch (e) {
      log.write({ type: "model_error", step, message: (e as Error).message });
      return end("model_error", step);
    }
    log.write({ type: "model_turn", step, text: turn.text, calls: turn.calls.map((c) => c.name), usage: turn.usage });
    transcript.push({ role: "assistant", text: turn.text, calls: turn.calls });

    if (turn.calls.length === 0) {
      transcript.push({ role: "user", text: `Finish by calling ${FINAL_TOOL_NAME}.` });
      continue;
    }

    const results: { id: string; content: string; isError: boolean }[] = [];
    for (const c of turn.calls) {
      if (c.name === FINAL_TOOL_NAME) {
        const parsed = FinalAnswer.safeParse(c.args);
        const reason = !parsed.success
          ? parsed.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`).join("; ")
          : parsed.data.evidence_ids.filter((id) => !fetched.has(id)).map((id) => `${id} was never fetched in this run`).join("; ");
        if (parsed.success && !reason) return end("completed", step, parsed.data);
        log.write({ type: "final_rejected", step, args: c.args, reason });
        results.push({ id: c.id, content: JSON.stringify({ code: "INVALID_ARGUMENTS", tool: FINAL_TOOL_NAME, message: reason }), isError: true });
        continue;
      }

      toolCalls++;
      const r = await registry.execute(c.name, c.args);
      if (r.ok && c.name === "get_supplier") fetched.add((r.result as { id: string }).id);
      if (!r.ok) toolErrors++;
      log.write({ type: "tool_call", step, call_id: c.id, tool: c.name, args: c.args, ok: r.ok, duration_ms: r.durationMs, ...(r.ok ? {} : { error: r.error }) });
      results.push({ id: c.id, content: JSON.stringify(r.ok ? r.result : r.error), isError: !r.ok });
    }
    transcript.push({ role: "tool", results });
  }
  return end("step_limit_exceeded", maxSteps);
}
