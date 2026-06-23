import { useEffect } from "react";
import { Image } from "lucide-react";
import type { ModelInfo } from "../shared/types";
import { defaultImageAnalysisPrompt } from "./form-state";

type ImageAnalysisValue = {
  imageAnalysis: boolean;
  imageModel: string;
  imagePrompt: string;
};

type Props<T extends ImageAnalysisValue> = {
  value: T;
  onChange: (value: T) => void;
  models: ModelInfo[];
};

export function ImageAnalysisControls<T extends ImageAnalysisValue>({ value, onChange, models }: Props<T>) {
  const options = imageModelOptions(models);
  const selectedOption = value.imageModel
    ? options.find((option) => option.value === value.imageModel || option.aliases.includes(value.imageModel))
    : undefined;

  useEffect(() => {
    if (selectedOption && selectedOption.value !== value.imageModel) {
      onChange({ ...value, imageModel: selectedOption.value });
    }
  }, [onChange, selectedOption, value]);

  function patch(next: Partial<ImageAnalysisValue>) {
    onChange({ ...value, ...next });
  }

  function setEnabled(enabled: boolean) {
    patch({
      imageAnalysis: enabled,
      imageModel: enabled && !value.imageModel && options[0] ? options[0].value : value.imageModel,
      imagePrompt: value.imagePrompt || defaultImageAnalysisPrompt
    });
  }

  const hasCustomSelectedModel = value.imageModel && !selectedOption;

  return (
    <fieldset className="config-section">
      <span className="field-label section-title"><Image size={16} /> Image analysis</span>
      <label className="toggle-row">
        <input type="checkbox" checked={value.imageAnalysis} onChange={(event) => setEnabled(event.target.checked)} />
        <span>Enable image analysis for text-only models</span>
      </label>
      {value.imageAnalysis ? (
        <>
          <div className="config-grid">
            <label>Image model
              <select value={value.imageModel} onChange={(event) => patch({ imageModel: event.target.value })} required>
                <option value="">{options.length ? "Select a model" : "No models available"}</option>
                {hasCustomSelectedModel ? <option value={value.imageModel}>{value.imageModel}</option> : null}
                {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </label>
          </div>
          <label className="wide-field">Image extraction prompt
            <textarea value={value.imagePrompt} onChange={(event) => patch({ imagePrompt: event.target.value })} required />
          </label>
          <p className="field-note compact">The selected model describes image inputs before the text-only model receives the request.</p>
        </>
      ) : (
        <p className="field-note compact">Image inputs are passed through unchanged unless the destination model already supports images.</p>
      )}
    </fieldset>
  );
}

function imageModelOptions(models: ModelInfo[]): Array<{ value: string; label: string; aliases: string[] }> {
  const seen = new Set<string>();
  const sorted = [...models].sort((left, right) => Number(modelSupportsVision(right)) - Number(modelSupportsVision(left)));
  return sorted.flatMap((model) => {
    const upstream = model.litellm_params?.model || model.model_name;
    const provider = model.litellm_params?.custom_llm_provider || "";
    const normalizedUpstream = provider === "openrouter" ? openRouterModelId(upstream) : upstream;
    const value = model.model_name;
    if (!value || seen.has(value)) return [];
    seen.add(value);
    const label = normalizedUpstream && normalizedUpstream !== model.model_name ? `${model.model_name} (${normalizedUpstream})` : model.model_name;
    const aliases = [upstream, normalizedUpstream].filter((alias): alias is string => Boolean(alias && alias !== value));
    return [{ value, label, aliases }];
  });
}

function openRouterModelId(model: string): string {
  const prefix = "openrouter/";
  return model.startsWith(prefix) ? model.slice(prefix.length) : model;
}

function modelSupportsVision(model: ModelInfo): boolean {
  return Boolean(model.model_info?.huawei_maas?.supports_vision || model.model_info?.supports_vision);
}
