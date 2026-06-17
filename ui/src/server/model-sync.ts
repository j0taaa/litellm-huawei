import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { LiteLLMClient } from "./litellm.js";

type PriceRange = {
  start: number;
  end: number;
  tokenPriceUsdPerMillion: number;
};

type CatalogModel = {
  id: string;
  name: string;
  pricing: {
    input: PriceRange[];
    output: PriceRange[];
  };
  limits: {
    contextWindowTokens: number;
    maxInputTokens: number;
    maxOutputTokens: number;
    maxReasoningTokens?: number;
  };
};

type HuaweiCatalog = {
  provider: string;
  service: string;
  endpoints: {
    openaiCompatible: string;
  };
  pricingUnit?: string;
  currency?: string;
  models: CatalogModel[];
};

export type ModelSyncResult = {
  catalogUrl: string;
  models: number;
  deleted: number;
  created: number;
};

const defaultOpenAIBase = "https://api-ap-southeast-1.modelarts-maas.com/openai/v1";

export async function syncHuaweiModels(options: {
  catalogUrl: string;
  generatedDir: string;
  litellm: LiteLLMClient;
  token: string;
}): Promise<ModelSyncResult> {
  const catalog = await loadCatalog(options.catalogUrl);
  validateCatalog(catalog);
  const seed = modelEntries(catalog);
  await writeGeneratedFiles(options.generatedDir, catalog, seed);

  const existing = await options.litellm.request<unknown>("/model/info", options.token);
  const deletable = modelRows(existing).filter(isHuaweiMaaSModel);
  let deleted = 0;
  for (const model of deletable) {
    const id = modelId(model);
    if (!id) continue;
    try {
      await options.litellm.request("/model/delete", options.token, {
        method: "POST",
        body: JSON.stringify({ id })
      });
      deleted += 1;
    } catch {
      // Continue reseeding even if a stale DB model has already been removed.
    }
  }

  let created = 0;
  for (const model of seed) {
    const payload = {
      ...model,
      model_info: {
        ...model.model_info,
        id: huaweiModelId(model.model_name),
        db_model: true
      }
    };
    try {
      await options.litellm.request("/model/delete", options.token, {
        method: "POST",
        body: JSON.stringify({ id: payload.model_info.id })
      });
    } catch {
      // LiteLLM returns an error when the exact generated id is not present.
    }
    await options.litellm.request("/model/new", options.token, {
      method: "POST",
      body: JSON.stringify(resolveEnvRefsForLiteLLM(payload))
    });
    created += 1;
  }

  return {
    catalogUrl: options.catalogUrl,
    models: seed.length,
    deleted,
    created
  };
}

export async function loadCatalog(source: string): Promise<HuaweiCatalog> {
  if (source.startsWith("http://") || source.startsWith("https://")) {
    const response = await fetch(source);
    if (!response.ok) throw new Error(`catalog returned HTTP ${response.status}`);
    return await response.json() as HuaweiCatalog;
  }
  return JSON.parse(await readFile(source, "utf-8")) as HuaweiCatalog;
}

export function modelEntries(catalog: HuaweiCatalog) {
  validateCatalog(catalog);
  const apiBase = catalog.endpoints.openaiCompatible || defaultOpenAIBase;
  return catalog.models.map((model) => {
    const inputPrice = model.pricing.input[0].tokenPriceUsdPerMillion;
    const outputPrice = model.pricing.output[0].tokenPriceUsdPerMillion;
    const tiered = model.pricing.input.length > 1 || model.pricing.output.length > 1;
    return {
      model_name: model.id,
      litellm_params: {
        model: model.id,
        custom_llm_provider: "openai",
        api_base: apiBase,
        api_key: "os.environ/HUAWEI_MAAS_API_KEY"
      },
      model_info: {
        key: model.id,
        litellm_provider: "openai",
        mode: "chat",
        max_tokens: model.limits.maxOutputTokens,
        max_input_tokens: model.limits.maxInputTokens,
        max_output_tokens: model.limits.maxOutputTokens,
        input_cost_per_token: inputPrice / 1_000_000,
        output_cost_per_token: outputPrice / 1_000_000,
        supports_system_messages: true,
        supports_function_calling: false,
        huawei_maas: {
          name: model.name,
          id: model.id,
          context_window_tokens: model.limits.contextWindowTokens,
          max_reasoning_tokens: model.limits.maxReasoningTokens,
          pricing_unit: catalog.pricingUnit || "1M tokens",
          currency: catalog.currency || "USD",
          tiered_pricing: tiered,
          pricing: model.pricing
        }
      }
    };
  });
}

