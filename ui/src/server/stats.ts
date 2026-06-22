import type { StatsBreakdownRow, StatsSummary, StatsTimeBucket, StatsTimeSeriesRow, StatsTimeframe } from "../shared/types.js";

const exportColumns = [
  "startTime",
  "model",
  "api_key",
  "team_id",
  "spend",
  "prompt_tokens",
  "completion_tokens",
  "total_tokens",
  "end_user",
  "request_id"
] as const;

export function summarizeStats(input: {
  spendLogs: Array<Record<string, unknown>>;
  keys: Array<Record<string, unknown>>;
  teams: Array<Record<string, unknown>>;
  models: Array<Record<string, unknown>>;
  timeframe?: StatsTimeframe;
  bucket?: StatsTimeBucket;
}): StatsSummary {
  const byModel = new Map<string, StatsBreakdownRow>();
  const byKey = new Map<string, StatsBreakdownRow>();
  const byTeam = new Map<string, StatsBreakdownRow>();
  const bucket = input.bucket || defaultBucket(input.timeframe || "7d");
  const sortedLogs = [...input.spendLogs].sort((a, b) => logTimeMs(b) - logTimeMs(a));
  const keyAliases = keyAliasLookup(input.keys);
  let spend = 0;

  for (const log of sortedLogs) {
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
    timeSeries: timeSeries(sortedLogs, bucket),
    range: {
      timeframe: input.timeframe || "7d",
      bucket,
      start: firstLogTime(sortedLogs),
      end: lastLogTime(sortedLogs)
    },
    recentTotal: sortedLogs.length,
    recent: sortedLogs.slice(0, 50).map((log) => ({
      ...log,
      model: displayModelName(stringField(log, "model") || "unknown"),
      api_key: keyDisplayName(statsKey(log), log, keyAliases)
    }))
  };
}

export function spendLogsToCsv(input: {
  spendLogs: Array<Record<string, unknown>>;
  keys: Array<Record<string, unknown>>;
}): string {
  const keyAliases = keyAliasLookup(input.keys);
  const rows = input.spendLogs.map((log) => {
    const keyId = statsKey(log);
    return {
      startTime: valueField(log, "startTime") ?? valueField(log, "start_time") ?? valueField(log, "created_at") ?? "",
      model: displayModelName(stringField(log, "model") || "unknown"),
      api_key: keyDisplayName(keyId, log, keyAliases),
      team_id: stringField(log, "team_id") || "none",
      spend: numberField(log, "spend") ?? numberField(log, "response_cost") ?? 0,
      prompt_tokens: valueField(log, "prompt_tokens") ?? valueField(log, "input_tokens") ?? "",
      completion_tokens: valueField(log, "completion_tokens") ?? valueField(log, "output_tokens") ?? "",
      total_tokens: valueField(log, "total_tokens") ?? "",
      end_user: valueField(log, "end_user") ?? valueField(log, "user") ?? "",
      request_id: valueField(log, "request_id") ?? valueField(log, "id") ?? ""
    };
  });

  return [
    exportColumns.join(","),
    ...rows.map((row) => exportColumns.map((column) => csvCell(row[column])).join(","))
  ].join("\r\n") + "\r\n";
}

export function filterSpendLogsByKey(spendLogs: Array<Record<string, unknown>>, key: string): Array<Record<string, unknown>> {
  return spendLogs.filter((log) => statsKey(log) === key);
}

export function filterSpendLogsByTeam(spendLogs: Array<Record<string, unknown>>, teamId: string): Array<Record<string, unknown>> {
  return spendLogs.filter((log) => (stringField(log, "team_id") || "none") === teamId);
}

export function filterSpendLogsByTimeframe(spendLogs: Array<Record<string, unknown>>, timeframe: StatsTimeframe): Array<Record<string, unknown>> {
  if (timeframe === "all") return spendLogs;
  const now = Date.now();
  const start = now - timeframeMs(timeframe);
  return spendLogs.filter((log) => {
    const time = logTimeMs(log);
    return time > 0 && time >= start && time <= now;
  });
}

