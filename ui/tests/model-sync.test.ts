import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { loadCatalog, modelEntries, syncHuaweiModels, validateCatalog } from "../src/server/model-sync";

const catalog = {
  provider: "Huawei Cloud",
  service: "MaaS",
  endpoints: { openaiCompatible: "https://api-ap-southeast-1.modelarts-maas.com/openai/v1" },
  currency: "USD",
  pricingUnit: "1M tokens",
  models: [
    {
      name: "DeepSeek-V4-Flash",
      id: "deepseek-v4-flash",
      pricing: {
        input: [{ start: 0, end: 1000000, tokenPriceUsdPerMillion: 0.135 }],
        output: [{ start: 0, end: 1000000, tokenPriceUsdPerMillion: 0.27 }]
      },
      limits: { contextWindowTokens: 1000000, maxInputTokens: 1000000, maxOutputTokens: 128000 }
    },
    {
      name: "GLM-5.1",
      id: "glm-5.1",
      pricing: {
        input: [
          { start: 0, end: 31999, tokenPriceUsdPerMillion: 0.809 },
          { start: 32000, end: 1000000, tokenPriceUsdPerMillion: 1.078 }
        ],
        output: [
          { start: 0, end: 31999, tokenPriceUsdPerMillion: 3.235 },
          { start: 32000, end: 1000000, tokenPriceUsdPerMillion: 3.774 }
        ]
      },
      limits: { contextWindowTokens: 198000, maxInputTokens: 192000, maxOutputTokens: 128000, maxReasoningTokens: 96000 }
    }
  ]
};

describe("model catalog sync", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("creates LiteLLM model payloads with Huawei pricing metadata", () => {
    const entries = modelEntries(catalog);
    expect(entries[0]).toMatchObject({
      model_name: "deepseek-v4-flash",
      litellm_params: { model: "deepseek-v4-flash", custom_llm_provider: "openai" },
      model_info: {
        key: "deepseek-v4-flash",
        input_cost_per_token: 0.000000135,
        output_cost_per_token: 0.00000027,
        huawei_maas: { id: "deepseek-v4-flash", tiered_pricing: false }
      }
    });
    expect(entries[1].model_info.huawei_maas).toMatchObject({
      id: "glm-5.1",
      tiered_pricing: true,
      pricing: catalog.models[1].pricing
    });
  });

  it("rejects overlapping price ranges", () => {
    const invalid = structuredClone(catalog);
    invalid.models[1].pricing.input[1].start = 100;
    expect(() => validateCatalog(invalid)).toThrow("overlaps");
  });

  it("loads local catalog files", async () => {
    const dir = await mkdtemp(path.join(os.tmpdir(), "huawei-catalog-"));
    try {
      const catalogPath = path.join(dir, "catalog.json");
      await writeFile(catalogPath, JSON.stringify(catalog));
      await expect(loadCatalog(catalogPath)).resolves.toMatchObject({ provider: "Huawei Cloud" });
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("writes generated catalog files and reseeds Huawei MaaS models", async () => {
    vi.stubEnv("HUAWEI_MAAS_API_KEY", "resolved-maas-key");
    const dir = await mkdtemp(path.join(os.tmpdir(), "huawei-sync-"));
    const calls: Array<{ path: string; body?: any }> = [];
    const litellm = {
      request: vi.fn(async (requestPath: string, _token: string, init?: RequestInit) => {
        calls.push({ path: requestPath, body: init?.body ? JSON.parse(String(init.body)) : undefined });
        if (requestPath === "/model/info") {
          return {
            data: [
              { model_name: "old", model_info: { id: "huawei-maas-old", huawei_maas: { id: "old" } } },
              { model_name: "custom", model_info: { id: "custom-model" } }
            ]
          };
        }
        return { ok: true };
      })
    };

    try {
      const catalogPath = path.join(dir, "source.json");
      const generatedDir = path.join(dir, "generated");
      await writeFile(catalogPath, JSON.stringify(catalog));
      await expect(syncHuaweiModels({ catalogUrl: catalogPath, generatedDir, litellm: litellm as any, token: "sk-test" })).resolves.toMatchObject({
        models: 2,
        deleted: 1,
        created: 2
      });
      await expect(readFile(path.join(generatedDir, "huawei_catalog.json"), "utf-8")).resolves.toContain("\"glm-5.1\"");
      await expect(readFile(path.join(generatedDir, "model_seed.json"), "utf-8")).resolves.toContain("\"deepseek-v4-flash\"");
      await expect(readFile(path.join(generatedDir, "model_seed.json"), "utf-8")).resolves.toContain("os.environ/HUAWEI_MAAS_API_KEY");
      expect(calls.filter((call) => call.path === "/model/new").map((call) => call.body.model_info.id)).toEqual([
        "huawei-maas-deepseek-v4-flash",
        "huawei-maas-glm-5-1"
      ]);
      expect(calls.filter((call) => call.path === "/model/new").map((call) => call.body.litellm_params.api_key)).toEqual([
        "resolved-maas-key",
        "resolved-maas-key"
      ]);
      expect(calls.some((call) => call.path === "/model/delete" && call.body.id === "huawei-maas-old")).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("requires the Huawei provider key when syncing DB-backed models", async () => {
    vi.stubEnv("HUAWEI_MAAS_API_KEY", "");
    const dir = await mkdtemp(path.join(os.tmpdir(), "huawei-sync-missing-key-"));
    const litellm = {
      request: vi.fn(async (requestPath: string) => {
        if (requestPath === "/model/info") return { data: [] };
        return { ok: true };
      })
    };

    try {
      const catalogPath = path.join(dir, "source.json");
      await writeFile(catalogPath, JSON.stringify(catalog));
      await expect(syncHuaweiModels({ catalogUrl: catalogPath, generatedDir: path.join(dir, "generated"), litellm: litellm as any, token: "sk-test" }))
        .rejects.toThrow("HUAWEI_MAAS_API_KEY is required");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
