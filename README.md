# agent-toolkit

A small TypeScript agent that answers a question by choosing tools, reading their results and ending with a structured, source-checked answer. Every tool call is validated on the way in and on the way out, every call has a timeout, the loop has a step limit, and the run log shows exactly what was called and what came back.

## Quick start

Node 22 or later.

```bash
make install     # npm ci, pinned versions
make demo        # six fixture scenarios, no API key, no cost
make test        # 17 tests
```

Live run against a real model (costs money, needs a key):

```bash
export ANTHROPIC_API_KEY=...
make live
# or: npm run live -- "Which supplier in Malmö makes electronics?"
```

## What the demo shows

One question needs both tools: *Which ISO 9001 certified supplier in Göteborg has the shortest lead time, and how do I contact it?* Search only returns names and cities. Certifications, lead times and emails live behind a separate HTTP record service, so the agent has to search, then fetch each candidate, then decide.

```
> happy-path
  [03] ok  search_suppliers({"city":"Göteborg"}) 0ms
  [05] ok  get_supplier({"id":"SUP-001"}) 5ms
  ...
  answer [answered]: Lindholmen Fräs AB (SUP-003) ... 9 days. Contact: rfq@lindholmen-fras.example.

> bad-calls-then-recover
  [03] ERR lookup_supplier(...)  -> UNKNOWN_TOOL
  [04] ERR search_suppliers({"limit":5})  -> INVALID_ARGUMENTS
  [05] ERR get_supplier({"id":"3"})  -> INVALID_ARGUMENTS
  ... recovers, same answer

> upstream-timeout          TIMEOUT twice, answers insufficient_evidence
> no-evidence               nothing in Kiruna, says so instead of guessing
> ungrounded-final-rejected answer cites a record it never fetched, agent refuses it
> runaway-loop              same call forever, stopped at step 5
```

The full JSONL log for each run lands in `evidence/`.

## How it works

```
question
   |
   v
 runAgent loop (max N steps) ----> ModelClient.next()     fixture: ScriptedModel
   |                                                      live:    AnthropicModel
   |  tool calls
   v
 ToolRegistry.execute(name, args)
   1. known tool?                 else UNKNOWN_TOOL
   2. zod input schema            else INVALID_ARGUMENTS (+ field issues)
   3. run with AbortSignal, raced against a timeout      else TIMEOUT
   4. zod output schema           else INVALID_RESULT
   |
   v
 result or error goes back to the model as tool_result (is_error)
   |
   v
 final_answer pseudo-tool
   - schema: status answered | insufficient_evidence
   - answered must cite evidence_ids
   - every evidence id must have been fetched with get_supplier in this run
```

| File | Role |
| --- | --- |
| `src/registry.ts` | Validation, timeout, error mapping. The JSON Schema sent to the model is generated from the same zod schema that validates. |
| `src/agent.ts` | The loop, step limit, grounding check on the final answer. |
| `src/errors.ts` | The one error shape used in logs and tool results. |
| `src/tools/` | `search_suppliers` (local JSON), `get_supplier` (HTTP), `final_answer` schema. |
| `src/server/recordService.ts` | Local HTTP service with fault injection (slow ids, failing ids). |
| `src/model/` | Provider-neutral transcript, scripted fixture model, Anthropic adapter. |
| `src/scenarios.ts` | The six fixture scenarios. Scripts read real tool results, answers are computed, not hard-coded. |

## What this proves and what it does not

- Fixture runs prove the loop, the guards and the error handling. They prove nothing about how well a real model picks tools. That needs `make live`, and the status of live verification is in [ACCEPTANCE.md](ACCEPTANCE.md).
- The HTTP service is local. It stands in for a third-party API so tests are reproducible. This repo does not demonstrate OAuth.
- All data is synthetic. See [data/README.md](data/README.md).

Design trade-offs are in [DECISIONS.md](DECISIONS.md). Built with AI assistance (Claude); every change is reviewed and run locally.
