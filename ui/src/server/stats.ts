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
  let spend = 0;

  for (const log of input.spendLogs) {
    const cost = numberField(log, "spend") || numberField(log, "response_cost") || 0;
    spend += cost;
    add(byModel, displayModelName(stringField(log, "model") || "unknown"), cost);
    add(byKey, statsKey(log), cost);
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

export function filterSpendLogsByKey(spendLogs: Array<Record<string, unknown>>, key: string): Array<Record<string, unknown>> {
  return spendLogs.filter((log) => statsKey(log) === key);
}

function add(map: Map<string, StatsBreakdownRow>, name: string, spend: number): void {
  const current = map.get(name) || { id: name, name, spend: 0, requests: 0 };
  current.spend += spend;
  current.requests += 1;
  map.set(name, current);
}

function statsKey(log: Record<string, unknown>): string {
  return stringField(log, "api_key") || stringField(log, "key_alias") || "unknown";
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
