import { useEffect, useMemo, useState } from "react";
import { ImagePlus, MessageSquare, Send, X } from "lucide-react";
import type { ApiKeyListRow, ModelInfo } from "../../shared/types";
import { api, useResource } from "../api";
import { EmptyState, Header } from "../components";
import { keyIdentifier, normalizeKeyRow } from "../form-state";
import type { TestChatMessage, TestImageAttachment } from "../types";
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
  const [images, setImages] = useState<TestImageAttachment[]>([]);
  const [messages, setMessages] = useState<TestChatMessage[]>([]);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const selectedKeyRow = useMemo(() => keys.find((key) => keyIdentifier(key) === selectedKey), [keys, selectedKey]);
  const allowedModelNames = useMemo(() => selectedKeyRow ? normalizeKeyRow(selectedKeyRow).models || [] : [], [selectedKeyRow]);
  const allowedModels = useMemo(
    () => allowedModelNames.length ? models.filter((item) => allowedModelNames.includes(item.model_name)) : models,
    [allowedModelNames, models]
  );

  useEffect(() => {
    if (!selectedKey && keys.length) {
      const first = keys[0];
      const id = keyIdentifier(first);
      setSelectedKey(id);
      setApiKey(usableBearerKey(first));
    }
  }, [keys, selectedKey]);

  useEffect(() => {
    if (!allowedModels.length) {
      if (model) setModel("");
      return;
    }
    if (!model || !allowedModels.some((item) => item.model_name === model)) {
      setModel(allowedModels[0].model_name);
    }
  }, [allowedModels, model]);

  function selectKey(value: string) {
    setSelectedKey(value);
    const row = keys.find((key) => keyIdentifier(key) === value);
    setApiKey(row ? usableBearerKey(row) : "");
  }

  async function attachImages(files: FileList | null) {
    if (!files?.length) return;
    const selected = Array.from(files).filter((file) => file.type.startsWith("image/"));
    const attachments = await Promise.all(selected.map(async (file) => ({
      id: `${file.name}-${file.size}-${crypto.randomUUID()}`,
      name: file.name,
      dataUrl: await fileToDataUrl(file)
    })));
    setImages((current) => [...current, ...attachments]);
  }

  function removeImage(id: string) {
    setImages((current) => current.filter((image) => image.id !== id));
  }

  async function sendPrompt(event: React.FormEvent) {
    event.preventDefault();
    await submitPrompt();
  }

  async function submitPrompt() {
    const content = prompt.trim();
    if ((!content && !images.length) || !apiKey || !model) return;
    const currentImages = images;
    const displayContent = content || "Image-only prompt";
    const nextMessages: TestChatMessage[] = [...messages, { role: "user", content: displayContent, imageCount: currentImages.length || undefined }];
    setMessages(nextMessages);
    setPrompt("");
    setImages([]);
    setSending(true);
    setError("");
    try {
      const requestMessages = [
        ...messages.map(({ role, content }) => ({ role, content })),
        {
          role: "user",
          content: currentImages.length
            ? [
              ...(content ? [{ type: "text", text: content }] : []),
              ...currentImages.map((image) => ({ type: "image_url", image_url: { url: image.dataUrl } }))
            ]
            : content
        }
      ];
      const result = await api<Record<string, unknown>>("/api/test/chat", {
        method: "POST",
        body: {
          api_key: apiKey,
          model,
          messages: requestMessages,
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

  function handlePromptKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey) return;
    event.preventDefault();
    if (!sending) void submitPrompt();
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
          <label>Bearer API key
            <input aria-label="Bearer API key" value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Paste the full sk-... key" />
          </label>
          <label>Model
            <select aria-label="Model" value={model} onChange={(event) => setModel(event.target.value)} disabled={modelsResource.loading}>
              <option value="">{modelsResource.loading ? "Loading models" : "Select model"}</option>
              {allowedModels.map((item) => <option key={item.model_name} value={item.model_name}>{item.model_name}</option>)}
            </select>
            {selectedKeyRow && allowedModelNames.length ? <span className="field-note compact">{allowedModels.length} model{allowedModels.length === 1 ? "" : "s"} allowed for this key.</span> : null}
          </label>
          <label>Max tokens<input type="number" min="1" max="8192" step="1" value={maxTokens} onChange={(event) => setMaxTokens(event.target.value)} /></label>
        </div>
        <div className="chat-window" aria-label="Chat transcript">
          {messages.length ? messages.map((message, index) => (
            <div className={`chat-message ${message.role}`} key={index}>
              <span>{message.role}</span>
              <p>{message.content}</p>
              {message.imageCount ? <small>{message.imageCount} image{message.imageCount === 1 ? "" : "s"} attached</small> : null}
            </div>
          )) : <EmptyState text="No test messages yet" />}
        </div>
        {error ? <div className="error">{error}</div> : null}
        <form className="chat-composer" onSubmit={sendPrompt}>
          <div className="composer-main">
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={handlePromptKeyDown} placeholder="Send a test prompt" />
            {images.length ? (
              <div className="image-attachments">
                {images.map((image) => (
                  <div className="image-chip" key={image.id}>
                    <img src={image.dataUrl} alt={image.name} />
                    <span>{image.name}</span>
                    <button type="button" className="icon" title="Remove image" onClick={() => removeImage(image.id)}><X size={14} /></button>
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="composer-actions">
            <label className="secondary image-upload">
              <ImagePlus size={16} /> Images
              <input type="file" accept="image/*" multiple onChange={(event) => { void attachImages(event.target.files); event.target.value = ""; }} />
            </label>
            <button className="primary" disabled={sending || (!prompt.trim() && !images.length) || !apiKey || !model}><Send size={16} /> {sending ? "Sending" : "Send"}</button>
          </div>
        </form>
      </div>
    </section>
  );
}

function usableBearerKey(row: ApiKeyListRow): string {
  const key = normalizeKeyRow(row).api_key || normalizeKeyRow(row).key_name || normalizeKeyRow(row).token || "";
  return typeof key === "string" && key.startsWith("sk-") && !key.includes("...") ? key : "";
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}
