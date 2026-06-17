import type { ApiKeyListRow, ApiKeyRow, ModelInfo, PromptPolicy, PromptPolicyRule, PromptSkill, TeamRow } from "../shared/types";
import type { DurationUnit, KeyFormState, ModelFormState, PolicyFormState, PricingRangeForm, SkillFormState, TeamFormState } from "./types";
import { clean, costPerMillionString, objectField, stringField } from "./utils";

export const weekDays = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 7, label: "Sun" }
];

export const timezones = [
  "America/Sao_Paulo",
  "Asia/Shanghai",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Berlin",
  "Asia/Singapore",
  "Asia/Tokyo"
];

export const defaultKeyForm: KeyFormState = {
  key_alias: "",
  team_id: "",
  max_budget: "",
  resetBudget: false,
  budgetResetAmount: 30,
  budgetResetUnit: "d",
  max_tps: "",
  max_tpm: "",
  max_parallel_requests: "",
  tokenBudget: false,
  tokenBudgetTokens: "",
  tokenBudgetReset: false,
  tokenBudgetResetAmount: 30,
  tokenBudgetResetUnit: "d",
  accessSchedule: false,
  accessTimezone: "America/Sao_Paulo",
  accessDays: [1, 2, 3, 4, 5],
  accessHours: false,
  accessStart: "09:00",
  accessEnd: "17:00",
  blocked: false,
  expires: false,
  durationAmount: 30,
  durationUnit: "d",
  models: [],
  policyIds: [],
  skillIds: []
};

export const defaultTeamForm: TeamFormState = {
  team_alias: "",
  max_budget: "",
  resetBudget: false,
  budgetResetAmount: 30,
  budgetResetUnit: "d",
  max_tps: "",
  max_tpm: "",
  max_parallel_requests: "",
  tokenBudget: false,
  tokenBudgetTokens: "",
  tokenBudgetReset: false,
  tokenBudgetResetAmount: 30,
  tokenBudgetResetUnit: "d",
  accessSchedule: false,
  accessTimezone: "America/Sao_Paulo",
  accessDays: [1, 2, 3, 4, 5],
  accessHours: false,
  accessStart: "09:00",
  accessEnd: "17:00",
  blocked: false,
  models: [],
  policyIds: [],
  skillIds: []
};

export const defaultPolicyRule: PromptPolicyRule = {
  name: "New rule",
  enabled: true,
  pattern: "",
  flags: [],
  action: "redact",
  replacement: "[REDACTED]",
  append_text: ""
};

export const defaultPolicyForm: PolicyFormState = {
  name: "",
  description: "",
  enabled: true,
  rules: [{ ...defaultPolicyRule }],
  keyAssignments: [],
  teamAssignments: []
};

export const defaultSkillForm: SkillFormState = {
  name: "",
  description: "",
  enabled: true,
  instructions: "",
  keyAssignments: [],
  teamAssignments: []
};

export const defaultModelForm: ModelFormState = {
  model_name: "",
  upstream_model: "",
  custom_llm_provider: "openai",
  api_base: "https://api-ap-southeast-1.modelarts-maas.com/openai/v1",
  api_key: "os.environ/HUAWEI_MAAS_API_KEY",
  display_name: "",
  max_input_tokens: "",
  max_output_tokens: "",
  input_cost_per_million: "",
  output_cost_per_million: "",
  tiered_pricing: false,
  supports_vision: false,
  pricing_ranges: defaultPricingRanges()
};

export function policyFormFromPolicy(policy: PromptPolicy): PolicyFormState {
  return {
    name: policy.name,
    description: policy.description || "",
    enabled: policy.enabled,
    rules: policy.rules.length ? policy.rules.map((rule) => ({ ...defaultPolicyRule, ...rule, flags: rule.flags || [] })) : [{ ...defaultPolicyRule }],
    keyAssignments: policy.assignments.filter((assignment) => assignment.target_type === "key").map((assignment) => assignment.target_id),
    teamAssignments: policy.assignments.filter((assignment) => assignment.target_type === "team").map((assignment) => assignment.target_id)
  };
}

