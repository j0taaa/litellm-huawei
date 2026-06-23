import { useState } from "react";
import { Globe2, Layers3, Pencil, Plus, RefreshCcw, Trash2 } from "lucide-react";
import type { ModelInfo } from "../../shared/types";
import { api, useResource } from "../api";
import { EmptyState, Header, Modal } from "../components";
import { defaultModelForm, defaultPricingRanges, modelFormFromInfo, modelPayload } from "../form-state";
import type { ModelFormState, PricingRangeForm } from "../types";
import { perMillion } from "../utils";

export function ModelsPage() {
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

  function openCreateOpenRouterModel() {
    setEditingModel(null);
    setForm({
      ...defaultModelForm,
      custom_llm_provider: "openrouter",
      api_base: "https://openrouter.ai/api/v1",
      api_key: "os.environ/OPENROUTER_API_KEY",
      supports_vision: true,
      pricing_ranges: defaultPricingRanges()
    });
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
        action={<div className="header-actions"><button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button><button className="secondary" onClick={syncCatalog} disabled={syncing}><RefreshCcw size={16} /> {syncing ? "Syncing" : "Sync catalog"}</button><button className="secondary" onClick={openCreateOpenRouterModel}><Globe2 size={16} /> Add OpenRouter</button><button className="primary" onClick={openCreateModel}><Plus size={16} /> Add model</button></div>}
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
            <label className="toggle-row"><input type="checkbox" checked={form.supports_vision} onChange={(e) => setForm({ ...form, supports_vision: e.target.checked })} /> <span>Supports image input</span></label>
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
          <thead><tr><th>Name</th><th>Upstream</th><th>Provider</th><th>Vision</th><th>Context</th><th>Output</th><th>Input / 1M</th><th>Output / 1M</th><th></th></tr></thead>
          <tbody>{models.map((model) => (
            <tr key={model.model_info?.id || model.model_name}>
              <td>{model.model_name}</td>
              <td>{model.litellm_params?.model || "-"}</td>
              <td>{model.litellm_params?.custom_llm_provider || "-"}</td>
              <td>{model.model_info?.huawei_maas?.supports_vision || model.model_info?.supports_vision ? "Yes" : "No"}</td>
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
