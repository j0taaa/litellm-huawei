import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Activity, BarChart3, CalendarClock, Copy, DollarSign, KeyRound, Layers3, LogOut, Pencil, Plus, RefreshCcw, ShieldCheck, Sparkles, Trash2, Users, X } from "lucide-react";
import type { ApiKeyListRow, ApiKeyRow, ModelInfo, SessionUser, StatsSummary, TeamRow } from "../shared/types";
import "./styles.css";

type RoutePath = "/stats" | "/keys" | "/teams";
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
  models: []
};

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
  const { data, loading, reload } = useResource<{ keys?: ApiKeyListRow[]; data?: ApiKeyListRow[] }>("/api/keys?page=1&size=100");
  const models = useResource<{ data?: ModelInfo[] }>("/api/models");
  const teamsResource = useResource<TeamRow[] | { teams?: TeamRow[]; data?: TeamRow[] }>("/api/teams");
  const [createdKey, setCreatedKey] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editingKey, setEditingKey] = useState<ApiKeyListRow | null>(null);
  const [cloningKey, setCloningKey] = useState<ApiKeyListRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [deletingKey, setDeletingKey] = useState("");
  const [form, setForm] = useState<KeyFormState>(defaultKeyForm);
  const keys = data?.keys || data?.data || [];
  const modelNames = (models.data?.data || []).map((model) => model.model_name);
  const teams = Array.isArray(teamsResource.data) ? teamsResource.data : teamsResource.data?.teams || teamsResource.data?.data || [];
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
    setForm(keyFormFromRow(normalizeKeyRow(row)));
    setCreatedKey("");
    setEditingKey(row);
    setCloningKey(null);
    setCreateOpen(true);
  }

  function openCloneModal(row: ApiKeyListRow) {
    const nextForm = keyFormFromRow(normalizeKeyRow(row));
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

function keyPayload(form: KeyFormState, mode: "create" | "edit" | "clone"): Record<string, unknown> {
  const editing = mode === "edit";
  const cloning = mode === "clone";
  const metadata = clean({
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
    models: form.models
  });
}

function keyFormFromRow(row: ApiKeyRow): KeyFormState {
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
    models: row.models || []
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

function formatCell(value: unknown): string {
  if (typeof value === "number") return value.toFixed(value < 1 ? 6 : 2);
  if (typeof value === "string") return value;
  if (value == null) return "-";
  return JSON.stringify(value);
}

createRoot(document.getElementById("root")!).render(<App />);
