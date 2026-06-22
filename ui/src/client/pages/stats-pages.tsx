import { useState } from "react";
import { Activity, BarChart3, DollarSign, KeyRound, Layers3, Users } from "lucide-react";
import type { StatsSummary, StatsTimeBucket, StatsTimeframe } from "../../shared/types";
import { useResource } from "../api";
import { Breakdown, EmptyState, Header, Metric, PaginatedDataTable, StatsActions, StatsCharts, UsageOverTimeCharts } from "../components";
import type { RoutePath } from "../types";
import { currency } from "../utils";

export function StatsPage({ onNavigate }: { onNavigate: (path: RoutePath) => void }) {
  const [timeframe, setTimeframe] = useState<StatsTimeframe>("7d");
  const [bucket, setBucket] = useState<StatsTimeBucket>("day");
  const query = statsQuery(timeframe, bucket);
  const { data, loading, reload } = useResource<StatsSummary>(`/api/stats?${query}`);
  return (
    <section>
      <Header
        icon={<BarChart3 size={22} />}
        title="Stats"
        tone="green"
        action={<div className="header-actions"><StatsActions exportHref={`/api/stats/export.csv?${query}`} onRefresh={reload} /></div>}
      />
      <StatsTimeframeControls timeframe={timeframe} bucket={bucket} onTimeframeChange={(next) => {
        setTimeframe(next);
        setBucket(defaultBucket(next));
      }} onBucketChange={setBucket} />
      {loading || !data ? <EmptyState text="Loading stats" /> : (
        <>
          <div className="metrics">
            <Metric icon={<DollarSign size={18} />} tone="green" label="Spend" value={currency(data.totals.spend)} />
            <Metric icon={<Activity size={18} />} tone="blue" label="Requests" value={String(data.totals.requests)} />
            <Metric icon={<KeyRound size={18} />} tone="amber" label="Keys" value={String(data.totals.keys)} />
            <Metric icon={<Users size={18} />} tone="violet" label="Teams" value={String(data.totals.teams)} />
            <Metric icon={<Layers3 size={18} />} tone="rose" label="Models" value={String(data.totals.models)} />
          </div>
          <UsageOverTimeCharts rows={data.timeSeries || []} />
          <StatsCharts spendTitle="Spend by team" spendRows={data.byTeam} modelRows={data.byModel} keyRows={data.byKey} />
          <div className="grid3">
            <Breakdown icon={<Layers3 size={16} />} tone="rose" title="By model" rows={data.byModel} />
            <Breakdown icon={<KeyRound size={16} />} tone="amber" title="By key" rows={data.byKey} onRowClick={(row) => onNavigate(`/stats/keys/${encodeURIComponent(row.id || row.name)}`)} />
            <Breakdown icon={<Users size={16} />} tone="violet" title="By team" rows={data.byTeam} onRowClick={(row) => onNavigate(`/stats/teams/${encodeURIComponent(row.id || row.name)}`)} />
          </div>
          <PaginatedDataTable icon={<Activity size={16} />} title="Recent spend logs" rows={data.recent} columns={["startTime", "model", "api_key", "team_id", "spend"]} />
        </>
      )}
    </section>
  );
}

function StatsTimeframeControls({
  timeframe,
  bucket,
  onTimeframeChange,
  onBucketChange
}: {
  timeframe: StatsTimeframe;
  bucket: StatsTimeBucket;
  onTimeframeChange: (value: StatsTimeframe) => void;
  onBucketChange: (value: StatsTimeBucket) => void;
}) {
  return (
    <div className="stats-controls">
      <label>Timeframe
        <select value={timeframe} onChange={(event) => onTimeframeChange(event.target.value as StatsTimeframe)}>
          <option value="24h">Last 24 hours</option>
          <option value="7d">Last 7 days</option>
          <option value="30d">Last 30 days</option>
          <option value="90d">Last 90 days</option>
          <option value="all">All time</option>
        </select>
      </label>
      <label>Group by
        <select value={bucket} onChange={(event) => onBucketChange(event.target.value as StatsTimeBucket)}>
          <option value="hour">Hour</option>
          <option value="day">Day</option>
          <option value="week">Week</option>
          <option value="month">Month</option>
        </select>
      </label>
    </div>
  );
}

function statsQuery(timeframe: StatsTimeframe, bucket: StatsTimeBucket): string {
  return new URLSearchParams({ timeframe, bucket }).toString();
}

