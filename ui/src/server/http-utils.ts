import type { FastifyReply } from "fastify";
import type { UiSession } from "./session.js";

export function sendCsv(reply: FastifyReply, filename: string, csv: string) {
  return reply
    .header("Content-Type", "text/csv; charset=utf-8")
    .header("Content-Disposition", `attachment; filename="${filename}"`)
    .send(csv);
}

export function filenamePart(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "unknown";
}

export function publicSession(session: UiSession) {
  return {
    userId: session.userId,
    userEmail: session.userEmail,
    userRole: session.userRole
  };
}

export function normalizeModelInfoResponse(value: unknown): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).data)) return value;
  return {
    ...(value as Record<string, unknown>),
    data: ((value as Record<string, unknown>).data as Array<Record<string, unknown>>).map((model) => ({
      ...model,
      model_name: displayModelName(model)
    }))
  };
}

export function normalizeModelLists(value: unknown): unknown {
  if (Array.isArray(value)) return value.map((item) => normalizeModelLists(item));
  if (!value || typeof value !== "object") return value;
  const record = { ...(value as Record<string, unknown>) };
  if (Array.isArray(record.models)) {
    record.models = record.models.map((model) => typeof model === "string" ? stripOpenAIPrefix(model) : model);
  }
  for (const key of ("keys,data,teams").split(",")) {
    if (Array.isArray(record[key])) {
      record[key] = record[key].map((item) => normalizeModelLists(item));
    }
  }
  return record;
}

export function objectField(value: Record<string, unknown> | null, key: string): Record<string, unknown> {
  const field = value?.[key];
  return field && typeof field === "object" && !Array.isArray(field) ? field as Record<string, unknown> : {};
}

export function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" && value[key] ? value[key] as string : null;
}

export function stringArrayField(value: Record<string, unknown>, key: string): string[] {
  const field = value[key];
  return Array.isArray(field) ? field.filter((item): item is string => typeof item === "string" && Boolean(item)) : [];
}

export function arrayFrom(value: unknown, ...keys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as Array<Record<string, unknown>>;
  }
  return [];
}

function displayModelName(model: Record<string, unknown>): string {
  const modelInfo = objectField(model, "model_info");
  const huaweiMaaS = objectField(modelInfo, "huawei_maas");
  const litellmParams = objectField(model, "litellm_params");
  return (
    stringField(huaweiMaaS, "id") ||
    stringField(modelInfo, "key") ||
    stripOpenAIPrefix(stringField(model, "model_name") || stringField(litellmParams, "model") || "unknown")
  );
}

function stripOpenAIPrefix(model: string): string {
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}