export function policyPayload(form: PolicyFormState): Record<string, unknown> {
  return {
    name: form.name,
    description: form.description,
    enabled: form.enabled,
    rules: form.rules.map((rule) => clean({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      pattern: rule.pattern,
      flags: rule.flags,
      action: rule.action,
      replacement: rule.action === "redact" ? rule.replacement || "[REDACTED]" : undefined,
      append_text: rule.action === "append" ? rule.append_text : undefined
    }))
  };
}

export function skillFormFromSkill(skill: PromptSkill): SkillFormState {
  return {
    name: skill.name,
    description: skill.description || "",
    enabled: skill.enabled,
    instructions: skill.instructions,
    keyAssignments: skill.assignments.filter((assignment) => assignment.target_type === "key").map((assignment) => assignment.target_id),
    teamAssignments: skill.assignments.filter((assignment) => assignment.target_type === "team").map((assignment) => assignment.target_id)
  };
}

export function skillPayload(form: SkillFormState): Record<string, unknown> {
  return {
    name: form.name,
    description: form.description,
    enabled: form.enabled,
    instructions: form.instructions
  };
}

export function sharedLimitMetadata(form: KeyFormState | TeamFormState): Record<string, unknown> {
  return clean({
    huawei_token_budget: form.tokenBudget ? clean({
      max_tokens: Number(form.tokenBudgetTokens),
      reset_duration: form.tokenBudgetReset ? `${form.tokenBudgetResetAmount}${form.tokenBudgetResetUnit}` : undefined,
      counts: "total_tokens"
    }) : undefined,
    huawei_time_access: form.accessSchedule ? clean({
      timezone: form.accessTimezone,
      rules: [
        clean({
          days: form.accessDays,
          start: form.accessHours ? form.accessStart : undefined,
          end: form.accessHours ? form.accessEnd : undefined
        })
      ]
    }) : undefined
  });
}

export function keyPayload(form: KeyFormState, mode: "create" | "edit" | "clone"): Record<string, unknown> {
  const editing = mode === "edit";
  const cloning = mode === "clone";
  const metadata = sharedLimitMetadata(form);
  return clean({
    key_alias: form.key_alias || (editing ? null : undefined),
    team_id: form.team_id || (editing ? null : undefined),
    duration: mode === "create" && form.expires ? `${form.durationAmount}${form.durationUnit}` : undefined,
    max_budget: form.max_budget ? Number(form.max_budget) : (editing ? null : undefined),
    budget_duration: form.resetBudget ? `${form.budgetResetAmount}${form.budgetResetUnit}` : (editing ? null : undefined),
    rpm_limit: form.max_tps ? Math.ceil(Number(form.max_tps) * 60) : (editing ? null : undefined),
    tpm_limit: form.max_tpm ? Number(form.max_tpm) : (editing ? null : undefined),
    max_parallel_requests: form.max_parallel_requests ? Number(form.max_parallel_requests) : (editing ? null : undefined),
    metadata: Object.keys(metadata).length ? metadata : (editing ? {} : undefined),
    blocked: editing || cloning ? form.blocked : undefined,
    models: form.models,
    prompt_policy_ids: form.policyIds,
    prompt_skill_ids: form.skillIds
  });
}

export function teamPayload(form: TeamFormState, editing: boolean): Record<string, unknown> {
  const metadata = sharedLimitMetadata(form);
  return clean({
    team_alias: form.team_alias || (editing ? null : undefined),
    max_budget: form.max_budget ? Number(form.max_budget) : (editing ? null : undefined),
    budget_duration: form.resetBudget ? `${form.budgetResetAmount}${form.budgetResetUnit}` : (editing ? null : undefined),
    rpm_limit: form.max_tps ? Math.ceil(Number(form.max_tps) * 60) : (editing ? null : undefined),
    tpm_limit: form.max_tpm ? Number(form.max_tpm) : (editing ? null : undefined),
    max_parallel_requests: form.max_parallel_requests ? Number(form.max_parallel_requests) : (editing ? null : undefined),
    metadata: Object.keys(metadata).length ? metadata : (editing ? {} : undefined),
    blocked: editing ? form.blocked : undefined,
    models: form.models,
    prompt_policy_ids: form.policyIds,
    prompt_skill_ids: form.skillIds
  });
}

