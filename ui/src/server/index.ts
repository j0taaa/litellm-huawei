import path from "node:path";
import { fileURLToPath } from "node:url";
import cookie from "@fastify/cookie";
import formbody from "@fastify/formbody";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { loadConfig } from "./config.js";
import { ImageSupportStore, imageSupportInputSchema } from "./image-support.js";
import { arrayFrom, filenamePart, normalizeModelInfoResponse, normalizeModelLists, objectField, publicSession, sendCsv, stringArrayField, stringField } from "./http-utils.js";
import { LiteLLMClient } from "./litellm.js";
import { syncHuaweiModels } from "./model-sync.js";
import { PromptPolicyStore, assignmentInputSchema, keyIdentifier, policyInputSchema } from "./prompt-policies.js";
import { PromptSkillStore, skillAssignmentInputSchema, skillInputSchema } from "./prompt-skills.js";
import { signSession, verifyLiteLLMToken, verifySession, type UiSession } from "./session.js";
import { filterSpendLogsByKey, filterSpendLogsByTeam, filterSpendLogsByTimeframe, spendLogsToCsv, statsQueryOptions, summarizeStats } from "./stats.js";

const config = loadConfig();
const litellm = new LiteLLMClient(config.litellmBaseUrl);
const promptPolicies = new PromptPolicyStore(config.databaseUrl, litellm);
const promptSkills = new PromptSkillStore(config.databaseUrl, litellm);
const imageSupport = new ImageSupportStore(config.databaseUrl);
const app = Fastify({ logger: true, bodyLimit: config.bodyLimitBytes });
const sessionCookie = "maas_ui_session";

await app.register(cookie);
await app.register(formbody);
await promptPolicies.ready();
await promptSkills.ready();
await imageSupport.ready();

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

