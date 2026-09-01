import type {
  ClassifierAnswer,
  ClassifierApi,
  ClassifierContext,
  ClassifierModel,
  ClassifierOptions,
  ClassifierResult,
} from "@earendil-works/pi-ai";
import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { unauthorized } from "./errors.ts";
import { models } from "./model.ts";
import type { FetchResponse, SearchResponse, SystemOneResponse } from "./types.ts";

export default function (pi: ExtensionAPI): void {
  pi.registerProvider("ollama-cloud", {
    name: "Ollama Cloud",
    baseUrl: "https://ollama.com/v1",
    api: "openai-completions",
    apiKey: "$OLLAMA_CLOUD_API_KEY",
    models,
    classifiers: { "ollama-cloud": { classify } },
  });

  pi.registerTool({
    name: "web-search",
    label: "Web Search",
    description: "Performs a web search for a single query and returns relevant results.",
    parameters: Type.Object({
      query: Type.String({ description: "the search query string" }),
      max_results: Type.Optional(
        Type.Integer({
          default: 5,
          maximum: 10,
          description: "maximum results to return",
        }),
      ),
    }),
    outputSchema: Type.Object({
      results: Type.Array(
        Type.Object({
          title: Type.String(),
          url: Type.String(),
          content: Type.String(),
        }),
      ),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const ollamaApiKey = await ctx.modelRegistry.getApiKeyForProvider("ollama-cloud");
      if (ollamaApiKey === undefined) throw unauthorized;

      const response = await fetch("https://ollama.com/api/web_search", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ollamaApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(params),
        signal,
      });

      if (!response.ok) {
        if (response.status === 401) throw unauthorized;

        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Search API error (status ${response.status}): ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as SearchResponse;

      const formatted = data.results
        .map((r, i) => `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content}`)
        .join("\n\n");

      return {
        content: [{ type: "text", text: formatted || "No results found." }],
        structuredContent: data,
        details: {},
      };
    },
  });

  pi.registerTool({
    name: "web-fetch",
    label: "Web Fetch",
    description: "Fetches a single web page by URL and returns its content.",
    parameters: Type.Object({
      url: Type.String({
        description: "the URL to fetch",
      }),
    }),
    outputSchema: Type.Object({
      title: Type.String(),
      content: Type.String(),
      links: Type.Array(Type.String()),
    }),
    async execute(toolCallId, params, signal, onUpdate, ctx) {
      const ollamaApiKey = await ctx.modelRegistry.getApiKeyForProvider("ollama-cloud");
      if (ollamaApiKey === undefined) throw unauthorized;

      const response = await fetch("https://ollama.com/api/web_fetch", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ollamaApiKey}`,
        },
        body: JSON.stringify(params),
        signal,
      });

      if (!response.ok) {
        if (response.status === 401) throw unauthorized;

        const errorText = await response.text().catch(() => "");
        throw new Error(
          `Fetch API error (status ${response.status}): ${errorText || response.statusText}`,
        );
      }

      const data = (await response.json()) as FetchResponse;

      const formatted = [
        `Title: ${data.title}`,
        "",
        "Content:",
        data.content,
        "",
        `Links found: ${data.links?.length ?? 0}`,
        ...(data.links?.slice(0, 10).map((l) => `  - ${l}`) ?? []),
      ].join("\n");

      return {
        content: [{ type: "text", text: formatted }],
        structuredContent: data,
        details: {},
      };
    },
  });

  const webTools = new Set(["web-search", "web-fetch"]);
  pi.on("before_agent_start", async (event, ctx) => {
    const activeTools = new Set(pi.getActiveTools());

    const ollamaApiKey = await ctx.modelRegistry.getApiKeyForProvider("ollama-cloud");
    if (ollamaApiKey === undefined) {
      pi.setActiveTools(Array.from(activeTools.difference(webTools)));
    } else {
      pi.setActiveTools(Array.from(activeTools.union(webTools)));
    }
  });
}

async function classify(
  model: ClassifierModel<ClassifierApi>,
  context: ClassifierContext,
  options?: ClassifierOptions,
): Promise<ClassifierResult> {
  const fetcher = options?.fetch || globalThis.fetch;

  const resp = await fetcher(`${model.baseUrl}/systemone`, {
    method: "POST",
    body: JSON.stringify({
      model: model.id,
      state: context.state,
      questions: context.questions,
      images: context.images?.map((img) => img.data),
    }),
    headers: {
      Authorization: `Bearer ${options?.apiKey}`,
      "Content-Type": "application/json",
    },
    signal: options?.signal,
  });

  if (!resp.ok) {
    const message = (await resp
      .json()
      .catch(() => ({ error: `${resp.status} ${resp.statusText}` }))) as { error: string };

    return {
      stopReason: "error",
      api: model.api,
      model: model.id,
      provider: model.provider,
      timestamp: Date.now(),
      errorMessage: message.error,
      answers: {},
    };
  }

  const classifyResp = (await resp.json()) as SystemOneResponse;

  return {
    stopReason: "stop",
    api: model.api,
    model: classifyResp.model,
    provider: model.provider,
    timestamp: Date.now(),
    answers: Object.fromEntries(
      Object.entries(classifyResp.answers).map(([key, answer]) => [key, convertAnswer(answer)]),
    ),
    usage: {
      output: classifyResp.usage.output_tokens,
      input: classifyResp.usage.input_tokens,
      totalTokens: classifyResp.usage.output_tokens + classifyResp.usage.input_tokens,
      cacheRead: 0,
      cacheWrite: 0,
      cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0, total: 0 },
    },
  };
}

function convertAnswer(answer: SystemOneResponse["answers"][string]): ClassifierAnswer {
  switch (answer.type) {
    case "choice":
      return {
        type: "choice",
        choice: answer.choice,
        probabilities: answer.probabilities,
        confidence: answer.confidence,
      };

    case "score":
      return {
        type: "score",
        score: answer.score,
        confidence: answer.confidence,
      };

    case "noul":
      return {
        type: "bool",
        probability: answer.noul,
      };
  }
}