export function teamFormFromRow(row: TeamRow, policies: PromptPolicy[] = [], skills: PromptSkill[] = []): TeamFormState {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const tokenBudget = objectField(metadata, "huawei_token_budget");
  const timeAccess = objectField(metadata, "huawei_time_access");
  const firstRule = Array.isArray(timeAccess.rules) && timeAccess.rules[0] && typeof timeAccess.rules[0] === "object"
    ? timeAccess.rules[0] as Record<string, unknown>
    : {};
  const budgetDuration = parseDurationValue(row.budget_duration);
  const tokenReset = parseDurationValue(stringField(tokenBudget, "reset_duration"));
  const accessDays = Array.isArray(firstRule.days) ? firstRule.days.filter((day): day is number => typeof day === "number") : defaultTeamForm.accessDays;
  return {
    ...defaultTeamForm,
    team_alias: row.team_alias || "",
    max_budget: row.max_budget == null ? "" : String(row.max_budget),
    resetBudget: Boolean(row.budget_duration),
    budgetResetAmount: budgetDuration.amount,
    budgetResetUnit: budgetDuration.unit,
    max_tps: row.rpm_limit ? String(row.rpm_limit / 60) : "",
    max_tpm: row.tpm_limit == null ? "" : String(row.tpm_limit),
    max_parallel_requests: row.max_parallel_requests == null ? "" : String(row.max_parallel_requests),
    tokenBudget: tokenBudget.max_tokens != null,
    tokenBudgetTokens: tokenBudget.max_tokens == null ? "" : String(tokenBudget.max_tokens),
    tokenBudgetReset: Boolean(tokenBudget.reset_duration),
    tokenBudgetResetAmount: tokenReset.amount,
    tokenBudgetResetUnit: tokenReset.unit,
    accessSchedule: Object.keys(timeAccess).length > 0,
    accessTimezone: stringField(timeAccess, "timezone") || defaultTeamForm.accessTimezone,
    accessDays: accessDays.length ? accessDays : defaultTeamForm.accessDays,
    accessHours: typeof firstRule.start === "string" && typeof firstRule.end === "string",
    accessStart: typeof firstRule.start === "string" ? firstRule.start : defaultTeamForm.accessStart,
    accessEnd: typeof firstRule.end === "string" ? firstRule.end : defaultTeamForm.accessEnd,
    blocked: Boolean(row.blocked),
    models: row.models || [],
    policyIds: policies
      .filter((policy) => policy.assignments.some((assignment) => assignment.target_type === "team" && assignment.target_id === row.team_id))
      .map((policy) => policy.id),
    skillIds: skills
      .filter((skill) => skill.assignments.some((assignment) => assignment.target_type === "team" && assignment.target_id === row.team_id))
      .map((skill) => skill.id)
  };
}

