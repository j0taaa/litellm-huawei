import type { PromptPolicyRule } from "../shared/types";

export type RoutePath = "/stats" | "/keys" | "/teams" | "/models" | "/policies" | "/skills" | "/search-tools" | "/test" | `/stats/keys/${string}` | `/stats/teams/${string}`;
export type Tone = "green" | "blue" | "amber" | "violet" | "rose";
export type DurationUnit = "m" | "h" | "d";
export type WebSearchMode = "trigger" | "automatic";

export type WebSearchFormState = {
  enabled: boolean;
  mode: WebSearchMode;
  searchToolName: string;
  trigger: string;
  maxResults: number;
  maxQueries: number;
};

export type KeyFormState = {
  key_alias: string;
  team_id: string;
  max_budget: string;
  resetBudget: boolean;
  budgetResetAmount: number;
  budgetResetUnit: DurationUnit;
  max_tps: string;
  max_tpm: string;
  max_parallel_requests: string;
  tokenBudget: boolean;
  tokenBudgetTokens: string;
  tokenBudgetReset: boolean;
  tokenBudgetResetAmount: number;
  tokenBudgetResetUnit: DurationUnit;
  accessSchedule: boolean;
  accessTimezone: string;
  accessDays: number[];
  accessHours: boolean;
  accessStart: string;
  accessEnd: string;
  blocked: boolean;
  expires: boolean;
  durationAmount: number;
  durationUnit: DurationUnit;
  models: string[];
  policyIds: string[];
  skillIds: string[];
  webSearch: WebSearchFormState;
  imageAnalysis: boolean;
  imageModel: string;
  imagePrompt: string;
};

export type TeamFormState = {
  team_alias: string;
  max_budget: string;
  resetBudget: boolean;
  budgetResetAmount: number;
  budgetResetUnit: DurationUnit;
  max_tps: string;
  max_tpm: string;
  max_parallel_requests: string;
  tokenBudget: boolean;
  tokenBudgetTokens: string;
  tokenBudgetReset: boolean;
  tokenBudgetResetAmount: number;
  tokenBudgetResetUnit: DurationUnit;
  accessSchedule: boolean;
  accessTimezone: string;
  accessDays: number[];
  accessHours: boolean;
  accessStart: string;
  accessEnd: string;
  blocked: boolean;
  models: string[];
  policyIds: string[];
  skillIds: string[];
  webSearch: WebSearchFormState;
  imageAnalysis: boolean;
  imageModel: string;
  imagePrompt: string;
};

export type ModelFormState = {
  model_name: string;
  upstream_model: string;
  custom_llm_provider: string;
  api_base: string;
  api_key: string;
  display_name: string;
  max_input_tokens: string;
  max_output_tokens: string;
  input_cost_per_million: string;
  output_cost_per_million: string;
  tiered_pricing: boolean;
  supports_vision: boolean;
  pricing_ranges: PricingRangeForm[];
};

export type PricingRangeForm = {
  start: string;
  end: string;
  input_cost_per_million: string;
  output_cost_per_million: string;
};

export type PolicyFormState = {
  name: string;
  description: string;
  enabled: boolean;
  rules: PromptPolicyRule[];
  keyAssignments: string[];
  teamAssignments: string[];
};

export type SkillFormState = {
  name: string;
  description: string;
  enabled: boolean;
  instructions: string;
  keyAssignments: string[];
  teamAssignments: string[];
};

export type TestChatMessage = {
  role: "user" | "assistant" | "system";
  content: string;
  imageCount?: number;
};

export type TestImageAttachment = {
  id: string;
  name: string;
  dataUrl: string;
};
