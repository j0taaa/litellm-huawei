import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, BarChart3, CalendarClock, Copy, DollarSign, Download, ExternalLink, KeyRound, Layers3, LogOut, MessageSquare, Pencil, Plus, Power, RefreshCcw, Regex, Send, ShieldCheck, Sparkles, Trash2, Users, X } from "lucide-react";
import type { ApiKeyListRow, ApiKeyRow, ModelInfo, PromptPolicy, PromptPolicyRule, SessionUser, StatsBreakdownRow, StatsSummary, TeamRow } from "../shared/types";
import "./styles.css";

type RoutePath = "/stats" | "/keys" | "/teams" | "/models" | "/policies" | "/test" | `/stats/keys/${string}` | `/stats/teams/${string}`;
type Tone = "green" | "blue" | "amber" | "violet" | "rose";
type DurationUnit = "m" | "h" | "d";

const weekDays = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" }
];

const timezones = [
  "America/Sao_Paulo",
  "Asia/Shanghai",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
  "Asia/Tokyo"
];

type KeyFormState = {
  key_alias: string;
  team_id: string;
  max_budget: string;
  resetBudget: boolean;
  budgetResetAmount: number;
  budgetResetUnit: DurationUnit;
  max_tps: string;
  max_tpm: string;
  max_parallel_requests: string;
  tokenBudget: boolean;
  tokenBudgetTokens: string;
  tokenBudgetReset: boolean;
  tokenBudgetResetAmount: number;
  tokenBudgetResetUnit: DurationUnit;
  accessSchedule: boolean;
  accessTimezone: string;
  accessDays: number[];
  accessHours: boolean;
  accessStart: string;
  accessEnd: string;
  blocked: boolean;
  expires: boolean;
  durationAmount: number;
  durationUnit: DurationUnit;
  models: string[];
  policyIds: string[];
};

type TeamFormState = {
  team_alias: string;
  max_budget: string;
  resetBudget: boolean;
  budgetResetAmount: number;
  budgetResetUnit: DurationUnit;
  max_tps: string;
  max_tpm: string;
  max_parallel_requests: string;
  tokenBudget: boolean;
  tokenBudgetTokens: string;
  tokenBudgetReset: boolean;
  tokenBudgetResetAmount: number;
  tokenBudgetResetUnit: DurationUnit;
  accessSchedule: boolean;
  accessTimezone: string;
  accessDays: number[];
  accessHours: boolean;
  accessStart: string;
  accessEnd: string;
  blocked: boolean;
  models: string[];
  policyIds: string[];
};

const defaultKeyForm: KeyFormState = {
  key_alias: "",
  team_id: "",
  max_budget: "",
  resetBudget: false,
  budgetResetAmount: 30,
  budgetResetUnit: "d",
  max_tps: "",
  max_tpm: "",
  max_parallel_requests: "",
  tokenBudget: false,
  tokenBudgetTokens: "",
  tokenBudgetReset: false,
  tokenBudgetResetAmount: 30,
  tokenBudgetResetUnit: "d",
  accessSchedule: false,
  accessTimezone: "America/Sao_Paulo",
  accessDays: [1, 2, 3, 4, 5],
  accessHours: false,
  accessStart: "09:00",
  accessEnd: "17:00",
  blocked: false,
  expires: false,
  durationAmount: 30,
  durationUnit: "d",
  models: [],
  policyIds: []
};

const defaultTeamForm: TeamFormState = {
  team_alias: "",
  max_budget: "",
  resetBudget: false,
  budgetResetAmount: 30,
  budgetResetUnit: "d",
  max_tps: "",
  max_tpm: "",
  max_parallel_requests: "",
  tokenBudget: false,
  tokenBudgetTokens: "",
  tokenBudgetReset: false,
  tokenBudgetResetAmount: 30,
  tokenBudgetResetUnit: "d",
  accessSchedule: false,
  accessTimezone: "America/Sao_Paulo",
  accessDays: [1, 2, 3, 4, 5],
  accessHours: false,
  accessStart: "09:00",
  accessEnd: "17:00",
  blocked: false,
  models: [],
  policyIds: []
};

type ModelFormState = {
  model_name: string;
  upstream_model: string;
  custom_llm_provider: string;
  api_base: string;
  api_key: string;
  display_name: string;
  max_input_tokens: string;
  max_output_tokens: string;
  input_cost_per_million: string;
  output_cost_per_million: string;
  tiered_pricing: boolean;
  pricing_ranges: PricingRangeForm[];
};

type PricingRangeForm = {
  start: string;
  end: string;
  input_cost_per_million: string;
  output_cost_per_million: string;
};

type PolicyFormState = {
  name: string;
  description: string;
  enabled: boolean;
  rules: PromptPolicyRule[];
  keyAssignments: string[];
  teamAssignments: string[];
};

type TestChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
};

const defaultPolicyRule: PromptPolicyRule = {
  name: "New rule",
  enabled: true,
  pattern: "",
  flags: [],
  action: "redact",
  replacement: "[REDACTED]",
  append_text: ""
};

const defaultPolicyForm: PolicyFormState = {
  name: "",
  description: "",
  enabled: true,
  rules: [{ ...defaultPolicyRule }],
  keyAssignments: [],
  teamAssignments: []
};

const defaultModelForm: ModelFormState = {
  model_name: "",
  upstream_model: "",
  custom_llm_provider: "openai",
  api_base: "https://api-ap-southeast-1.modelarts-maas.com/openai/v1",
  api_key: "os.environ/HUAWEI_MAAS_API_KEY",
  display_name: "",
  max_input_tokens: "",
  max_output_tokens: "",
  input_cost_per_million: "",
  output_cost_per_million: "",
  tiered_pricing: false,
  pricing_ranges: defaultPricingRanges()
};

const routes: Array<{ path: "/stats" | "/keys" | "/teams" | "/models" | "/policies" | "/test"; label: string; icon: React.ReactNode }> = [
  { path: "/stats", label: "Stats", icon: <BarChart3 size={18} /> },
  { path: "/keys", label: "Keys", icon: <KeyRound size={18} /> },
  { path: "/teams", label: "Teams", icon: <Users size={18} /> },
  { path: "/models", label: "Models", icon: <Layers3 size={18} /> },
  { path: "/policies", label: "Policies", icon: <Regex size={18} /> },
  { path: "/test", label: "Test", icon: <MessageSquare size={18} /> }
];