export function keyFormFromRow(row: ApiKeyRow, policies: PromptPolicy[] = [], key = "", skills: PromptSkill[] = []): KeyFormState {
  const metadata = row.metadata && typeof row.metadata === "object" ? row.metadata : {};
  const tokenBudget = objectField(metadata, "huawei_token_budget");
  const timeAccess = objectField(metadata, "huawei_time_access");
  const firstRule = Array.isArray(timeAccess.rules) && timeAccess.rules[0] && typeof timeAccess.rules[0] === "object"
    ? timeAccess.rules[0] as Record<string, unknown>
    : {};
  const budgetDuration = parseDurationValue(row.budget_duration);
  const tokenReset = parseDurationValue(stringField(tokenBudget, "reset_duration"));
  const accessDays = Array.isArray(firstRule.days) ? firstRule.days.filter((day): day is number => typeof day === "number") : defaultKeyForm.accessDays;
  const accessStart = typeof firstRule.start === "string" ? firstRule.start : defaultKeyForm.accessStart;
  const accessEnd = typeof firstRule.end === "string" ? firstRule.end : defaultKeyForm.accessEnd;
  return {
    ...defaultKeyForm,
    key_alias: row.key_alias || "",
    team_id: row.team_id || "",
    max_budget: row.max_budget == null ? "" : String(row.max_budget),
    resetBudget: Boolean(row.budget_duration),
    budgetResetAmount: budgetDuration.amount,
    budgetResetUnit: budgetDuration.unit,
    max_tps: row.rpm_limit ? String(row.rpm_limit / 60) : "",
    max_tpm: row.tpm_limit == null ? "" : String(row.tpm_limit),
    max_parallel_requests: row.max_parallel_requests == null ? "" : String(row.max_parallel_requests),
    tokenBudget: tokenBudget.max_tokens != null,
    tokenBudgetTokens: tokenBudget.max_tokens == null ? "" : String(tokenBudget.max_tokens),
    tokenBudgetReset: Boolean(tokenBudget.reset_duration),
    tokenBudgetResetAmount: tokenReset.amount,
    tokenBudgetResetUnit: tokenReset.unit,
    accessSchedule: Object.keys(timeAccess).length > 0,
    accessTimezone: stringField(timeAccess, "timezone") || defaultKeyForm.accessTimezone,
    accessDays: accessDays.length ? accessDays : defaultKeyForm.accessDays,
    accessHours: typeof firstRule.start === "string" && typeof firstRule.end === "string",
    accessStart,
    accessEnd,
    blocked: Boolean(row.blocked),
    models: row.models || [],
    policyIds: policies
      .filter((policy) => policy.assignments.some((assignment) => assignment.target_type === "key" && assignment.target_id === key))
      .map((policy) => policy.id),
    skillIds: skills
      .filter((skill) => skill.assignments.some((assignment) => assignment.target_type === "key" && assignment.target_id === key))
      .map((skill) => skill.id)
  };
}

export function parseDurationValue(value: unknown): { amount: number; unit: DurationUnit } {
  if (typeof value !== "string" || value.length < 2) return { amount: 30, unit: "d" };
  const unit = value.slice(-1);
  const amount = Number(value.slice(0, -1));
  if (!["m", "h", "d"].includes(unit) || !Number.isFinite(amount) || amount <= 0) return { amount: 30, unit: "d" };
  return { amount, unit: unit as DurationUnit };
}

export function modelFormFromInfo(model: ModelInfo): ModelFormState {
  const huaweiMaaS = model.model_info?.huawei_maas;
  const pricingRanges = pricingRangesFromInfo(model);
  return {
    model_name: model.model_name,
    upstream_model: model.litellm_params?.model || model.model_info?.key || model.model_name,
    custom_llm_provider: model.litellm_params?.custom_llm_provider || "openai",
    api_base: model.litellm_params?.api_base || defaultModelForm.api_base,
    api_key: model.litellm_params?.api_key || defaultModelForm.api_key,
    display_name: huaweiMaaS?.name || model.model_name,
    max_input_tokens: model.model_info?.max_input_tokens == null ? "" : String(model.model_info.max_input_tokens),
    max_output_tokens: model.model_info?.max_output_tokens == null ? "" : String(model.model_info.max_output_tokens),
    input_cost_per_million: costPerMillionString(model.model_info?.input_cost_per_token),
    output_cost_per_million: costPerMillionString(model.model_info?.output_cost_per_token),
    tiered_pricing: Boolean(huaweiMaaS?.tiered_pricing),
    supports_vision: Boolean(huaweiMaaS?.supports_vision || model.model_info?.supports_vision),
    pricing_ranges: pricingRanges.length ? pricingRanges : defaultPricingRanges(
      costPerMillionString(model.model_info?.input_cost_per_token),
      costPerMillionString(model.model_info?.output_cost_per_token)
    )
  };
}

