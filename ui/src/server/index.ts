import path from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { LiteLLMClient } from "./litellm.js";
import { PromptPolicyStore, assignmentInputSchema, keyIdentifier, policyInputSchema } from "./prompt-policies.js";
import { signSession, verifyLiteLLMToken, verifySession, type UiSession } from "./session.js";
import { filterSpendLogsByKey, summarizeStats } from "./stats.js";

const config = loadConfig();
const litellm = new LiteLLMClient(config.litellmBaseUrl);
const promptPolicies = new PromptPolicyStore(config.databaseUrl, litellm);
const app = Fastify({ logger: true });
const sessionCookie = "maas_ui_session";

await app.register(cookie);
await app.register(formbody);
await promptPolicies.ready();

app.get("/health", async () => ({ status: "ok" }));

app.post("/api/login", async (request, reply) => {
  const body = z.object({ username: z.string().min(1), password: z.string().min(1) }).parse(request.body);
  const login = await litellm.login(body.username, body.password);
  const session = await verifyLiteLLMToken(login.token, config.litellmMasterKey);
  const cookieValue = await signSession(session, config.sessionSecret);
  reply.setCookie(sessionCookie, cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.secureCookies,
    path: "/",
    maxAge: 60 * 60 * 8
  });
  return publicSession(session);
});

app.post("/api/logout", async (_request, reply) => {
  reply.clearCookie(sessionCookie, { path: "/" });
  return { ok: true };
});

app.get("/api/session", async (request, reply) => publicSession(await requireSession(request, reply)));

app.get("/api/models", async (request, reply) => {
  const session = await requireSession(request, reply);
  return normalizeModelInfoResponse(await litellm.request("/model/info", session.litellmKey));
});

app.post("/api/models", async (request, reply) => {
  const session = await requireSession(request, reply);
  return litellm.request("/model/new", session.litellmKey, {
    method: "POST",
    body: JSON.stringify(request.body || {})
  });
});

app.patch("/api/models/:modelId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ modelId: z.string().min(1) }).parse(request.params);
  const body = request.body as Record<string, unknown> || {};
  const replacement = {
    ...body,
    model_info: {
      ...objectField(body, "model_info"),
      id: params.modelId,
      db_model: true
    }
  };
  await litellm.request("/model/delete", session.litellmKey, {
    method: "POST",
    body: JSON.stringify({ id: params.modelId })
  });
  return litellm.request("/model/new", session.litellmKey, {
    method: "POST",
    body: JSON.stringify(replacement)
  });
});

app.delete("/api/models/:modelId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ modelId: z.string().min(1) }).parse(request.params);
  return litellm.request("/model/delete", session.litellmKey, {
    method: "POST",
    body: JSON.stringify({ id: params.modelId })
  });
});

app.get("/api/keys", async (request, reply) => {
  const session = await requireSession(request, reply);
  const query = new URLSearchParams(request.query as Record<string, string>);
  if (!query.has("return_full_object")) query.set("return_full_object", "true");
  return normalizeModelLists(await litellm.request(`/key/list?${query.toString()}`, session.litellmKey));
});

app.post("/api/keys", async (request, reply) => {
  const session = await requireSession(request, reply);
  const body = request.body as Record<string, unknown> || {};
  const metadata = await promptPolicies.metadataForKey(null, stringField(body, "team_id"), objectField(body, "metadata"));
  return litellm.request("/key/generate", session.litellmKey, {
    method: "POST",
    body: JSON.stringify({ ...body, metadata })
  });
});

app.patch("/api/keys/:key", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ key: z.string().min(1) }).parse(request.params);
  const body = request.body as Record<string, unknown> || {};
  const existing = await findLiteLLMKey(session.litellmKey, params.key);
  const teamId = stringField(body, "team_id") ?? (existing ? stringField(existing, "team_id") : null);
  const requestedMetadata = body.metadata === undefined ? objectField(existing, "metadata") : objectField(body, "metadata");
  const metadata = await promptPolicies.metadataForKey(params.key, teamId, requestedMetadata);
  return litellm.request("/key/update", session.litellmKey, {
    method: "POST",
    body: JSON.stringify({ ...body, key: params.key, metadata })
  });
});

app.delete("/api/keys", async (request, reply) => {
  const session = await requireSession(request, reply);
  const body = z.object({ keys: z.array(z.string()).optional(), key_aliases: z.array(z.string()).optional() }).parse(request.body || {});
  if (!body.keys?.length && !body.key_aliases?.length) {
    reply.code(400);
    throw new Error("key_required");
  }
  return litellm.request("/key/delete", session.litellmKey, { method: "POST", body: JSON.stringify(body) });
});

app.get("/api/teams", async (request, reply) => {
  const session = await requireSession(request, reply);
  return normalizeModelLists(await litellm.request("/team/list", session.litellmKey));
});

app.post("/api/teams", async (request, reply) => {
  const session = await requireSession(request, reply);
  return litellm.request("/team/new", session.litellmKey, { method: "POST", body: JSON.stringify(request.body || {}) });
});

app.patch("/api/teams/:teamId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ teamId: z.string() }).parse(request.params);
  const result = await litellm.request("/team/update", session.litellmKey, {
    method: "POST",
    body: JSON.stringify({ ...(request.body as Record<string, unknown> || {}), team_id: params.teamId })
  });
  await promptPolicies.syncAllEffectivePolicies(session.litellmKey);
  return result;
});

app.delete("/api/teams/:teamId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ teamId: z.string() }).parse(request.params);
  return litellm.request("/team/delete", session.litellmKey, {
    method: "POST",
    body: JSON.stringify({ team_ids: [params.teamId] })
  });
});

