import { useEffect, useState } from "react";
import { Eye, RefreshCcw, Save } from "lucide-react";
import type { ImageSupportSettings } from "../../shared/types";
import { api, useResource } from "../api";
import { EmptyState, Header } from "../components";

export function ImageSupportPage() {
  const { data, loading, reload } = useResource<ImageSupportSettings>("/api/image-support");
  const [form, setForm] = useState({
    enabled: false,
    openrouter_api_key: "",
    clear_api_key: false,
    vision_model: "openai/gpt-4o-mini",
    extraction_prompt: "",
    max_tokens: 1200
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!data) return;
    setForm({
      enabled: data.enabled,
      openrouter_api_key: "",
      clear_api_key: false,
      vision_model: data.vision_model,
      extraction_prompt: data.extraction_prompt,
      max_tokens: data.max_tokens
    });
  }, [data]);

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setMessage("");
    try {
      await api<ImageSupportSettings>("/api/image-support", { method: "PUT", body: form });
      setMessage("Image support settings saved.");
      reload();
    } finally {
      setSaving(false);
    }
  }

  return (
    <section>
      <Header
        icon={<Eye size={22} />}
        title="Image Support"
        tone="blue"
        action={<div className="header-actions"><button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button></div>}
      />
      {loading ? <EmptyState text="Loading image support settings" /> : (
        <form className="panel settings-form" onSubmit={save}>
          <label className="toggle-row"><input type="checkbox" checked={form.enabled} onChange={(event) => setForm({ ...form, enabled: event.target.checked })} /> <span>Enable image extraction for text-only models</span></label>
          <label>OpenRouter API key
            <input
              type="password"
              placeholder={data?.openrouter_api_key_present ? data.openrouter_api_key_masked : "sk-or-..."}
              value={form.openrouter_api_key}
              onChange={(event) => setForm({ ...form, openrouter_api_key: event.target.value, clear_api_key: false })}
            />
          </label>
          {data?.openrouter_api_key_present ? (
            <label className="toggle-row"><input type="checkbox" checked={form.clear_api_key} onChange={(event) => setForm({ ...form, clear_api_key: event.target.checked, openrouter_api_key: "" })} /> <span>Clear saved OpenRouter key</span></label>
          ) : null}
          <div className="config-grid">
            <label>Vision model<input value={form.vision_model} onChange={(event) => setForm({ ...form, vision_model: event.target.value })} required /></label>
            <label>Max extraction tokens<input type="number" min="1" max="8192" step="1" value={form.max_tokens} onChange={(event) => setForm({ ...form, max_tokens: Math.max(1, Number(event.target.value) || 1) })} required /></label>
          </div>
          <label>Extraction prompt<textarea value={form.extraction_prompt} onChange={(event) => setForm({ ...form, extraction_prompt: event.target.value })} required /></label>
          {message ? <div className="notice">{message}</div> : null}
          <div className="modal-actions"><button className="primary" disabled={saving}><Save size={16} /> {saving ? "Saving" : "Save settings"}</button></div>
        </form>
      )}
    </section>
  );
}
