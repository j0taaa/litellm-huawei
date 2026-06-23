import { Search } from "lucide-react";
import type { SearchTool } from "../shared/types";
import type { WebSearchFormState, WebSearchMode } from "./types";

export function WebSearchControls({
  value,
  onChange,
  searchTools
}: {
  value: WebSearchFormState;
  onChange: (value: WebSearchFormState) => void;
  searchTools: SearchTool[];
}) {
  return (
    <fieldset className="config-section">
      <span className="field-label section-title"><Search size={16} /> Web search</span>
      <label className="toggle-row">
        <input type="checkbox" checked={value.enabled} onChange={(event) => onChange({ ...value, enabled: event.target.checked })} />
        <span>Enable web search augmentation</span>
      </label>
      {value.enabled ? (
        <>
          <div className="config-grid">
            <label>Search mode
              <select value={value.mode} onChange={(event) => onChange({ ...value, mode: event.target.value as WebSearchMode })}>
                <option value="trigger">Prompt trigger</option>
                <option value="automatic">Automatic planner</option>
              </select>
            </label>
            <label>Search tool
              <select value={value.searchToolName} onChange={(event) => onChange({ ...value, searchToolName: event.target.value })} required={value.enabled}>
                <option value="">Select search tool</option>
                {searchTools.map((tool) => <option key={tool.search_tool_id || tool.search_tool_name} value={tool.search_tool_name}>{tool.search_tool_name}</option>)}
              </select>
            </label>
          </div>
          <div className="config-grid">
            {value.mode === "trigger" ? (
              <label>Trigger token<input value={value.trigger} onChange={(event) => onChange({ ...value, trigger: event.target.value })} required={value.enabled && value.mode === "trigger"} /></label>
            ) : null}
            <label>Max results<input type="number" min="1" max="20" step="1" value={value.maxResults} onChange={(event) => onChange({ ...value, maxResults: bounded(Number(event.target.value), 1, 20, 5) })} /></label>
            <label>Max queries<input type="number" min="1" max="5" step="1" value={value.maxQueries} onChange={(event) => onChange({ ...value, maxQueries: bounded(Number(event.target.value), 1, 5, 2) })} /></label>
          </div>
          <p className="field-note compact">
            {value.mode === "trigger"
              ? `Search runs only when the prompt includes ${value.trigger || "[SEARCH]"}.`
              : "The request model checks whether current web context is needed before answering."}
          </p>
        </>
      ) : <p className="field-note compact">No web search context is added before model calls.</p>}
    </fieldset>
  );
}

function bounded(value: number, min: number, max: number, fallback: number) {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(value)));
}
