import { expect, test } from "vitest";
import { models } from "./model.ts";
import type { ListResponse } from "./types.ts";

test("model IDs match the current Ollama Cloud model list", async () => {
  const response = await fetch("https://ollama.com/api/tags", {
    signal: AbortSignal.timeout(3_000),
  });
  expect(response.ok, `Ollama tags API returned HTTP ${response.status}`).toBe(true);

  const list = (await response.json()) as ListResponse;
  const localIds = models.map((model) => model.id).sort();
  const remoteIds = list.models.map((model) => model.model).sort();

  expect(localIds).toEqual(remoteIds);
});
