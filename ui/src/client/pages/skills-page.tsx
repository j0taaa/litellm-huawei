import { useState } from "react";
import { BrainCircuit, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import type { ApiKeyListRow, PromptSkill, TeamRow } from "../../shared/types";
import { api, useResource } from "../api";
import { EmptyState, Header, Modal, StatusBadge } from "../components";
import { defaultSkillForm, keyIdentifier, normalizeKeyRow, skillFormFromSkill, skillPayload } from "../form-state";
import type { SkillFormState } from "../types";

export function SkillsPage() {
  const { data, loading, reload } = useResource<{ skills: PromptSkill[] }>("/api/skills");
  const keysResource = useResource<{ keys?: ApiKeyListRow[]; data?: ApiKeyListRow[] }>("/api/keys?page=1&size=100");
  const teamsResource = useResource<TeamRow[] | { teams?: TeamRow[]; data?: TeamRow[] }>("/api/teams");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<PromptSkill | null>(null);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<SkillFormState>(defaultSkillForm);
  const skills = data?.skills || [];
  const keys = keysResource.data?.keys || keysResource.data?.data || [];
  const teams = Array.isArray(teamsResource.data) ? teamsResource.data : teamsResource.data?.teams || teamsResource.data?.data || [];

  function openCreateSkill() {
    setEditingSkill(null);
    setForm(defaultSkillForm);
    setModalOpen(true);
  }

  function openEditSkill(skill: PromptSkill) {
    setEditingSkill(skill);
    setForm(skillFormFromSkill(skill));
    setModalOpen(true);
  }

  function closeSkillModal() {
    setModalOpen(false);
    setEditingSkill(null);
    setForm(defaultSkillForm);
  }

  function toggleAssignment(kind: "keyAssignments" | "teamAssignments", id: string) {
    const values = form[kind];
    setForm({ ...form, [kind]: values.includes(id) ? values.filter((value) => value !== id) : [...values, id] });
  }

  async function saveSkill(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const skill = editingSkill
        ? await api<PromptSkill>(`/api/skills/${encodeURIComponent(editingSkill.id)}`, { method: "PATCH", body: skillPayload(form) })
        : await api<PromptSkill>("/api/skills", { method: "POST", body: skillPayload(form) });
      await api(`/api/skills/${encodeURIComponent(skill.id)}/assignments`, {
        method: "PUT",
        body: {
          assignments: [
            ...form.teamAssignments.map((target_id) => ({ target_type: "team", target_id })),
            ...form.keyAssignments.map((target_id) => ({ target_type: "key", target_id }))
          ]
        }
      });
      closeSkillModal();
      reload();
    } finally {
      setSaving(false);
    }
  }

  async function deleteSkill(skill: PromptSkill) {
    await api(`/api/skills/${encodeURIComponent(skill.id)}`, { method: "DELETE" });
    reload();
  }

  return (
    <section>
      <Header
        icon={<BrainCircuit size={22} />}
        title="Skills"
        tone="green"
        action={<div className="header-actions"><button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button><button className="primary" onClick={openCreateSkill}><Plus size={16} /> Create skill</button></div>}
      />
      {modalOpen ? (
        <Modal title={editingSkill ? "Edit skill" : "Create skill"} onClose={closeSkillModal}>
          <form className="modal-form" onSubmit={saveSkill}>
            <label>Name<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} required /></label>
            <label>Description<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} /></label>
            <label className="toggle-row"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> <span>Enabled</span></label>
            <label>Instructions<textarea value={form.instructions} onChange={(event) => setForm({ ...form, instructions: event.target.value })} required /></label>
            <fieldset className="model-access">
              <span className="field-label">Assign to teams</span>
              <div className="model-checks">
                {teams.map((team) => (
                  <label className="model-check" key={team.team_id}>
                    <input type="checkbox" checked={form.teamAssignments.includes(team.team_id)} onChange={() => toggleAssignment("teamAssignments", team.team_id)} />
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
                      <input type="checkbox" checked={form.keyAssignments.includes(id)} onChange={() => toggleAssignment("keyAssignments", id)} />
                      <span>{row.key_alias || row.key_name || id}</span>
                    </label>
                  ) : null;
                })}
              </div>
            </fieldset>
            <div className="modal-actions"><button type="button" className="secondary" onClick={closeSkillModal}>Cancel</button><button className="primary" disabled={saving}>{saving ? "Saving" : editingSkill ? "Save changes" : "Create skill"}</button></div>
          </form>
        </Modal>
      ) : null}
      {loading ? <EmptyState text="Loading skills" /> : (
        <table>
          <thead><tr><th>Name</th><th>Status</th><th>Keys</th><th>Teams</th><th>Description</th><th></th></tr></thead>
          <tbody>{skills.map((skill) => (
            <tr key={skill.id}>
              <td>{skill.name}</td>
              <td><StatusBadge blocked={!skill.enabled} /></td>
              <td>{skill.assignments.filter((assignment) => assignment.target_type === "key").length}</td>
              <td>{skill.assignments.filter((assignment) => assignment.target_type === "team").length}</td>
              <td>{skill.description || "-"}</td>
              <td>
                <div className="row-actions">
                  <button className="icon" onClick={() => openEditSkill(skill)} title="Edit skill"><Pencil size={16} /></button>
                  <button className="icon danger" onClick={() => deleteSkill(skill)} title="Delete skill"><Trash2 size={16} /></button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      )}
    </section>
  );
}
