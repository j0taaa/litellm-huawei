import { useState } from "react";
import { CalendarClock, Copy, KeyRound, Pencil, Plus, Power, RefreshCcw, Trash2 } from "lucide-react";
import type { ApiKeyListRow, ApiKeyRow, ModelInfo, PromptPolicy, PromptSkill, SearchTool, TeamRow } from "../../shared/types";
import { api, useResource } from "../api";
import { EmptyState, Header, Modal, StatusBadge } from "../components";
import { defaultKeyForm, keyFormFromRow, keyIdentifier, keyPayload, normalizeKeyRow, timezones, weekDays } from "../form-state";
import type { DurationUnit, KeyFormState } from "../types";
import { currency, mask, toggleValue } from "../utils";
import { WebSearchControls } from "../web-search-controls";

export function KeysPage() {
  const { data, loading, reload } = useResource<{ keys?: ApiKeyListRow[]; data?: ApiKeyListRow[] }>("/api/keys?page=1&size=100");
  const models = useResource<{ data?: ModelInfo[] }>("/api/models");
  const teamsResource = useResource<TeamRow[] | { teams?: TeamRow[]; data?: TeamRow[] }>("/api/teams");
  const policiesResource = useResource<{ policies: PromptPolicy[] }>("/api/prompt-policies");
  const skillsResource = useResource<{ skills: PromptSkill[] }>("/api/skills");
  const searchToolsResource = useResource<{ search_tools?: SearchTool[] }>("/api/search-tools");
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
  const skills = skillsResource.data?.skills || [];
  const searchTools = searchToolsResource.data?.search_tools || [];
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

  function toggleKeySkill(skillId: string) {
    setForm({ ...form, skillIds: toggleValue(form.skillIds, skillId) });
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
    setForm(keyFormFromRow(normalizeKeyRow(row), policies, key, skills));
    setCreatedKey("");
    setEditingKey(row);
    setCloningKey(null);
    setCreateOpen(true);
  }

  function openCloneModal(row: ApiKeyListRow) {
    const key = keyIdentifier(row);
    const nextForm = keyFormFromRow(normalizeKeyRow(row), policies, key, skills);
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
              <WebSearchControls
                value={form.webSearch}
                onChange={(webSearch) => setForm({ ...form, webSearch })}
                searchTools={searchTools}
                models={models.data?.data || []}
              />
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
              <fieldset className="model-access">
                <div className="model-access-header">
                  <span className="field-label">Skills</span>
                  <div className="model-actions">
                    <button type="button" className="text-action" onClick={() => setForm({ ...form, skillIds: skills.map((skill) => skill.id) })}>Select all</button>
                    <button type="button" className="text-action" onClick={() => setForm({ ...form, skillIds: [] })}>Clear</button>
                  </div>
                </div>
                <p className="field-note">{form.skillIds.length ? `${form.skillIds.length} selected` : "No key-specific prompt skills are assigned."}</p>
                <div className="model-checks">
                  {skills.map((skill) => (
                    <label className="model-check" key={skill.id}>
                      <input type="checkbox" checked={form.skillIds.includes(skill.id)} onChange={() => toggleKeySkill(skill.id)} />
                      <span>{skill.name}</span>
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
