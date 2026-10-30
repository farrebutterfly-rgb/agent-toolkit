# Exercises

Three exercises for anyone who wants to learn the code by explaining it, debugging it and changing it. Do these yourself; ask for hints, not for the answer.

## 1. Explain a flow (15 min)

Run `npm run demo bad-calls-then-recover`. Then answer, in your own words, pointing at file and line:

1. Where does `get_supplier({"id":"3"})` get stopped, and why does the tool's `run` never execute?
2. How does the model find out the call failed? What exactly does it receive?
3. Why does the run not stop at the first error?
4. In `ungrounded-final-rejected`: which line refuses the first answer, and what set does it check against?

## 2. Fix a bug (20 min)

```bash
git checkout exercise/01-bug
npm test
```

Some tests fail or the process crashes. Find the cause from the error output, fix it, and get `npm test` green. Then write one sentence on why it broke. Hint only if stuck: compare what happens to a timer after the tool has already answered.

## 3. Make a change (25 min)

Add an optional `certification` filter to `search_suppliers`, for example `{ city: "Göteborg", certification: "ISO 9001" }`.

The catch: certifications are not in `data/index.json`. Decide whether to add them to the index or keep search cheap and make the agent fetch. Write the choice and the reason in DECISIONS.md. Add at least one test. `make check` must pass.
