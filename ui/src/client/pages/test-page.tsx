import { useEffect, useState } from "react";
import { MessageSquare, Send } from "lucide-react";
import type { ApiKeyListRow, ModelInfo } from "../../shared/types";
import { api, useResource } from "../api";
import { EmptyState, Header } from "../components";
import { keyIdentifier, normalizeKeyRow } from "../form-state";
import type { TestChatMessage } from "../types";
import { chatResponseText } from "../utils";

export function TestPage() {
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