app.post("/api/models/sync", async (request, reply) => {
  const session = await requireSession(request, reply);
  return syncHuaweiModels({
    catalogUrl: config.catalogUrl,
    generatedDir: config.generatedDir,
    litellm,
    token: session.litellmKey
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
  const promptPolicyIds = stringArrayField(body, "prompt_policy_ids");
  const promptSkillIds = stringArrayField(body, "prompt_skill_ids");
  const metadata = await metadataForKey(null, stringField(body, "team_id"), objectField(body, "metadata"));
  const payload: Record<string, unknown> = { ...body, metadata };
  delete payload.prompt_policy_ids;
  delete payload.prompt_skill_ids;
  const result = await litellm.request<Record<string, unknown>>("/key/generate", session.litellmKey, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (promptPolicyIds.length || promptSkillIds.length) {
    const createdKey = await findGeneratedLiteLLMKey(session.litellmKey, result, stringField(body, "key_alias"));
    if (createdKey) {
      const createdKeyId = keyIdentifier(createdKey);
      await promptPolicies.setKeyPolicyAssignments(createdKeyId, promptPolicyIds, session.litellmKey);
      await promptSkills.setKeySkillAssignments(createdKeyId, promptSkillIds, session.litellmKey);
    }
  }
  return result;
});

app.patch("/api/keys/:key", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ key: z.string().min(1) }).parse(request.params);
  const body = request.body as Record<string, unknown> || {};
  const promptPolicyIds = stringArrayField(body, "prompt_policy_ids");
  const promptSkillIds = stringArrayField(body, "prompt_skill_ids");
  const existing = await findLiteLLMKey(session.litellmKey, params.key);
  const teamId = stringField(body, "team_id") ?? (existing ? stringField(existing, "team_id") : null);
  const requestedMetadata = body.metadata === undefined ? objectField(existing, "metadata") : objectField(body, "metadata");
  const metadata = await metadataForKey(params.key, teamId, requestedMetadata);
  const payload: Record<string, unknown> = { ...body, key: params.key, metadata };
  delete payload.prompt_policy_ids;
  delete payload.prompt_skill_ids;
  const result = await litellm.request("/key/update", session.litellmKey, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (body.prompt_policy_ids !== undefined) {
    await promptPolicies.setKeyPolicyAssignments(params.key, promptPolicyIds, session.litellmKey);
  }
  if (body.prompt_skill_ids !== undefined) {
    await promptSkills.setKeySkillAssignments(params.key, promptSkillIds, session.litellmKey);
  }
  return result;
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
  const body = request.body as Record<string, unknown> || {};
  const promptPolicyIds = stringArrayField(body, "prompt_policy_ids");
  const promptSkillIds = stringArrayField(body, "prompt_skill_ids");
  const payload: Record<string, unknown> = { ...body };
  delete payload.prompt_policy_ids;
  delete payload.prompt_skill_ids;
  const result = await litellm.request<Record<string, unknown>>("/team/new", session.litellmKey, { method: "POST", body: JSON.stringify(payload) });
  if (promptPolicyIds.length || promptSkillIds.length) {
    const teamId = stringField(result, "team_id") || await findGeneratedLiteLLMTeam(session.litellmKey, stringField(body, "team_alias"));
    if (teamId) {
      await promptPolicies.setTeamPolicyAssignments(teamId, promptPolicyIds, session.litellmKey);
      await promptSkills.setTeamSkillAssignments(teamId, promptSkillIds, session.litellmKey);
    }
  }
  return result;
});

app.patch("/api/teams/:teamId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ teamId: z.string() }).parse(request.params);
  const body = request.body as Record<string, unknown> || {};
  const promptPolicyIds = stringArrayField(body, "prompt_policy_ids");
  const promptSkillIds = stringArrayField(body, "prompt_skill_ids");
  const payload: Record<string, unknown> = { ...body, team_id: params.teamId };
  delete payload.prompt_policy_ids;
  delete payload.prompt_skill_ids;
  const result = await litellm.request("/team/update", session.litellmKey, {
    method: "POST",
    body: JSON.stringify(payload)
  });
  if (body.prompt_policy_ids !== undefined) {
    await promptPolicies.setTeamPolicyAssignments(params.teamId, promptPolicyIds, session.litellmKey);
  }
  if (body.prompt_skill_ids !== undefined) {
    await promptSkills.setTeamSkillAssignments(params.teamId, promptSkillIds, session.litellmKey);
  }
  await promptPolicies.syncAllEffectivePolicies(session.litellmKey);
  await promptSkills.syncAllEffectiveSkills(session.litellmKey);
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

app.get("/api/skills", async (request, reply) => {
  await requireSession(request, reply);
  return { skills: await promptSkills.list() };
});

app.post("/api/skills", async (request, reply) => {
  const session = await requireSession(request, reply);
  return promptSkills.create(skillInputSchema.parse(request.body || {}), session.litellmKey);
});

app.patch("/api/skills/:skillId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ skillId: z.string().min(1) }).parse(request.params);
  return promptSkills.update(params.skillId, skillInputSchema.parse(request.body || {}), session.litellmKey);
});

app.delete("/api/skills/:skillId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ skillId: z.string().min(1) }).parse(request.params);
  return promptSkills.delete(params.skillId, session.litellmKey);
});

app.put("/api/skills/:skillId/assignments", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ skillId: z.string().min(1) }).parse(request.params);
  const body = skillAssignmentInputSchema.parse(request.body || {});
  return promptSkills.setAssignments(params.skillId, body.assignments, session.litellmKey);
});

app.get("/api/image-support", async (request, reply) => {
  await requireSession(request, reply);
  return imageSupport.get();
});

app.put("/api/image-support", async (request, reply) => {
  await requireSession(request, reply);
  return imageSupport.update(imageSupportInputSchema.parse(request.body || {}));
});

const searchToolSchema = z.object({
  search_tool_name: z.string().min(1),
  litellm_params: z.object({
    search_provider: z.string().min(1),
    api_key: z.string().optional(),
    api_base: z.string().optional(),
    timeout: z.number().positive().optional(),
    max_retries: z.number().int().min(0).optional()
  }).passthrough(),
  search_tool_info: z.object({
    description: z.string().optional()
  }).passthrough().optional()
});

app.get("/api/search-tools", async (request, reply) => {
  const session = await requireSession(request, reply);
  return litellm.request("/search_tools/list", session.litellmKey);
});

app.get("/api/search-tools/providers", async (request, reply) => {
  const session = await requireSession(request, reply);
  return litellm.request("/search_tools/ui/available_providers", session.litellmKey);
});