function defaultBucket(timeframe: StatsTimeframe): StatsTimeBucket {
  if (timeframe === "24h") return "hour";
  if (timeframe === "90d") return "week";
  if (timeframe === "all") return "month";
  return "day";
}

export function KeyStatsPage({ keyId, onBack }: { keyId: string; onBack: () => void }) {
  const { data, loading, reload } = useResource<StatsSummary>(`/api/stats/keys/${encodeURIComponent(keyId)}`);
  const exportHref = `/api/stats/keys/${encodeURIComponent(keyId)}/export.csv`;
  return (
    <section>
      <Header
        icon={<KeyRound size={22} />}
        title="Key stats"
        tone="amber"
        action={<div className="header-actions"><button className="secondary" onClick={onBack}>Back to stats</button><StatsActions exportHref={exportHref} onRefresh={reload} /></div>}
      />
      <div className="detail-heading">
        <span className="muted">API key</span>
        <code>{keyId}</code>
      </div>
      {loading || !data ? <EmptyState text="Loading key stats" /> : (
        <>
          <div className="metrics">
            <Metric icon={<DollarSign size={18} />} tone="green" label="Spend" value={currency(data.totals.spend)} />
            <Metric icon={<Activity size={18} />} tone="blue" label="Requests" value={String(data.totals.requests)} />
            <Metric icon={<Layers3 size={18} />} tone="rose" label="Models" value={String(data.byModel.length)} />
            <Metric icon={<Users size={18} />} tone="violet" label="Teams" value={String(data.byTeam.length)} />
            <Metric icon={<KeyRound size={18} />} tone="amber" label="Key rows" value={String(data.byKey.length)} />
          </div>
          <StatsCharts spendTitle="Key spend by model" spendRows={data.byModel} modelRows={data.byModel} keyRows={data.byKey} />
          <div className="grid3">
            <Breakdown icon={<Layers3 size={16} />} tone="rose" title="Models" rows={data.byModel} />
            <Breakdown icon={<Users size={16} />} tone="violet" title="Teams" rows={data.byTeam} />
            <Breakdown icon={<Activity size={16} />} tone="blue" title="Requests" rows={data.byKey} />
          </div>
          <PaginatedDataTable icon={<Activity size={16} />} title="Recent key spend logs" rows={data.recent} columns={["startTime", "model", "api_key", "team_id", "spend"]} />
        </>
      )}
    </section>
  );
}

export function TeamStatsPage({ teamId, onBack }: { teamId: string; onBack: () => void }) {
  const { data, loading, reload } = useResource<StatsSummary>(`/api/stats/teams/${encodeURIComponent(teamId)}`);
  const exportHref = `/api/stats/teams/${encodeURIComponent(teamId)}/export.csv`;
  return (
    <section>
      <Header
        icon={<Users size={22} />}
        title="Team stats"
        tone="violet"
        action={<div className="header-actions"><button className="secondary" onClick={onBack}>Back to stats</button><StatsActions exportHref={exportHref} onRefresh={reload} /></div>}
      />
      <div className="detail-heading">
        <span className="muted">Team</span>
        <code>{teamId}</code>
      </div>
      {loading || !data ? <EmptyState text="Loading team stats" /> : (
        <>
          <div className="metrics">
            <Metric icon={<DollarSign size={18} />} tone="green" label="Spend" value={currency(data.totals.spend)} />
            <Metric icon={<Activity size={18} />} tone="blue" label="Requests" value={String(data.totals.requests)} />
            <Metric icon={<Layers3 size={18} />} tone="rose" label="Models" value={String(data.byModel.length)} />
            <Metric icon={<KeyRound size={18} />} tone="amber" label="Keys" value={String(data.byKey.length)} />
            <Metric icon={<Users size={18} />} tone="violet" label="Team rows" value={String(data.byTeam.length)} />
          </div>
          <StatsCharts spendTitle="Team spend by key" spendRows={data.byKey} modelRows={data.byModel} keyRows={data.byKey} />
          <div className="grid3">
            <Breakdown icon={<Layers3 size={16} />} tone="rose" title="Models" rows={data.byModel} />
            <Breakdown icon={<KeyRound size={16} />} tone="amber" title="Keys" rows={data.byKey} />
            <Breakdown icon={<Activity size={16} />} tone="blue" title="Requests" rows={data.byTeam} />
          </div>
          <PaginatedDataTable icon={<Activity size={16} />} title="Recent team spend logs" rows={data.recent} columns={["startTime", "model", "api_key", "team_id", "spend"]} />
        </>
      )}
    </section>
  );
}
