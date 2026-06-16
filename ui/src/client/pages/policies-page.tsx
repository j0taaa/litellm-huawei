import { useState } from "react";
import { Pencil, Plus, RefreshCcw, Regex, Trash2 } from "lucide-react";
import type { ApiKeyListRow, PromptPolicy, PromptPolicyRule, TeamRow } from "../../shared/types";
import { api, useResource } from "../api";
import { EmptyState, Header, Modal, StatusBadge } from "../components";
import { defaultPolicyForm, defaultPolicyRule, keyIdentifier, normalizeKeyRow, policyFormFromPolicy, policyPayload } from "../form-state";
import type { PolicyFormState } from "../types";
import { toggleValue } from "../utils";

export function PoliciesPage() {
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