export function validateCatalog(catalog: HuaweiCatalog): void {
  if (catalog.provider !== "Huawei Cloud") throw new Error("catalog provider must be Huawei Cloud");
  if (catalog.service !== "MaaS") throw new Error("catalog service must be MaaS");
  if (!catalog.endpoints || !catalog.endpoints.openaiCompatible) throw new Error("catalog must include endpoints.openaiCompatible");
  if (!Array.isArray(catalog.models) || !catalog.models.length) throw new Error("catalog must include at least one model");

  const seen = new Set<string>();
  for (const [index, model] of catalog.models.entries()) {
    if (!model || typeof model.id !== "string" || !model.id) throw new Error(`models[${index}].id must be a non-empty string`);
    if (seen.has(model.id)) throw new Error(`duplicate model id: ${model.id}`);
    seen.add(model.id);
    if (typeof model.name !== "string" || !model.name) throw new Error(`models[${index}].name must be a non-empty string`);
    validateRanges(model.pricing?.input, `${model.id}.pricing.input`);
    validateRanges(model.pricing?.output, `${model.id}.pricing.output`);
    for (const key of ["contextWindowTokens", "maxInputTokens", "maxOutputTokens"] as const) {
      if (!Number.isInteger(model.limits?.[key]) || model.limits[key] <= 0) throw new Error(`${model.id}.limits.${key} must be a positive integer`);
    }
  }
}

function validateRanges(ranges: PriceRange[] | undefined, label: string): void {
  if (!Array.isArray(ranges) || !ranges.length) throw new Error(`${label} must include at least one price range`);
  let previousEnd = -1;
  ranges.forEach((range, index) => {
    if (!Number.isInteger(range.start) || range.start < 0) throw new Error(`${label}[${index}].start must be a non-negative integer`);
    if (!Number.isInteger(range.end) || range.end < range.start) throw new Error(`${label}[${index}].end must be an integer >= start`);
    if (range.start <= previousEnd) throw new Error(`${label}[${index}] overlaps the previous range`);
    if (typeof range.tokenPriceUsdPerMillion !== "number" || range.tokenPriceUsdPerMillion <= 0) throw new Error(`${label}[${index}].tokenPriceUsdPerMillion must be positive`);
    previousEnd = range.end;
  });
}

async function writeGeneratedFiles(generatedDir: string, catalog: HuaweiCatalog, seed: unknown): Promise<void> {
  await mkdir(generatedDir, { recursive: true });
  await writeAtomic(path.join(generatedDir, "huawei_catalog.json"), JSON.stringify(catalog, null, 2) + "\n");
  await writeAtomic(path.join(generatedDir, "model_seed.json"), JSON.stringify(seed, null, 2) + "\n");
}

async function writeAtomic(target: string, content: string): Promise<void> {
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await writeFile(tmp, content);
  await rename(tmp, target);
}

function modelRows(value: unknown): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (!value || typeof value !== "object") return [];
  const data = (value as Record<string, unknown>).data;
  return Array.isArray(data) ? data as Array<Record<string, unknown>> : [];
}

function isHuaweiMaaSModel(model: Record<string, unknown>): boolean {
  const modelInfo = objectField(model, "model_info");
  return Boolean(objectField(modelInfo, "huawei_maas").id);
}

function modelId(model: Record<string, unknown>): string | null {
  const modelInfo = objectField(model, "model_info");
  return stringField(modelInfo, "id") || stringField(model, "model_name");
}

function huaweiModelId(modelName: string): string {
  return `huawei-maas-${modelName.replaceAll(".", "-")}`;
}

function resolveEnvRefsForLiteLLM<T extends { litellm_params?: Record<string, unknown> }>(payload: T): T {
  const cloned = structuredClone(payload);
  const litellmParams = cloned.litellm_params;
  if (!litellmParams) return cloned;
  const apiKey = litellmParams.api_key;
  if (typeof apiKey === "string" && apiKey.startsWith("os.environ/")) {
    const envName = apiKey.split("/", 2)[1];
    const value = process.env[envName];
    if (!value) throw new Error(`${envName} is required to sync DB-backed LiteLLM models`);
    litellmParams.api_key = value;
  }
  return cloned;
}

function objectField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const field = value[key];
  return field && typeof field === "object" && !Array.isArray(field) ? field as Record<string, unknown> : {};
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" && value[key] ? value[key] : null;
}
