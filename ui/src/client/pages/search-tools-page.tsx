import { useEffect, useState } from "react";
import { CheckCircle2, Pencil, Plus, RefreshCcw, Search, Trash2, XCircle } from "lucide-react";
import type { AvailableSearchProvider, SearchTool } from "../../shared/types";
import { api, useResource } from "../api";
import { EmptyState, Header, Modal } from "../components";

type SearchToolForm = {
  search_tool_name: string;
  search_provider: string;
  api_key: string;
  api_base: string;
  timeout: string;
  max_retries: string;
  description: string;
};

type TestResult = {
  status?: string;
  message?: string;
  test_query?: string;
  results_count?: number;
  error_type?: string;
};

const defaultForm: SearchToolForm = {
  search_tool_name: "",
  search_provider: "",
  api_key: "",
  api_base: "",
  timeout: "",
  max_retries: "",
  description: ""
};

export function SearchToolsPage() {
  const { data, loading, reload } = useResource<{ search_tools?: SearchTool[] }>("/api/search-tools");
  const providersResource = useResource<{ providers?: AvailableSearchProvider[] }>("/api/search-tools/providers");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingTool, setEditingTool] = useState<SearchTool | null>(null);
  const [form, setForm] = useState<SearchToolForm>(defaultForm);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [error, setError] = useState("");
  const searchTools = data?.search_tools || [];
  const providers = providersResource.data?.providers || [];

  function openCreateTool() {
    setEditingTool(null);
    setForm(defaultForm);
    setTestResult(null);
    setError("");
    setModalOpen(true);
  }

  function openEditTool(tool: SearchTool) {
    setEditingTool(tool);
    setForm(formFromTool(tool));
    setTestResult(null);
    setError("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
    setEditingTool(null);
    setForm(defaultForm);
    setTestResult(null);
    setError("");
  }

  async function saveTool(event: React.FormEvent) {
    event.preventDefault();
    setSaving(true);
    setError("");
    try {
      const payload = formPayload(form);
      if (editingTool?.search_tool_id) {
        await api(`/api/search-tools/${encodeURIComponent(editingTool.search_tool_id)}`, { method: "PUT", body: payload });
      } else {
        await api("/api/search-tools", { method: "POST", body: payload });
      }
      closeModal();
      reload();
    } catch (error) {
      setError(error instanceof Error ? error.message : "Failed to save search tool");
    } finally {
      setSaving(false);
    }
  }

  async function deleteTool(tool: SearchTool) {
    if (!tool.search_tool_id || tool.is_from_config) return;
    await api(`/api/search-tools/${encodeURIComponent(tool.search_tool_id)}`, { method: "DELETE" });
    reload();
  }

  async function testConnection() {
    setTesting(true);
    setTestResult(null);
    setError("");
    try {
      if (!form.search_provider || !form.api_key) {
        setTestResult({ status: "error", message: "Search provider and API key are required to test the connection." });
        return;
      }
      const result = await api<TestResult>("/api/search-tools/test-connection", {
        method: "POST",
        body: { litellm_params: formPayload(form).litellm_params }
      });
      setTestResult(result);
    } catch (error) {
      setTestResult({ status: "error", message: error instanceof Error ? error.message : "Connection test failed" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <section>
      <Header
        icon={<Search size={22} />}
        title="Search Tools"
        tone="blue"
        action={<div className="header-actions"><button className="secondary" onClick={reload}><RefreshCcw size={16} /> Refresh</button><button className="primary" onClick={openCreateTool}><Plus size={16} /> Create search tool</button></div>}
      />
      {modalOpen ? (
        <Modal title={editingTool ? "Edit search tool" : "Create search tool"} onClose={closeModal}>
          <form className="modal-form" onSubmit={saveTool}>
            <label>Search tool name
              <input
                value={form.search_tool_name}
                onChange={(event) => setForm({ ...form, search_tool_name: event.target.value })}
                pattern="[A-Za-z0-9_-]+"
                title="Use letters, numbers, hyphens, and underscores."
                placeholder="perplexity-search"
                required
              />
            </label>
            <label>Search provider
              <select value={form.search_provider} onChange={(event) => setForm({ ...form, search_provider: event.target.value })} required>
                <option value="">Select provider</option>
                {providers.map((provider) => (
                  <option key={provider.provider_name} value={provider.provider_name}>{provider.ui_friendly_name}</option>
                ))}
              </select>
            </label>
            <label>API key
              <input type="password" value={form.api_key} onChange={(event) => setForm({ ...form, api_key: event.target.value })} placeholder={editingTool?.litellm_params.api_key ? String(editingTool.litellm_params.api_key) : "Provider API key"} />
            </label>
            <label>API base
              <input value={form.api_base} onChange={(event) => setForm({ ...form, api_base: event.target.value })} placeholder="Optional provider API base" />
            </label>
            <label>Timeout seconds
              <input type="number" min="0.1" step="0.1" value={form.timeout} onChange={(event) => setForm({ ...form, timeout: event.target.value })} />
            </label>
            <label>Max retries
              <input type="number" min="0" step="1" value={form.max_retries} onChange={(event) => setForm({ ...form, max_retries: event.target.value })} />
            </label>
            <label className="wide-field">Description
              <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Optional description" />
            </label>
            {testResult ? <ConnectionResult result={testResult} /> : null}
            {error ? <div className="error">{error}</div> : null}
            <div className="modal-actions">
              <button type="button" className="secondary" onClick={testConnection} disabled={testing}>{testing ? "Testing" : "Test connection"}</button>
              <button type="button" className="secondary" onClick={closeModal}>Cancel</button>
              <button className="primary" disabled={saving}>{saving ? "Saving" : editingTool ? "Save changes" : "Create search tool"}</button>
            </div>
          </form>
        </Modal>
      ) : null}
      {loading ? <EmptyState text="Loading search tools" /> : searchTools.length ? (
        <table>
          <thead><tr><th>Name</th><th>Provider</th><th>Source</th><th>Created</th><th>Updated</th><th>Description</th><th></th></tr></thead>
          <tbody>{searchTools.map((tool) => {
            const source = tool.is_from_config ? "Config" : "DB";
            return (
              <tr key={tool.search_tool_id || tool.search_tool_name}>
                <td>{tool.search_tool_name}</td>
                <td>{providerLabel(providers, tool.litellm_params.search_provider)}</td>
                <td><span className={tool.is_from_config ? "status blocked" : "status active"}>{source}</span></td>
                <td>{formatDate(tool.created_at)}</td>
                <td>{formatDate(tool.updated_at)}</td>
                <td>{tool.search_tool_info?.description || "-"}</td>
                <td>
                  <div className="row-actions">
                    <button className="icon" onClick={() => openEditTool(tool)} title="Edit search tool" disabled={tool.is_from_config || !tool.search_tool_id}><Pencil size={16} /></button>
                    <button className="icon danger" onClick={() => deleteTool(tool)} title="Delete search tool" disabled={tool.is_from_config || !tool.search_tool_id}><Trash2 size={16} /></button>
                  </div>
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      ) : <EmptyState text="No search tools configured" />}
    </section>
  );
}

function ConnectionResult({ result }: { result: TestResult }) {
  const ok = result.status === "success";
  return (
    <div className={ok ? "notice search-test-result" : "error search-test-result"}>
      <strong>{ok ? <CheckCircle2 size={16} /> : <XCircle size={16} />}{ok ? "Connection successful" : "Connection failed"}</strong>
      <span>{result.message || (ok ? "The provider returned search results." : "The provider could not be reached.")}</span>
      {result.test_query ? <small>Test query: {result.test_query}</small> : null}
      {typeof result.results_count === "number" ? <small>Results: {result.results_count}</small> : null}
      {result.error_type ? <small>Error type: {result.error_type}</small> : null}
    </div>
  );
}

function formFromTool(tool: SearchTool): SearchToolForm {
  return {
    search_tool_name: tool.search_tool_name,
    search_provider: tool.litellm_params.search_provider,
    api_key: "",
    api_base: stringValue(tool.litellm_params.api_base),
    timeout: stringValue(tool.litellm_params.timeout),
    max_retries: stringValue(tool.litellm_params.max_retries),
    description: stringValue(tool.search_tool_info?.description)
  };
}

function formPayload(form: SearchToolForm): SearchTool {
  return {
    search_tool_name: form.search_tool_name.trim(),
    litellm_params: {
      search_provider: form.search_provider,
      ...(form.api_key ? { api_key: form.api_key } : {}),
      ...(form.api_base ? { api_base: form.api_base } : {}),
      ...(form.timeout ? { timeout: Number(form.timeout) } : {}),
      ...(form.max_retries ? { max_retries: Number(form.max_retries) } : {})
    },
    ...(form.description ? { search_tool_info: { description: form.description } } : {})
  };
}

function providerLabel(providers: AvailableSearchProvider[], providerName: string) {
  return providers.find((provider) => provider.provider_name === providerName)?.ui_friendly_name || providerName || "-";
}

function formatDate(value: string | undefined) {
  return value ? new Date(value).toLocaleDateString() : "-";
}

function stringValue(value: unknown) {
  return value == null ? "" : String(value);
}