function App() {
  const [session, setSession] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);
  const { route, navigate } = useRoute();

  useEffect(() => {
    api<SessionUser>("/api/session")
      .then(setSession)
      .catch(() => setSession(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="boot">Loading</div>;
  if (!session) return <Login onLogin={(nextSession) => { setSession(nextSession); navigate(normalizeRoute(window.location.pathname)); }} />;
  const activeRoute = activeNavRoute(route);
  return (
    <AppLayout session={session} route={activeRoute} onNavigate={navigate} onLogout={() => setSession(null)}>
      {renderRoute(route, navigate)}
    </AppLayout>
  );
}

function Login({ onLogin }: { onLogin: (session: SessionUser) => void }) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      onLogin(await api<SessionUser>("/api/login", { method: "POST", body: { username, password } }));
    } catch (error) {
      setError(error instanceof Error ? error.message : "Login failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-screen">
      <form className="login-panel" onSubmit={submit}>
        <div>
          <p className="eyebrow">Huawei MaaS Gateway</p>
          <h1>LiteLLM Access</h1>
        </div>
        <label>
          Username
          <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" />
        </label>
        <label>
          Password
          <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" autoComplete="current-password" />
        </label>
        {error ? <div className="error">{error}</div> : null}
        <button className="primary" disabled={busy}>{busy ? "Signing in" : "Sign in"}</button>
      </form>
    </main>
  );
}

function AppLayout({ session, route, onNavigate, onLogout, children }: { session: SessionUser; route: RoutePath; onNavigate: (path: RoutePath) => void; onLogout: () => void; children: React.ReactNode }) {
  async function logout() {
    await api("/api/logout", { method: "POST" });
    onLogout();
    onNavigate("/stats");
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          <KeyRound size={20} />
          <span>MaaS LiteLLM</span>
        </div>
        <nav>
          {routes.map((item) => (
            <NavLink key={item.path} active={route === item.path} icon={item.icon} label={item.label} path={item.path} onNavigate={onNavigate} />
          ))}
        </nav>
        <a className="nav litellm-external" href={liteLLMUiUrl()} target="_blank" rel="noreferrer">
          <ExternalLink size={18} /><span>LiteLLM UI</span>
        </a>
        <div className="account">
          <strong>{session.userEmail || session.userId}</strong>
          <span>{session.userRole}</span>
          <button className="ghost" onClick={logout}><LogOut size={16} /> Logout</button>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}

function liteLLMUiUrl(): string {
  const host = window.location.hostname.includes(":") ? `[${window.location.hostname}]` : window.location.hostname;
  return `${window.location.protocol}//${host}:4000/ui/`;
}

function NavLink({ active, icon, label, path, onNavigate }: { active: boolean; icon: React.ReactNode; label: string; path: RoutePath; onNavigate: (path: RoutePath) => void }) {
  return (
    <a
      className={active ? "nav active" : "nav"}
      href={path}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        event.preventDefault();
        onNavigate(path);
      }}
    >
      {icon}<span>{label}</span>
    </a>
  );
}

function renderRoute(route: RoutePath, navigate: (path: RoutePath) => void): React.ReactNode {
  if (route.startsWith("/stats/keys/")) {
    return <KeyStatsPage keyId={decodeURIComponent(route.slice("/stats/keys/".length))} onBack={() => navigate("/stats")} />;
  }
  if (route.startsWith("/stats/teams/")) {
    return <TeamStatsPage teamId={decodeURIComponent(route.slice("/stats/teams/".length))} onBack={() => navigate("/stats")} />;
  }
  if (route === "/keys") return <KeysPage />;
  if (route === "/teams") return <TeamsPage />;
  if (route === "/models") return <ModelsPage />;
  if (route === "/policies") return <PoliciesPage />;
  if (route === "/test") return <TestPage />;
  return <StatsPage onNavigate={navigate} />;
}

function activeNavRoute(route: RoutePath): "/stats" | "/keys" | "/teams" | "/models" | "/policies" | "/test" {
  if (route.startsWith("/stats")) return "/stats";
  if (route === "/keys" || route === "/teams" || route === "/models" || route === "/policies" || route === "/test") return route;
  return "/stats";
}

function StatsPage({ onNavigate }: { onNavigate: (path: RoutePath) => void }) {
  const { data, loading, reload } = useResource<StatsSummary>("/api/stats");
  return (
    <section>
      <Header
        icon={<BarChart3 size={22} />}
        title="Stats"
        tone="green"
        action={<div className="header-actions"><StatsActions exportHref="/api/stats/export.csv" onRefresh={reload} /></div>}
      />
      {loading || !data ? <EmptyState text="Loading stats" /> : (
        <>
          <div className="metrics">
            <Metric icon={<DollarSign size={18} />} tone="green" label="Spend" value={currency(data.totals.spend)} />
            <Metric icon={<Activity size={18} />} tone="blue" label="Requests" value={String(data.totals.requests)} />
            <Metric icon={<KeyRound size={18} />} tone="amber" label="Keys" value={String(data.totals.keys)} />
            <Metric icon={<Users size={18} />} tone="violet" label="Teams" value={String(data.totals.teams)} />
            <Metric icon={<Layers3 size={18} />} tone="rose" label="Models" value={String(data.totals.models)} />
          </div>
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

function KeyStatsPage({ keyId, onBack }: { keyId: string; onBack: () => void }) {
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

function TeamStatsPage({ teamId, onBack }: { teamId: string; onBack: () => void }) {
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

function KeysPage() {
  const { data, loading, reload } = useResource<{ keys?: ApiKeyListRow[]; data?: ApiKeyListRow[] }>("/api/keys?page=1&size=100");
  const models = useResource<{ data?: ModelInfo[] }>("/api/models");
  const teamsResource = useResource<TeamRow[] | { teams?: TeamRow[]; data?: TeamRow[] }>("/api/teams");
  const policiesResource = useResource<{ policies: PromptPolicy[] }>("/api/prompt-policies");
  const [createdKey, setCreatedKey] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyListRow | null>(null);
  const [cloningKey, setCloningKey] = useState<ApiKeyListRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [togglingKey, setTogglingKey] = useState("");
  const [deletingKey, setDeletingKey] = useState("");
  const [form, setForm] = useState<KeyFormState>(defaultKeyForm);
  const keys = data?.keys || data?.data || [];
  const modelNames = (models.data?.data || []).map((model) => model.model_name);
  const teams = Array.isArray(teamsResource.data) ? teamsResource.data : teamsResource.data?.teams || teamsResource.data?.data || [];
  const policies = policiesResource.data?.policies || [];
  const scheduleInvalid = form.accessSchedule && form.accessDays.length === 0;

  async function submitKey(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    const editingId = editingKey ? keyIdentifier(editingKey) : "";
    const payload = keyPayload(form, editingKey ? "edit" : cloningKey ? "clone" : "create");
    try {
      if (editingId) {
        await api(`/api/keys/${encodeURIComponent(editingId)}`, { method: "PATCH", body: payload });
        closeKeyModal();
      } else {
        const result = await api<Record<string, unknown>>("/api/keys", { method: "POST", body: payload });
        setCreatedKey(String(result.key || result.token || ""));
        setForm(defaultKeyForm);
      }
      reload();
    } finally {
      setCreating(false);
    }
  }

  function toggleKeyModel(modelName: string) {
    const nextModels = form.models.includes(modelName)
      ? form.models.filter((name) => name !== modelName)
      : [...form.models, modelName];
    setForm({ ...form, models: nextModels });
  }

  function toggleKeyPolicy(policyId: string) {
    setForm({ ...form, policyIds: toggleValue(form.policyIds, policyId) });
  }

  function toggleAccessDay(day: number) {
    const nextDays = form.accessDays.includes(day)
      ? form.accessDays.filter((value) => value !== day)
      : [...form.accessDays, day].sort((left, right) => left - right);
    setForm({ ...form, accessDays: nextDays });
  }

  function openCreateModal() {
    setForm(defaultKeyForm);
    setCreatedKey("");
    setEditingKey(null);
    setCloningKey(null);
    setCreateOpen(true);
  }

  function openEditModal(row: ApiKeyListRow) {
    const key = keyIdentifier(row);
    setForm(keyFormFromRow(normalizeKeyRow(row), policies, key));
    setCreatedKey("");
    setEditingKey(row);
    setCloningKey(null);
    setCreateOpen(true);
  }

  function openCloneModal(row: ApiKeyListRow) {
    const key = keyIdentifier(row);
    const nextForm = keyFormFromRow(normalizeKeyRow(row), policies, key);
    setForm({
      ...nextForm,
      key_alias: nextForm.key_alias ? `${nextForm.key_alias} copy` : ""
    });
    setCreatedKey("");
    setEditingKey(null);
    setCloningKey(row);
    setCreateOpen(true);
  }

  function closeKeyModal() {
    setCreateOpen(false);
    setCreatedKey("");
    setEditingKey(null);
    setCloningKey(null);
    setForm(defaultKeyForm);
  }

  async function deleteKey(row: ApiKeyListRow) {
    const key = keyIdentifier(row);
    if (!key) return;
    setDeletingKey(key);
    try {
      await api("/api/keys", { method: "DELETE", body: { keys: [key] } });
      reload();
    } finally {
      setDeletingKey("");
    }
  }

  async function toggleKeyActive(row: ApiKeyListRow) {
    const key = keyIdentifier(row);
    if (!key) return;
    setTogglingKey(key);
    try {
      await api(`/api/keys/${encodeURIComponent(key)}`, { method: "PATCH", body: { blocked: !Boolean(normalizeKeyRow(row).blocked) } });
      reload();
    } finally {
      setTogglingKey("");
    }
  }

  return (
    <section>
      <Header
        icon={<KeyRound size={22} />}
        title="Keys"
        tone="amber"
        action={<div className="header-actions"><button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button><button className="primary" onClick={openCreateModal}><Plus size={16} /> Create key</button></div>}
      />
      {createOpen ? (
        <Modal title={editingKey ? "Edit key" : cloningKey ? "Clone key" : "Create key"} onClose={closeKeyModal}>
          {createdKey ? (
            <div className="modal-stack">
              <div className="secret"><code>{createdKey}</code><button className="secondary" onClick={() => navigator.clipboard.writeText(createdKey)}><Copy size={16} /> Copy</button></div>
              <div className="modal-actions"><button className="primary" onClick={closeKeyModal}>Done</button></div>
            </div>
          ) : (
            <form className="modal-form" onSubmit={submitKey}>
              <label>Alias<input placeholder="Production app" value={form.key_alias} onChange={(e) => setForm({ ...form, key_alias: e.target.value })} /></label>
              <label>Team
                <select value={form.team_id} onChange={(e) => setForm({ ...form, team_id: e.target.value })} disabled={teamsResource.loading}>
                  <option value="">{teamsResource.loading ? "Loading teams" : "No team"}</option>
                  {teams.map((team) => <option key={team.team_id} value={team.team_id}>{team.team_alias || team.team_id}</option>)}
                </select>
              </label>
              <label>Budget USD<input placeholder="Optional" value={form.max_budget} onChange={(e) => setForm({ ...form, max_budget: e.target.value })} /></label>
              <div className="expiration-field">
                <label className="toggle-row"><input type="checkbox" checked={form.resetBudget} onChange={(e) => setForm({ ...form, resetBudget: e.target.checked })} /> <span>Reset budget</span></label>
                {form.resetBudget ? (
                  <div className="duration-controls">
                    <label>Reset every
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={form.budgetResetAmount}
                        onChange={(e) => setForm({ ...form, budgetResetAmount: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>
                    <label>Budget reset unit
                      <select value={form.budgetResetUnit} onChange={(e) => setForm({ ...form, budgetResetUnit: e.target.value as DurationUnit })}>
                        <option value="m">Minutes</option>
                        <option value="h">Hours</option>
                        <option value="d">Days</option>
                      </select>
                    </label>
                  </div>
                ) : (
                  <p className="field-note compact">Budget does not reset.</p>
                )}
              </div>
              {editingKey ? (
                <label className="toggle-row"><input type="checkbox" checked={form.blocked} onChange={(e) => setForm({ ...form, blocked: e.target.checked })} /> <span>Block key</span></label>
              ) : null}
              {!editingKey ? <div className="expiration-field">
                <label className="toggle-row"><input type="checkbox" checked={form.expires} onChange={(e) => setForm({ ...form, expires: e.target.checked })} /> <span>Set expiration</span></label>
                {form.expires ? (
                  <div className="duration-controls">
                    <label>Expires after
                      <input
                        type="number"
                        min="1"
                        step="1"
                        value={form.durationAmount}
                        onChange={(e) => setForm({ ...form, durationAmount: Math.max(1, Number(e.target.value) || 1) })}
                      />
                    </label>
                    <label>Expiration unit
                      <select value={form.durationUnit} onChange={(e) => setForm({ ...form, durationUnit: e.target.value as DurationUnit })}>
                        <option value="m">Minutes</option>
                        <option value="h">Hours</option>
                        <option value="d">Days</option>
                      </select>
                    </label>
                  </div>
                ) : (
                  <p className="field-note compact">This key will not expire.</p>
                )}
              </div> : null}
              <fieldset className="config-section">
                <span className="field-label">Rate limits</span>
                <div className="config-grid">
                  <label>Max TPS<input type="number" min="0.01" step="0.01" placeholder="Optional" value={form.max_tps} onChange={(e) => setForm({ ...form, max_tps: e.target.value })} /></label>
                  <label>Max TPM<input type="number" min="1" step="1" placeholder="Optional" value={form.max_tpm} onChange={(e) => setForm({ ...form, max_tpm: e.target.value })} /></label>
                  <label>Max parallel<input type="number" min="1" step="1" placeholder="Optional" value={form.max_parallel_requests} onChange={(e) => setForm({ ...form, max_parallel_requests: e.target.value })} /></label>
                </div>
              </fieldset>
              <fieldset className="config-section">
                <span className="field-label">Token quota</span>
                <label className="toggle-row"><input type="checkbox" checked={form.tokenBudget} onChange={(e) => setForm({ ...form, tokenBudget: e.target.checked })} /> <span>Set token quota</span></label>
                {form.tokenBudget ? (
                  <>
                    <div className="config-grid">
                      <label>Total token quota<input type="number" min="1" step="1" placeholder="Total tokens" value={form.tokenBudgetTokens} onChange={(e) => setForm({ ...form, tokenBudgetTokens: e.target.value })} required={form.tokenBudget} /></label>
                      <label className="toggle-row"><input type="checkbox" checked={form.tokenBudgetReset} onChange={(e) => setForm({ ...form, tokenBudgetReset: e.target.checked })} /> <span>Reset token quota</span></label>
                    </div>
                    {form.tokenBudgetReset ? (
                      <div className="duration-controls">
                        <label>Token reset every
                          <input
                            type="number"
                            min="1"
                            step="1"
                            value={form.tokenBudgetResetAmount}
                            onChange={(e) => setForm({ ...form, tokenBudgetResetAmount: Math.max(1, Number(e.target.value) || 1) })}
                          />
                        </label>
                        <label>Token reset unit
                          <select value={form.tokenBudgetResetUnit} onChange={(e) => setForm({ ...form, tokenBudgetResetUnit: e.target.value as DurationUnit })}>
                            <option value="m">Minutes</option>
                            <option value="h">Hours</option>
                            <option value="d">Days</option>
                          </select>
                        </label>
                      </div>
                    ) : (
                      <p className="field-note compact">Token quota does not reset.</p>
                    )}
                  </>
                ) : (
                  <p className="field-note compact">No total token quota is enforced.</p>
                )}
              </fieldset>
              <fieldset className="config-section">
                <span className="field-label section-title"><CalendarClock size={16} /> Access schedule</span>
                <label className="toggle-row"><input type="checkbox" checked={form.accessSchedule} onChange={(e) => setForm({ ...form, accessSchedule: e.target.checked })} /> <span>Restrict access by schedule</span></label>
                {form.accessSchedule ? (
                  <>
                    <div className="config-grid schedule-grid">
                      <label>Access timezone
                        <select value={form.accessTimezone} onChange={(e) => setForm({ ...form, accessTimezone: e.target.value })}>
                          {timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
                        </select>
                      </label>
                      <label className="toggle-row"><input type="checkbox" checked={form.accessHours} onChange={(e) => setForm({ ...form, accessHours: e.target.checked })} /> <span>Limit daily hours</span></label>
                    </div>
                    <div>
                      <span className="field-label">Allowed days</span>
                      <div className="weekday-checks">
                        {weekDays.map((day) => (
                          <label className="weekday-check" key={day.value}>
                            <input type="checkbox" checked={form.accessDays.includes(day.value)} onChange={() => toggleAccessDay(day.value)} />
                            <span>{day.label}</span>
                          </label>
                        ))}
                      </div>
                      {scheduleInvalid ? <p className="field-note danger-note">Select at least one allowed day.</p> : null}
                    </div>
                    {form.accessHours ? (
                      <div className="duration-controls">
                        <label>Start time<input type="time" value={form.accessStart} onChange={(e) => setForm({ ...form, accessStart: e.target.value })} required /></label>
                        <label>End time<input type="time" value={form.accessEnd} onChange={(e) => setForm({ ...form, accessEnd: e.target.value })} required /></label>
                      </div>
                    ) : (
                      <p className="field-note compact">Allowed days are available for the full day.</p>
                    )}
                  </>
                ) : (
                  <p className="field-note compact">This key can be used at any time.</p>
                )}
              </fieldset>
              <fieldset className="model-access">
                <div className="model-access-header">
                  <span className="field-label">Model access</span>
                  <div className="model-actions">
                    <button type="button" className="text-action" onClick={() => setForm({ ...form, models: modelNames })}>Select all</button>
                    <button type="button" className="text-action" onClick={() => setForm({ ...form, models: [] })}>Clear</button>
                  </div>
                </div>
                <p className="field-note">{form.models.length ? `${form.models.length} selected` : "No models selected means this key can use all models."}</p>
                <div className="model-checks">
                  {modelNames.map((name) => (
                    <label className="model-check" key={name}>
                      <input type="checkbox" checked={form.models.includes(name)} onChange={() => toggleKeyModel(name)} />
                      <span>{name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <fieldset className="model-access">
                <div className="model-access-header">
                  <span className="field-label">Prompt policies</span>
                  <div className="model-actions">
                    <button type="button" className="text-action" onClick={() => setForm({ ...form, policyIds: policies.map((policy) => policy.id) })}>Select all</button>
                    <button type="button" className="text-action" onClick={() => setForm({ ...form, policyIds: [] })}>Clear</button>
                  </div>
                </div>
                <p className="field-note">{form.policyIds.length ? `${form.policyIds.length} selected` : "No key-specific prompt policies are assigned."}</p>
                <div className="model-checks">
                  {policies.map((policy) => (
                    <label className="model-check" key={policy.id}>
                      <input type="checkbox" checked={form.policyIds.includes(policy.id)} onChange={() => toggleKeyPolicy(policy.id)} />
                      <span>{policy.name}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="modal-actions"><button type="button" className="secondary" onClick={closeKeyModal}>Cancel</button><button className="primary" disabled={creating || scheduleInvalid}>{creating ? (editingKey ? "Saving" : cloningKey ? "Cloning" : "Creating") : (editingKey ? "Save changes" : cloningKey ? "Clone key" : "Create key")}</button></div>
            </form>
          )}
        </Modal>
      ) : null}
      {loading ? <EmptyState text="Loading keys" /> : (
        <table>
          <thead><tr><th>Alias</th><th>Key</th><th>Owner</th><th>Team</th><th>Spend</th><th>Budget</th><th>Status</th><th></th></tr></thead>
          <tbody>{keys.map((rawRow, index) => {
            const row = normalizeKeyRow(rawRow);
            const key = keyIdentifier(rawRow);
            return (
            <tr key={`${key || row.key_name || index}`}>
              <td>{row.key_alias || "-"}</td>
              <td><code>{mask(row.key_name || row.token)}</code></td>
              <td>{row.user_id || "-"}</td>
              <td>{row.team_id || "-"}</td>
              <td>{currency(row.spend || 0)}</td>
              <td>{row.max_budget ? currency(row.max_budget) : "-"}</td>
              <td><StatusBadge blocked={Boolean(row.blocked)} /></td>
              <td>
                <div className="row-actions">
                  <button className="icon" onClick={() => openEditModal(rawRow)} title="Edit key" disabled={!key}><Pencil size={16} /></button>
                  <button className="icon" onClick={() => openCloneModal(rawRow)} title="Clone key" disabled={!key}><Copy size={16} /></button>
                  <button className="icon" onClick={() => toggleKeyActive(rawRow)} title={row.blocked ? "Activate key" : "Deactivate key"} aria-label={row.blocked ? "Activate key" : "Deactivate key"} disabled={!key || togglingKey === key}><Power size={16} /></button>
                  <button className="icon danger" onClick={() => deleteKey(rawRow)} title="Delete key" disabled={!key || deletingKey === key}><Trash2 size={16} /></button>
                </div>
              </td>
            </tr>
            );
          })}</tbody>
        </table>
      )}
    </section>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
        <div className="modal-header">
          <h2 id="modal-title">{title}</h2>
          <button className="icon" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

function TestPage() {
  const keysResource = useResource<{ keys?: ApiKeyListRow[]; data?: ApiKeyListRow[] }>("/api/keys?page=1&size=100");
  const modelsResource = useResource<{ data?: ModelInfo[] }>("/api/models");
  const keys = keysResource.data?.keys || keysResource.data?.data || [];
  const models = modelsResource.data?.data || [];
  const [selectedKey, setSelectedKey] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [maxTokens, setMaxTokens] = useState("512");
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<TestChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!model && models[0]?.model_name) setModel(models[0].model_name);
  }, [model, models]);

  useEffect(() => {
    if (!selectedKey && keys.length) {
      const id = keyIdentifier(keys[0]);
      setSelectedKey(id);
      setApiKey(id);
    }
  }, [keys, selectedKey]);

  function selectKey(value: string) {
    setSelectedKey(value);
    setApiKey(value);
  }

  async function sendPrompt(event: React.FormEvent) {
    event.preventDefault();
    const content = prompt.trim();
    if (!content || !apiKey || !model) return;
    const nextMessages: TestChatMessage[] = [...messages, { role: "user", content }];
    setMessages(nextMessages);
    setPrompt("");
    setSending(true);
    setError("");
    try {
      const result = await api<Record<string, unknown>>("/api/test/chat", {
        method: "POST",
        body: {
          api_key: apiKey,
          model,
          messages: nextMessages.map(({ role, content }) => ({ role, content })),
          max_tokens: Number(maxTokens) || 512
        }
      });
      setMessages([...nextMessages, { role: "assistant", content: chatResponseText(result) }]);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Request failed";
      setError(message);
      setMessages([...nextMessages, { role: "assistant", content: `Error: ${message}` }]);
    } finally {
      setSending(false);
    }
  }

  return (
    <section>
      <Header icon={<MessageSquare size={22} />} title="Test" tone="green" />
      <div className="test-shell">
        <div className="test-controls">
          <label>API key
            <select aria-label="API key" value={selectedKey} onChange={(event) => selectKey(event.target.value)} disabled={keysResource.loading}>
              <option value="">{keysResource.loading ? "Loading keys" : "Select key"}</option>
              {keys.map((rawKey, index) => {
                const row = normalizeKeyRow(rawKey);
                const id = keyIdentifier(rawKey);
                return id ? <option key={id || index} value={id}>{row.key_alias || row.key_name || id}</option> : null;
              })}
            </select>
          </label>
          <label>Bearer API key<input aria-label="Bearer API key" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste key if only a hash is listed" /></label>
          <label>Model
            <select aria-label="Model" value={model} onChange={(event) => setModel(event.target.value)} disabled={modelsResource.loading}>
              <option value="">{modelsResource.loading ? "Loading models" : "Select model"}</option>
              {models.map((item) => <option key={item.model_name} value={item.model_name}>{item.model_name}</option>)}
            </select>
          </label>
          <label>Max tokens<input type="number" min="1" max="8192" step="1" value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)} /></label>
        </div>
        <div className="chat-window" aria-label="Chat transcript">
          {messages.length ? messages.map((message, index) => (
            <div className={`chat-message ${message.role}`} key={index}>
              <span>{message.role}</span>
              <p>{message.content}</p>
            </div>
          )) : <EmptyState text="No test messages yet" />}
        </div>
        {error ? <div className="error">{error}</div> : null}
        <form className="chat-composer" onSubmit={sendPrompt}>
          <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Send a test prompt" />
          <button className="primary" disabled={sending || !prompt.trim() || !apiKey || !model}><Send size={16} /> {sending ? "Sending" : "Send"}</button>
        </form>
      </div>
    </section>
  );
}

function PoliciesPage() {
  const { data, loading, reload } = useResource<{ policies: PromptPolicy[] }>("/api/prompt-policies");
  const keysResource = useResource<{ keys?: ApiKeyListRow[]; data?: ApiKeyListRow[] }>("/api/keys?page=1&size=100");
  const teamsResource = useResource<TeamRow[] | { teams?: TeamRow[]; data?: TeamRow[] }>("/api/teams");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<PromptPolicy | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<PolicyFormState>(defaultPolicyForm);
  const policies = data?.policies || [];
  const keys = keysResource.data?.keys || keysResource.data?.data || [];
  const teams = Array.isArray(teamsResource.data) ? teamsResource.data : teamsResource.data?.teams || teamsResource.data?.data || [];

  function openCreatePolicy() {
    setEditingPolicy(null);
    setForm(defaultPolicyForm);
    setModalOpen(true);
  }

  function openEditPolicy(policy: PromptPolicy) {
    setEditingPolicy(policy);
    setForm(policyFormFromPolicy(policy));
    setModalOpen(true);
  }

  function closePolicyModal() {
    setModalOpen(false);
    setEditingPolicy(null);
    setForm(defaultPolicyForm);
  }

  function updateRule(index: number, patch: Partial<PromptPolicyRule>) {
    setForm({ ...form, rules: form.rules.map((rule, ruleIndex) => ruleIndex === index ? { ...rule, ...patch } : rule) });
  }

  function addRule() {
    setForm({ ...form, rules: [...form.rules, { ...defaultPolicyRule }] });
  }

  function removeRule(index: number) {
    setForm({ ...form, rules: form.rules.filter((_rule, ruleIndex) => ruleIndex !== index) });
  }

  function togglePolicyAssignment(kind: "keyAssignments" | "teamAssignments", id: string) {
    const values = form[kind];
    setForm({ ...form, [kind]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id] });
  }

  async function savePolicy(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const policy = editingPolicy
        ? await api<PromptPolicy>(`/api/prompt-policies/${encodeURIComponent(editingPolicy.id)}`, { method: "PATCH", body: policyPayload(form) })
        : await api<PromptPolicy>("/api/prompt-policies", { method: "POST", body: policyPayload(form) });
      await api(`/api/prompt-policies/${encodeURIComponent(policy.id)}/assignments`, {
        method: "PUT",
        body: {
          assignments: [
            ...form.teamAssignments.map((target_id) => ({ target_type: "team", target_id })),
            ...form.keyAssignments.map((target_id) => ({ target_type: "key", target_id }))
          ]
        }
      });
      closePolicyModal();
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function deletePolicy(policy: PromptPolicy) {
    await api(`/api/prompt-policies/${encodeURIComponent(policy.id)}`, { method: "DELETE" });
    reload();
  }

  return (
    <section>
      <Header
        icon={<Regex size={22} />}
        title="Policies"
        tone="blue"
        action={<div className="header-actions"><button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button><button className="primary" onClick={openCreatePolicy}><Plus size={16} /> Create policy</button></div>}
      />
      {modalOpen ? (
        <Modal title={editingPolicy ? "Edit policy" : "Create policy"} onClose={closePolicyModal}>
          <form className="modal-form" onSubmit={savePolicy}>
            <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label>Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="toggle-row"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> <span>Enabled</span></label>
            <fieldset className="config-section">
              <div className="model-access-header">
                <span className="field-label">Rules</span>
                <button type="button" className="text-action" onClick={addRule}>Add rule</button>
              </div>
              <div className="rule-stack">
                {form.rules.map((rule, index) => (
                  <div className="rule-editor" key={index}>
                    <div className="rule-editor-head">
                      <label className="toggle-row"><input type="checkbox" checked={rule.enabled} onChange={(event) => updateRule(index, { enabled: event.target.checked })} /> <span>Rule enabled</span></label>
                      <button type="button" className="icon danger" onClick={() => removeRule(index)} title="Remove rule"><Trash2 size={16} /></button>
                    </div>
                    <div className="config-grid">
                      <label>Rule name<input value={rule.name} onChange={(event) => updateRule(index, { name: event.target.value })} required /></label>
                      <label>Action
                        <select value={rule.action} onChange={(event) => updateRule(index, { action: event.target.value as PromptPolicyRule["action"] })}>
                          <option value="redact">Redact</option>
                          <option value="block">Block</option>
                          <option value="append">Append</option>
                        </select>
                      </label>
                    </div>
                    <label>Regex pattern<input value={rule.pattern} onChange={(event) => updateRule(index, { pattern: event.target.value })} required /></label>
                    <div className="weekday-checks">
                      <label className="weekday-check"><input type="checkbox" checked={rule.flags.includes("ignore_case")} onChange={() => updateRule(index, { flags: toggleValue(rule.flags, "ignore_case") })} /><span>Ignore case</span></label>
                      <label className="weekday-check"><input type="checkbox" checked={rule.flags.includes("multiline")} onChange={() => updateRule(index, { flags: toggleValue(rule.flags, "multiline") })} /><span>Multiline</span></label>
                      <label className="weekday-check"><input type="checkbox" checked={rule.flags.includes("dotall")} onChange={() => updateRule(index, { flags: toggleValue(rule.flags, "dotall") })} /><span>Dotall</span></label>
                    </div>
                    {rule.action === "redact" ? <label>Replacement<input value={rule.replacement || ""} onChange={(event) => updateRule(index, { replacement: event.target.value })} placeholder="[REDACTED]" /></label> : null}
                    {rule.action === "append" ? <label>Append text<textarea value={rule.append_text || ""} onChange={(event) => updateRule(index, { append_text: event.target.value })} required /></label> : null}
                  </div>
                ))}
              </div>
            </fieldset>
            <fieldset className="model-access">
              <span className="field-label">Assign to teams</span>
              <div className="model-checks">
                {teams.map((team) => (
                  <label className="model-check" key={team.team_id}>
                    <input type="checkbox" checked={form.teamAssignments.includes(team.team_id)} onChange={() => togglePolicyAssignment("teamAssignments", team.team_id)} />
                    <span>{team.team_alias || team.team_id}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            <fieldset className="model-access">
              <span className="field-label">Assign to keys</span>
              <div className="model-checks">
                {keys.map((rawKey, index) => {
                  const row = normalizeKeyRow(rawKey);
                  const id = keyIdentifier(rawKey);
                  return id ? (
                    <label className="model-check" key={id || index}>
                      <input type="checkbox" checked={form.keyAssignments.includes(id)} onChange={() => togglePolicyAssignment("keyAssignments", id)} />
                      <span>{row.key_alias || row.key_name || id}</span>
                    </label>
                  ) : null;
                })}
              </div>
            </fieldset>
            <div className="modal-actions"><button type="button" className="secondary" onClick={closePolicyModal}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving" : editingPolicy ? "Save changes" : "Create policy"}</button></div>
          </form>
        </Modal>
      ) : null}
      {loading ? <EmptyState text="Loading policies" /> : (
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Rules</th><th>Keys</th><th>Teams</th><th>Description</th><th></th></tr></thead>
          <tbody>{policies.map((policy) => (
            <tr key={policy.id}>
              <td>{policy.name}</td>
              <td><StatusBadge blocked={!policy.enabled} /></td>
              <td>{policy.rules.length}</td>
              <td>{policy.assignments.filter((assignment) => assignment.target_type === "key").length}</td>
              <td>{policy.assignments.filter((assignment) => assignment.target_type === "team").length}</td>
              <td>{policy.description || "-"}</td>
              <td>
                <div className="row-actions">
                  <button className="icon" onClick={() => openEditPolicy(policy)} title="Edit policy"><Pencil size={16} /></button>
                  <button className="icon danger" onClick={() => deletePolicy(policy)} title="Delete policy"><Trash2 size={16} /></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}

function ModelsPage() {
  const { data, loading, reload } = useResource<{ data?: ModelInfo[] }>("/api/models");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingModel, setEditingModel] = useState<ModelInfo | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState("");
  const [syncError, setSyncError] = useState(false);
  const [form, setForm] = useState<ModelFormState>(defaultModelForm);
  const models = data?.data || [];

  function openCreateModel() {
    setEditingModel(null);
    setForm(defaultModelForm);
    setModalOpen(true);
  }

  function openEditModel(model: ModelInfo) {
    setEditingModel(model);
    setForm(modelFormFromInfo(model));
    setModalOpen(true);
  }

  function closeModelModal() {
    setModalOpen(false);
    setEditingModel(null);
    setForm(defaultModelForm);
  }

  function updatePricingRange(index: number, patch: Partial<PricingRangeForm>) {
    setForm((current) => ({
      ...current,
      pricing_ranges: current.pricing_ranges.map((range, rangeIndex) => rangeIndex === index ? { ...range, ...patch } : range)
    }));
  }

  function addPricingRange() {
    setForm((current) => {
      const previous = current.pricing_ranges.at(-1);
      const nextStart = previous?.end && Number.isFinite(Number(previous.end)) ? String(Number(previous.end) + 1) : "";
      return {
        ...current,
        pricing_ranges: [...current.pricing_ranges, { start: nextStart, end: "1000000", input_cost_per_million: "", output_cost_per_million: "" }]
      };
    });
  }

  function removePricingRange(index: number) {
    setForm((current) => ({
      ...current,
      pricing_ranges: current.pricing_ranges.filter((_range, rangeIndex) => rangeIndex !== index)
    }));
  }

  async function saveModel(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    const payload = modelPayload(form, editingModel);
    try {
      if (editingModel?.model_info?.id) {
        await api(`/api/models/${encodeURIComponent(editingModel.model_info.id)}`, { method: "PATCH", body: payload });
      } else {
        await api("/api/models", { method: "POST", body: payload });
      }
      closeModelModal();
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function deleteModel(model: ModelInfo) {
    const modelId = model.model_info?.id;
    if (!modelId) return;
    await api(`/api/models/${encodeURIComponent(modelId)}`, { method: "DELETE" });
    reload();
  }

  async function syncCatalog() {
    setSyncing(true);
    setSyncMessage("");
    setSyncError(false);
    try {
      const result = await api<{ models: number; created: number }>("/api/models/sync", { method: "POST" });
      setSyncMessage(`Synced ${result.created || result.models} Huawei MaaS models from the catalog.`);
      reload();
    } catch (error) {
      setSyncMessage(error instanceof Error ? error.message : "Catalog sync failed");
      setSyncError(true);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <section>
      <Header
        icon={<Layers3 size={22} />}
        title="Models"
        tone="rose"
        action={<div className="header-actions"><button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button><button className="secondary" onClick={syncCatalog} disabled={syncing}><RefreshCcw size={16} /> {syncing ? "Syncing" : "Sync catalog"}</button><button className="primary" onClick={openCreateModel}><Plus size={16} /> Add model</button></div>}
      />
      {syncMessage ? <div className={syncError ? "error" : "notice"}>{syncMessage}</div> : null}
      {modalOpen ? (
        <Modal title={editingModel ? "Edit model" : "Add model"} onClose={closeModelModal}>
          <form className="modal-form" onSubmit={saveModel}>
            <label>Model name<input value={form.model_name} onChange={(e) => setForm({ ...form, model_name: e.target.value })} required /></label>
            <label>Upstream model<input value={form.upstream_model} onChange={(e) => setForm({ ...form, upstream_model: e.target.value })} required /></label>
            <label>Provider<input value={form.custom_llm_provider} onChange={(e) => setForm({ ...form, custom_llm_provider: e.target.value })} required /></label>
            <label>API base<input value={form.api_base} onChange={(e) => setForm({ ...form, api_base: e.target.value })} required /></label>
            <label>API key reference<input value={form.api_key} onChange={(e) => setForm({ ...form, api_key: e.target.value })} required /></label>
            <label>Display name<input value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} /></label>
            <fieldset className="config-section">
              <span className="field-label">Limits and pricing</span>
              <div className="config-grid">
                <label>Max input tokens<input type="number" min="1" step="1" value={form.max_input_tokens} onChange={(e) => setForm({ ...form, max_input_tokens: e.target.value })} /></label>
                <label>Max output tokens<input type="number" min="1" step="1" value={form.max_output_tokens} onChange={(e) => setForm({ ...form, max_output_tokens: e.target.value })} /></label>
                <label>Input USD / 1M<input type="number" min="0" step="0.000001" value={form.input_cost_per_million} onChange={(e) => setForm({ ...form, input_cost_per_million: e.target.value })} /></label>
                <label>Output USD / 1M<input type="number" min="0" step="0.000001" value={form.output_cost_per_million} onChange={(e) => setForm({ ...form, output_cost_per_million: e.target.value })} /></label>
              </div>
              <label className="toggle-row">
                <input
                  type="checkbox"
                  checked={form.tiered_pricing}
                  onChange={(event) => setForm({
                    ...form,
                    tiered_pricing: event.target.checked,
                    pricing_ranges: event.target.checked && !form.tiered_pricing
                      ? defaultPricingRanges(form.input_cost_per_million, form.output_cost_per_million)
                      : form.pricing_ranges.length ? form.pricing_ranges : defaultPricingRanges()
                  })}
                />
                Use pricing ranges
              </label>
              {form.tiered_pricing ? (
                <div className="pricing-ranges">
                  {form.pricing_ranges.map((range, index) => (
                    <div className="pricing-range" key={index}>
                      <label>From tokens<input aria-label={`Range ${index + 1} from tokens`} type="number" min="0" step="1" value={range.start} onChange={(e) => updatePricingRange(index, { start: e.target.value })} required /></label>
                      <label>To tokens<input aria-label={`Range ${index + 1} to tokens`} type="number" min="1" step="1" value={range.end} onChange={(e) => updatePricingRange(index, { end: e.target.value })} required /></label>
                      <label>Input USD / 1M<input aria-label={`Range ${index + 1} input USD per 1M`} type="number" min="0" step="0.000001" value={range.input_cost_per_million} onChange={(e) => updatePricingRange(index, { input_cost_per_million: e.target.value })} required /></label>
                      <label>Output USD / 1M<input aria-label={`Range ${index + 1} output USD per 1M`} type="number" min="0" step="0.000001" value={range.output_cost_per_million} onChange={(e) => updatePricingRange(index, { output_cost_per_million: e.target.value })} required /></label>
                      <button type="button" className="icon danger" title="Remove pricing range" onClick={() => removePricingRange(index)} disabled={form.pricing_ranges.length === 1}><Trash2 size={16} /></button>
                    </div>
                  ))}
                  <button type="button" className="secondary pricing-add" onClick={addPricingRange}><Plus size={16} /> Add range</button>
                </div>
              ) : null}
            </fieldset>
            <div className="modal-actions"><button type="button" className="secondary" onClick={closeModelModal}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving" : editingModel ? "Save changes" : "Add model"}</button></div>
          </form>
        </Modal>
      ) : null}
      {loading ? <EmptyState text="Loading models" /> : (
        <table>
          <thead><tr><th>Name</th><th>Upstream</th><th>Provider</th><th>Context</th><th>Output</th><th>Input / 1M</th><th>Output / 1M</th><th></th></tr></thead>
          <tbody>{models.map((model) => (
            <tr key={model.model_info?.id || model.model_name}>
              <td>{model.model_name}</td>
              <td>{model.litellm_params?.model || "-"}</td>
              <td>{model.litellm_params?.custom_llm_provider || "-"}</td>
              <td>{model.model_info?.max_input_tokens || "-"}</td>
              <td>{model.model_info?.max_output_tokens || "-"}</td>
              <td>{perMillion(model.model_info?.input_cost_per_token)}</td>
              <td>{perMillion(model.model_info?.output_cost_per_token)}</td>
              <td>
                <div className="row-actions">
                  <button className="icon" onClick={() => openEditModel(model)} title="Edit model"><Pencil size={16} /></button>
                  <button className="icon danger" onClick={() => deleteModel(model)} title="Delete model" disabled={!model.model_info?.id}><Trash2 size={16} /></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}

function TeamsPage() {
  const { data, loading, reload } = useResource<TeamRow[] | { teams?: TeamRow[]; data?: TeamRow[] }>("/api/teams");
  const models = useResource<{ data?: ModelInfo[] }>("/api/models");
  const policiesResource = useResource<{ policies: PromptPolicy[] }>("/api/prompt-policies");
  const teams = Array.isArray(data) ? data : data?.teams || data?.data || [];
  const modelNames = (models.data?.data || []).map((model) => model.model_name);
  const policies = policiesResource.data?.policies || [];
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTeam, setEditingTeam] = useState<TeamRow | null>(null);
  const [saving, setSaving] = useState(false);
  const [togglingTeam, setTogglingTeam] = useState("");
  const [form, setForm] = useState<TeamFormState>(defaultTeamForm);
  const scheduleInvalid = form.accessSchedule && form.accessDays.length === 0;

  async function submitTeam(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = teamPayload(form, Boolean(editingTeam));
      if (editingTeam) {
        await api(`/api/teams/${encodeURIComponent(editingTeam.team_id)}`, { method: "PATCH", body: payload });
      } else {
        await api("/api/teams", { method: "POST", body: payload });
      }
      closeTeamModal();
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function deleteTeam(teamId: string) {
    await api(`/api/teams/${encodeURIComponent(teamId)}`, { method: "DELETE" });
    reload();
  }

  async function toggleTeamActive(team: TeamRow) {
    setTogglingTeam(team.team_id);
    try {
      await api(`/api/teams/${encodeURIComponent(team.team_id)}`, { method: "PATCH", body: { blocked: !Boolean(team.blocked) } });
      reload();
    } finally {
      setTogglingTeam("");
    }
  }

  function openCreateTeam() {
    setEditingTeam(null);
    setForm(defaultTeamForm);
    setModalOpen(true);
  }

  function openEditTeam(team: TeamRow) {
    setEditingTeam(team);
    setForm(teamFormFromRow(team, policies));
    setModalOpen(true);
  }

  function closeTeamModal() {
    setModalOpen(false);
    setEditingTeam(null);
    setForm(defaultTeamForm);
  }

  function toggleTeamModel(modelName: string) {
    setForm({ ...form, models: toggleValue(form.models, modelName) });
  }

  function toggleTeamPolicy(policyId: string) {
    setForm({ ...form, policyIds: toggleValue(form.policyIds, policyId) });
  }

  function toggleTeamAccessDay(day: number) {
    const nextDays = form.accessDays.includes(day)
      ? form.accessDays.filter((value) => value !== day)
      : [...form.accessDays, day].sort((left, right) => left - right);
    setForm({ ...form, accessDays: nextDays });
  }

  return (
    <section>
      <Header icon={<Users size={22} />} title="Teams" tone="violet" action={<div className="header-actions"><button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button><button className="primary" onClick={openCreateTeam}><Plus size={16} /> Create team</button></div>} />
      {modalOpen ? (
        <Modal title={editingTeam ? "Edit team" : "Create team"} onClose={closeTeamModal}>
          <form className="modal-form" onSubmit={submitTeam}>
            <label>Alias<input placeholder="Platform team" value={form.team_alias} onChange={(e) => setForm({ ...form, team_alias: e.target.value })} /></label>
            {editingTeam ? <label className="toggle-row"><input type="checkbox" checked={form.blocked} onChange={(e) => setForm({ ...form, blocked: e.target.checked })} /> <span>Block team</span></label> : null}
            <label>Budget USD<input placeholder="Optional" value={form.max_budget} onChange={(e) => setForm({ ...form, max_budget: e.target.value })} /></label>
            <div className="expiration-field">
              <label className="toggle-row"><input type="checkbox" checked={form.resetBudget} onChange={(e) => setForm({ ...form, resetBudget: e.target.checked })} /> <span>Reset budget</span></label>
              {form.resetBudget ? (
                <div className="duration-controls">
                  <label>Reset every<input type="number" min="1" step="1" value={form.budgetResetAmount} onChange={(e) => setForm({ ...form, budgetResetAmount: Math.max(1, Number(e.target.value) || 1) })} /></label>
                  <label>Budget reset unit
                    <select value={form.budgetResetUnit} onChange={(e) => setForm({ ...form, budgetResetUnit: e.target.value as DurationUnit })}>
                      <option value="m">Minutes</option>
                      <option value="h">Hours</option>
                      <option value="d">Days</option>
                    </select>
                  </label>
                </div>
              ) : <p className="field-note compact">Budget does not reset.</p>}
            </div>
            <fieldset className="config-section">
              <span className="field-label">Rate limits</span>
              <div className="config-grid">
                <label>Max TPS<input type="number" min="0.01" step="0.01" placeholder="Optional" value={form.max_tps} onChange={(e) => setForm({ ...form, max_tps: e.target.value })} /></label>
                <label>Max TPM<input type="number" min="1" step="1" placeholder="Optional" value={form.max_tpm} onChange={(e) => setForm({ ...form, max_tpm: e.target.value })} /></label>
                <label>Max parallel<input type="number" min="1" step="1" placeholder="Optional" value={form.max_parallel_requests} onChange={(e) => setForm({ ...form, max_parallel_requests: e.target.value })} /></label>
              </div>
            </fieldset>
            <fieldset className="config-section">
              <span className="field-label">Token quota</span>
              <label className="toggle-row"><input type="checkbox" checked={form.tokenBudget} onChange={(e) => setForm({ ...form, tokenBudget: e.target.checked })} /> <span>Set token quota</span></label>
              {form.tokenBudget ? (
                <>
                  <div className="config-grid">
                    <label>Total token quota<input type="number" min="1" step="1" placeholder="Total tokens" value={form.tokenBudgetTokens} onChange={(e) => setForm({ ...form, tokenBudgetTokens: e.target.value })} required={form.tokenBudget} /></label>
                    <label className="toggle-row"><input type="checkbox" checked={form.tokenBudgetReset} onChange={(e) => setForm({ ...form, tokenBudgetReset: e.target.checked })} /> <span>Reset token quota</span></label>
                  </div>
                  {form.tokenBudgetReset ? (
                    <div className="duration-controls">
                      <label>Token reset every<input type="number" min="1" step="1" value={form.tokenBudgetResetAmount} onChange={(e) => setForm({ ...form, tokenBudgetResetAmount: Math.max(1, Number(e.target.value) || 1) })} /></label>
                      <label>Token reset unit
                        <select value={form.tokenBudgetResetUnit} onChange={(e) => setForm({ ...form, tokenBudgetResetUnit: e.target.value as DurationUnit })}>
                          <option value="m">Minutes</option>
                          <option value="h">Hours</option>
                          <option value="d">Days</option>
                        </select>
                      </label>
                    </div>
                  ) : <p className="field-note compact">Token quota does not reset.</p>}
                </>
              ) : <p className="field-note compact">No total token quota is enforced.</p>}
            </fieldset>
            <fieldset className="config-section">
              <span className="field-label section-title"><CalendarClock size={16} /> Access schedule</span>
              <label className="toggle-row"><input type="checkbox" checked={form.accessSchedule} onChange={(e) => setForm({ ...form, accessSchedule: e.target.checked })} /> <span>Restrict access by schedule</span></label>
              {form.accessSchedule ? (
                <>
                  <div className="config-grid schedule-grid">
                    <label>Access timezone
                      <select value={form.accessTimezone} onChange={(e) => setForm({ ...form, accessTimezone: e.target.value })}>
                        {timezones.map((timezone) => <option key={timezone} value={timezone}>{timezone}</option>)}
                      </select>
                    </label>
                    <label className="toggle-row"><input type="checkbox" checked={form.accessHours} onChange={(e) => setForm({ ...form, accessHours: e.target.checked })} /> <span>Limit daily hours</span></label>
                  </div>
                  <div>
                    <span className="field-label">Allowed days</span>
                    <div className="weekday-checks">
                      {weekDays.map((day) => (
                        <label className="weekday-check" key={day.value}>
                          <input type="checkbox" checked={form.accessDays.includes(day.value)} onChange={() => toggleTeamAccessDay(day.value)} />
                          <span>{day.label}</span>
                        </label>
                      ))}
                    </div>
                    {scheduleInvalid ? <p className="field-note danger-note">Select at least one allowed day.</p> : null}
                  </div>
                  {form.accessHours ? <div className="duration-controls"><label>Start time<input type="time" value={form.accessStart} onChange={(e) => setForm({ ...form, accessStart: e.target.value })} required /></label><label>End time<input type="time" value={form.accessEnd} onChange={(e) => setForm({ ...form, accessEnd: e.target.value })} required /></label></div> : <p className="field-note compact">Allowed days are available for the full day.</p>}
                </>
              ) : <p className="field-note compact">This team can be used at any time.</p>}
            </fieldset>
            <fieldset className="model-access">
              <div className="model-access-header">
                <span className="field-label">Model access</span>
                <div className="model-actions"><button type="button" className="text-action" onClick={() => setForm({ ...form, models: modelNames })}>Select all</button><button type="button" className="text-action" onClick={() => setForm({ ...form, models: [] })}>Clear</button></div>
              </div>
              <p className="field-note">{form.models.length ? `${form.models.length} selected` : "No models selected means this team can use all models."}</p>
              <div className="model-checks">
                {modelNames.map((name) => <label className="model-check" key={name}><input type="checkbox" checked={form.models.includes(name)} onChange={() => toggleTeamModel(name)} /><span>{name}</span></label>)}
              </div>
            </fieldset>
            <fieldset className="model-access">
              <div className="model-access-header">
                <span className="field-label">Prompt policies</span>
                <div className="model-actions"><button type="button" className="text-action" onClick={() => setForm({ ...form, policyIds: policies.map((policy) => policy.id) })}>Select all</button><button type="button" className="text-action" onClick={() => setForm({ ...form, policyIds: [] })}>Clear</button></div>
              </div>
              <p className="field-note">{form.policyIds.length ? `${form.policyIds.length} selected` : "No team prompt policies are assigned."}</p>
              <div className="model-checks">
                {policies.map((policy) => <label className="model-check" key={policy.id}><input type="checkbox" checked={form.policyIds.includes(policy.id)} onChange={() => toggleTeamPolicy(policy.id)} /><span>{policy.name}</span></label>)}
              </div>
            </fieldset>
            <div className="modal-actions"><button type="button" className="secondary" onClick={closeTeamModal}>Cancel</button><button className="primary" disabled={saving || scheduleInvalid}>{saving ? "Saving" : editingTeam ? "Save changes" : "Create team"}</button></div>
          </form>
        </Modal>
      ) : null}
      {loading ? <EmptyState text="Loading teams" /> : (
        <table>
          <thead><tr><th>Alias</th><th>ID</th><th>Models</th><th>Spend</th><th>Budget</th><th>RPM</th><th>TPM</th><th>Status</th><th></th></tr></thead>
          <tbody>{teams.map((team) => (
            <tr key={team.team_id}>
              <td>{team.team_alias || "-"}</td>
              <td><code>{team.team_id}</code></td>
              <td>{team.models?.length ? team.models.join(", ") : "All"}</td>
              <td>{currency(team.spend || 0)}</td>
              <td>{team.max_budget ? currency(team.max_budget) : "-"}</td>
              <td>{team.rpm_limit || "-"}</td>
              <td>{team.tpm_limit || "-"}</td>
              <td><StatusBadge blocked={Boolean(team.blocked)} /></td>
              <td>
                <div className="row-actions">
                  <button className="icon" onClick={() => openEditTeam(team)} title="Edit team"><Pencil size={16} /></button>
                  <button className="icon" onClick={() => toggleTeamActive(team)} title={team.blocked ? "Activate team" : "Deactivate team"} aria-label={team.blocked ? "Activate team" : "Deactivate team"} disabled={togglingTeam === team.team_id}><Power size={16} /></button>
                  <button className="icon danger" onClick={() => deleteTeam(team.team_id)} title="Delete team"><Trash2 size={16} /></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}

function Header({ icon, title, tone = "green", action }: { icon: React.ReactNode; title: string; tone?: Tone; action?: React.ReactNode }) {
  return <div className="header"><div className={`page-title ${tone}`}><span className="page-icon">{icon}</span><h1>{title}</h1></div>{action}</div>;
}

function StatsActions({ exportHref, onRefresh }: { exportHref: string; onRefresh: () => void }) {
  return (
    <>
      <a className="secondary" href={exportHref} download><Download size={16} /> Download CSV</a>
      <button className="secondary" onClick={onRefresh}><RefreshCcw size={16} /> Refresh</button>
    </>
  );
}

function Metric({ icon, tone, label, value }: { icon: React.ReactNode; tone: Tone; label: string; value: string }) {
  return <div className={`metric ${tone}`}><div className="metric-top"><span className="metric-icon">{icon}</span><span>{label}</span></div><strong>{value}</strong></div>;
}

function Breakdown({ icon, tone, title, rows, onRowClick }: { icon: React.ReactNode; tone: Tone; title: string; rows: StatsBreakdownRow[]; onRowClick?: (row: StatsBreakdownRow) => void }) {
  return (
    <div className={`panel ${tone}`}>
      <PanelTitle icon={icon} title={title} />
      {rows.length ? rows.slice(0, 8).map((row) => {
        const content = <><span>{row.name}</span><strong>{currency(row.spend)}</strong></>;
        return onRowClick ? (
          <button className="bar-row clickable" key={row.id || row.name} onClick={() => onRowClick(row)}>{content}</button>
        ) : (
          <div className="bar-row" key={row.id || row.name}>{content}</div>
        );
      }) : <p className="muted">No data</p>}
    </div>
  );
}

const chartColors = ["#14745f", "#2563eb", "#d97706", "#7c3aed", "#e0526f", "#52605b"];

function StatsCharts({ spendTitle, spendRows, modelRows, keyRows }: { spendTitle: string; spendRows: StatsBreakdownRow[]; modelRows: StatsBreakdownRow[]; keyRows: StatsBreakdownRow[] }) {
  return (
    <div className="chart-grid">
      <DonutChart title={spendTitle} rows={spendRows.slice(0, 6).map((row, index) => ({ ...row, color: chartColors[index % chartColors.length] }))} />
      <DonutChart title="Spend by model %" rows={modelRows.slice(0, 6).map((row, index) => ({ ...row, color: chartColors[index % chartColors.length] }))} showPercent />
      <SpendBarChart title="Spend by key" rows={keyRows.slice(0, 6)} color="#d97706" />
      <BarChart title="Requests by model" rows={modelRows.slice(0, 6)} color="#2563eb" />
    </div>
  );
}

function DonutChart({ title, rows, showPercent = false }: { title: string; rows: Array<StatsBreakdownRow & { color: string }>; showPercent?: boolean }) {
  const total = rows.reduce((sum, row) => sum + row.spend, 0);
  let offset = 0;
  return (
    <div className="panel chart-panel">
      <PanelTitle icon={<DollarSign size={16} />} title={title} />
      <div className="donut-layout">
        <svg className="donut-chart" viewBox="0 0 120 120" role="img" aria-label={title}>
          <circle cx="60" cy="60" r="42" fill="none" stroke="#edf2f0" strokeWidth="18" />
          {total > 0 ? rows.map((row) => {
            const fraction = row.spend / total;
            const dash = fraction * 263.89;
            const segment = <circle key={row.name} cx="60" cy="60" r="42" fill="none" stroke={row.color} strokeWidth="18" strokeDasharray={`${dash} ${263.89 - dash}`} strokeDashoffset={-offset} pathLength="263.89" />;
            offset += dash;
            return segment;
          }) : null}
          <text x="60" y="56" textAnchor="middle" className="chart-value">{currency(total)}</text>
          <text x="60" y="72" textAnchor="middle" className="chart-label">total</text>
        </svg>
        <div className="chart-legend">
          {rows.map((row) => {
            const percent = total > 0 ? `${((row.spend / total) * 100).toFixed(1)}%` : "0.0%";
            return <div className="legend-row" key={row.name}><span className="legend-dot" style={{ background: row.color }} /> <span>{row.name}</span><strong>{showPercent ? percent : currency(row.spend)}</strong></div>;
          })}
        </div>
      </div>
    </div>
  );
}

function SpendBarChart({ title, rows, color }: { title: string; rows: StatsBreakdownRow[]; color: string }) {
  const maxSpend = Math.max(0.000001, ...rows.map((row) => row.spend));
  return (
    <div className="panel chart-panel">
      <PanelTitle icon={<DollarSign size={16} />} title={title} />
      <div className="bar-chart" role="img" aria-label={title}>
        {rows.length ? rows.map((row) => (
          <div className="chart-bar-row" key={row.id || row.name}>
            <span title={row.name}>{row.name}</span>
            <div className="chart-bar-track"><div className="chart-bar-fill" style={{ width: `${Math.max(4, (row.spend / maxSpend) * 100)}%`, background: color }} /></div>
            <strong>{currency(row.spend)}</strong>
          </div>
        )) : <p className="muted">No spend</p>}
      </div>
    </div>
  );
}

function BarChart({ title, rows, color }: { title: string; rows: StatsBreakdownRow[]; color: string }) {
  const maxRequests = Math.max(1, ...rows.map((row) => row.requests));
  return (
    <div className="panel chart-panel">
      <PanelTitle icon={<Activity size={16} />} title={title} />
      <div className="bar-chart" role="img" aria-label={title}>
        {rows.length ? rows.map((row) => (
          <div className="chart-bar-row" key={row.id || row.name}>
            <span title={row.name}>{row.name}</span>
            <div className="chart-bar-track"><div className="chart-bar-fill" style={{ width: `${Math.max(4, (row.requests / maxRequests) * 100)}%`, background: color }} /></div>
            <strong>{row.requests}</strong>
          </div>
        )) : <p className="muted">No requests</p>}
      </div>
    </div>
  );
}

function DataTable({ icon, title, rows, columns }: { icon: React.ReactNode; title: string; rows: Array<Record<string, unknown>>; columns: string[] }) {
  return <div className="panel wide"><PanelTitle icon={icon} title={title} /><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}</tr>)}</tbody></table></div>;
}

function PaginatedDataTable({ icon, title, rows, columns, pageSize = 10 }: { icon: React.ReactNode; title: string; rows: Array<Record<string, unknown>>; columns: string[]; pageSize?: number }) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const start = currentPage * pageSize;
  const visibleRows = rows.slice(start, start + pageSize);

  useEffect(() => {
    setPage(0);
  }, [rows]);

  return (
    <div className="panel wide">
      <div className="table-panel-head">
        <PanelTitle icon={icon} title={title} />
        <span className="muted">{rows.length ? `${start + 1}-${Math.min(start + pageSize, rows.length)} of ${rows.length}` : "0 logs"}</span>
      </div>
      <table>
        <thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead>
        <tbody>{visibleRows.map((row, index) => <tr key={start + index}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}</tr>)}</tbody>
      </table>
      <div className="pagination">
        <button className="secondary" onClick={() => setPage(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>Previous</button>
        <span className="muted">Page {currentPage + 1} of {pageCount}</span>
        <button className="secondary" onClick={() => setPage(Math.min(pageCount - 1, currentPage + 1))} disabled={currentPage >= pageCount - 1}>Next</button>
      </div>
    </div>
  );
}

function PanelTitle({ icon, title }: { icon: React.ReactNode; title: string }) {
  return <h2 className="panel-title"><span>{icon}</span>{title}</h2>;
}

function StatusBadge({ blocked }: { blocked: boolean }) {
  return blocked ? <span className="status blocked"><ShieldCheck size={13} />Blocked</span> : <span className="status active"><Sparkles size={13} />Active</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty">{text}</div>;
}

function useRoute() {
  const [route, setRoute] = useState<RoutePath>(() => normalizeRoute(window.location.pathname));

  useEffect(() => {
    if (window.location.pathname !== route) {
      window.history.replaceState({}, "", route);
    }

    function onPopState() {
      setRoute(normalizeRoute(window.location.pathname));
    }

    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, [route]);

  const navigate = useMemo(() => (path: RoutePath) => {
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
    setRoute(path);
  }, []);

  return { route, navigate };
}

function normalizeRoute(pathname: string): RoutePath {
  if (pathname.startsWith("/stats/keys/") && pathname.length > "/stats/keys/".length) return pathname as RoutePath;
  if (pathname.startsWith("/stats/teams/") && pathname.length > "/stats/teams/".length) return pathname as RoutePath;
  return routes.some((item) => item.path === pathname) ? pathname as RoutePath : "/stats";
}

function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const reload = useMemo(() => async () => {
    setLoading(true);
    try { setData(await api<T>(path)); } finally { setLoading(false); }
  }, [path]);
  useEffect(() => { void reload(); }, [reload]);
  return { data, loading, reload };
}

async function api<T>(path: string, options: { method?: string; body?: unknown } = {}): Promise<T> {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: options.body ? { "Content-Type": "application/json" } : undefined,
    body: options.body ? JSON.stringify(options.body) : undefined
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${response.status})`);
  }
  return response.json() as Promise<T>;
}

function clean<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined && item !== "")) as T;
}

function policyFormFromPolicy(policy: PromptPolicy): PolicyFormState {
  return {
    name: policy.name,
    description: policy.description || "",
    enabled: policy.enabled,
    rules: policy.rules.length ? policy.rules.map((rule) => ({ ...defaultPolicyRule, ...rule, flags: rule.flags || [] })) : [{ ...defaultPolicyRule }],
    keyAssignments: policy.assignments.filter((assignment) => assignment.target_type === "key").map((assignment) => assignment.target_id),
    teamAssignments: policy.assignments.filter((assignment) => assignment.target_type === "team").map((assignment) => assignment.target_id)
  };
}

function policyPayload(form: PolicyFormState): Record<string, unknown> {
  return {
    name: form.name,
    description: form.description,
    enabled: form.enabled,
    rules: form.rules.map((rule) => clean({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      pattern: rule.pattern,
      flags: rule.flags,
      action: rule.action,
      replacement: rule.action === "redact" ? rule.replacement || "[REDACTED]" : undefined,
      append_text: rule.action === "append" ? rule.append_text : undefined
    }))
  };
}

function toggleValue<T>(values: T[], value: T): T[] {
  return values.includes(value) ? values.filter((item) => item !== value) : [...values, value];
}

function chatResponseText(result: Record<string, unknown>): string {
  const choices = Array.isArray(result.choices) ? result.choices : [];
  const first = choices[0] as Record<string, unknown> | undefined;
  const message = first?.message && typeof first.message === "object" ? first.message as Record<string, unknown> : {};
  if (typeof message.content === "string") return message.content;
  if (typeof first?.text === "string") return first.text;
  return JSON.stringify(result, null, 2);
}

function sharedLimitMetadata(form: KeyFormState | TeamFormState): Record<string, unknown> {
  return clean({
    huawei_token_budget: form.tokenBudget ? clean({
      max_tokens: Number(form.tokenBudgetTokens),
      reset_duration: form.tokenBudgetReset ? `${form.tokenBudgetResetAmount}${form.tokenBudgetResetUnit}` : undefined,
      counts: "total_tokens"
    }) : undefined,
    huawei_time_access: form.accessSchedule ? clean({
      timezone: form.accessTimezone,
      rules: [
        clean({
          days: form.accessDays,
          start: form.accessHours ? form.accessStart : undefined,
          end: form.accessHours ? form.accessEnd : undefined
        })
      ]
    }) : undefined
  });
}

function keyPayload(form: KeyFormState, mode: "create" | "edit" | "clone"): Record<string, unknown> {
  const editing = mode === "edit";
  const cloning = mode === "clone";
  const metadata = sharedLimitMetadata(form);
  return clean({
    key_alias: form.key_alias || (editing ? null : undefined),
    team_id: form.team_id || (editing ? null : undefined),
    duration: mode === "create" && form.expires ? `${form.durationAmount}${form.durationUnit}` : undefined,
    max_budget: form.max_budget ? Number(form.max_budget) : (editing ? null : undefined),
    budget_duration: form.resetBudget ? `${form.budgetResetAmount}${form.budgetResetUnit}` : (editing ? null : undefined),
    rpm_limit: form.max_tps ? Math.ceil(Number(form.max_tps) * 60) : (editing ? null : undefined),
    tpm_limit: form.max_tpm ? Number(form.max_tpm) : (editing ? null : undefined),
    max_parallel_requests: form.max_parallel_requests ? Number(form.max_parallel_requests) : (editing ? null : undefined),
    metadata: Object.keys(metadata).length ? metadata : (editing ? {} : undefined),
    blocked: editing || cloning ? form.blocked : undefined,
    models: form.models,
    prompt_policy_ids: form.policyIds
  });
}

function teamPayload(form: TeamFormState, editing: boolean): Record<string, unknown> {
  const metadata = sharedLimitMetadata(form);
  return clean({
    team_alias: form.team_alias || (editing ? null : undefined),
    max_budget: form.max_budget ? Number(form.max_budget) : (editing ? null : undefined),
    budget_duration: form.resetBudget ? `${form.budgetResetAmount}${form.budgetResetUnit}` : (editing ? null : undefined),
    rpm_limit: form.max_tps ? Math.ceil(Number(form.max_tps) * 60) : (editing ? null : undefined),
    tpm_limit: form.max_tpm ? Number(form.max_tpm) : (editing ? null : undefined),
    max_parallel_requests: form.max_parallel_requests ? Number(form.max_parallel_requests) : (editing ? null : undefined),
    metadata: Object.keys(metadata).length ? metadata : (editing ? {} : undefined),
    blocked: editing ? form.blocked : undefined,
    models: form.models,
    prompt_policy_ids: form.policyIds
  });
}

function teamFormFromRow(row: TeamRow, policies: PromptPolicy[] = []): TeamFormState {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const tokenBudget = objectField(metadata, "huawei_token_budget");
  const timeAccess = objectField(metadata, "huawei_time_access");
  const firstRule = Array.isArray(timeAccess.rules) && timeAccess.rules[0] && typeof timeAccess.rules[0] === "object"
    ? timeAccess.rules[0] as Record<string, unknown>
    : {};
  const budgetDuration = parseDurationValue(row.budget_duration);
  const tokenReset = parseDurationValue(stringField(tokenBudget, "reset_duration"));
  const accessDays = Array.isArray(firstRule.days) ? firstRule.days.filter((day): day is number => typeof day === "number") : defaultTeamForm.accessDays;
  return {
    ...defaultTeamForm,
    team_alias: row.team_alias || "",
    max_budget: row.max_budget == null ? "" : String(row.max_budget),
    resetBudget: Boolean(row.budget_duration),
    budgetResetAmount: budgetDuration.amount,
    budgetResetUnit: budgetDuration.unit,
    max_tps: row.rpm_limit ? String(row.rpm_limit / 60) : "",
    max_tpm: row.tpm_limit == null ? "" : String(row.tpm_limit),
    max_parallel_requests: row.max_parallel_requests == null ? "" : String(row.max_parallel_requests),
    tokenBudget: tokenBudget.max_tokens != null,
    tokenBudgetTokens: tokenBudget.max_tokens == null ? "" : String(tokenBudget.max_tokens),
    tokenBudgetReset: Boolean(tokenBudget.reset_duration),
    tokenBudgetResetAmount: tokenReset.amount,
    tokenBudgetResetUnit: tokenReset.unit,
    accessSchedule: Object.keys(timeAccess).length > 0,
    accessTimezone: stringField(timeAccess, "timezone") || defaultTeamForm.accessTimezone,
    accessDays: accessDays.length ? accessDays : defaultTeamForm.accessDays,
    accessHours: typeof firstRule.start === "string" && typeof firstRule.end === "string",
    accessStart: typeof firstRule.start === "string" ? firstRule.start : defaultTeamForm.accessStart,
    accessEnd: typeof firstRule.end === "string" ? firstRule.end : defaultTeamForm.accessEnd,
    blocked: Boolean(row.blocked),
    models: row.models || [],
    policyIds: policies
      .filter((policy) => policy.assignments.some((assignment) => assignment.target_type === "team" && assignment.target_id === row.team_id))
      .map((policy) => policy.id)
  };
}

function keyFormFromRow(row: ApiKeyRow, policies: PromptPolicy[] = [], key = ""): KeyFormState {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const tokenBudget = objectField(metadata, "huawei_token_budget");
  const timeAccess = objectField(metadata, "huawei_time_access");
  const firstRule = Array.isArray(timeAccess.rules) && timeAccess.rules[0] && typeof timeAccess.rules[0] === "object"
    ? timeAccess.rules[0] as Record<string, unknown>
    : {};
  const budgetDuration = parseDurationValue(row.budget_duration);
  const tokenReset = parseDurationValue(stringField(tokenBudget, "reset_duration"));
  const accessDays = Array.isArray(firstRule.days) ? firstRule.days.filter((day): day is number => typeof day === "number") : defaultKeyForm.accessDays;
  const accessStart = typeof firstRule.start === "string" ? firstRule.start : defaultKeyForm.accessStart;
  const accessEnd = typeof firstRule.end === "string" ? firstRule.end : defaultKeyForm.accessEnd;
  return {
    ...defaultKeyForm,
    key_alias: row.key_alias || "",
    team_id: row.team_id || "",
    max_budget: row.max_budget == null ? "" : String(row.max_budget),
    resetBudget: Boolean(row.budget_duration),
    budgetResetAmount: budgetDuration.amount,
    budgetResetUnit: budgetDuration.unit,
    max_tps: row.rpm_limit ? String(row.rpm_limit / 60) : "",
    max_tpm: row.tpm_limit == null ? "" : String(row.tpm_limit),
    max_parallel_requests: row.max_parallel_requests == null ? "" : String(row.max_parallel_requests),
    tokenBudget: tokenBudget.max_tokens != null,
    tokenBudgetTokens: tokenBudget.max_tokens == null ? "" : String(tokenBudget.max_tokens),
    tokenBudgetReset: Boolean(tokenBudget.reset_duration),
    tokenBudgetResetAmount: tokenReset.amount,
    tokenBudgetResetUnit: tokenReset.unit,
    accessSchedule: Object.keys(timeAccess).length > 0,
    accessTimezone: stringField(timeAccess, "timezone") || defaultKeyForm.accessTimezone,
    accessDays: accessDays.length ? accessDays : defaultKeyForm.accessDays,
    accessHours: typeof firstRule.start === "string" && typeof firstRule.end === "string",
    accessStart,
    accessEnd,
    blocked: Boolean(row.blocked),
    models: row.models || [],
    policyIds: policies
      .filter((policy) => policy.assignments.some((assignment) => assignment.target_type === "key" && assignment.target_id === key))
      .map((policy) => policy.id)
  };
}

function parseDurationValue(value: unknown): { amount: number; unit: DurationUnit } {
  if (typeof value !== "string" || value.length < 2) return { amount: 30, unit: "d" };
  const unit = value.slice(-1);
  const amount = Number(value.slice(0, -1));
  if (!["m", "h", "d"].includes(unit) || !Number.isFinite(amount) || amount <= 0) return { amount: 30, unit: "d" };
  return { amount, unit: unit as DurationUnit };
}

function objectField(value: Record<string, unknown>, key: string): Record<string, unknown> {
  const field = value[key];
  return field && typeof field === "object" && !Array.isArray(field) ? field as Record<string, unknown> : {};
}

function stringField(value: Record<string, unknown>, key: string): string | null {
  return typeof value[key] === "string" && value[key] ? value[key] : null;
}

function modelFormFromInfo(model: ModelInfo): ModelFormState {
  const huaweiMaaS = model.model_info?.huawei_maas;
  const pricingRanges = pricingRangesFromInfo(model);
  return {
    model_name: model.model_name,
    upstream_model: model.litellm_params?.model || model.model_info?.key || model.model_name,
    custom_llm_provider: model.litellm_params?.custom_llm_provider || "openai",
    api_base: model.litellm_params?.api_base || defaultModelForm.api_base,
    api_key: model.litellm_params?.api_key || defaultModelForm.api_key,
    display_name: huaweiMaaS?.name || model.model_name,
    max_input_tokens: model.model_info?.max_input_tokens == null ? "" : String(model.model_info.max_input_tokens),
    max_output_tokens: model.model_info?.max_output_tokens == null ? "" : String(model.model_info.max_output_tokens),
    input_cost_per_million: costPerMillionString(model.model_info?.input_cost_per_token),
    output_cost_per_million: costPerMillionString(model.model_info?.output_cost_per_token),
    tiered_pricing: Boolean(huaweiMaaS?.tiered_pricing),
    pricing_ranges: pricingRanges.length ? pricingRanges : defaultPricingRanges(
      costPerMillionString(model.model_info?.input_cost_per_token),
      costPerMillionString(model.model_info?.output_cost_per_token)
    )
  };
}

function modelPayload(form: ModelFormState, existing: ModelInfo | null): Record<string, unknown> {
  const pricingRanges = form.tiered_pricing ? normalizedPricingRanges(form.pricing_ranges) : [];
  const inputCostPerMillion = pricingRanges[0]?.input_cost_per_million || form.input_cost_per_million;
  const outputCostPerMillion = pricingRanges[0]?.output_cost_per_million || form.output_cost_per_million;
  const inputCost = inputCostPerMillion ? Number(inputCostPerMillion) / 1_000_000 : undefined;
  const outputCost = outputCostPerMillion ? Number(outputCostPerMillion) / 1_000_000 : undefined;
  const maxInput = form.max_input_tokens ? Number(form.max_input_tokens) : undefined;
  const maxOutput = form.max_output_tokens ? Number(form.max_output_tokens) : undefined;
  const huaweiPricing = {
    input: pricingRanges.map((range) => ({
      start: Number(range.start),
      end: Number(range.end),
      tokenPriceUsdPerMillion: Number(range.input_cost_per_million)
    })),
    output: pricingRanges.map((range) => ({
      start: Number(range.start),
      end: Number(range.end),
      tokenPriceUsdPerMillion: Number(range.output_cost_per_million)
    }))
  };
  const modelInfo = clean({
    ...(existing?.model_info || {}),
    id: existing?.model_info?.id || modelIdForName(form.model_name),
    db_model: true,
    key: form.upstream_model,
    mode: "chat",
    litellm_provider: form.custom_llm_provider,
    max_tokens: maxOutput,
    max_input_tokens: maxInput,
    max_output_tokens: maxOutput,
    input_cost_per_token: inputCost,
    output_cost_per_token: outputCost,
    huawei_maas: clean({
      ...(existing?.model_info?.huawei_maas || {}),
      id: form.upstream_model,
      name: form.display_name || form.model_name,
      tiered_pricing: form.tiered_pricing,
      currency: existing?.model_info?.huawei_maas?.currency || "USD",
      pricing_unit: existing?.model_info?.huawei_maas?.pricing_unit || "1M tokens",
      pricing: form.tiered_pricing ? huaweiPricing : { input: [], output: [] }
    })
  });
  return {
    model_name: form.model_name,
    litellm_params: {
      model: form.upstream_model,
      custom_llm_provider: form.custom_llm_provider,
      api_base: form.api_base,
      api_key: form.api_key
    },
    model_info: modelInfo
  };
}

function modelIdForName(modelName: string): string {
  return `custom-${modelName.trim().replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

function defaultPricingRanges(inputCost = "", outputCost = ""): PricingRangeForm[] {
  return [
    { start: "0", end: "31999", input_cost_per_million: inputCost, output_cost_per_million: outputCost },
    { start: "32000", end: "1000000", input_cost_per_million: "", output_cost_per_million: "" }
  ];
}

function pricingRangesFromInfo(model: ModelInfo): PricingRangeForm[] {
  const input = model.model_info?.huawei_maas?.pricing?.input || [];
  const output = model.model_info?.huawei_maas?.pricing?.output || [];
  const count = Math.max(input.length, output.length);
  return Array.from({ length: count }, (_value, index) => {
    const inputRange = input[index];
    const outputRange = output[index];
    return {
      start: String(inputRange?.start ?? outputRange?.start ?? ""),
      end: String(inputRange?.end ?? outputRange?.end ?? ""),
      input_cost_per_million: inputRange?.tokenPriceUsdPerMillion == null ? "" : String(inputRange.tokenPriceUsdPerMillion),
      output_cost_per_million: outputRange?.tokenPriceUsdPerMillion == null ? "" : String(outputRange.tokenPriceUsdPerMillion)
    };
  }).filter((range) => range.start || range.end || range.input_cost_per_million || range.output_cost_per_million);
}

function normalizedPricingRanges(ranges: PricingRangeForm[]): PricingRangeForm[] {
  return ranges
    .filter((range) => range.start && range.end && range.input_cost_per_million && range.output_cost_per_million)
    .sort((a, b) => Number(a.start) - Number(b.start));
}

function costPerMillionString(value?: number): string {
  return value == null ? "" : String(Number((value * 1_000_000).toFixed(6)));
}

function normalizeKeyRow(row: ApiKeyListRow): ApiKeyRow {
  return typeof row === "string" ? { token: row } : row;
}

function keyIdentifier(row: ApiKeyListRow): string {
  return typeof row === "string" ? row : row.token || "";
}

function mask(value?: string | null): string {
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function currency(value: number): string {
  return `$${value.toFixed(value < 1 ? 6 : 2)}`;
}

function perMillion(value?: number): string {
  return value == null ? "-" : `$${(value * 1_000_000).toFixed(6)}`;
}

function formatCell(value: unknown): string {
  if (typeof value === "number") return value.toFixed(value < 1 ? 6 : 2);
  if (typeof value === "string") return value;
  if (value == null) return "-";
  return JSON.stringify(value);
}

createRoot(document.getElementById("root")!).render(<App />);