app.get("/api/prompt-policies", async (request, reply) => {
  await requireSession(request, reply);
  return { policies: await promptPolicies.list() };
});

app.post("/api/prompt-policies", async (request, reply) => {
  const session = await requireSession(request, reply);
  return promptPolicies.create(policyInputSchema.parse(request.body || {}), session.litellmKey);
});

app.patch("/api/prompt-policies/:policyId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ policyId: z.string().min(1) }).parse(request.params);
  return promptPolicies.update(params.policyId, policyInputSchema.parse(request.body || {}), session.litellmKey);
});

app.delete("/api/prompt-policies/:policyId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ policyId: z.string().min(1) }).parse(request.params);
  return promptPolicies.delete(params.policyId, session.litellmKey);
});

app.put("/api/prompt-policies/:policyId/assignments", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ policyId: z.string().min(1) }).parse(request.params);
  const body = assignmentInputSchema.parse(request.body || {});
  return promptPolicies.setAssignments(params.policyId, body.assignments, session.litellmKey);
});

app.get("/api/stats", async (request, reply) => {
  const session = await requireSession(request, reply);
  const query = new URLSearchParams(request.query as Record<string, string>);
  const [logs, keys, teams, models] = await Promise.all([
    litellm.request<unknown>(`/spend/logs?${query.toString()}`, session.litellmKey),
    litellm.request<unknown>("/key/list?page=1&size=100", session.litellmKey),
    litellm.request<unknown>("/team/list", session.litellmKey),
    litellm.request<unknown>("/model/info", session.litellmKey)
  ]);
  return summarizeStats({
    spendLogs: arrayFrom(logs, "data", "logs", "spend_logs"),
    keys: arrayFrom(keys, "keys", "data"),
    teams: arrayFrom(teams, "teams", "data"),
    models: arrayFrom(normalizeModelInfoResponse(models), "data")
  });
});

app.get("/api/stats/keys/:key", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ key: z.string().min(1) }).parse(request.params);
  const query = new URLSearchParams(request.query as Record<string, string>);
  const [logs, keys, teams, models] = await Promise.all([
    litellm.request<unknown>(`/spend/logs?${query.toString()}`, session.litellmKey),
    litellm.request<unknown>("/key/list?page=1&size=100&return_full_object=true", session.litellmKey),
    litellm.request<unknown>("/team/list", session.litellmKey),
    litellm.request<unknown>("/model/info", session.litellmKey)
  ]);
  return summarizeStats({
    spendLogs: filterSpendLogsByKey(arrayFrom(logs, "data", "logs", "spend_logs"), params.key),
    keys: arrayFrom(keys, "keys", "data"),
    teams: arrayFrom(teams, "teams", "data"),
    models: arrayFrom(normalizeModelInfoResponse(models), "data")
  });
});

if (config.nodeEnv === "production") {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const staticRoot = path.resolve(__dirname, "../../client");
  await app.register(fastifyStatic, { root: staticRoot });
  app.setNotFoundHandler(async (request, reply) => {
    if (request.raw.url?.startsWith("/api/")) return reply.code(404).send({ error: "not_found" });
    return reply.sendFile("index.html");
  });
}

app.setErrorHandler((error, _request, reply) => {
  app.log.error(error);
  const message = error instanceof Error ? error.message : "internal_error";
  const maybeStatus = typeof error === "object" && error !== null && "statusCode" in error ? Number(error.statusCode) : undefined;
  const statusCode = error instanceof z.ZodError ? 400 : maybeStatus || 500;
  reply.code(statusCode).send({ error: message });
});

await app.listen({ host: "0.0.0.0", port: config.port });

async function requireSession(request: FastifyRequest, reply: FastifyReply): Promise<UiSession> {
  const token = request.cookies[sessionCookie];
  if (!token) {
    reply.code(401);
    throw new Error("not_authenticated");
  }
  try {
    return await verifySession(token, config.sessionSecret);
  } catch {
    reply.clearCookie(sessionCookie, { path: "/" });
    reply.code(401);
    throw new Error("not_authenticated");
  }
}

function publicSession(session: UiSession) {
  return {
    userId: session.userId,
    userEmail: session.userEmail,
    userRole: session.userRole
  };
}

async function findLiteLLMKey(litellmKey: string, key: string): Promise<Record<string, unknown> | null> {
  const response = await litellm.request<unknown>("/key/list?page=1&size=100&return_full_object=true", litellmKey);
  for (const row of arrayFrom(response, "keys", "data")) {
    if (keyIdentifier(row) === key) return row;
  }
  return null;
}

function normalizeModelInfoResponse(value: unknown): unknown {
  if (!value || typeof value !== "object" || !Array.isArray((value as Record<string, unknown>).data)) return value;
  return {
    ...(value as Record<string, unknown>),
    data: ((value as Record<string, unknown>).data as Array<Record<string, unknown>>).map((model) => ({
      ...model,
      model_name: displayModelName(model)
    }))
  };
}

function normalizeModelLists(value: unknown): unknown {
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

function objectField(value: Record<string, unknown> | null, key: string): Record<string, unknown> {
  const field = value?.[key];
  return field && typeof field === "object" && !Array.isArray(field) ? field as Record<string, unknown> : {};
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" && value[key] ? value[key] : null;
}

function stripOpenAIPrefix(model: string): string {
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}

function arrayFrom(value: unknown, ...keys: string[]): Array<Record<string, unknown>> {
  if (Array.isArray(value)) return value as Array<Record<string, unknown>>;
  if (!value || typeof value !== "object") return [];
  const record = value as Record<string, unknown>;
  for (const key of keys) {
    if (Array.isArray(record[key])) return record[key] as Array<Record<string, unknown>>;
  }
  return [];
}