app.post("/api/search-tools", async (request, reply) => {
  const session = await requireSession(request, reply);
  const searchTool = searchToolSchema.parse(request.body || {});
  return litellm.request("/search_tools", session.litellmKey, {
    method: "POST",
    body: JSON.stringify({ search_tool: searchTool })
  });
});

app.put("/api/search-tools/:searchToolId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ searchToolId: z.string().min(1) }).parse(request.params);
  const searchTool = searchToolSchema.parse(request.body || {});
  return litellm.request(`/search_tools/${encodeURIComponent(params.searchToolId)}`, session.litellmKey, {
    method: "PUT",
    body: JSON.stringify({ search_tool: searchTool })
  });
});

app.delete("/api/search-tools/:searchToolId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ searchToolId: z.string().min(1) }).parse(request.params);
  return litellm.request(`/search_tools/${encodeURIComponent(params.searchToolId)}`, session.litellmKey, {
    method: "DELETE"
  });
});

app.post("/api/search-tools/test-connection", async (request, reply) => {
  const session = await requireSession(request, reply);
  const body = z.object({
    litellm_params: searchToolSchema.shape.litellm_params
  }).parse(request.body || {});
  return litellm.request("/search_tools/test_connection", session.litellmKey, {
    method: "POST",
    body: JSON.stringify(body)
  });
});

app.post("/api/test/chat", async (request, reply) => {
  await requireSession(request, reply);
  const messageContentSchema = z.union([
    z.string(),
    z.array(z.union([
      z.object({ type: z.literal("text"), text: z.string() }),
      z.object({
        type: z.literal("image_url"),
        image_url: z.union([
          z.string(),
          z.object({ url: z.string().min(1), detail: z.string().optional() })
        ])
      })
    ])).min(1)
  ]);
  const body = z.object({
    api_key: z.string().min(1),
    model: z.string().min(1),
    messages: z.array(z.object({
      role: z.enum(["system", "user", "assistant"]),
      content: messageContentSchema
    })).min(1),
    max_tokens: z.number().int().min(1).max(8192).optional()
  }).parse(request.body || {});
  if (!isUsableLiteLLMApiKey(body.api_key)) {
    reply.code(400);
    throw new Error("Paste the full LiteLLM API key for testing. Key hashes and masked values like sk-...1234 cannot authenticate chat requests.");
  }
  try {
    return await litellm.request("/chat/completions", body.api_key, {
      method: "POST",
      body: JSON.stringify({
        model: body.model,
        messages: body.messages,
        max_tokens: body.max_tokens || 512
      })
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Request failed";
    if (isHuaweiProviderAuthError(message)) {
      reply.code(502);
      throw new Error("Huawei MaaS provider API key is missing or invalid in LiteLLM. Set HUAWEI_MAAS_API_KEY and restart the stack.");
    }
    throw error;
  }
});

app.get("/api/stats", async (request, reply) => {
  const session = await requireSession(request, reply);
  const { logs, keys, teams, models, timeframe, bucket } = await fetchStatsInputs(session, request.query);
  return summarizeStats({
    spendLogs: logs,
    keys,
    teams,
    models,
    timeframe,
    bucket
  });
});

app.get("/api/stats/export.csv", async (request, reply) => {
  const session = await requireSession(request, reply);
  const { logs, keys } = await fetchStatsInputs(session, request.query);
  return sendCsv(reply, "huawei-litellm-stats.csv", spendLogsToCsv({ spendLogs: logs, keys }));
});

app.get("/api/stats/keys/:key", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ key: z.string().min(1) }).parse(request.params);
  const { logs, keys, teams, models, timeframe, bucket } = await fetchStatsInputs(session, request.query);
  return summarizeStats({
    spendLogs: filterSpendLogsByKey(logs, params.key),
    keys,
    teams,
    models,
    timeframe,
    bucket
  });
});

app.get("/api/stats/keys/:key/export.csv", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ key: z.string().min(1) }).parse(request.params);
  const { logs, keys } = await fetchStatsInputs(session, request.query);
  return sendCsv(reply, `huawei-litellm-key-${filenamePart(params.key)}-stats.csv`, spendLogsToCsv({ spendLogs: filterSpendLogsByKey(logs, params.key), keys }));
});