export function modelPayload(form: ModelFormState, existing: ModelInfo | null): Record<string, unknown> {
  const pricingRanges = form.tiered_pricing ? normalizedPricingRanges(form.pricing_ranges) : [];
  const inputCostPerMillion = pricingRanges[0]?.input_cost_per_million || form.input_cost_per_million;
  const outputCostPerMillion = pricingRanges[0]?.output_cost_per_million || form.output_cost_per_million;
  const inputCost = inputCostPerMillion ? Number(inputCostPerMillion) / 1_000_000 : undefined;
  const outputCost = outputCostPerMillion ? Number(outputCostPerMillion) / 1_000_000 : undefined;
  const maxInput = form.max_input_tokens ? Number(form.max_input_tokens) : undefined;
  const maxOutput = form.max_output_tokens ? Number(form.max_output_tokens) : undefined;
  const huaweiPricing = {
    input: pricingRanges.map((range) => ({
      start: Number(range.start),
      end: Number(range.end),
      tokenPriceUsdPerMillion: Number(range.input_cost_per_million)
    })),
    output: pricingRanges.map((range) => ({
      start: Number(range.start),
      end: Number(range.end),
      tokenPriceUsdPerMillion: Number(range.output_cost_per_million)
    }))
  };
  const modelInfo = clean({
    ...(existing?.model_info || {}),
    id: existing?.model_info?.id || modelIdForName(form.model_name),
    db_model: true,
    key: form.upstream_model,
    mode: "chat",
    litellm_provider: form.custom_llm_provider,
    max_tokens: maxOutput,
    max_input_tokens: maxInput,
    max_output_tokens: maxOutput,
    input_cost_per_token: inputCost,
    output_cost_per_token: outputCost,
    huawei_maas: clean({
      ...(existing?.model_info?.huawei_maas || {}),
      id: form.upstream_model,
      name: form.display_name || form.model_name,
      tiered_pricing: form.tiered_pricing,
      supports_vision: form.supports_vision,
      currency: existing?.model_info?.huawei_maas?.currency || "USD",
      pricing_unit: existing?.model_info?.huawei_maas?.pricing_unit || "1M tokens",
      pricing: form.tiered_pricing ? huaweiPricing : { input: [], output: [] }
    }),
    supports_vision: form.supports_vision ? true : undefined
  });
  return {
    model_name: form.model_name,
    litellm_params: {
      model: form.upstream_model,
      custom_llm_provider: form.custom_llm_provider,
      api_base: form.api_base,
      api_key: form.api_key
    },
    model_info: modelInfo
  };
}

export function modelIdForName(modelName: string): string {
  return `custom-${modelName.trim().replace(/[^A-Za-z0-9_-]+/g, "-")}`;
}

export function defaultPricingRanges(inputCost = "", outputCost = ""): PricingRangeForm[] {
  return [
    { start: "0", end: "31999", input_cost_per_million: inputCost, output_cost_per_million: outputCost },
    { start: "32000", end: "1000000", input_cost_per_million: "", output_cost_per_million: "" }
  ];
}

export function pricingRangesFromInfo(model: ModelInfo): PricingRangeForm[] {
  const input = model.model_info?.huawei_maas?.pricing?.input || [];
  const output = model.model_info?.huawei_maas?.pricing?.output || [];
  const count = Math.max(input.length, output.length);
  return Array.from({ length: count }, (_value, index) => {
    const inputRange = input[index];
    const outputRange = output[index];
    return {
      start: String(inputRange?.start ?? outputRange?.start ?? ""),
      end: String(inputRange?.end ?? outputRange?.end ?? ""),
      input_cost_per_million: inputRange?.tokenPriceUsdPerMillion == null ? "" : String(inputRange.tokenPriceUsdPerMillion),
      output_cost_per_million: outputRange?.tokenPriceUsdPerMillion == null ? "" : String(outputRange.tokenPriceUsdPerMillion)
    };
  }).filter((range) => range.start || range.end || range.input_cost_per_million || range.output_cost_per_million);
}

export function normalizedPricingRanges(ranges: PricingRangeForm[]): PricingRangeForm[] {
  return ranges
    .filter((range) => range.start && range.end && range.input_cost_per_million && range.output_cost_per_million)
    .sort((a, b) => Number(a.start) - Number(b.start));
}

export function normalizeKeyRow(row: ApiKeyListRow): ApiKeyRow {
  return typeof row === "string" ? { token: row } : row;
}

export function keyIdentifier(row: ApiKeyListRow): string {
  return typeof row === "string" ? row : row.token || "";
}