export function statsQueryOptions(rawQuery: unknown): { timeframe: StatsTimeframe; bucket: StatsTimeBucket; passthrough: URLSearchParams } {
  const input = new URLSearchParams(rawQuery as Record<string, string>);
  const timeframe = statsTimeframe(input.get("timeframe"));
  const bucket = statsBucket(input.get("bucket")) || defaultBucket(timeframe);
  input.delete("timeframe");
  input.delete("bucket");
  return { timeframe, bucket, passthrough: input };
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
  const field = value[key];
  if (typeof field === "number") return field;
  if (typeof field === "string" && field.trim()) {
    const parsed = Number(field);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function valueField(value: Record<string, unknown>, key: string): string | number | boolean | null {
  const field = value[key];
  return typeof field === "string" || typeof field === "number" || typeof field === "boolean" ? field : null;
}

function displayModelName(model: string): string {
  return model.startsWith("openai/") ? model.slice("openai/".length) : model;
}

function timeSeries(spendLogs: Array<Record<string, unknown>>, bucket: StatsTimeBucket): StatsTimeSeriesRow[] {
  const rows = new Map<string, StatsTimeSeriesRow>();
  for (const log of spendLogs) {
    const time = logTimeMs(log);
    if (!time) continue;
    const start = bucketStart(new Date(time), bucket);
    const key = start.toISOString();
    const current = rows.get(key) || {
      label: bucketLabel(start, bucket),
      start: key,
      spend: 0,
      requests: 0,
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };
    current.spend += numberField(log, "spend") || numberField(log, "response_cost") || 0;
    current.requests += 1;
    current.prompt_tokens += numberField(log, "prompt_tokens") || numberField(log, "input_tokens") || 0;
    current.completion_tokens += numberField(log, "completion_tokens") || numberField(log, "output_tokens") || 0;
    current.total_tokens += numberField(log, "total_tokens") || 0;
    rows.set(key, current);
  }
  return [...rows.values()].sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
}

function logTimeMs(log: Record<string, unknown>): number {
  const value = valueField(log, "startTime") ?? valueField(log, "start_time") ?? valueField(log, "created_at") ?? valueField(log, "endTime");
  if (typeof value === "number") return value > 10_000_000_000 ? value : value * 1000;
  if (typeof value === "string") {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function firstLogTime(logs: Array<Record<string, unknown>>): string | null {
  const times = logs.map(logTimeMs).filter(Boolean).sort((a, b) => a - b);
  return times[0] ? new Date(times[0]).toISOString() : null;
}

function lastLogTime(logs: Array<Record<string, unknown>>): string | null {
  const times = logs.map(logTimeMs).filter(Boolean).sort((a, b) => b - a);
  return times[0] ? new Date(times[0]).toISOString() : null;
}

function bucketStart(date: Date, bucket: StatsTimeBucket): Date {
  const next = new Date(date);
  next.setUTCMinutes(0, 0, 0);
  if (bucket === "hour") return next;
  next.setUTCHours(0, 0, 0, 0);
  if (bucket === "day") return next;
  if (bucket === "week") {
    const day = next.getUTCDay() || 7;
    next.setUTCDate(next.getUTCDate() - day + 1);
    return next;
  }
  next.setUTCDate(1);
  return next;
}

function bucketLabel(date: Date, bucket: StatsTimeBucket): string {
  if (bucket === "hour") return date.toISOString().slice(5, 13).replace("T", " ");
  if (bucket === "day") return date.toISOString().slice(5, 10);
  if (bucket === "week") return `Week ${date.toISOString().slice(5, 10)}`;
  return date.toISOString().slice(0, 7);
}

function statsTimeframe(value: string | null): StatsTimeframe {
  return value === "24h" || value === "7d" || value === "30d" || value === "90d" || value === "all" ? value : "7d";
}

function statsBucket(value: string | null): StatsTimeBucket | null {
  return value === "hour" || value === "day" || value === "week" || value === "month" ? value : null;
}

function defaultBucket(timeframe: StatsTimeframe): StatsTimeBucket {
  if (timeframe === "24h") return "hour";
  if (timeframe === "90d") return "week";
  if (timeframe === "all") return "month";
  return "day";
}

function timeframeMs(timeframe: Exclude<StatsTimeframe, "all">): number {
  if (timeframe === "24h") return 24 * 60 * 60 * 1000;
  if (timeframe === "7d") return 7 * 24 * 60 * 60 * 1000;
  if (timeframe === "30d") return 30 * 24 * 60 * 60 * 1000;
  return 90 * 24 * 60 * 60 * 1000;
}

function csvCell(value: string | number | boolean): string {
  let text = String(value);
  if (typeof value === "string" && /^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, "\"\"")}"`;
  return text;
}
