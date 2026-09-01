import type {
  ExtensionAPI,
  ProviderModelConfig,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import type {
  FetchResponse,
  ListResponse,
  SearchResponse,
  ShowResponse,
} from "./types.ts";

export default function (pi: ExtensionAPI) {
  pi.registerProvider("ollama-cloud", {
    name: "Ollama Cloud",
    baseUrl: "https://ollama.com/v1",
    api: "openai-completions",
    authHeader: true,
    apiKey: "$OLLAMA_API_KEY",
    async refreshModels({ signal, stored, allowNetwork, publish }) {
      if (
        !allowNetwork ||
        stored?.checkedAt &&
          (Date.now() - stored.checkedAt < 86400_000)
      ) {
        return stored?.models ? [...stored.models] : [];
      }

      const list = await fetch("https://ollama.com/api/tags", { signal })
        .then((resp): Promise<ListResponse> => resp.json());

      list.models.sort((a, b) => {
        if (a.model < b.model) return -1;
        else if (a.model > b.model) return 1;
        else return 0;
      });

      const models = await Promise.all(
        list.models.map(async (m): Promise<ProviderModelConfig> => {
          const show = await fetch("https://ollama.com/api/show", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ model: m.model }),
            signal,
          }).then((resp): Promise<ShowResponse> => resp.json());

          return {
            id: m.model,
            name: m.model,
            reasoning: show.capabilities.includes("thinking") ?? false,
            input: show.capabilities.includes("vision")
              ? ["text", "image"]
              : ["text"],
            cost: { cacheRead: 0, cacheWrite: 0, input: 0, output: 0 },
            contextWindow: getContextLength(show),
            maxTokens: 32768,
          };
        }),
      );

      await publish({
        persist: {
          models: models.map((m) => ({
            ...m,
            provider: "ollama-cloud",
            api: "openai-completions",
            baseUrl: "https://ollama.com/v1",
          })),
          checkedAt: Date.now(),
        },
      });

      return models;
    },
  });

  pi.on("resources_discover", async (_event, ctx) => {
    const providerAuth = await ctx.modelRegistry.getProviderAuth(
      "ollama-cloud",
    );
    const ollamaApiKey = providerAuth?.auth.apiKey;
    if (ollamaApiKey === undefined) return;

    pi.registerTool({
      name: "web-search",
      label: "Web Search",
      description:
        "Performs a web search for a single query and returns relevant results.",
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
      async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
        const response = await fetch(
          "https://ollama.com/api/web_search",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ollamaApiKey}`,
            },
            body: JSON.stringify(params),
            signal,
          },
        );

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error(
              "Unauthorized. Run `/login ollama cloud` to authenticate.",
            );
          }
          const errorText = await response.text().catch(() => "");
          throw new Error(
            `Search API error (status ${response.status}): ${
              errorText || response.statusText
            }`,
          );
        }

        const data = await response.json() as SearchResponse;

        const formatted = data.results
          .map((r, i) =>
            `${i + 1}. ${r.title}\n   URL: ${r.url}\n   ${r.content}`
          )
          .join("\n\n");

        return {
          content: [{ type: "text", text: formatted || "No results found." }],
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
      async execute(_toolCallId, params, signal, _onUpdate, _ctx) {
        const response = await fetch(
          "https://ollama.com/api/web_fetch",
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${ollamaApiKey}`,
            },
            body: JSON.stringify(params),
            signal,
          },
        );

        if (!response.ok) {
          if (response.status === 401) {
            throw new Error(
              "Unauthorized. Run `/login ollama cloud` to authenticate.",
            );
          }
          const errorText = await response.text().catch(() => "");
          throw new Error(
            `Fetch API error (status ${response.status}): ${
              errorText || response.statusText
            }`,
          );
        }

        const data = await response.json() as FetchResponse;

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
          details: {},
        };
      },
    });
  });
}

function getContextLength(show: ShowResponse): number {
  for (const [key, value] of Object.entries(show.model_info)) {
    if (key.endsWith(".context_length") && typeof value === "number") {
      return value;
    }
  }
  throw new Error("Unreachable.");
}
