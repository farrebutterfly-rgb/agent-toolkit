import { test, after } from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ToolRegistry } from "../src/registry.ts";
import { defineTool } from "../src/tools/types.ts";
import { setup } from "../src/setup.ts";

const { registry, svc } = await setup({ faults: { failIds: { "SUP-012": 503 } } });
after(() => svc.close());

test("unknown tool is stopped and names the real tools", async () => {
  const r = await registry.execute("delete_everything", {});
  assert.equal(r.ok, false);
  if (!r.ok) {
    assert.equal(r.error.code, "UNKNOWN_TOOL");
    assert.match(r.error.message, /search_suppliers, get_supplier/);
  }
});

test("invalid arguments never reach the tool", async () => {
  for (const args of [{ id: "3" }, { id: "SUP-001", extra: true }, {}, "SUP-001", null]) {
    const r = await registry.execute("get_supplier", args);
    assert.equal(r.ok, false, JSON.stringify(args));
    if (!r.ok) assert.equal(r.error.code, "INVALID_ARGUMENTS");
  }
});

test("search requires at least one filter", async () => {
  const r = await registry.execute("search_suppliers", { limit: 3 });
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.issues?.[0]?.message, "Give at least one of query, city or category");
});

test("search is case and accent tolerant on city", async () => {
  const r = await registry.execute("search_suppliers", { city: "göteborg" });
  assert.ok(r.ok);
  if (r.ok) assert.equal((r.result as { total: number }).total, 5);
});

test("HTTP 404 becomes NOT_FOUND, not retryable", async () => {
  const r = await registry.execute("get_supplier", { id: "SUP-999" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual([r.error.code, r.error.retryable], ["NOT_FOUND", false]);
});

test("HTTP 503 becomes UPSTREAM_ERROR, retryable", async () => {
  const r = await registry.execute("get_supplier", { id: "SUP-012" });
  assert.equal(r.ok, false);
  if (!r.ok) assert.deepEqual([r.error.code, r.error.retryable], ["UPSTREAM_ERROR", true]);
});

test("timeout fires even when a tool ignores its abort signal", async () => {
  const stubborn = defineTool({
    name: "stubborn",
    description: "never resolves and ignores abort",
    input: z.object({}),
    output: z.object({}),
    run: () => new Promise(() => {}),
  });
  const reg = new ToolRegistry([stubborn], 150);
  const r = await reg.execute("stubborn", {});
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "TIMEOUT");
  assert.ok(r.durationMs < 1000, `took ${r.durationMs}ms`);
});

test("a tool returning the wrong shape is caught as INVALID_RESULT", async () => {
  const liar = defineTool({
    name: "liar",
    description: "returns a string where a number is promised",
    input: z.object({}),
    output: z.object({ n: z.number() }),
    run: async () => ({ n: "seven" }) as unknown as { n: number },
  });
  const r = await new ToolRegistry([liar]).execute("liar", {});
  assert.equal(r.ok, false);
  if (!r.ok) assert.equal(r.error.code, "INVALID_RESULT");
});

test("JSON schema sent to the model is generated from the validator", () => {
  const spec = registry.specs().find((s) => s.name === "get_supplier")!;
  const props = spec.input_schema.properties as Record<string, { pattern?: string }>;
  assert.equal(props.id?.pattern, "^SUP-\\d{3}$");
  assert.equal(spec.input_schema.additionalProperties, false);
});
