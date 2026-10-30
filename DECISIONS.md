# Decisions

**One schema, two uses.** Each tool has a zod schema. The registry validates with it and also generates the JSON Schema sent to the model (`z.toJSONSchema`). The model and the validator cannot drift apart.

**Errors go back to the model, not up the stack.** A bad call becomes a `tool_result` with `is_error: true` and a fixed shape (`code`, `tool`, `message`, `retryable`, `issues`). The model gets a chance to correct itself; the step limit stops it if it cannot.

**Timeout by race, not only by abort.** The tool gets an `AbortSignal`, and the call is also raced against a timer. A tool that ignores the signal still cannot hang the agent. There is a test for exactly that.

**The final answer is a tool call.** `final_answer` has its own schema, so the end of a run is structured data, not text to parse. `insufficient_evidence` is a normal outcome.

**Grounding check on evidence ids.** An answered result must cite records, and each cited id must have been fetched with `get_supplier` in this run. This catches a model citing something it never looked at. It does not check that the answer text is faithful to the records; that belongs to the evaluation project (agent-evals).

**Scripted fixture model instead of recorded API responses.** Each script step is a function of the transcript, so it reacts to real tool output. Answers in fixtures are computed from the data, which keeps the demo honest when the data changes.

**Local HTTP service with fault injection.** Slow ids and failing ids are set per test. No network, no flakiness, no cost.

**Not done on purpose.** No retries inside the registry (the model decides, and the error says `retryable`). No parallel tool execution. No streaming. No OAuth. Each would add code without changing what this project has to prove.
