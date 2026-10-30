# Acceptance

Checked 2026-10-30 on Node 22.23.4, Linux. Fixture runs only. "Not run" means not run, not passed.

| # | Criterion | Status | Evidence |
| --- | --- | --- | --- |
| 1 | Both tools used in at least one real model run | **Not run.** No API key in the build environment. | `make live` writes `evidence/live-*.jsonl` |
| 1a | Both tools used in a fixture run | Passed | `happy-path` in `evidence/fixture-2026-10-30.jsonl`; test `happy path uses both tools` |
| 2 | Invalid arguments and unknown tools are stopped | Passed | tests `unknown tool is stopped`, `invalid arguments never reach the tool`, scenario `bad-calls-then-recover` |
| 3 | Timeout and step limit give clear results, no endless loop | Passed | tests `timeout fires even when a tool ignores its abort signal`, `step limit stops a runaway loop`; scenarios `upstream-timeout`, `runaway-loop` |
| 4 | Missing data gives an honest answer | Passed | scenario `no-evidence`; tests `missing data gives insufficient_evidence`, `answered without evidence is refused` |
| 5 | Someone else can run the fixture demo and read the live log | Fixture: passed on a clean `npm ci`. Live log: pending criterion 1. Not yet tried by a second person. | README quick start |

Extra checks beyond the plan: HTTP 404 and 503 mapping, output schema violations (`INVALID_RESULT`), final answers citing unfetched records, model API failure.

## Open gaps

- No live model run yet.
- The HTTP service is local; no real third-party API and no OAuth.
