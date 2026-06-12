import type { StatsSummary } from "../shared/types.js";

export function summarizeStats(input: {
  spendLogs: Array<Record<string, unknown>>;
  keys: Array<Record<string, unknown>>;
  teams: Array<Record<string, unknown>>;
  models: Array<Record<string, unknown>>;
}): StatsSummary {
  const byModel = new Map<string, { name: string; spend: number; requests: number }>();
  const byKey = new Map<string, { name: string; spend: number; requests: number }>();
  const byTeam = new Map<string, { name: string; spend: number; requests: number }>();
  let spend = 0;

  for (const log of input.spendLogs) {
    const cost = numberField(log, "spend") || numberField(log, "response_cost") || 0;
    spend += cost;
    add(byModel, displayModelName(stringField(log, "model") || "unknown"), cost);
    add(byKey, stringField(log, "api_key") || stringField(log, "key_alias") || "unknown", cost);
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
    recent: input.spendLogs.slice(0, 50).map((log) => ({
      ...log,
      model: displayModelName(stringField(log, "model") || "unknown")
    }))
  };
}

function add(map: Map<string, { name: string; spend: number; requests: number }>, name: string, spend: number): void {
  const current = map.get(name) || { name, spend: 0, requests: 0 };
  current.spend += spend;
  current.requests += 1;
  map.set(name, current);
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
