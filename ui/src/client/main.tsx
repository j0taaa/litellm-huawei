import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, BarChart3, Copy, DollarSign, KeyRound, Layers3, LogOut, Plus, RefreshCcw, ShieldCheck, Sparkles, Trash2, Users, X } from "lucide-react";
import type { ApiKeyRow, ModelInfo, SessionUser, StatsSummary, TeamRow } from "../shared/types";
import "./styles.css";

type RoutePath = "/stats" | "/keys" | "/teams";
type Tone = "green" | "blue" | "amber" | "violet" | "rose";
type DurationUnit = "m" | "h" | "d";

const routes: Array<{ path: RoutePath; label: string; icon: React.ReactNode; page: React.ReactNode }> = [
  { path: "/stats", label: "Stats", icon: <BarChart3 size={18} />, page: <StatsPage /> },
  { path: "/keys", label: "Keys", icon: <KeyRound size={18} />, page: <KeysPage /> },
  { path: "/teams", label: "Teams", icon: <Users size={18} />, page: <TeamsPage /> }
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
  const activeRoute = routes.find((item) => item.path === route) || routes[0];
  return (
    <AppLayout session={session} route={activeRoute.path} onNavigate={navigate} onLogout={() => setSession(null)}>
      {activeRoute.page}
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

function StatsPage() {
  const { data, loading, reload } = useResource<StatsSummary>("/api/stats");
  return (
    <section>
      <Header icon={<BarChart3 size={22} />} title="Stats" tone="green" action={<button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button>} />
      {loading || !data ? <EmptyState text="Loading stats" /> : (
        <>
          <div className="metrics">
            <Metric icon={<DollarSign size={18} />} tone="green" label="Spend" value={currency(data.totals.spend)} />
            <Metric icon={<Activity size={18} />} tone="blue" label="Requests" value={String(data.totals.requests)} />
            <Metric icon={<KeyRound size={18} />} tone="amber" label="Keys" value={String(data.totals.keys)} />
            <Metric icon={<Users size={18} />} tone="violet" label="Teams" value={String(data.totals.teams)} />
            <Metric icon={<Layers3 size={18} />} tone="rose" label="Models" value={String(data.totals.models)} />
          </div>
          <div className="grid3">
            <Breakdown icon={<Layers3 size={16} />} tone="rose" title="By model" rows={data.byModel} />
            <Breakdown icon={<KeyRound size={16} />} tone="amber" title="By key" rows={data.byKey} />
            <Breakdown icon={<Users size={16} />} tone="violet" title="By team" rows={data.byTeam} />
          </div>
          <DataTable icon={<Activity size={16} />} title="Recent spend logs" rows={data.recent} columns={["startTime", "model", "api_key", "team_id", "spend"]} />
        </>
      )}
    </section>
  );
}

function KeysPage() {
  const { data, loading, reload } = useResource<{ keys?: ApiKeyRow[]; data?: ApiKeyRow[] }>("/api/keys?page=1&size=100");
  const models = useResource<{ data?: ModelInfo[] }>("/api/models");
  const teamsResource = useResource<TeamRow[] | { teams?: TeamRow[]; data?: TeamRow[] }>("/api/teams");
  const [createdKey, setCreatedKey] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({
    key_alias: "",
    team_id: "",
    max_budget: "",
    resetBudget: false,
    budgetResetAmount: 30,
    budgetResetUnit: "d" as DurationUnit,
    max_tps: "",
    max_tpm: "",
    max_parallel_requests: "",
    tokenBudget: false,
    tokenBudgetTokens: "",
    tokenBudgetReset: false,
    tokenBudgetResetAmount: 30,
    tokenBudgetResetUnit: "d" as DurationUnit,
    expires: false,
    durationAmount: 30,
    durationUnit: "d" as DurationUnit,
    models: [] as string[]
  });
  const keys = data?.keys || data?.data || [];
  const modelNames = (models.data?.data || []).map((model) => model.model_name);
  const teams = Array.isArray(teamsResource.data) ? teamsResource.data : teamsResource.data?.teams || teamsResource.data?.data || [];

  async function createKey(event: React.FormEvent) {
    event.preventDefault();
    setCreating(true);
    const payload = clean({
      key_alias: form.key_alias || undefined,
      team_id: form.team_id || undefined,
      duration: form.expires ? `${form.durationAmount}${form.durationUnit}` : undefined,
      max_budget: form.max_budget ? Number(form.max_budget) : undefined,
      budget_duration: form.resetBudget ? `${form.budgetResetAmount}${form.budgetResetUnit}` : undefined,
      rpm_limit: form.max_tps ? Math.ceil(Number(form.max_tps) * 60) : undefined,
      tpm_limit: form.max_tpm ? Number(form.max_tpm) : undefined,
      max_parallel_requests: form.max_parallel_requests ? Number(form.max_parallel_requests) : undefined,
      metadata: form.tokenBudget ? clean({
        huawei_token_budget: clean({
          max_tokens: Number(form.tokenBudgetTokens),
          reset_duration: form.tokenBudgetReset ? `${form.tokenBudgetResetAmount}${form.tokenBudgetResetUnit}` : undefined,
          counts: "total_tokens"
        })
      }) : undefined,
      models: form.models
    });
    try {
      const result = await api<Record<string, unknown>>("/api/keys", { method: "POST", body: payload });
      setCreatedKey(String(result.key || result.token || ""));
      setForm({
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
        expires: false,
        durationAmount: 30,
        durationUnit: "d",
        models: []
      });
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

  function closeCreateModal() {
    setCreateOpen(false);
    setCreatedKey("");
  }

  async function deleteKey(row: ApiKeyRow) {
    const key = row.token || row.key_name;
    if (!key) return;
    await api("/api/keys", { method: "DELETE", body: { keys: [key] } });
    reload();
  }

  return (
    <section>
      <Header
        icon={<KeyRound size={22} />}
        title="Keys"
        tone="amber"
        action={<div className="header-actions"><button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button><button className="primary" onClick={() => setCreateOpen(true)}><Plus size={16} /> Create key</button></div>}
      />
      {createOpen ? (
        <Modal title="Create key" onClose={closeCreateModal}>
          {createdKey ? (
            <div className="modal-stack">
              <div className="secret"><code>{createdKey}</code><button className="secondary" onClick={() => navigator.clipboard.writeText(createdKey)}><Copy size={16} /> Copy</button></div>
              <div className="modal-actions"><button className="primary" onClick={closeCreateModal}>Done</button></div>
            </div>
          ) : (
            <form className="modal-form" onSubmit={createKey}>
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
              <div className="expiration-field">
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
                <span className="field-label">Token budget</span>
                <label className="toggle-row"><input type="checkbox" checked={form.tokenBudget} onChange={(e) => setForm({ ...form, tokenBudget: e.target.checked })} /> <span>Set token budget</span></label>
                {form.tokenBudget ? (
                  <>
                    <div className="config-grid">
                      <label>Total token budget<input type="number" min="1" step="1" placeholder="Total tokens" value={form.tokenBudgetTokens} onChange={(e) => setForm({ ...form, tokenBudgetTokens: e.target.value })} required={form.tokenBudget} /></label>
                      <label className="toggle-row"><input type="checkbox" checked={form.tokenBudgetReset} onChange={(e) => setForm({ ...form, tokenBudgetReset: e.target.checked })} /> <span>Reset token budget</span></label>
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
                      <p className="field-note compact">Token budget does not reset.</p>
                    )}
                  </>
                ) : (
                  <p className="field-note compact">No total token budget is enforced.</p>
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
              <div className="modal-actions"><button type="button" className="secondary" onClick={closeCreateModal}>Cancel</button><button className="primary" disabled={creating}>{creating ? "Creating" : "Create key"}</button></div>
            </form>
          )}
        </Modal>
      ) : null}
      {loading ? <EmptyState text="Loading keys" /> : (
        <table>
          <thead><tr><th>Alias</th><th>Key</th><th>Owner</th><th>Team</th><th>Spend</th><th>Budget</th><th>Status</th><th></th></tr></thead>
          <tbody>{keys.map((row, index) => (
            <tr key={`${row.key_name || row.token || index}`}>
              <td>{row.key_alias || "-"}</td>
              <td><code>{mask(row.key_name || row.token)}</code></td>
              <td>{row.user_id || "-"}</td>
              <td>{row.team_id || "-"}</td>
              <td>{currency(row.spend || 0)}</td>
              <td>{row.max_budget ? currency(row.max_budget) : "-"}</td>
              <td><StatusBadge blocked={Boolean(row.blocked)} /></td>
              <td><button className="icon danger" onClick={() => deleteKey(row)} title="Delete key"><Trash2 size={16} /></button></td>
            </tr>
          ))}</tbody>
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

function TeamsPage() {
  const { data, loading, reload } = useResource<TeamRow[] | { teams?: TeamRow[]; data?: TeamRow[] }>("/api/teams");
  const models = useResource<{ data?: ModelInfo[] }>("/api/models");
  const teams = Array.isArray(data) ? data : data?.teams || data?.data || [];
  const modelNames = (models.data?.data || []).map((model) => model.model_name);
  const [form, setForm] = useState({ team_alias: "", max_budget: "", rpm_limit: "", tpm_limit: "", models: "" });

  async function createTeam(event: React.FormEvent) {
    event.preventDefault();
    await api("/api/teams", {
      method: "POST",
      body: clean({
        team_alias: form.team_alias,
        max_budget: form.max_budget ? Number(form.max_budget) : undefined,
        rpm_limit: form.rpm_limit ? Number(form.rpm_limit) : undefined,
        tpm_limit: form.tpm_limit ? Number(form.tpm_limit) : undefined,
        models: form.models ? [form.models] : []
      })
    });
    setForm({ team_alias: "", max_budget: "", rpm_limit: "", tpm_limit: "", models: "" });
    reload();
  }

  async function deleteTeam(teamId: string) {
    await api(`/api/teams/${encodeURIComponent(teamId)}`, { method: "DELETE" });
    reload();
  }

  return (
    <section>
      <Header icon={<Users size={22} />} title="Teams" tone="violet" action={<button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button>} />
      <form className="toolbar" onSubmit={createTeam}>
        <input placeholder="Team alias" value={form.team_alias} onChange={(e) => setForm({ ...form, team_alias: e.target.value })} />
        <input placeholder="Budget USD" value={form.max_budget} onChange={(e) => setForm({ ...form, max_budget: e.target.value })} />
        <input placeholder="RPM" value={form.rpm_limit} onChange={(e) => setForm({ ...form, rpm_limit: e.target.value })} />
        <input placeholder="TPM" value={form.tpm_limit} onChange={(e) => setForm({ ...form, tpm_limit: e.target.value })} />
        <select value={form.models} onChange={(e) => setForm({ ...form, models: e.target.value })}>
          <option value="">All models</option>
          {modelNames.map((name) => <option key={name} value={name}>{name}</option>)}
        </select>
        <button className="primary"><Plus size={16} /> Create</button>
      </form>
      {loading ? <EmptyState text="Loading teams" /> : (
        <table>
          <thead><tr><th>Alias</th><th>ID</th><th>Models</th><th>Spend</th><th>Budget</th><th>RPM</th><th>TPM</th><th></th></tr></thead>
          <tbody>{teams.map((team) => (
            <tr key={team.team_id}>
              <td>{team.team_alias || "-"}</td>
              <td><code>{team.team_id}</code></td>
              <td>{team.models?.length ? team.models.join(", ") : "All"}</td>
              <td>{currency(team.spend || 0)}</td>
              <td>{team.max_budget ? currency(team.max_budget) : "-"}</td>
              <td>{team.rpm_limit || "-"}</td>
              <td>{team.tpm_limit || "-"}</td>
              <td><button className="icon danger" onClick={() => deleteTeam(team.team_id)} title="Delete team"><Trash2 size={16} /></button></td>
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

function Metric({ icon, tone, label, value }: { icon: React.ReactNode; tone: Tone; label: string; value: string }) {
  return <div className={`metric ${tone}`}><div className="metric-top"><span className="metric-icon">{icon}</span><span>{label}</span></div><strong>{value}</strong></div>;
}

function Breakdown({ icon, tone, title, rows }: { icon: React.ReactNode; tone: Tone; title: string; rows: Array<{ name: string; spend: number; requests: number }> }) {
  return <div className={`panel ${tone}`}><PanelTitle icon={icon} title={title} />{rows.length ? rows.slice(0, 8).map((row) => <div className="bar-row" key={row.name}><span>{row.name}</span><strong>{currency(row.spend)}</strong></div>) : <p className="muted">No data</p>}</div>;
}

function DataTable({ icon, title, rows, columns }: { icon: React.ReactNode; title: string; rows: Array<Record<string, unknown>>; columns: string[] }) {
  return <div className="panel wide"><PanelTitle icon={icon} title={title} /><table><thead><tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{columns.map((column) => <td key={column}>{formatCell(row[column])}</td>)}</tr>)}</tbody></table></div>;
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

function mask(value?: string | null): string {
  if (!value) return "-";
  return value.length > 12 ? `${value.slice(0, 6)}...${value.slice(-4)}` : value;
}

function currency(value: number): string {
  return `$${value.toFixed(value < 1 ? 6 : 2)}`;
}

function formatCell(value: unknown): string {
  if (typeof value === "number") return value.toFixed(value < 1 ? 6 : 2);
  if (typeof value === "string") return value;
  if (value == null) return "-";
  return JSON.stringify(value);
}

createRoot(document.getElementById("root")!).render(<App />);
