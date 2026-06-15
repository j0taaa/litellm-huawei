import type { StatsBreakdownRow, StatsSummary } from "../shared/types.js";

export function summarizeStats(input: {
  spendLogs: Array<Record<string, unknown>>;
  keys: Array<Record<string, unknown>>;
  teams: Array<Record<string, unknown>>;
  models: Array<Record<string, unknown>>;
}): StatsSummary {
  const byModel = new Map<string, StatsBreakdownRow>();
  const byKey = new Map<string, StatsBreakdownRow>();
  const byTeam = new Map<string, StatsBreakdownRow>();
  const keyAliases = keyAliasLookup(input.keys);
  let spend = 0;

  for (const log of input.spendLogs) {
    const cost = numberField(log, "spend") || numberField(log, "response_cost") || 0;
    const keyId = statsKey(log);
    spend += cost;
    add(byModel, displayModelName(stringField(log, "model") || "unknown"), cost);
    add(byKey, keyId, cost, keyDisplayName(keyId, log, keyAliases));
    add(byTeam, stringField(log, "team_id") || "none", cost);
  }

  return {
    totals: {
      spend,
      requests: input.spendLogs.length,
      keys: input.keys.length,
      teams: input.teams.length,
      models: input.models.length
    },
    byModel: [...byModel.values()].sort((a, b) => b.spend - a.spend),
    byKey: [...byKey.values()].sort((a, b) => b.spend - a.spend),
    byTeam: [...byTeam.values()].sort((a, b) => b.spend - a.spend),
    recentTotal: input.spendLogs.length,
    recent: input.spendLogs.slice(0, 50).map((log) => ({
      ...log,
      model: displayModelName(stringField(log, "model") || "unknown"),
      api_key: keyDisplayName(statsKey(log), log, keyAliases)
    }))
  };
}

export function filterSpendLogsByKey(spendLogs: Array<Record<string, unknown>>, key: string): Array<Record<string, unknown>> {
  return spendLogs.filter((log) => statsKey(log) === key);
}

export function filterSpendLogsByTeam(spendLogs: Array<Record<string, unknown>>, teamId: string): Array<Record<string, unknown>> {
  return spendLogs.filter((log) => (stringField(log, "team_id") || "none") === teamId);
}

function add(map: Map<string, StatsBreakdownRow>, id: string, spend: number, name = id): void {
  const current = map.get(id) || { id, name, spend: 0, requests: 0 };
  current.name = name;
  current.spend += spend;
  current.requests += 1;
  map.set(id, current);
}

function statsKey(log: Record<string, unknown>): string {
  return stringField(log, "api_key") || stringField(log, "key_alias") || "unknown";
}

function keyAliasLookup(keys: Array<Record<string, unknown>>): Map<string, string> {
  const aliases = new Map<string, string>();
  for (const key of keys) {
    const alias = stringField(key, "key_alias");
    if (!alias) continue;
    for (const id of keyIdentifierCandidates(key)) {
      aliases.set(id, alias);
    }
  }
  return aliases;
}

function keyDisplayName(keyId: string, log: Record<string, unknown>, aliases: Map<string, string>): string {
  return aliases.get(keyId) || stringField(log, "key_alias") || keyId;
}

function keyIdentifierCandidates(key: Record<string, unknown>): string[] {
  return ["token", "key", "key_name", "api_key", "hashed_token", "key_id"]
    .map((field) => stringField(key, field))
    .filter((value): value is string => Boolean(value));
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" && value[key] ? value[key] : null;
}

function numberField(value: Record<string, unknown>, key: string): number | null {
  return typeof value[key] === "number" ? value[key] : null;
}

function displayModelName(model: string): string {
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}