app.get("/api/stats/teams/:teamId", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ teamId: z.string().min(1) }).parse(request.params);
  const { logs, keys, teams, models, timeframe, bucket } = await fetchStatsInputs(session, request.query);
  return summarizeStats({
    spendLogs: filterSpendLogsByTeam(logs, params.teamId),
    keys,
    teams,
    models,
    timeframe,
    bucket
  });
});

app.get("/api/stats/teams/:teamId/export.csv", async (request, reply) => {
  const session = await requireSession(request, reply);
  const params = z.object({ teamId: z.string().min(1) }).parse(request.params);
  const { logs, keys } = await fetchStatsInputs(session, request.query);
  return sendCsv(reply, `huawei-litellm-team-${filenamePart(params.teamId)}-stats.csv`, spendLogsToCsv({ spendLogs: filterSpendLogsByTeam(logs, params.teamId), keys }));
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

async function fetchStatsInputs(session: UiSession, rawQuery: unknown): Promise<{
  logs: Array<Record<string, unknown>>;
  keys: Array<Record<string, unknown>>;
  teams: Array<Record<string, unknown>>;
  models: Array<Record<string, unknown>>;
  timeframe: ReturnType<typeof statsQueryOptions>["timeframe"];
  bucket: ReturnType<typeof statsQueryOptions>["bucket"];
}> {
  const { timeframe, bucket, passthrough } = statsQueryOptions(rawQuery);
  const [logs, keys, teams, models] = await Promise.all([
    litellm.request<unknown>(`/spend/logs?${passthrough.toString()}`, session.litellmKey),
    litellm.request<unknown>("/key/list?page=1&size=100&return_full_object=true", session.litellmKey),
    litellm.request<unknown>("/team/list", session.litellmKey),
    litellm.request<unknown>("/model/info", session.litellmKey)
  ]);
  const spendLogs = filterSpendLogsByTimeframe(arrayFrom(logs, "data", "logs", "spend_logs"), timeframe);
  return {
    logs: spendLogs,
    keys: arrayFrom(keys, "keys", "data"),
    teams: arrayFrom(teams, "teams", "data"),
    models: arrayFrom(normalizeModelInfoResponse(models), "data"),
    timeframe,
    bucket
  };
}

async function findLiteLLMKey(litellmKey: string, key: string): Promise<Record<string, unknown> | null> {
  const response = await litellm.request<unknown>("/key/list?page=1&size=100&return_full_object=true", litellmKey);
  for (const row of arrayFrom(response, "keys", "data")) {
    if (keyIdentifier(row) === key) return row;
  }
  return null;
}

async function metadataForKey(keyId: string | null, teamId: string | null, existingMetadata: Record<string, unknown> | null | undefined) {
  const withPolicies = await promptPolicies.metadataForKey(keyId, teamId, existingMetadata);
  return promptSkills.metadataForKey(keyId, teamId, withPolicies);
}

async function findGeneratedLiteLLMKey(litellmKey: string, result: Record<string, unknown>, alias: string | null): Promise<Record<string, unknown> | null> {
  const response = await litellm.request<unknown>("/key/list?page=1&size=100&return_full_object=true", litellmKey);
  const rows = arrayFrom(response, "keys", "data");
  for (const row of rows) {
    const id = keyIdentifier(row);
    if (id && (id === stringField(result, "key") || id === stringField(result, "token") || id === stringField(result, "key_name"))) return row;
  }
  if (alias) {
    return rows.find((row) => stringField(row, "key_alias") === alias) || null;
  }
  return null;
}

function isHuaweiProviderAuthError(message: string) {
  return (
    message.includes("ModelArts.81003") ||
    message.includes("Invalid authorization header") ||
    message.includes("Huawei MaaS provider API key")
  );
}

function isUsableLiteLLMApiKey(value: string): boolean {
  const key = value.trim();
  return key.startsWith("sk-") && !key.includes("...") && key.length > 8;
}

async function findGeneratedLiteLLMTeam(litellmKey: string, alias: string | null): Promise<string | null> {
  if (!alias) return null;
  const response = await litellm.request<unknown>("/team/list", litellmKey);
  return arrayFrom(response, "teams", "data")
    .map((row) => stringField(row, "team_alias") === alias ? stringField(row, "team_id") : null)
    .find((id): id is string => Boolean(id)) || null;
}
