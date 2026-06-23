import { useState } from "react";
import { CalendarClock, Pencil, Plus, Power, RefreshCcw, Trash2, Users } from "lucide-react";
import type { ModelInfo, PromptPolicy, PromptSkill, SearchTool, TeamRow } from "../../shared/types";
import { api, useResource } from "../api";
import { EmptyState, Header, Modal, StatusBadge } from "../components";
import { defaultTeamForm, teamFormFromRow, teamPayload, timezones, weekDays } from "../form-state";
import { ImageAnalysisControls } from "../image-analysis-controls";
import type { DurationUnit, TeamFormState } from "../types";
import { currency, toggleValue } from "../utils";
import { WebSearchControls } from "../web-search-controls";

export function TeamsPage() {
  const { data, loading, reload } = useResource<TeamRow[] | { teams?: TeamRow[]; data?: TeamRow[] }>("/api/teams");
  const models = useResource<{ data?: ModelInfo[] }>("/api/models");
  const policiesResource = useResource<{ policies: PromptPolicy[] }>("/api/prompt-policies");
  const skillsResource = useResource<{ skills: PromptSkill[] }>("/api/skills");
  const searchToolsResource = useResource<{ search_tools?: SearchTool[] }>("/api/search-tools");
  const teams = Array.isArray(data) ? data : data?.teams || data?.data || [];
  const modelNames = (models.data?.data || []).map((model) => model.model_name);
  const policies = policiesResource.data?.policies || [];
  const skills = skillsResource.data?.skills || [];
  const searchTools = searchToolsResource.data?.search_tools || [];
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
    setForm(teamFormFromRow(team, policies, skills));
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

  function toggleTeamSkill(skillId: string) {
    setForm({ ...form, skillIds: toggleValue(form.skillIds, skillId) });
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
            <WebSearchControls
              value={form.webSearch}
              onChange={(webSearch) => setForm({ ...form, webSearch })}
              searchTools={searchTools}
              models={models.data?.data || []}
            />
            <ImageAnalysisControls value={form} onChange={setForm} models={models.data?.data || []} />
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
            <fieldset className="model-access">
              <div className="model-access-header">
                <span className="field-label">Skills</span>
                <div className="model-actions"><button type="button" className="text-action" onClick={() => setForm({ ...form, skillIds: skills.map((skill) => skill.id) })}>Select all</button><button type="button" className="text-action" onClick={() => setForm({ ...form, skillIds: [] })}>Clear</button></div>
              </div>
              <p className="field-note">{form.skillIds.length ? `${form.skillIds.length} selected` : "No team prompt skills are assigned."}</p>
              <div className="model-checks">
                {skills.map((skill) => <label className="model-check" key={skill.id}><input type="checkbox" checked={form.skillIds.includes(skill.id)} onChange={() => toggleTeamSkill(skill.id)} /><span>{skill.name}</span></label>)}
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
